// Correcteur Express — serveur (Cloudflare Worker).
//
// Rôle : garder la clé de l'IA (Gemini), décompter les pages achetées et encaisser via Stripe.
// Confidentialité : les copies transitent en mémoire vers l'IA puis sont oubliées.
// Rien n'est écrit sur disque ni dans les journaux, à part les clés d'accès et leur solde.

export const PACKS = {
  decouverte: { name: 'Pack Découverte', pages: 200, amount: 1400 },
  session: { name: 'Pack Session', pages: 500, amount: 2900 },
  annee: { name: 'Pack Année', pages: 1800, amount: 7900 },
};

const MAX_PAGES_PER_COPY = 10;
const MAX_RUBRIC_PAGES = 6;
const MAX_IMAGE_CHARS = 2_500_000; // ~1,8 Mo par page une fois décodée
// Une école entière partage souvent la même adresse IP : on plafonne par jour au lieu de bloquer.
const TRIALS_PER_IP_PER_DAY = 10;
const DAY_MS = 24 * 3600 * 1000;
const DIVERGENCE_RATIO = 0.075; // 1,5 point sur 20

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env);
      const route = ROUTES[`${request.method} ${url.pathname}`];
      if (!route) return json({ error: 'Introuvable' }, 404);
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      // On ne journalise que le message : jamais le contenu des copies.
      console.error('Erreur interne :', err?.message);
      return json({ error: 'Erreur interne, réessayez dans un instant.' }, 500);
    }
  },
};

const ROUTES = {
  'GET /api/balance': balance,
  'POST /api/trial': trial,
  'POST /api/checkout': checkout,
  'GET /api/claim': claim,
  'POST /api/grade': grade,
};

// ---------- Utilitaires ----------

// Crée les tables au besoin (une fois par instance) : aucune manipulation manuelle de la base.
// Garder en accord avec schema.sql.
const DB_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS access_keys (key TEXT PRIMARY KEY, pages INTEGER NOT NULL DEFAULT 0, email TEXT,
     is_trial INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS payments (session_id TEXT PRIMARY KEY, key TEXT NOT NULL, pages INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trials (ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS trials_ip ON trials (ip_hash, created_at)`,
];
let schemaReady;
function ensureSchema(env) {
  schemaReady ||= env.DB.batch(DB_SCHEMA.map((q) => env.DB.prepare(q))).catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'Requête invalide'); }
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const s = Array.from(bytes, (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  return `CE-${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}`;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function bearer(request) {
  const key = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim().toUpperCase();
  if (!/^CE-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(key)) throw new HttpError(401, "Clé d'accès invalide");
  return key;
}

async function getKey(env, key) {
  const row = await env.DB.prepare('SELECT pages, is_trial FROM access_keys WHERE key = ?').bind(key).first();
  if (!row) throw new HttpError(401, "Clé d'accès inconnue");
  return row;
}

// ---------- Solde et essai gratuit ----------

async function balance(request, env) {
  const row = await getKey(env, bearer(request));
  return json({ pages: row.pages, trial: !!row.is_trial });
}

async function trial(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
  const ipHash = await sha256(`${env.IP_SALT || ''}:${ip}`);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM trials WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - DAY_MS).first();
  if (recent.n >= TRIALS_PER_IP_PER_DAY) {
    throw new HttpError(429, "Trop d'essais gratuits depuis cette connexion aujourd'hui. Réessayez demain ou choisissez un pack.");
  }
  const key = newKey();
  const pages = Number(env.TRIAL_PAGES) || 30;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM trials WHERE created_at < ?').bind(now - DAY_MS),
    env.DB.prepare('INSERT INTO trials (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now),
    env.DB.prepare('INSERT INTO access_keys (key, pages, is_trial, created_at) VALUES (?, ?, 1, ?)').bind(key, pages, now),
  ]);
  return json({ key, pages });
}

// ---------- Paiement Stripe ----------

async function stripe(env, method, path, params) {
  const res = await fetch(`${env.STRIPE_API_BASE || 'https://api.stripe.com/v1'}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe :', data.error?.message);
    throw new HttpError(502, 'Le paiement est momentanément indisponible.');
  }
  return data;
}

async function checkout(request, env, url) {
  const { pack, key: existingKey } = await readJson(request);
  const p = PACKS[pack];
  if (!p) throw new HttpError(400, 'Pack inconnu');

  // Recharge d'une clé existante, ou nouvelle clé créée au moment du paiement.
  let key = newKey();
  if (existingKey) {
    key = bearer(new Request(url, { headers: { Authorization: `Bearer ${existingKey}` } }));
    await getKey(env, key);
  }

  const session = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'payment',
    success_url: `${url.origin}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/#tarifs`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'cad',
    'line_items[0][price_data][unit_amount]': String(p.amount),
    'line_items[0][price_data][product_data][name]': `${p.name} — ${p.pages} pages`,
    'metadata[key]': key,
    'metadata[pages]': String(p.pages),
    allow_promotion_codes: 'true',
    locale: 'fr-CA',
  });
  return json({ url: session.url });
}

