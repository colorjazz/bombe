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
const MAX_LANG_IMAGE_CHARS = 14_000_000; // photos en pleine résolution pour la correction de la langue (~10 Mo)
// Une école entière partage souvent la même adresse IP : on plafonne par jour au lieu de bloquer.
const TRIALS_PER_IP_PER_DAY = 10;
const DAY_MS = 24 * 3600 * 1000;
const RELIABILITY_ALERT = 80; // en dessous, la copie est signalée à vérifier

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
  'POST /api/split': split,
  'POST /api/rubric': rubric,
  'POST /api/language': language,
  'POST /api/locate': locate,
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

function checkImages(list, max, label, maxChars = MAX_IMAGE_CHARS) {
  if (!Array.isArray(list)) throw new HttpError(400, `${label} manquantes`);
  if (list.length > max) throw new HttpError(400, `${label} : ${max} pages maximum`);
  for (const img of list) {
    if (typeof img !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > maxChars) {
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
    "GROUPE : lis le groupe ou la classe écrit sur la copie (ex. « 541 », « Gr. 02 », « 4e B »), tel qu'écrit. S'il n'y en a pas, renvoie une chaîne vide.",
    "INCERTITUDE : mets « incertain » à true si une partie importante est illisible, si la copie semble incomplète ou hors sujet, ou si tu hésites sérieusement sur la note.",
    "COMMENTAIRE : 2 à 4 phrases adressées à l'élève (tutoiement), concrètes et constructives : une réussite, l'erreur principale, une piste de progrès.",
    o.rubric ? `\nCONSIGNES DE L'ENSEIGNANT (prioritaires) :\n"""\n${o.rubric}\n"""` : '',
    o.grid ? `\nGRILLE DÉTAILLÉE VALIDÉE PAR L'ENSEIGNANT (à appliquer strictement) :
Pour chaque critère, lis les descriptions de niveaux, choisis celle qui correspond le mieux à la copie et attribue exactement les points de ce niveau. Dans la justification, indique le niveau retenu et ce qui, dans la copie, le justifie.
${gridText(o.grid)}` : '',
  ].join('\n');
}

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'correction',
    schema: {
      type: 'object',
      required: ['nom', 'groupe', 'questions', 'commentaire', 'incertain', 'raison_incertitude'],
      properties: {
        nom: { type: 'string' },
        groupe: { type: 'string' },
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
  return aiChat(env, prompt, content, SCHEMA);
}

// Appel au modèle (format compatible OpenAI) : nouvelles tentatives, modèle de secours, réponse JSON.
async function aiChat(env, system, content, responseFormat) {
  let model = env.AI_MODEL;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content }],
        response_format: responseFormat,
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

// ---------- Correction de la langue ----------

const LANG_CATEGORIES = {
  orthographe: "orthographe d'usage (mot mal écrit, accent, majuscule)",
  accord: 'accords (genre, nombre, participe passé, adjectif, déterminant)',
  conjugaison: 'conjugaison (terminaison, temps, mode, auxiliaire)',
  ponctuation: 'ponctuation (virgule, point, apostrophe, trait d’union)',
  syntaxe: 'syntaxe (construction de phrase, préposition, négation, pronom)',
  vocabulaire: 'vocabulaire (mot impropre, anglicisme, registre familier)',
};
const LEVELS = {
  primaire: 'élève du primaire : relève les fautes importantes, explications très simples',
  secondaire1: 'élève de secondaire 1-2 : explications simples avec la règle',
  secondaire3: 'élève de secondaire 3-5 : explications précises avec la règle',
  cegep: 'étudiant de cégep ou adulte : exigence élevée, explications précises',
};
// Le repérage des positions est nettement plus précis avec l'accès natif de Gemini qu'avec l'accès compatible OpenAI.
const NATIVE_LANG_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      mot_fautif: { type: 'STRING', description: 'Le mot ou groupe de mots exact contenant la faute.' },
      correction: { type: 'STRING', description: 'La correction proposée.' },
      explication: { type: 'STRING', description: 'Une courte explication de la règle (ex: Accord du participe passé).' },
      categorie: { type: 'STRING', enum: Object.keys(LANG_CATEGORIES) },
      box: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Bounding box [ymin, xmin, ymax, xmax] normalisée de 0 à 1000. Laisse vide si introuvable.' },
    },
    required: ['mot_fautif', 'correction', 'explication', 'categorie'],
  },
};