// Appelé par la page de remerciement. Vérifie le paiement auprès de Stripe et crédite une seule fois.
async function claim(request, env, url) {
  const sessionId = url.searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new HttpError(400, 'Paiement introuvable');

  const session = await stripe(env, 'GET', `checkout/sessions/${sessionId}`);
  if (session.payment_status !== 'paid') throw new HttpError(402, "Le paiement n'est pas encore confirmé.");
  const key = session.metadata?.key;
  const pages = Number(session.metadata?.pages);
  if (!key || !pages) throw new HttpError(400, 'Paiement invalide');

  const now = Date.now();
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO payments (session_id, key, pages, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, key, pages, now).run();
  if (inserted.meta.changes) {
    await env.DB.prepare(`INSERT INTO access_keys (key, pages, email, is_trial, created_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(key) DO UPDATE SET pages = pages + excluded.pages, is_trial = 0, email = COALESCE(excluded.email, email)`)
      .bind(key, pages, session.customer_details?.email || null, now).run();
  }
  const row = await getKey(env, key);
  return json({ key, pages: row.pages, added: pages });
}

// ---------- Correction ----------

function checkImages(list, max, label) {
  if (!Array.isArray(list)) throw new HttpError(400, `${label} manquantes`);
  if (list.length > max) throw new HttpError(400, `${label} : ${max} pages maximum`);
  for (const img of list) {
    if (typeof img !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > MAX_IMAGE_CHARS) {
      throw new HttpError(400, `${label} : image invalide ou trop lourde`);
    }
  }
}

function buildPrompt(o) {
  const step = o.wholePoints ? '1 point' : '0,5 point';
  return [
    "Tu es un enseignant expérimenté, rigoureux et juste. Tu corriges la copie d'un élève, question par question.",
    '',
    `Évaluation : « ${o.exam || 'non précisé'} ». Barème total : ${o.total} points. Granularité : ${step} (aucune valeur plus fine).`,
    '',
    'MÉTHODE :',
    "1. Repère chaque question ou critère du barème. Si un corrigé ou une grille est fourni, suis-le strictement (questions, points par question, réponses attendues).",
    "2. Pour chaque question : lis ce que l'élève a réellement écrit, compare à la réponse attendue, attribue des points entre 0 et le maximum de la question. Accorde des points partiels quand la réponse est partiellement juste.",
    "3. Dans la justification, cite brièvement la réponse de l'élève et ce qui était attendu. Ne suppose jamais une réponse que tu ne lis pas : si c'est illisible, dis-le.",
    `4. La somme des points maximum des questions doit faire ${o.total}.`,
    o.checkLanguage
      ? "5. Tiens compte de la qualité de la langue (orthographe, grammaire) selon la grille ; sans indication de la grille, consacre-lui un critère « Qualité de la langue » raisonnable."
      : "5. Ne pénalise pas l'orthographe ni la grammaire.",
    '',
    "IDENTITÉ : lis le nom de l'élève sur la copie. S'il est absent ou illisible, renvoie une chaîne vide. N'invente jamais un nom.",
    "INCERTITUDE : mets « incertain » à true si une partie importante est illisible, si la copie semble incomplète ou hors sujet, ou si tu hésites sérieusement sur la note.",
    "COMMENTAIRE : 2 à 4 phrases adressées à l'élève (tutoiement), concrètes et constructives : une réussite, l'erreur principale, une piste de progrès.",
    o.rubric ? `\nCONSIGNES DE L'ENSEIGNANT (prioritaires) :\n"""\n${o.rubric}\n"""` : '',
  ].join('\n');
}

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'correction',
    schema: {
      type: 'object',
      required: ['nom', 'questions', 'commentaire', 'incertain', 'raison_incertitude'],
      properties: {
        nom: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['question', 'points_obtenus', 'points_max', 'justification'],
            properties: {
              question: { type: 'string' },
              points_obtenus: { type: 'number' },
              points_max: { type: 'number' },
              justification: { type: 'string' },
            },
          },
        },
        commentaire: { type: 'string' },
        incertain: { type: 'boolean' },
        raison_incertitude: { type: 'string' },
      },
    },
  },
};

async function callModel(env, prompt, rubricPages, pages) {
  const image = (url) => ({ type: 'image_url', image_url: { url, detail: 'high' } });
  const content = [];
  if (rubricPages.length) content.push({ type: 'text', text: 'CORRIGÉ / GRILLE DE L’ENSEIGNANT :' }, ...rubricPages.map(image));
  content.push({ type: 'text', text: `COPIE DE L'ÉLÈVE (${pages.length} page(s), dans l'ordre) :` }, ...pages.map(image));

  let model = env.AI_MODEL;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content }],
        response_format: SCHEMA,
        temperature: 0,
        max_tokens: 8192, // les modèles qui « réfléchissent » comptent aussi ces jetons
      }),
    });
    if (res.ok) {
      const msg = (await res.json()).choices?.[0]?.message;
      if (!msg?.content) throw new Error('réponse vide');
      // Certains modèles entourent le JSON de ```json … ``` malgré la consigne.
      return JSON.parse(msg.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    }
    // Modèle retiré par le fournisseur : on bascule sur l'alias « toujours à jour ».
    if (res.status === 404 && env.AI_FALLBACK_MODEL && model !== env.AI_FALLBACK_MODEL) {
      console.error(`Modèle ${model} introuvable, bascule sur ${env.AI_FALLBACK_MODEL}`);
      model = env.AI_FALLBACK_MODEL;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }
    // Le message d'erreur du fournisseur ne contient pas la copie : on peut le journaliser.
    const detail = await res.text().catch(() => '');
    throw new Error(`IA ${res.status} : ${detail.slice(0, 300)}`);
  }
}