const inlineImage = (dataUrl) => {
  const [, mimeType, data] = dataUrl.match(/^data:([^;]+);base64,(.*)$/s) || [];
  return { inlineData: { mimeType, data } };
};

async function geminiVision(env, prompt, dataUrl) {
  const list = await geminiNative(env, [{ text: prompt }, inlineImage(dataUrl)], NATIVE_LANG_SCHEMA, env.LANG_MODEL);
  return { fautes: (Array.isArray(list) ? list : list.fautes || []).map((f) => ({ ...f, texte: f.mot_fautif ?? f.texte, box: f.box ?? f.box_2d })) };
}

// Appel natif à Gemini (generateContent) avec réponse JSON structurée.
async function geminiNative(env, parts, schema, preferredModel) {
  const base = env.GEMINI_NATIVE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const chain = [...new Set([preferredModel, env.AI_MODEL, env.AI_FALLBACK_MODEL].filter(Boolean))];
  let model = chain.shift();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.AI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
    });
    if (res.ok) {
      const text = (await res.json()).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
      if (!text) throw new Error('réponse vide');
      return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    }
    if (res.status === 404 && chain.length) { console.error(`Modèle ${model} introuvable, essai de ${chain[0]}`); model = chain.shift(); continue; }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    const detail = await res.text().catch(() => '');
    throw new Error(`IA ${res.status} : ${detail.slice(0, 300)}`);
  }
}

// 2e passe de précision : l'appli envoie des zones agrandies autour de chaque faute, et Gemini y encadre le mot exact.
// Non facturé (inclus dans l'analyse de la langue).
const LOCATE_BATCH = 30;
const LOCATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    zones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { numero: { type: 'INTEGER' }, trouve: { type: 'BOOLEAN' }, box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } } },
        required: ['numero', 'trouve', 'box_2d'],
      },
    },
  },
  required: ['zones'],
};

async function locate(request, env) {
  await getKey(env, bearer(request));
  const { items } = await readJson(request);
  if (!Array.isArray(items) || !items.length || items.length > LOCATE_BATCH) throw new HttpError(400, `Entre 1 et ${LOCATE_BATCH} zones`);
  for (const it of items) {
    if (typeof it?.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(it.image) || it.image.length > MAX_THUMB_CHARS) throw new HttpError(400, 'Zone invalide');
  }
  const parts = [{ text: [
    "Chaque image ci-dessous est un agrandissement d'une copie manuscrite ou dactylographiée.",
    "Pour chaque image numérotée, trouve le mot ou groupe de mots indiqué et donne le rectangle qui l'encadre exactement (toutes ses lettres, sans déborder sur les mots voisins).",
    "Format box_2d : [ymin, xmin, ymax, xmax] normalisé de 0 à 1000 par rapport à CETTE image. Si le texte n'apparaît pas dans l'image, mets trouve à false.",
  ].join('\n') }];
  items.forEach((it, i) => parts.push({ text: `Image ${i + 1} — texte à trouver : « ${String(it.text || '').slice(0, 120)} »` }, inlineImage(it.image)));
  let raw;
  try { raw = await geminiNative(env, parts, LOCATE_SCHEMA, env.LANG_MODEL); } catch (err) {
    console.error('Précision impossible :', err.message);
    throw new HttpError(502, 'Affinage impossible');
  }
  const byNumber = new Map((raw.zones || []).map((z) => [Number(z.numero), z]));
  return json({ boxes: items.map((_, i) => { const z = byNumber.get(i + 1); return z?.trouve ? cleanBox(z.box_2d, 1000) : null; }) });
}

// Rectangle [ymin, xmin, ymax, xmax] sur 1000, ou null s'il est inutilisable.
function cleanBox(box, maxHeight = 400) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [y0, x0, y1, x1] = box.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v)))));
  return y1 > y0 && x1 > x0 && y1 - y0 <= maxHeight ? [y0, x0, y1, x1] : null;
}

async function language(request, env) {
  const key = bearer(request);
  const body = await readJson(request);
  checkImages(body.pages, MAX_PAGES_PER_COPY, 'Copie', MAX_LANG_IMAGE_CHARS);
  if (!body.pages.length) throw new HttpError(400, 'Copie vide');
  const cats = (Array.isArray(body.categories) ? body.categories : Object.keys(LANG_CATEGORIES)).filter((c) => LANG_CATEGORIES[c]);
  if (!cats.length) throw new HttpError(400, 'Choisissez au moins un type de faute');
  const level = LEVELS[body.level] || LEVELS.secondaire1;

  const n = body.pages.length; // 1 page de copie = 1 page décomptée
  const reserved = await env.DB.prepare('UPDATE access_keys SET pages = pages - ? WHERE key = ? AND pages >= ?').bind(n, key, n).run();
  if (!reserved.meta.changes) {
    await getKey(env, key);
    throw new HttpError(402, 'Solde de pages insuffisant. Rechargez votre compte pour continuer.');
  }

  // Consigne calquée sur la version Gemini de l'enseignant, dont le surlignage est précis.
  const system = `Tu es un expert en langue française. Voici l'image d'un document manuscrit (ou dactylographié), une copie de ${level}.
Ta mission :
1. Lis le texte attentivement.
2. Identifie UNIQUEMENT ces fautes : ${cats.map((c) => LANG_CATEGORIES[c]).join(' ; ')}. Pas de choix de style ; si un mot est illisible, ignore-le.
3. Pour CHAQUE faute trouvée, déduis ses coordonnées (bounding box) sur l'image en encadrant le MOT COMPLET ou l'EXPRESSION COMPLÈTE qui contient la faute.
   Les coordonnées 'box' doivent être un tableau de 4 nombres [ymin, xmin, ymax, xmax] normalisés entre 0 et 1000.
   (ymin = haut, xmin = gauche, ymax = bas, xmax = droite).
Pour chaque faute, indique aussi sa catégorie et une courte explication de la règle.
Renvoie EXCLUSIVEMENT un tableau JSON. Si aucune faute n'est trouvée, renvoie un tableau vide [].`;

  const identity = body.identify === false ? Promise.resolve({}) : geminiNative(env, [{ text: "Recopie le nom de l'élève et son groupe s'ils sont écrits sur cette copie (sinon chaînes vides)." }, inlineImage(body.pages[0])],
    { type: 'OBJECT', properties: { nom: { type: 'STRING' }, groupe: { type: 'STRING' } }, required: ['nom', 'groupe'] }, env.LANG_MODEL).catch(() => ({}));
  const results = await Promise.allSettled(body.pages.map((url) => geminiVision(env, system, url)));
  const failed = results.filter((x) => x.status === 'rejected').length;
  if (failed) {
    await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(failed, key).run();
    console.error('Langue : pages en échec :', results.filter((x) => x.status === 'rejected').map((x) => x.reason?.message).join(' / '));
  }
  if (failed === n) throw new HttpError(502, "L'analyse de la langue a échoué. Aucune page n'a été décomptée, réessayez.");

  const ok = results.map((x) => (x.status === 'fulfilled' ? x.value : null));
  const pages = ok.map((raw) => (raw ? {
    errors: (raw.fautes || []).filter((f) => LANG_CATEGORIES[f.categorie] && cats.includes(f.categorie)).map((f) => ({
      text: String(f.texte || '').slice(0, 200), correction: String(f.correction || '').slice(0, 200),
      category: f.categorie, explanation: String(f.explication || '').slice(0, 400), box: cleanBox(f.box),
    })),
  } : { errors: [], failed: true }));
  const who = await identity;
  const name = String(who.nom || '').trim();
  const group = String(who.groupe || '').trim();
  const left = await env.DB.prepare('SELECT pages FROM access_keys WHERE key = ?').bind(key).first();
  return json({ name, group, pages, failedPages: failed, pagesLeft: left?.pages ?? 0 });
}