// Ramène les points sur la granularité choisie et dans les bornes, puis calcule la note.
function normalize(raw, total, unit) {
  const snap = (n) => Math.round((Number(n) || 0) / unit) * unit;
  const questions = (raw.questions || []).map((q) => {
    const max = Math.max(0, snap(q.points_max));
    return {
      question: String(q.question || 'Question').trim(),
      points: Math.min(max, Math.max(0, snap(q.points_obtenus))),
      max,
      justification: String(q.justification || '').trim(),
    };
  });
  const sumMax = questions.reduce((a, q) => a + q.max, 0);
  const grade = Math.min(total, questions.reduce((a, q) => a + q.points, 0));
  return { name: String(raw.nom || '').trim(), questions, sumMax, grade, comment: String(raw.commentaire || '').trim(),
    uncertain: !!raw.incertain, reason: String(raw.raison_incertitude || '').trim() };
}

const fr = (n) => String(n).replace('.', ',');

async function grade(request, env) {
  const key = bearer(request);
  const body = await readJson(request);
  const total = Number(body.total);
  if (!(total > 0 && total <= 1000)) throw new HttpError(400, 'Barème invalide');
  checkImages(body.pages, MAX_PAGES_PER_COPY, 'Copie');
  if (!body.pages.length) throw new HttpError(400, 'Copie vide');
  checkImages(body.rubricPages || [], MAX_RUBRIC_PAGES, 'Corrigé');

  // Réserve les pages de façon atomique (le corrigé n'est pas facturé).
  const n = body.pages.length;
  const reserved = await env.DB.prepare('UPDATE access_keys SET pages = pages - ? WHERE key = ? AND pages >= ?').bind(n, key, n).run();
  if (!reserved.meta.changes) {
    await getKey(env, key); // 401 si la clé n'existe pas
    throw new HttpError(402, 'Solde de pages insuffisant. Rechargez votre compte pour continuer.');
  }

  const unit = body.wholePoints ? 1 : 0.5;
  const prompt = buildPrompt({ exam: String(body.exam || '').slice(0, 200), total, wholePoints: !!body.wholePoints,
    checkLanguage: !!body.checkLanguage, rubric: String(body.rubric || '').slice(0, 8000) });

  // Double correction indépendante : un écart important signale la copie à l'enseignant.
  const runs = await Promise.allSettled([0, 1].map(() => callModel(env, prompt, body.rubricPages || [], body.pages)));
  const ok = runs.filter((r) => r.status === 'fulfilled').map((r) => normalize(r.value, total, unit));
  if (!ok.length) {
    await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(n, key).run();
    const reasons = runs.map((r) => r.reason?.message || '').join(' / ');
    console.error('Correction impossible :', reasons);
    const code = (reasons.match(/IA (\d{3})/) || [])[1];
    const hint = code === '401' || code === '403' ? ' (clé IA refusée : vérifiez AI_API_KEY)'
      : code === '429' ? ' (limite du fournisseur IA atteinte : facturation activée ?)'
      : code === '400' || code === '404' ? ` (requête refusée par l'IA, code ${code} : modèle ou format)`
      : code ? ` (erreur IA ${code})` : reasons.includes('JSON') ? " (réponse de l'IA illisible)" : '';
    throw new HttpError(502, `La correction a échoué${hint}. Aucune page n'a été décomptée, réessayez.`);
  }

  const [a, b] = ok;
  const flags = [];
  if (a.uncertain && a.reason) flags.push(a.reason);
  else if (a.uncertain) flags.push("L'IA a un doute sur cette copie.");
  if (!a.name) flags.push('Nom illisible ou absent.');
  if (Math.abs(a.sumMax - total) > 1e-9) flags.push(`Les questions totalisent ${fr(a.sumMax)} points au lieu de ${fr(total)}.`);
  if (!b) flags.push('Une seule correction a pu être faite (pas de contre-vérification).');
  else if (Math.abs(a.grade - b.grade) > total * DIVERGENCE_RATIO) {
    flags.push(`Deux corrections indépendantes divergent : ${fr(a.grade)} et ${fr(b.grade)} sur ${fr(total)}.`);
  }

  const left = await env.DB.prepare('SELECT pages FROM access_keys WHERE key = ?').bind(key).first();
  return json({
    name: a.name, grade: a.grade, total, questions: a.questions, comment: a.comment,
    secondGrade: b ? b.grade : null, flags, pagesLeft: left?.pages ?? 0,
  });
}