// ---------- Grille détaillée ----------

// Grille envoyée par l'appli : [{ name, max, levels: [{ points, description }] }]. Renvoie null si absente.
function readGrid(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (raw.length > 30) throw new HttpError(400, 'Grille : 30 critères maximum');
  return raw.map((c) => {
    const max = Number(c.max);
    const levels = (Array.isArray(c.levels) ? c.levels : []).slice(0, 10)
      .map((l) => ({ points: Number(l.points), description: String(l.description || '').slice(0, 600) }))
      .filter((l) => Number.isFinite(l.points) && l.points >= 0 && l.points <= max);
    if (!c.name || !(max > 0)) throw new HttpError(400, 'Grille invalide');
    return { name: String(c.name).slice(0, 200), max, levels };
  });
}

function gridText(grid) {
  return grid.map((c, i) => [`${i + 1}. ${c.name} (sur ${fr(c.max)} points)`,
    ...[...c.levels].sort((x, y) => y.points - x.points).map((l) => `   - ${fr(l.points)} pt : ${l.description}`)].join('\n')).join('\n');
}

// Ramène les points de chaque critère au niveau de la grille le plus proche : c'est ce qui stabilise les notes.
function snapToGrid(result, grid) {
  if (result.questions.length !== grid.length) return;
  result.questions.forEach((q, i) => {
    const allowed = grid[i].levels.map((l) => l.points);
    if (!allowed.length) return;
    q.points = allowed.reduce((best, v) => (Math.abs(v - q.raw) < Math.abs(best - q.raw) ? v : best), allowed[0]);
    q.max = grid[i].max;
    q.question = grid[i].name;
  });
  result.grade = result.questions.reduce((x, q) => x + q.points, 0);
  result.sumMax = result.questions.reduce((x, q) => x + q.max, 0);
}

const GRID_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'grille',
    schema: {
      type: 'object',
      required: ['criteres'],
      properties: {
        criteres: {
          type: 'array',
          items: {
            type: 'object',
            required: ['nom', 'points_max', 'niveaux'],
            properties: {
              nom: { type: 'string' },
              points_max: { type: 'number' },
              niveaux: {
                type: 'array',
                items: { type: 'object', required: ['points', 'description'], properties: { points: { type: 'number' }, description: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
};

// Rédige une grille avec descripteurs de niveaux à partir des consignes (gratuit, l'enseignant la valide ensuite).
async function rubric(request, env) {
  await getKey(env, bearer(request));
  const body = await readJson(request);
  const total = Number(body.total);
  if (!(total > 0 && total <= 1000)) throw new HttpError(400, 'Barème invalide');
  const text = String(body.rubric || '').slice(0, 8000);
  checkImages(body.rubricPages || [], MAX_RUBRIC_PAGES, 'Corrigé');
  if (!text.trim() && !(body.rubricPages || []).length) throw new HttpError(400, "Écrivez d'abord vos consignes ou ajoutez votre corrigé.");
  const unit = body.wholePoints ? 1 : 0.5;
  const system = [
    "Tu es conseiller pédagogique. À partir des consignes et du corrigé d'un enseignant, rédige une grille d'évaluation critériée.",
    `Barème total : ${fr(total)} points. Les points maximum des critères doivent totaliser exactement ${fr(total)}.`,
    "Reprends les critères et les points de l'enseignant s'il en donne ; n'en invente pas d'autres. S'il n'en donne pas, propose 3 à 6 critères pertinents.",
    `Pour chaque critère, rédige 4 ou 5 niveaux, du maximum à 0, avec des points multiples de ${fr(unit)}.`,
    "Chaque description de niveau doit être concrète et observable dans une copie (ce qui est présent, combien, avec quelle qualité), pour que deux correcteurs différents choisissent le même niveau.",
    "Appuie-toi sur les exigences précises des consignes (éléments obligatoires, nombre de causes, sections attendues, etc.). Rédige en français.",
  ].join('\n');
  const image = (url) => ({ type: 'image_url', image_url: { url, detail: 'high' } });
  const content = [{ type: 'text', text: text ? `CONSIGNES DE L'ENSEIGNANT :\n${text}` : 'Consignes : voir le corrigé joint.' },
    ...(body.rubricPages || []).map(image)];
  let raw;
  try { raw = await aiChat(env, system, content, GRID_SCHEMA); } catch (err) {
    console.error('Grille impossible :', err.message);
    throw new HttpError(502, 'La préparation de la grille a échoué. Réessayez.');
  }
  const snap = (n) => Math.round((Number(n) || 0) / unit) * unit;
  const grid = (raw.criteres || []).map((c) => {
    const max = Math.max(unit, snap(c.points_max));
    const levels = (c.niveaux || []).map((l) => ({ points: Math.min(max, Math.max(0, snap(l.points))), description: String(l.description || '').trim() }))
      .sort((x, y) => y.points - x.points);
    return { name: String(c.nom || 'Critère').trim(), max, levels };
  });
  if (!grid.length) throw new HttpError(502, "L'IA n'a pas pu préparer de grille à partir de ces consignes. Précisez les critères et réessayez.");
  return json({ grid });
}

// Fiabilité : accord des deux corrections question par question (écarts de points rapportés au barème),
// pénalisée si l'IA exprime un doute, ne lit pas le nom ou si le barème ne totalise pas.
// Chaque question de la 1re correction reçoit `second` : les points de la 2e quand ils diffèrent.
function compare(a, b, total) {
  const key = (q) => q.question.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byKey = new Map((b?.questions || []).map((q) => [key(q), q]));
  let gap = 0;
  // La 2e correction reçoit la structure de la 1re : même nombre de questions → comparaison par position.
  const sameShape = b && b.questions.length === a.questions.length;
  const questions = a.questions.map((q, i) => {
    if (!b) return { ...q, second: null };
    const other = sameShape ? b.questions[i] : byKey.get(key(q));
    if (!other) return { ...q, second: null }; // découpage différent : seul l'écart de note totale compte
    const d = Math.abs(q.points - other.points);
    gap += d;
    return { ...q, second: d > 1e-9 ? other.points : null };
  });
  if (b) gap = Math.max(gap, Math.abs(a.grade - b.grade)); // découpages différents des questions
  let score = b ? 100 * (1 - Math.min(1, (gap / total) * 3)) : 70; // 1 point d'écart sur 20 → 85 %
  if (a.uncertain) score -= 15;
  if (!a.name) score -= 5;
  if (Math.abs(a.sumMax - total) > 1e-9) score -= 15;
  return { reliability: Math.max(0, Math.min(100, Math.round(score))), questions };
}

// Ramène les points sur la granularité choisie et dans les bornes, puis calcule la note.
function normalize(raw, total, unit) {
  const snap = (n) => Math.round((Number(n) || 0) / unit) * unit;
  const questions = (raw.questions || []).map((q) => {
    const max = Math.max(0, snap(q.points_max));
    return {
      question: String(q.question || 'Question').trim(),
      points: Math.min(max, Math.max(0, snap(q.points_obtenus))),
      raw: Number(q.points_obtenus) || 0, // valeur brute, pour l'ajustement au niveau de grille le plus proche
      max,
      justification: String(q.justification || '').trim(),
    };
  });
  const sumMax = questions.reduce((a, q) => a + q.max, 0);
  const grade = Math.min(total, questions.reduce((a, q) => a + q.points, 0));
  return { name: String(raw.nom || '').trim(), group: String(raw.groupe || '').trim(), questions, sumMax, grade, comment: String(raw.commentaire || '').trim(),
    uncertain: !!raw.incertain, reason: String(raw.raison_incertitude || '').trim() };
}

const fr = (n) => String(n).replace('.', ',');

// ---------- Détection des copies (gratuite) ----------

const SPLIT_BATCH = 40;
const MAX_THUMB_CHARS = 250_000;
const SPLIT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'decoupage',
    schema: {
      type: 'object',
      required: ['pages'],
      properties: {
        pages: {
          type: 'array',
          items: {
            type: 'object',
            required: ['numero', 'nouvelle_copie', 'nom'],
            properties: { numero: { type: 'integer' }, nouvelle_copie: { type: 'boolean' }, nom: { type: 'string' } },
          },
        },
      },
    },
  },
};

// Reçoit des miniatures de pages numérisées à la suite et indique où commence chaque copie d'élève.
async function split(request, env) {
  const key = bearer(request);
  await getKey(env, key); // réservé aux clés valides, mais non facturé
  const body = await readJson(request);
  const pages = body.pages;
  if (!Array.isArray(pages) || !pages.length || pages.length > SPLIT_BATCH) throw new HttpError(400, `Entre 1 et ${SPLIT_BATCH} pages par envoi`);
  const ok = (img) => typeof img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(img) && img.length <= MAX_THUMB_CHARS;
  if (!pages.every(ok) || (body.previous && !ok(body.previous))) throw new HttpError(400, 'Miniature invalide');

  const image = (url) => ({ type: 'image_url', image_url: { url, detail: 'low' } });
  const content = [];
  if (body.previous) content.push({ type: 'text', text: 'Page précédente (contexte seulement, ne pas la numéroter) :' }, image(body.previous));
  pages.forEach((url, i) => content.push({ type: 'text', text: `Page ${i + 1} :` }, image(url)));
  const system = [
    "Tu reçois des pages numérisées à la suite, provenant de plusieurs copies d'élèves mises bout à bout.",
    "Pour chaque page numérotée, indique si elle est la PREMIÈRE page d'une nouvelle copie d'élève.",
    "Indices d'une nouvelle copie : un nom d'élève ou un en-tête (nom, groupe, date), le titre de l'examen, « page 1 », la première question, une écriture différente de la page précédente.",
    "Indices d'une suite : numéro de page > 1, suite d'une réponse, questions suivantes, même écriture, aucun en-tête.",
    body.previous ? "La page de contexte appartient à la copie qui précède la page 1." : "La page 1 commence toujours une nouvelle copie.",
    "Si une nouvelle copie commence, recopie le nom de l'élève tel qu'écrit (chaîne vide si illisible). Sinon, chaîne vide.",
  ].join('\n');
  let raw;
  try {
    raw = await aiChat(env, system, content, SPLIT_SCHEMA);
  } catch (err) {
    console.error('Détection impossible :', err.message);
    throw new HttpError(502, 'La détection automatique a échoué. Réessayez ou regroupez les pages manuellement.');
  }
  const byNumber = new Map((raw.pages || []).map((p) => [Number(p.numero), p]));
  return json({
    pages: pages.map((_, i) => {
      const p = byNumber.get(i + 1);
      return { startsNew: (!body.previous && i === 0) || !!p?.nouvelle_copie, name: String(p?.nom || '').trim() };
    }),
  });
}

async function grade(request, env) {
  const key = bearer(request);
  const body = await readJson(request);
  const total = Number(body.total);
  if (!(total > 0 && total <= 1000)) throw new HttpError(400, 'Barème invalide');
  checkImages(body.pages, MAX_PAGES_PER_COPY, 'Copie');
  if (!body.pages.length) throw new HttpError(400, 'Copie vide');
  checkImages(body.rubricPages || [], MAX_RUBRIC_PAGES, 'Corrigé');

  // Réserve les pages de façon atomique (le corrigé n'est pas facturé).
  // Mode approfondi : deux corrections, donc deux pages décomptées par page de copie.
  const deep = body.deep !== false;
  const perPage = deep ? 2 : 1;
  const n = body.pages.length * perPage;
  const reserved = await env.DB.prepare('UPDATE access_keys SET pages = pages - ? WHERE key = ? AND pages >= ?').bind(n, key, n).run();
  if (!reserved.meta.changes) {
    await getKey(env, key); // 401 si la clé n'existe pas
    throw new HttpError(402, 'Solde de pages insuffisant. Rechargez votre compte pour continuer.');
  }

  const unit = body.wholePoints ? 1 : 0.5;
  const grid = readGrid(body.grid);
  const prompt = buildPrompt({ exam: String(body.exam || '').slice(0, 200), total, wholePoints: !!body.wholePoints,
    checkLanguage: !!body.checkLanguage, rubric: String(body.rubric || '').slice(0, 8000), grid });

  // Double correction : la 1re fixe le découpage en questions, la 2e corrige indépendamment
  // les mêmes questions (intitulés et points maximum, sans les notes de la 1re).
  const rubricPages = body.rubricPages || [];
  const errors = [];
  const attempt = async (p) => {
    try { return normalize(await callModel(env, p, rubricPages, body.pages), total, unit); } catch (err) { errors.push(err); return null; }
  };
  const impose = (list) => `${prompt}

STRUCTURE IMPOSÉE : corrige exactement ces ${list.length} questions ou critères, dans cet ordre, avec ces intitulés et ces points maximum. Fais ta propre correction, indépendante.
${list.map((q, i) => `${i + 1}. ${q.name} (sur ${fr(q.max)} points)`).join('\n')}`;
  const promptA = grid ? impose(grid) : prompt;
  const a = (await attempt(promptA)) || (await attempt(promptA));
  if (!a) {
    await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(n, key).run();
    const reasons = errors.map((e) => e?.message || '').join(' / ');
    console.error('Correction impossible :', reasons);
    const code = (reasons.match(/IA (\d{3})/) || [])[1];
    const hint = code === '401' || code === '403' ? ' (clé IA refusée : vérifiez AI_API_KEY)'
      : code === '429' ? ' (limite du fournisseur IA atteinte : facturation activée ?)'
      : code === '400' || code === '404' ? ` (requête refusée par l'IA, code ${code} : modèle ou format)`
      : code ? ` (erreur IA ${code})` : reasons.includes('JSON') ? " (réponse de l'IA illisible)" : '';
    throw new HttpError(502, `La correction a échoué${hint}. Aucune page n'a été décomptée, réessayez.`);
  }

  const b = deep && a.questions.length
    ? await attempt(grid ? promptA : impose(a.questions.map((q) => ({ name: q.question, max: q.max })))) : null;
  if (grid) { snapToGrid(a, grid); if (b) snapToGrid(b, grid); }
  const flags = [];
  if (a.uncertain && a.reason) flags.push(a.reason);
  else if (a.uncertain) flags.push("L'IA a un doute sur cette copie.");
  if (!a.name) flags.push('Nom illisible ou absent.');
  if (Math.abs(a.sumMax - total) > 1e-9) flags.push(`Les questions totalisent ${fr(a.sumMax)} points au lieu de ${fr(total)}.`);
  if (deep && !b) {
    // La contre-vérification a échoué : on ne facture que la correction simple.
    await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(body.pages.length, key).run();
    flags.push("La contre-vérification a échoué : correction simple seulement (une seule page décomptée par page).");
  }
  const { reliability: score, questions: compared } = compare(a, b, total);
  // Mode approfondi : la note retenue est la moyenne des deux corrections, question par question.
  const sameShape = b && b.questions.length === a.questions.length;
  const questions = compared.map((q, i) => {
    if (!sameShape || q.second == null) return q;
    const mean = Math.round(((q.points + b.questions[i].points) / 2) / unit) * unit;
    return { ...q, first: q.points, points: Math.min(q.max, mean) };
  }).map(({ raw, ...q }) => q);
  const finalGrade = Math.min(total, questions.reduce((x, q) => x + q.points, 0));
  const reliability = b ? score : null; // sans 2e correction, pas de mesure d'accord
  const disputed = questions.filter((q) => q.second != null);
  if (reliability != null && reliability < RELIABILITY_ALERT) {
    flags.push(disputed.length
      ? `Fiabilité ${reliability} % : les deux corrections ne s'entendent pas sur ${disputed.map((q) => q.question).join(', ')}.`
      : `Fiabilité ${reliability} % : vérifiez cette copie.`);
  }

  const left = await env.DB.prepare('SELECT pages FROM access_keys WHERE key = ?').bind(key).first();
  return json({
    name: a.name, group: a.group, grade: finalGrade, total, questions, comment: a.comment,
    reliability, secondGrade: b ? b.grade : null, flags, pagesLeft: left?.pages ?? 0,
  });
}
