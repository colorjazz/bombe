import { HttpError } from '../../partage/correction/erreurs.js';
import { ENGLISH_OUTPUT, buildPrompt, COMMENT_VARIETY, avoidText, readAvoid, SCHEMA, ANNOTATED_SCHEMA, ANNOTATION_RULE, calibrationText, readCalibration, readStructure, readGrid, gridText, snapToGrid, normalize, placement, compare, cleanBox, GRID_SCHEMA, fr, SPLIT_SCHEMA } from '../../partage/correction/copies.js';
import { ORTHO_TYPES, LANG_CATEGORIES, LANG_CATEGORIES_EN, LEVELS, LEVELS_EN, NATIVE_LANG_SCHEMA, NOT_YET, langSchema, countWords, CHECKS, CHECKS_EN, checklist, checklistEn, RECTIF, readPda, langErrors, sameError, overlaps, pdaSystem, pdaSecSystem } from '../../partage/correction/langue.js';
// Correcteur Express — serveur (Cloudflare Worker).
//
// Rôle : garder la clé de l'IA (Gemini), décompter les pages achetées et encaisser via Stripe.
// Confidentialité : les copies transitent en mémoire vers l'IA puis sont oubliées.
// Rien n'est écrit sur disque ni dans les journaux, à part les clés d'accès et leur solde.

// Parrainage : un collègue invité reçoit REFERRAL.referee pages en plus de son premier forfait ; le parrain reçoit
// REFERRAL.referrer pages quand ce collègue a corrigé REFERRAL.activePages pages (un vrai utilisateur), pour
// REFERRAL.max collègues au plus.
export const REFERRAL = { referrer: 200, referee: 100, activePages: 30, max: 5 };

export const PACKS = {
  decouverte: { name: 'Pack Découverte', nameEn: 'Starter pack', pages: 200, amount: 1400 },
  session: { name: 'Pack Session', nameEn: 'Term pack', pages: 500, amount: 2900 },
  annee: { name: 'Pack Année', nameEn: 'Year pack', pages: 1800, amount: 7900 },
};

// Un travail long du cégep fait souvent 20 à 30 pages ; au-delà de 10, l'appli réduit les pages avant l'envoi
// pour que la requête reste sous la limite de taille de Google (MAX_COPY_CHARS).
const MAX_PAGES_PER_COPY = 30;
const MAX_COPY_CHARS = 18_000_000; // ~13 Mo d'images par copie
const MAX_RUBRIC_PAGES = 10;
const MAX_IMAGE_CHARS = 2_500_000; // ~1,8 Mo par page une fois décodée
const MAX_LANG_IMAGE_CHARS = 14_000_000; // photos en pleine résolution pour la correction de la langue (~10 Mo)
// Une école entière partage souvent la même adresse IP : on plafonne par jour au lieu de bloquer.
const TRIALS_PER_IP_PER_DAY = 10;
const IDEAS_PER_IP_PER_DAY = 5;
const DAY_MS = 24 * 3600 * 1000;
const RELIABILITY_ALERT = 80; // en dessous, la copie est signalée à vérifier

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env);
      const route = ROUTES[`${request.method} ${url.pathname}`];
      if (!route) return json({ error: 'Introuvable' }, 404);
      // Option « Traiter les copies au Québec » (en-tête X-Region: qc) : Vertex AI à Montréal pour cette requête.
      // Jamais de repli ailleurs : sans la clé Vertex, la requête est refusée.
      if (request.headers.get('X-Region') === 'qc') {
        if (!env.VERTEX_SA_KEY) return json({ error: "Le traitement au Québec n'est pas offert pour l'instant : décochez l'option dans les réglages avancés." }, 503);
        env = Object.assign(Object.create(env), { AI_PROVIDER: 'vertex' }); // les liaisons (DB, ASSETS) restent accessibles
      }
      return await route(request, env, url, ctx);
    } catch (err) {
      if (err instanceof HttpError && err.status === 502 && request.headers.get('X-Region') === 'qc') {
        return json({ error: `${err.message} Le traitement au Québec (Montréal) n'a pas répondu : aucune copie n'a été envoyée ailleurs. Réessayez, ou décochez l'option dans les réglages avancés.` }, 502);
      }
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      // On ne journalise que le message : jamais le contenu des copies.
      console.error('Erreur interne :', err?.message);
      return json({ error: 'Erreur interne, réessayez dans un instant.' }, 500);
    }
  },
  // Toutes les heures : efface les empreintes d'IP de plus de 24 h (promesse de la politique de confidentialité),
  // les clés d'essai de plus de 90 jours et le journal d'utilisation de plus de 12 mois.
  async scheduled(event, env) {
    await ensureSchema(env);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM trials WHERE created_at < ?').bind(now - DAY_MS),
      env.DB.prepare('DELETE FROM access_keys WHERE is_trial = 1 AND created_at < ?').bind(now - 90 * DAY_MS),
      env.DB.prepare('UPDATE ideas SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?').bind(now - DAY_MS),
      env.DB.prepare('DELETE FROM usage WHERE created_at < ?').bind(now - 365 * DAY_MS),
      env.DB.prepare('DELETE FROM ai_calls WHERE created_at < ?').bind(now - 90 * DAY_MS),
    ]);
  },
};

const ROUTES = {
  'GET /api/balance': balance, 'GET /api/referral': referral,
  'POST /api/trial': trial,
  'POST /api/idea': idea,
  'POST /api/admin/keys': adminCreateKey, 'POST /api/admin/note': adminSetNote,
  'GET /api/admin/keys': adminListKeys, 'POST /api/admin/ai-check': adminAiCheck, 'GET /api/admin/stats': adminStats, 'POST /api/admin/revenue-reset': adminRevenueReset, 'POST /api/admin/setting': adminSetting, 'POST /api/admin/notify-test': adminNotifyTest, 'POST /api/admin/delete-keys': adminDeleteKeys, 'POST /api/admin/insight': adminInsight,
  'POST /api/checkout': checkout,
  'GET /api/claim': claim,
  'POST /api/stripe-webhook': stripeWebhook,
  'POST /api/grade': grade,
  'POST /api/split': split,
  'POST /api/orient': orient,
  'POST /api/rubric': rubric, 'POST /api/classify': classify,
  'POST /api/comment': rewriteComment,
  'POST /api/language': language,
  'POST /api/language-reread': languageReread,
  'POST /api/language-verify': languageVerify,
  'POST /api/profil': writerProfile,
  'POST /api/progression': writerProgress,
  // Pays du visiteur (fourni par Cloudflare), pour la mention « Fait au Canada » de l'accueil.
  'GET /api/geo': async (request) => json({ country: request.cf?.country || '' }),
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
  `CREATE TABLE IF NOT EXISTS gifts (key TEXT PRIMARY KEY, pages INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ideas (text TEXT NOT NULL, email TEXT, lang TEXT, ip_hash TEXT, created_at INTEGER NOT NULL)`,
  // Journal d'utilisation (statistiques du fondateur) : clé, pages, type et heure, jamais de copie ni de nom. Gardé 12 mois.
  // Un remboursement de pages s'inscrit en négatif.
  `CREATE TABLE IF NOT EXISTS usage (key TEXT NOT NULL, pages INTEGER NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS usage_time ON usage (created_at)`,
  `CREATE INDEX IF NOT EXISTS usage_key ON usage (key, created_at)`,
  // Détail des ventes : montant payé (après code promo) et clé d'essai convertie en achat.
  `CREATE TABLE IF NOT EXISTS sales (session_id TEXT PRIMARY KEY, amount INTEGER, from_trial INTEGER NOT NULL DEFAULT 0)`,
  // Réglages du fondateur (ex. revenue_since : début du compteur de revenus, après une remise à zéro).
  `CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT)`,
  // Jetons consommés par chaque appel à l'IA (modèle, entrée, sortie avec la réflexion) : le vrai coût de l'IA dans l'admin.
  // Aucun contenu, aucune clé. Gardé 90 jours.
  `CREATE TABLE IF NOT EXISTS ai_calls (model TEXT NOT NULL, tin INTEGER NOT NULL, tout INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_calls_time ON ai_calls (created_at)`,
  // Parrainage : un code par clé (le lien ne montre jamais la clé), et une ligne par achat parrainé.
  `CREATE TABLE IF NOT EXISTS referral_codes (code TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS referrals (session_id TEXT PRIMARY KEY, code TEXT NOT NULL, referrer_key TEXT NOT NULL, referee_key TEXT NOT NULL,
     referrer_pages INTEGER NOT NULL, referee_pages INTEGER NOT NULL, created_at INTEGER NOT NULL, referrer_paid INTEGER NOT NULL DEFAULT 0, paid_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS referrals_referee ON referrals (referee_key, referrer_paid)`,
];
let schemaReady;
function ensureSchema(env) {
  schemaReady ||= env.DB.batch(DB_SCHEMA.map((q) => env.DB.prepare(q))).catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

// Langue de l'interface de l'enseignant (en-tête envoyé par l'appli) : l'IA rédige ses textes dans cette langue.
const isEnglish = (request) => (request.headers.get('X-Lang') || '').toLowerCase().startsWith('en');

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
  return json({ pages: row.pages, trial: !!row.is_trial, qc: !!env.VERTEX_SA_KEY }); // qc : option « au Québec » offerte
}

// « Proposez une fonctionnalité » (page d'accueil) : le texte, et le courriel si la personne veut une réponse.
// L'empreinte de connexion sert seulement à limiter les envois ; elle est effacée après 24 h. Lire les idées :
// SELECT datetime(created_at / 1000, 'unixepoch') AS quand, lang, email, text FROM ideas ORDER BY created_at DESC;
async function idea(request, env) {
  const body = await readJson(request);
  if (body.website) return json({ ok: true }); // champ invisible rempli : un robot
  const text = String(body.text || '').trim().slice(0, 2000);
  const email = String(body.email || '').trim().slice(0, 200);
  if (text.length < 5) throw new HttpError(400, 'Décrivez votre idée en quelques mots.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Adresse courriel invalide.');
  const ipHash = await sha256(`${env.IP_SALT || ''}:${request.headers.get('CF-Connecting-IP') || 'inconnue'}`);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM ideas WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - DAY_MS).first();
  if (recent.n >= IDEAS_PER_IP_PER_DAY) throw new HttpError(429, 'Merci ! Vous avez déjà envoyé plusieurs idées aujourd’hui : écrivez-nous par courriel pour la suite.');
  await env.DB.prepare('INSERT INTO ideas (text, email, lang, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(text, email || null, isEnglish(request) ? 'en' : 'fr', ipHash, now).run();
  return json({ ok: true });
}

// ---------- Clés offertes (page admin.html, réservée au fondateur) ----------
// Protégées par le secret ADMIN_TOKEN (Cloudflare → Variables and Secrets) ; sans lui, ces routes n'existent pas.
// La note (nom ou courriel du prof testeur) sert seulement au fondateur à savoir à qui il a donné la clé.
async function requireAdmin(request, env) {
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN) throw new HttpError(404, 'Introuvable');
  // Comparaison des empreintes : même durée quelle que soit la position de la première différence.
  if (!given || (await sha256(given)) !== (await sha256(env.ADMIN_TOKEN))) throw new HttpError(403, 'Mot de passe administrateur incorrect.');
}

async function adminCreateKey(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const pages = Math.round(Number(body.pages));
  if (!(pages >= 1 && pages <= 5000)) throw new HttpError(400, 'Nombre de pages invalide (1 à 5000).');
  const note = String(body.note || '').trim().slice(0, 200);
  const key = newKey(); const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO access_keys (key, pages, is_trial, created_at) VALUES (?, ?, 0, ?)').bind(key, pages, now),
    env.DB.prepare('INSERT INTO gifts (key, pages, note, created_at) VALUES (?, ?, ?, ?)').bind(key, pages, note || null, now),
  ]);
  return json({ key, pages });
}

// « Pour qui » oublié ou à corriger après coup.
async function adminSetNote(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const key = String(body.key || '').trim();
  const note = String(body.note || '').trim().slice(0, 200);
  const { meta } = await env.DB.prepare('UPDATE gifts SET note = ? WHERE key = ?').bind(note || null, key).run();
  if (!meta.changes) throw new HttpError(404, 'Clé offerte introuvable.');
  return json({ ok: true, note });
}

// Clés créées pour rien (tests, doublons) : effacées avec leur note. Une clé qui a servi à un achat n'est jamais
// effacée (le client a payé ces pages). Le journal d'utilisation reste, pour garder des statistiques justes.
async function adminDeleteKeys(request, env) {
  await requireAdmin(request, env);
  const { keys } = await readJson(request);
  if (!Array.isArray(keys) || !keys.length || keys.length > 500) throw new HttpError(400, 'Liste de clés invalide');
  const list = [...new Set(keys.map((k) => String(k).trim()))].filter(Boolean);
  const deleted = [], kept = [];
  for (const key of list) {
    const paid = await env.DB.prepare('SELECT 1 FROM payments WHERE key = ? LIMIT 1').bind(key).first();
    if (paid) { kept.push(key); continue; }
    await env.DB.batch([env.DB.prepare('DELETE FROM access_keys WHERE key = ?').bind(key), env.DB.prepare('DELETE FROM gifts WHERE key = ?').bind(key)]);
    deleted.push(key);
  }
  return json({ deleted, kept });
}

async function adminListKeys(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(`SELECT g.key, g.pages AS given, g.note, g.created_at, k.pages AS left
    FROM gifts g LEFT JOIN access_keys k ON k.key = g.key ORDER BY g.created_at DESC LIMIT 200`).all();
  return json({ keys: results });
}

// Statistiques du fondateur : toutes les clés (essai, offertes, achetées), achats, utilisation des 90 derniers jours, idées.
// Pages données = essai + offertes + achetées ; pages utilisées = données − restantes.
// Vérification du fournisseur d'IA depuis l'admin : un petit appel de chaque sorte (format OpenAI et format natif),
// avec le fournisseur en service et, si la clé est là, avec Vertex AI à Montréal, avant de basculer AI_PROVIDER.
async function adminAiCheck(request, env) {
  await requireAdmin(request, env);
  const schema = { type: 'json_schema', json_schema: { name: 'test', schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'string' } } } } };
  const probe = async (e) => {
    const out = {};
    for (const [name, call] of [['chat', () => aiChat(e, 'Réponds en JSON.', 'Écris « oui » dans ok.', schema)],
      ['natif', () => geminiNative(e, [{ text: 'Écris « oui » dans ok.' }], { type: 'OBJECT', properties: { ok: { type: 'STRING' } }, required: ['ok'] }, e.LANG_MODEL, { thinking: 'low', timeoutMs: 30_000 })]]) {
      const t = Date.now();
      try { out[name] = { ok: !!(await call())?.ok, ms: Date.now() - t }; } catch (err) { out[name] = { ok: false, ms: Date.now() - t, error: String(err.message).slice(0, 300) }; }
    }
    return out;
  };
  const current = vertexOn(env) ? { provider: 'vertex', location: env.VERTEX_LOCATION || VERTEX_LOCATION, model: vertexModel(env) }
    : { provider: 'gemini', model: env.AI_MODEL, langModel: env.LANG_MODEL };
  return json({ current: { ...current, ...(await probe(env)) },
    vertex: env.VERTEX_SA_KEY && !vertexOn(env) ? { location: env.VERTEX_LOCATION || VERTEX_LOCATION, model: vertexModel(env), ...(await probe(Object.assign(Object.create(env), { AI_PROVIDER: 'vertex' }))) } : null,
    vertexKey: !!env.VERTEX_SA_KEY });
}

async function adminStats(request, env) {
  await requireAdmin(request, env);
  return json(await statsData(env));
}

// Remise à zéro du compteur de revenus (achats de test du fondateur, par exemple) : rien n'est effacé,
// les achats restent dans la base ; l'admin compte les revenus à partir de cette date.
async function adminRevenueReset(request, env) {
  await requireAdmin(request, env);
  const { undo } = await readJson(request).catch(() => ({}));
  const now = undo ? 0 : Date.now(); // undo : on recompte depuis le début
  await env.DB.prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').bind('revenue_since', String(now)).run();
  return json({ revenueSince: now });
}

// Réglages modifiables depuis l'admin : dépenses de pub (pour le coût par essai) et coût de l'IA par page.
async function adminSetting(request, env) {
  await requireAdmin(request, env);
  const { name, value } = await readJson(request);
  let clean;
  if (name === 'ad_spend') {
    if (!Array.isArray(value) || value.length > 500) throw new HttpError(400, 'Liste de dépenses invalide');
    clean = value.map((x) => ({ d: String(x.d || '').slice(0, 10), c: Math.round(Number(x.c)) }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.c > 0 && x.c < 10_000_000);
  } else if (name === 'ai_since') { // remise à zéro du coût de l'IA : on compte à partir de maintenant (0 = annuler)
    clean = value === 0 ? 0 : Date.now();
  } else if (name === 'test_keys') { // clés du fondateur (tests) : exclues de toutes les statistiques
    if (!Array.isArray(value) || value.length > 500) throw new HttpError(400, 'Liste de clés invalide');
    clean = [...new Set(value.map((k) => String(k).trim()).filter((k) => /^CE-[A-Z0-9-]{5,40}$/.test(k)))];
  } else if (name === 'ai_prices') { // prix par million de jetons (USD) et taux de change
    if (!value || typeof value !== 'object') throw new HttpError(400, 'Prix invalides');
    const num = (v, max) => { const n = Number(v); if (!(n >= 0 && n < max)) throw new HttpError(400, 'Prix invalides'); return n; };
    clean = { usdCad: num(value.usdCad, 5), models: Object.fromEntries(Object.entries(value.models || {}).slice(0, 20)
      .map(([m, p]) => [String(m).slice(0, 60), { in: num(p.in, 1000), out: num(p.out, 1000) }])) };
  } else if (name === 'ai_cpp') {
    const v = Number(value);
    if (!(v >= 0 && v < 1000)) throw new HttpError(400, 'Coût par page invalide');
    clean = v;
  } else throw new HttpError(400, 'Réglage inconnu');
  await env.DB.prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').bind(name, JSON.stringify(clean)).run();
  return json({ name, value: clean });
}

async function adminNotifyTest(request, env) {
  await requireAdmin(request, env);
  if (!env.NOTIFY_URL) return json({ ok: false, configured: false });
  return json({ ok: await notify(env, 'Les alertes de vente fonctionnent.', 'Test Brûle la pile ✅'), configured: true });
}

async function statsData(env) {
  const since = Date.now() - 90 * DAY_MS;
  const [keys, sales, usage, ideas, settings, aiCalls] = await env.DB.batch([
    env.DB.prepare(`SELECT k.key, k.pages AS left, k.is_trial AS trial, k.email, k.created_at, g.pages AS gift, g.note,
        (SELECT SUM(p.pages) FROM payments p WHERE p.key = k.key AND p.session_id NOT LIKE 'cs_test_%') AS bought,
        (SELECT MAX(s.from_trial) FROM payments p JOIN sales s ON s.session_id = p.session_id WHERE p.key = k.key) AS converted,
        (SELECT MAX(u.created_at) FROM usage u WHERE u.key = k.key AND u.pages > 0) AS last_used
      FROM access_keys k LEFT JOIN gifts g ON g.key = k.key ORDER BY k.created_at DESC LIMIT 3000`),
    env.DB.prepare(`SELECT p.key, p.pages, p.created_at, s.amount, s.from_trial FROM payments p LEFT JOIN sales s ON s.session_id = p.session_id
      WHERE p.session_id NOT LIKE 'cs_test_%' ORDER BY p.created_at DESC LIMIT 1000`),
    env.DB.prepare('SELECT key, pages, kind, created_at FROM usage WHERE created_at > ? ORDER BY created_at LIMIT 50000').bind(since),
    env.DB.prepare('SELECT text, email, lang, created_at FROM ideas ORDER BY created_at DESC LIMIT 500'),
    env.DB.prepare('SELECT name, value FROM settings'),
    env.DB.prepare(`SELECT model, CAST(created_at / 3600000 AS INTEGER) AS hour, COUNT(*) AS calls, SUM(tin) AS tin, SUM(tout) AS tout
      FROM ai_calls WHERE created_at > ? GROUP BY model, hour ORDER BY hour`).bind(since),
  ]);
  const conf = Object.fromEntries(settings.results.map((r) => [r.name, r.value]));
  const parse = (v, d) => { try { return v == null ? d : JSON.parse(v); } catch { return d; } };
  const revenueSince = Number(conf.revenue_since) || 0;
  const adSpend = parse(conf.ad_spend, []), aiCpp = parse(conf.ai_cpp, null), aiSince = Number(parse(conf.ai_since, 0)) || 0;
  // Clés de test du fondateur : marquées dans la liste, et leurs pages et achats ne comptent nulle part.
  const testKeys = parse(conf.test_keys, []), isTest = new Set(testKeys);
  const trialPages = Number(env.TRIAL_PAGES) || 30;
  const list = keys.results.map((k) => {
    // Une clé d'essai achetée avant le suivi des conversions a perdu sa marque « essai » : les pages restantes le trahissent.
    const given = Math.max((k.gift || 0) + (k.bought || 0) + (k.trial || k.converted ? trialPages : 0), k.left);
    return { ...k, type: k.gift ? 'gift' : k.bought ? 'bought' : k.trial ? 'trial' : 'other', given, used: given - k.left };
  });
  list.forEach((k) => { k.test = isTest.has(k.key); });
  return { keys: list, sales: sales.results.filter((x) => !isTest.has(x.key)), usage: usage.results.filter((u) => !isTest.has(u.key)), ideas: ideas.results, testKeys, trialPages, since, revenueSince, adSpend, aiCpp, aiSince, aiCalls: aiCalls.results, aiPrices: parse(conf.ai_prices, null), notify: !!env.NOTIFY_URL };
}

// Bilan IA, à la demande (bouton de la page admin) : l'IA ne reçoit que des chiffres agrégés et le texte des idées,
// jamais de clé, de nom ni de courriel. La page affiche elle-même qui relancer et quelle idée est citée.
const INSIGHT_SCHEMA = { type: 'json_schema', json_schema: { name: 'bilan', schema: { type: 'object', required: ['titre', 'points'], properties: {
  titre: { type: 'string' },
  points: { type: 'array', items: { type: 'object', required: ['type', 'texte'], properties: {
    type: { type: 'string', enum: ['bravo', 'action', 'idee', 'alerte'] }, texte: { type: 'string' }, idee: { type: 'integer' } } } },
} } } };
async function adminInsight(request, env) {
  await requireAdmin(request, env);
  const d = await statsData(env);
  const now = Date.now(), DAY = DAY_MS;
  const inDays = (t, a, b) => t > now - b * DAY && t <= now - a * DAY;
  const by = (t) => d.keys.filter((k) => k.type === t && !k.test);
  const sumUsage = (a, b) => d.usage.filter((u) => inDays(u.created_at, a, b)).reduce((x, u) => x + u.pages, 0);
  const facts = {
    aujourdhui: new Date(now).toISOString().slice(0, 10),
    essais: { total: by('trial').length, utilises: by('trial').filter((k) => k.used > 0).length,
      crees_7_derniers_jours: by('trial').filter((k) => inDays(k.created_at, 0, 7)).length, crees_7_jours_precedents: by('trial').filter((k) => inDays(k.created_at, 7, 14)).length },
    cles_offertes: { total: by('gift').length, utilisees: by('gift').filter((k) => k.used > 0).length,
      jamais_utilisees_depuis_3_jours: by('gift').filter((k) => k.used === 0 && k.created_at < now - 3 * DAY).length },
    achats: { total: d.sales.length, '7_derniers_jours': d.sales.filter((x) => inDays(x.created_at, 0, 7)).length,
      revenus_dollars: d.sales.filter((x) => x.created_at > d.revenueSince).reduce((x, s) => x + (s.amount ?? ({ 200: 1400, 500: 2900, 1800: 7900 }[s.pages] || 0)), 0) / 100,
      essais_convertis: d.sales.filter((x) => x.from_trial).length },
    pages_utilisees: { '7_derniers_jours': sumUsage(0, 7), '7_jours_precedents': sumUsage(7, 14),
      langue: d.usage.filter((u) => u.kind === 'langue').reduce((x, u) => x + u.pages, 0), copies: d.usage.filter((u) => u.kind === 'copies').reduce((x, u) => x + u.pages, 0) },
  };
  const ideas = d.ideas.slice(0, 30).map((i, n) => `#${n + 1} (${new Date(i.created_at).toISOString().slice(0, 10)}) : ${String(i.text).slice(0, 500)}`).join('\n');
  const system = [
    "Tu conseilles le fondateur de « Brûle la pile », une petite appli web québécoise de correction de copies par IA pour les enseignants (lancée en octobre 2026, vendue en forfaits de pages, essai gratuit de 30 pages, clés offertes à des profs testeurs). Il est lui-même enseignant et fait tout seul.",
    "À partir des chiffres et des idées reçues, fais un bilan court et utile : 3 à 6 points, chacun d'une ou deux phrases, en tutoyant, concrets et honnêtes (encourage quand c'est mérité, dis-le franchement quand ça stagne).",
    "Types : « bravo » (un progrès réel, chiffre à l'appui), « action » (une chose précise à faire cette semaine : relancer les testeurs qui n'ont pas essayé, publier dans les groupes de profs, écrire aux conseillers pédagogiques…), « idee » (une idée reçue qui vaut la peine d'y réfléchir : mets son numéro dans « idee » et dis pourquoi), « alerte » (un problème à surveiller).",
    "Pas de jargon, pas de promesses chiffrées inventées ; appuie-toi seulement sur les données fournies. Le calendrier scolaire québécois compte (fins d'étape en novembre, février et juin). Titre : une phrase qui résume la période.",
  ].join('\n');
  let raw;
  try { raw = await aiChat(env, system, `CHIFFRES :\n${JSON.stringify(facts, null, 1)}\n\nIDÉES REÇUES :\n${ideas || '(aucune)'}`, INSIGHT_SCHEMA, { temperature: 0.4 }); } catch (err) {
    console.error('Bilan impossible :', err.message);
    throw new HttpError(502, 'Le bilan n\'a pas pu être préparé. Réessayez.');
  }
  const points = (raw.points || []).slice(0, 8).map((p) => ({ type: ['bravo', 'action', 'idee', 'alerte'].includes(p.type) ? p.type : 'action',
    texte: String(p.texte || '').slice(0, 600), idee: Number.isInteger(p.idee) && p.idee >= 1 && p.idee <= d.ideas.length ? p.idee : null }));
  return json({ titre: String(raw.titre || '').slice(0, 200), points, facts });
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
  const { pack, key: existingKey, ref } = await readJson(request);
  const p = PACKS[pack];
  if (!p) throw new HttpError(400, 'Pack inconnu');

  // Recharge d'une clé existante, ou nouvelle clé créée au moment du paiement.
  let key = newKey();
  if (existingKey) {
    key = bearer(new Request(url, { headers: { Authorization: `Bearer ${existingKey}` } }));
    await getKey(env, key);
  }

  // Code de parrainage valide et qui n'est pas celui de l'acheteur : le filleul voit son bonus sur la page de paiement.
  const code = /^[A-Z0-9]{6,12}$/.test(String(ref || '')) ? String(ref) : '';
  const owner = code ? await env.DB.prepare('SELECT key FROM referral_codes WHERE code = ?').bind(code).first() : null;
  const referred = owner && owner.key !== key ? code : '';
  const bonus = referred ? (isEnglish(request) ? ` + ${REFERRAL.referee} bonus pages (referral)` : ` + ${REFERRAL.referee} pages offertes (parrainage)`) : '';

  const session = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'payment',
    success_url: `${url.origin}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/#tarifs`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'cad',
    'line_items[0][price_data][unit_amount]': String(p.amount),
    // La clé fait partie du nom de l'article : c'est la seule ligne présente sur tous les reçus, y compris
    // ceux d'une commande à 0 $ (code promo à 100 %), où Stripe ne crée pas de paiement ni sa description.
    'line_items[0][price_data][product_data][name]': isEnglish(request)
      ? `Burn the Pile — ${p.nameEn}, ${p.pages.toLocaleString('en-CA')} pages${bonus} · Access key ${key}`
      : `Brûle la pile — ${p.name}, ${p.pages.toLocaleString('fr-CA')} pages${bonus} · Clé d'accès ${key}`,
    'metadata[key]': key,
    'metadata[pages]': String(p.pages),
    ...(referred ? { 'metadata[ref]': referred } : {}),
    // La description du paiement figure sur le reçu que Stripe envoie par courriel : le client y retrouve sa clé.
    'payment_intent_data[description]': isEnglish(request)
      ? `Your access key: ${key} (${p.pages.toLocaleString('en-CA')} pages added). Keep this email.`
      : `Votre clé d'accès : ${key} (${p.pages.toLocaleString('fr-CA')} pages ajoutées). Conservez ce courriel.`,
    allow_promotion_codes: 'true',
    locale: isEnglish(request) ? 'en' : 'fr-CA',
  });
  return json({ url: session.url });
}

// Appelé par la page de remerciement. Vérifie le paiement auprès de Stripe et crédite une seule fois.
async function claim(request, env, url) {
  const sessionId = url.searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new HttpError(400, 'Paiement introuvable');

  const session = await stripe(env, 'GET', `checkout/sessions/${sessionId}`);
  if (!isSettled(session)) throw new HttpError(402, "Le paiement n'est pas encore confirmé.");
  const { key, pages } = await creditSession(env, session);
  const row = await getKey(env, key);
  return json({ key, pages: row.pages, added: pages });
}

// Payée, ou gratuite grâce à un code promo à 100 % (Stripe indique alors « no_payment_required »).
function isSettled(session) {
  return session?.status === 'complete' && ['paid', 'no_payment_required'].includes(session.payment_status);
}

// Crédite une seule fois les pages d'une session Checkout payée (page de remerciement ou webhook).
async function creditSession(env, session) {
  const key = session.metadata?.key;
  const pages = Number(session.metadata?.pages);
  if (!key || !pages) throw new HttpError(400, 'Paiement invalide');
  const now = Date.now();
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO payments (session_id, key, pages, created_at) VALUES (?, ?, ?, ?)')
    .bind(session.id, key, pages, now).run();
  if (inserted.meta.changes) {
    const before = await env.DB.prepare('SELECT is_trial FROM access_keys WHERE key = ?').bind(key).first();
    await env.DB.prepare('INSERT OR IGNORE INTO sales (session_id, amount, from_trial) VALUES (?, ?, ?)')
      .bind(session.id, Number.isFinite(session.amount_total) ? session.amount_total : null, before?.is_trial ? 1 : 0).run();
    await env.DB.prepare(`INSERT INTO access_keys (key, pages, email, is_trial, created_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(key) DO UPDATE SET pages = pages + excluded.pages, is_trial = 0, email = COALESCE(excluded.email, email)`)
      .bind(key, pages, session.customer_details?.email || null, now).run();
    const pack = { 200: 'Découverte', 500: 'Session', 1800: 'Année' }[pages] || `${pages} pages`;
    const paid = Number.isFinite(session.amount_total) ? `${(session.amount_total / 100).toFixed(2).replace('.', ',')} $` : '';
    const bonus = await rewardReferral(env, session, key, now);
    await notify(env, `${pack} (${pages} pages)${paid ? ` · ${paid}` : ''}${before?.is_trial ? ' · après un essai gratuit' : ''}${bonus ? ' · parrainée' : ''}`,
      `Nouvelle vente${String(session.id).startsWith('cs_test_') ? ' (test)' : ''} 🎉`);
    return { key, pages: pages + bonus };
  }
  const done = await env.DB.prepare('SELECT referee_pages FROM referrals WHERE session_id = ?').bind(session.id).first();
  return { key, pages: pages + (done?.referee_pages || 0) };
}

// Achat parrainé : seulement le premier achat payant de la clé du filleul, jamais sa propre clé ni son propre courriel.
// Une seule fois par achat (INSERT OR IGNORE sur la session). Le filleul reçoit son bonus tout de suite ; le parrain,
// plus tard (payReferrer), et seulement pour ses REFERRAL.max premiers collègues. Retourne les pages offertes au filleul.
async function rewardReferral(env, session, key, now) {
  const code = session.metadata?.ref;
  if (!code || !(session.amount_total > 0)) return 0;
  const owner = await env.DB.prepare('SELECT r.key, k.email FROM referral_codes r JOIN access_keys k ON k.key = r.key WHERE r.code = ?').bind(code).first();
  if (!owner || owner.key === key) return 0;
  const email = session.customer_details?.email;
  if (email && owner.email && email.toLowerCase() === owner.email.toLowerCase()) return 0;
  const earlier = await env.DB.prepare('SELECT COUNT(*) AS n FROM payments WHERE key = ? AND session_id != ?').bind(key, session.id).first();
  if (earlier.n) return 0;
  const done = await env.DB.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_key = ? AND referrer_pages > 0').bind(owner.key).first();
  const forReferrer = done.n < REFERRAL.max ? REFERRAL.referrer : 0; // au-delà du plafond, seul le filleul reçoit son bonus
  const row = await env.DB.prepare(`INSERT OR IGNORE INTO referrals (session_id, code, referrer_key, referee_key, referrer_pages, referee_pages, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(session.id, code, owner.key, key, forReferrer, REFERRAL.referee, now).run();
  if (!row.meta.changes) return 0;
  await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(REFERRAL.referee, key).run();
  return REFERRAL.referee;
}

// Le parrain reçoit ses pages quand le collègue a vraiment corrigé REFERRAL.activePages pages depuis son achat
// (pages nettes : les remboursements sont déduits). Appelé à chaque correction ; une seule fois par parrainage.
async function payReferrer(env, key) {
  try {
    const r = await env.DB.prepare('SELECT session_id, referrer_key, referrer_pages, created_at FROM referrals WHERE referee_key = ? AND referrer_paid = 0 AND referrer_pages > 0 LIMIT 1').bind(key).first();
    if (!r) return;
    const used = await env.DB.prepare('SELECT COALESCE(SUM(pages), 0) AS n FROM usage WHERE key = ? AND created_at >= ?').bind(key, r.created_at).first();
    if (used.n < REFERRAL.activePages) return;
    const upd = await env.DB.prepare('UPDATE referrals SET referrer_paid = 1, paid_at = ? WHERE session_id = ? AND referrer_paid = 0').bind(Date.now(), r.session_id).run();
    if (!upd.meta.changes) return;
    await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(r.referrer_pages, r.referrer_key).run();
    await notify(env, `Le collègue parrainé a corrigé ${REFERRAL.activePages} pages : le parrain reçoit ${r.referrer_pages} pages.`, 'Parrainage réussi 🤝');
  } catch (err) { console.error('Parrainage :', err.message); }
}

// Lien de parrainage de l'enseignant (créé au premier appel) et ce qu'il lui a rapporté.
async function referral(request, env, url) {
  const key = bearer(request);
  await getKey(env, key);
  let row = await env.DB.prepare('SELECT code FROM referral_codes WHERE key = ?').bind(key).first();
  if (!row) {
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    const code = Array.from(bytes, (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    await env.DB.prepare('INSERT OR IGNORE INTO referral_codes (code, key, created_at) VALUES (?, ?, ?)').bind(code, key, Date.now()).run();
    row = await env.DB.prepare('SELECT code FROM referral_codes WHERE key = ?').bind(key).first();
  }
  const stats = await env.DB.prepare(`SELECT COALESCE(SUM(referrer_paid), 0) AS paid, COALESCE(SUM(CASE WHEN referrer_paid = 0 AND referrer_pages > 0 THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN referrer_paid = 1 THEN referrer_pages ELSE 0 END), 0) AS pages, COALESCE(SUM(CASE WHEN referrer_pages > 0 THEN 1 ELSE 0 END), 0) AS counted
    FROM referrals WHERE referrer_key = ?`).bind(key).first();
  return json({ code: row.code, link: `${url.origin}/?ref=${row.code}`, count: stats.paid, pending: stats.pending, pages: stats.pages,
    left: Math.max(0, REFERRAL.max - stats.counted), reward: REFERRAL });
}

// Alerte au fondateur (appli ntfy sur son téléphone) : NOTIFY_URL = https://ntfy.sh/<sujet secret>, dans Cloudflare.
// Seulement le forfait et le montant : jamais de clé, de nom ni de courriel. Une alerte ratée ne bloque jamais la vente.
async function notify(env, message, title) {
  if (!env.NOTIFY_URL) return false;
  try {
    // Publication en JSON (accents et émojis permis, contrairement aux en-têtes HTTP) : sujet = chemin de l'adresse.
    const u = new URL(env.NOTIFY_URL);
    const res = await fetch(u.origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ topic: u.pathname.replace(/^\/+|\/+$/g, ''), title, message, tags: ['moneybag'] }) });
    return res.ok;
  } catch (err) { console.error('Alerte impossible :', err.message); return false; }
}

// Stripe prévient le site après chaque paiement : les pages sont créditées même si le client
// ferme l'onglet avant la page de remerciement. Signature vérifiée avec STRIPE_WEBHOOK_SECRET.
async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'STRIPE_WEBHOOK_SECRET manquant dans Cloudflare (Settings → Variables and Secrets)');
  const body = await request.text();
  const header = request.headers.get('Stripe-Signature') || '';
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((kv) => kv.length === 2));
  const t = Number(parts.t);
  const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - t) > 300) throw new HttpError(400, 'Signature invalide');
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${t}.${body}`));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  if (!signatures.includes(expected)) throw new HttpError(400, 'Signature invalide');

  const event = JSON.parse(body);
  const session = event.data?.object;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
    && isSettled(session) && session.metadata?.key) {
    await creditSession(env, session);
  }
  return json({ received: true });
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

{
  const item = ANNOTATED_SCHEMA.json_schema.schema.properties.questions.items;
  item.required.push('note_marge', 'page', 'zone');
  Object.assign(item.properties, { note_marge: { type: 'string' }, page: { type: 'integer' }, zone: { type: 'array', items: { type: 'number' } } });
}

async function callModel(env, prompt, rubricPages, pages, opts) {
  const image = (url) => ({ type: 'image_url', image_url: { url, detail: 'high' } });
  const content = [];
  if (rubricPages.length) content.push({ type: 'text', text: 'CORRIGÉ / GRILLE DE L’ENSEIGNANT :' }, ...rubricPages.map(image));
  content.push({ type: 'text', text: `COPIE DE L'ÉLÈVE (${pages.length} page(s), dans l'ordre) :` }, ...pages.map(image));
  // Grille de 20 critères ou travail de 30 pages : la réponse (une justification par critère) dépasse 8192 jetons.
  return aiChat(env, prompt, content, opts?.annotate ? ANNOTATED_SCHEMA : SCHEMA, { maxTokens: 24000, ...opts });
}

// Appel au modèle (format compatible OpenAI) : nouvelles tentatives, modèle de secours, réponse JSON.
// ---------- Fournisseur d'IA ----------
// Par défaut : l'API Gemini (clé AI_API_KEY), sans garantie sur le pays de traitement. Avec AI_PROVIDER = "vertex" et
// VERTEX_SA_KEY (clé JSON d'un compte de service Google Cloud, rôle « Utilisateur Vertex AI ») : Vertex AI dans la
// région VERTEX_LOCATION, par défaut northamerica-northeast1 (Montréal), où le traitement reste dans la région.
// Tous les appels y prennent VERTEX_MODEL : seul gemini-3.5-flash répondait à Montréal le 28 octobre 2026 (3.6 et 3.7 : 404).
const VERTEX_LOCATION = 'northamerica-northeast1';
const vertexOn = (env) => env.AI_PROVIDER === 'vertex' && !!env.VERTEX_SA_KEY;
const vertexModel = (env) => env.VERTEX_MODEL || 'gemini-3.5-flash';
function vertexBase(env) {
  const sa = JSON.parse(env.VERTEX_SA_KEY), loc = env.VERTEX_LOCATION || VERTEX_LOCATION;
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${env.VERTEX_PROJECT || sa.project_id}/locations/${loc}`;
}
// Jeton d'accès du compte de service (JWT signé RS256, échangé chez Google), gardé jusqu'à une minute de sa fin.
let vertexAuth = null; // { exp, token: Promise<string> }
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (t) => b64url(new TextEncoder().encode(t));
function vertexToken(env) {
  if (vertexAuth && vertexAuth.exp > Date.now() + 60_000) return vertexAuth.token;
  const token = (async () => {
    const sa = JSON.parse(env.VERTEX_SA_KEY);
    const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlText(JSON.stringify({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }) });
    if (!res.ok) throw new Error(`IA ${res.status} : jeton Vertex refusé ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return (await res.json()).access_token;
  })();
  vertexAuth = { exp: Date.now() + 3500_000, token };
  token.catch(() => { vertexAuth = null; });
  return token;
}

// Un appel réussi à l'IA : on note le modèle et les jetons (sortie = réponse + réflexion). Ne bloque jamais la correction.
async function logAi(env, model, tin, tout) {
  try {
    await env.DB.prepare('INSERT INTO ai_calls (model, tin, tout, created_at) VALUES (?, ?, ?, ?)')
      .bind(String(model).replace(/^google\//, ''), Math.max(0, Math.round(Number(tin) || 0)), Math.max(0, Math.round(Number(tout) || 0)), Date.now()).run();
  } catch (err) { console.error('Journal IA impossible :', err.message); }
}

async function aiChat(env, system, content, responseFormat, opts = {}) {
  const vx = vertexOn(env);
  let model = vx ? `google/${vertexModel(env)}` : opts.model || env.AI_MODEL;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(vx ? `${vertexBase(env)}/endpoints/openapi/chat/completions` : `${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vx ? await vertexToken(env) : env.AI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content }],
        response_format: responseFormat,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens || 8192, // les modèles qui « réfléchissent » comptent aussi ces jetons
        ...(opts.reasoning ? { reasoning_effort: opts.reasoning } : {}),
      }),
    });
    if (res.ok) {
      const out = await res.json();
      const u = out.usage || {};
      await logAi(env, model, u.prompt_tokens, (u.total_tokens || 0) - (u.prompt_tokens || 0));
      const choice = out.choices?.[0], msg = choice?.message;
      // Réponse coupée (limite de longueur atteinte) : le JSON est incomplet ; on le dit plutôt qu'une erreur de syntaxe.
      if (choice?.finish_reason === 'length') throw new Error('réponse coupée (trop longue)');
      if (!msg?.content) throw new Error('réponse vide');
      // Certains modèles entourent le JSON de ```json … ``` malgré la consigne.
      return JSON.parse(msg.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    }
    // Modèle retiré par le fournisseur : on bascule sur l'alias « toujours à jour ».
    if (res.status === 404 && !vx && env.AI_FALLBACK_MODEL && model !== env.AI_FALLBACK_MODEL) {
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


// Codes du ministère (S, P, U, G, V), comme sur les copies : un homophone grammatical est une erreur G même s'il est
// surligné avec l'orthographe. Le code se déduit du sous-type.
const ORTHO_CODES = { phonologique: 'U', morphologique: 'U', visuo_orthographique: 'U', homophone_lexical: 'U', segmentation: 'U', majuscule_signes: 'U',
  homophone_grammatical: 'G', accord_gn: 'G', accord_attribut: 'G', accord_sv_simple: 'G', accord_sv_complexe: 'G', pp_etre: 'G', pp_avoir: 'G', pp_seul: 'G',
  morphologie_verbale: 'G', homophone_verbal: 'G', delimitation: 'P', virgule_detachement: 'P', virgule: 'P', ponctuation_autre: 'P',
  structure_phrase: 'S', subordination: 'S', negation: 'S', pronom_preposition: 'S', vocabulaire: 'V' };
const ORTHO_RULE = `\n\nANALYSE ORTHOPÉDAGOGIQUE : pour chaque faute, indique aussi « sous_type », le raisonnement probable de l'élève, parmi :\n${Object.entries(ORTHO_TYPES).map(([k, v]) => `   - ${k} (${v.cat}, critère ${ORTHO_CODES[k]}) : ${v.def}`).join('\n')}\n   Le sous-type doit correspondre à la catégorie de la faute (entre parenthèses).`;
const orthoOn = (request, body) => body.ortho === true && !isEnglish(request);


const inlineImage = (dataUrl) => {
  const [, mimeType, data] = dataUrl.match(/^data:([^;]+);base64,(.*)$/s) || [];
  return { inlineData: { mimeType, data } };
};

// Deux lectures : /api/language rend tout de suite la première, que l'enseignant peut déjà relire ; l'appli demande
// ensuite à /api/language-reread une relecture qui connaît cette liste et cherche seulement les fautes oubliées
// (repérage ≈ 73 % en une lecture, ≈ 88 % avec la relecture ; deux lectures indépendantes en parallèle : ≈ 75 %).
const REREAD = {
  fr: (list) => `\n\nRELECTURE : une première lecture a déjà relevé ces fautes :\n${list}\nRelis maintenant la copie mot à mot et relève UNIQUEMENT les fautes OUBLIÉES, en particulier : accord du verbe avec un sujet éloigné ou inversé, accord du participe passé, accord dans le groupe du nom, négation incomplète (« ne » absent), majuscules (noms propres, début de phrase), homophones, lettres manquantes, virgules oubliées après un organisateur ou un complément en début de phrase, phrases incomplètes ou sujet répété (seulement pour les catégories demandées). Ne répète aucune faute de la liste. Mêmes règles : aucune faute sur une lettre bien formée. Si tu n'en trouves pas d'autre, renvoie [].`,
  en: (list) => `\n\nSECOND READING: a first reading already found these errors:\n${list}\nNow reread the paper word by word and report ONLY the MISSED errors, especially: subject-verb agreement with a distant or inverted subject, pronoun agreement, capitalization (proper nouns, sentence start), homophones. Do not repeat any error from the list. Same rules: a well-formed letter is never an error. If you find no other error, return [].`,
};
const REREAD_MS = 30 * 60 * 1000; // la relecture d'une page analysée reste possible 30 minutes (gratuite : déjà décomptée)

const rereadToken = async (env, key, page, ts) => sha256(`${env.IP_SALT || ''}:reread:${key}:${ts}:${await sha256(page)}`);

// Vérification à la loupe (gratuite) : chaque mot relevé, recadré et agrandi, est recopié lettre par lettre sans correction.
// Une « faute » qui disparaît à la loupe (« guerre » lu « guere » sur la page entière) devient « à vérifier ».
// L'IA ne fait que recopier ; c'est le code qui compare avec la correction.
const MAX_CROPS = 12; // par appel : l'appli en envoie plusieurs en parallèle
async function languageVerify(request, env) {
  await getKey(env, bearer(request));
  const { crops } = await readJson(request);
  const ok = (c) => c && typeof c.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(c.image) && c.image.length <= MAX_THUMB_CHARS;
  if (!Array.isArray(crops) || !crops.length || crops.length > MAX_CROPS || !crops.every(ok)) throw new HttpError(400, 'Images invalides');
  // Ni la première lecture ni la correction ne sont montrées : elles poussent le modèle à « voir » le mot bien écrit.
  const parts = [{ text: "Chaque image montre, agrandi, un mot (ou un petit groupe de mots) manuscrit d'un élève, au centre de l'image. "
    + "Recopie EXACTEMENT ce que l'élève a écrit au centre, lettre par lettre, majuscules, accents et lettres doublées compris, sans rien corriger, même si c'est une faute." }];
  crops.forEach((c, k) => parts.push({ text: `Image ${k}${String(c.text || '').includes(' ') ? ' (plusieurs mots)' : ''} :` }, inlineImage(c.image)));
  let raw;
  try {
    raw = await geminiNative(env, parts, { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      image: { type: 'INTEGER' }, ecrit: { type: 'STRING' } }, required: ['image', 'ecrit'] } },
    env.LANG_MODEL, { thinking: 'low', timeoutMs: 45_000 }); // recopier des lettres : réflexion courte, temps prévisible
  } catch (err) {
    console.error('Vérification impossible :', err.message);
    throw new HttpError(502, 'Vérification impossible');
  }
  const out = crops.map(() => null);
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!Number.isInteger(r.image) || r.image < 0 || r.image >= crops.length) continue;
    // La faute disparaît seulement si ce qui est écrit est exactement la correction (accents et majuscules compris).
    const clean = (t) => String(t || '').normalize('NFC').replace(/[’]/g, "'").replace(/[.,;:!?]+$/, '').trim();
    out[r.image] = { written: String(r.ecrit || '').slice(0, 200), error: clean(r.ecrit) !== clean(crops[r.image].correction) };
  }
  return json({ results: out });
}

async function languageReread(request, env) {
  const key = bearer(request);
  await getKey(env, key);
  const body = await readJson(request);
  checkImages([body.page], 1, 'Copie', MAX_LANG_IMAGE_CHARS);
  const cats = (Array.isArray(body.categories) ? body.categories : Object.keys(LANG_CATEGORIES)).filter((c) => LANG_CATEGORIES[c]);
  const pda = readPda(body.pda);
  const ts = Number(body.ts);
  if (!cats.length || !(Date.now() - ts < REREAD_MS) || body.token !== await rereadToken(env, key, body.page, ts)) throw new HttpError(403, 'Relecture refusée');
  const known = (Array.isArray(body.known) ? body.known : []).slice(0, 200).map((f) => ({ texte: String(f.text || '').slice(0, 200), correction: String(f.correction || '').slice(0, 200), box: cleanBox(f.box) }));
  const list = known.map((f) => `- « ${f.texte} » → « ${f.correction} »`).join('\n') || '(aucune)';
  let raw;
  try { raw = await geminiVision(env, langSystem(request, body, cats, pda) + REREAD[isEnglish(request) ? 'en' : 'fr'](list), body.page, pda, orthoOn(request, body)); } catch (err) {
    console.error('Relecture impossible :', err.message);
    throw new HttpError(502, 'Relecture impossible');
  }
  const same = (f, g) => f.texte.trim().toLowerCase() === String(g.texte || '').trim().toLowerCase() || overlaps(f.box, cleanBox(g.box));
  return json({ errors: langErrors(raw.fautes.filter((g) => !known.some((f) => same(f, g))), cats, pda) });
}

async function geminiVision(env, prompt, dataUrl, pda, ortho = false) {
  const list = await geminiNative(env, [{ text: ortho ? prompt + ORTHO_RULE : prompt }, inlineImage(dataUrl)], langSchema(pda, ortho), env.LANG_MODEL, { thinking: env.LANG_THINKING, timeoutMs: 150_000 });
  return { fautes: (Array.isArray(list) ? list : list.fautes || []).map((f) => ({ ...f, texte: f.mot_fautif ?? f.texte, box: f.box ?? f.box_2d })) };
}

// Appel natif à Gemini (generateContent) avec réponse JSON structurée.
// opts.thinking : niveau de réflexion du modèle (par défaut celui du modèle : « low » est deux fois plus rapide mais
// invente 2 à 3 fois plus de fausses fautes) ; chaque appel a une limite de temps.
async function geminiNative(env, parts, schema, preferredModel, opts = {}) {
  const vx = vertexOn(env);
  const base = vx ? `${vertexBase(env)}/publishers/google` : env.GEMINI_NATIVE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const chain = vx ? [vertexModel(env)] : [...new Set([preferredModel, env.AI_MODEL, env.AI_FALLBACK_MODEL].filter(Boolean))];
  let model = chain.shift();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(vx ? { Authorization: `Bearer ${await vertexToken(env)}` } : { 'x-goog-api-key': env.AI_API_KEY }) },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema,
          ...(opts.thinking ? { thinkingConfig: { thinkingLevel: opts.thinking } } : {}) },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs || 120_000),
    });
    if (res.ok) {
      const out = await res.json();
      const u = out.usageMetadata || {};
      await logAi(env, model, u.promptTokenCount, (u.totalTokenCount || 0) - (u.promptTokenCount || 0));
      const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
      if (!text) throw new Error('réponse vide');
      return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    }
    if (res.status === 404 && chain.length) { console.error(`Modèle ${model} introuvable, essai de ${chain[0]}`); model = chain.shift(); continue; }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    const detail = await res.text().catch(() => '');
    throw new Error(`IA ${res.status} : ${detail.slice(0, 300)}`);
  }
}

// Sens d'une page photographiée de côté (gratuit) : l'appli ne l'appelle que pour les pages dont les lignes semblent verticales.
// Elle envoie la page tournée dans les deux sens possibles ; l'IA dit laquelle se lit à l'endroit.
// (Demander directement l'angle donnait presque toujours « 90 » : 9 bonnes réponses sur 18 avec de vraies copies.)
async function orient(request, env) {
  await getKey(env, bearer(request));
  const { images } = await readJson(request);
  const ok = (im) => typeof im === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(im) && im.length <= MAX_THUMB_CHARS;
  if (!Array.isArray(images) || images.length !== 2 || !images.every(ok)) throw new HttpError(400, 'Image invalide');
  const prompt = "Voici deux fois la même page (copie d'élève, texte imprimé ou manuscrit), tournée de deux façons : image A, puis image B. "
    + "L'une montre le texte à l'endroit, l'autre à l'envers (tourné de 180°). Pour chacune, recopie les premiers mots que tu arrives à lire "
    + "de gauche à droite sans tourner la tête (chaîne vide si rien n'est lisible ainsi), puis indique laquelle est à l'endroit.";
  let raw;
  try {
    raw = await geminiNative(env, [{ text: prompt }, { text: 'Image A :' }, inlineImage(images[0]), { text: 'Image B :' }, inlineImage(images[1])],
      { type: 'OBJECT', properties: { mots_A: { type: 'STRING' }, mots_B: { type: 'STRING' }, endroit: { type: 'STRING', enum: ['A', 'B'] } },
        required: ['mots_A', 'mots_B', 'endroit'] }, env.LANG_MODEL, { thinking: 'low', timeoutMs: 30_000 }); // question simple : réponse rapide, ou la page reste telle quelle
  } catch (err) {
    console.error('Orientation impossible :', err.message);
    throw new HttpError(502, 'Orientation impossible');
  }
  return json({ choice: raw.endroit === 'B' ? 1 : 0 });
}

// Consigne calquée sur la version Gemini de l'enseignant, dont le surlignage est précis.
function langSystem(request, body, cats, pda) {
  if (pda) return pdaSystem(pda);
  const level = LEVELS[body.level] || LEVELS.secondaire1;
  return isEnglish(request) ? `You are an English language expert. Here is the image of a handwritten (or typed) document, written by a ${LEVELS_EN[body.level] || LEVELS_EN.secondaire1}.
Your task:
1. Read the text carefully.
2. Identify ONLY these errors: ${cats.map((c) => LANG_CATEGORIES_EN[c]).join('; ')}. No style preferences; if a word is illegible, ignore it.
${checklistEn(cats)}
   A well-formed letter is never an error. If a letter is ambiguous, flag the error only if it is likely, with lecture_douteuse = true. Ignore the teacher's marks (brackets, X, underlining, colored ink).
3. For EACH error found, give its coordinates (bounding box) on the image, surrounding the COMPLETE WORD or COMPLETE EXPRESSION containing the error.
   The 'box' coordinates must be an array of 4 numbers [ymin, xmin, ymax, xmax] normalized between 0 and 1000.
   (ymin = top, xmin = left, ymax = bottom, xmax = right).
For each error, also copy in 'ligne' the complete handwritten line where it appears, exactly as written, and give its category and a short explanation of the rule, in English.
Return ONLY a JSON array. If no error is found, return an empty array [].` : `Tu es un expert en langue française. Voici l'image d'un document manuscrit (ou dactylographié), une copie de ${level}.
Ta mission :
1. Lis le texte attentivement.
2. Identifie UNIQUEMENT ces fautes : ${cats.map((c) => LANG_CATEGORIES[c]).join(' ; ')}. Pas de choix de style ; si un mot est illisible, ignore-le.
${checklist(cats)}
${RECTIF}
   Une lettre bien formée n'est jamais une faute. Si une lettre est ambiguë (q ou d, accent douteux, lettre doublée ou non), relève la faute seulement si elle est probable, avec lecture_douteuse = true. Ignore les marques de l'enseignant (crochets, X, soulignés, encre de couleur).
3. Pour CHAQUE faute trouvée, déduis ses coordonnées (bounding box) sur l'image en encadrant le MOT COMPLET ou l'EXPRESSION COMPLÈTE qui contient la faute.
   Les coordonnées 'box' doivent être un tableau de 4 nombres [ymin, xmin, ymax, xmax] normalisés entre 0 et 1000.
   (ymin = haut, xmin = gauche, ymax = bas, xmax = droite).
Pour chaque faute, recopie aussi dans « ligne » la ligne manuscrite complète où elle se trouve, exactement telle qu'écrite, et indique sa catégorie et une courte explication de la règle.
Renvoie EXCLUSIVEMENT un tableau JSON. Si aucune faute n'est trouvée, renvoie un tableau vide [].`;
}

// Primaire : le nombre de mots de la copie, pour le pourcentage de fautes. L'IA recopie seulement le texte ; c'est le
// code qui compte les mots (vérifiable, et toujours le même résultat pour le même texte).
async function transcribe(env, dataUrl) {
  const raw = await geminiNative(env, [{ text: "Recopie EXACTEMENT le texte rédigé par l'élève sur cette page, mot à mot, sans rien corriger, "
    + "dans l'ordre de lecture. N'inclus pas le nom de l'élève, la date, ni les consignes ou le texte imprimés. Chaîne vide s'il n'y a aucun texte de l'élève." }, inlineImage(dataUrl)],
  { type: 'OBJECT', properties: { texte: { type: 'STRING' } }, required: ['texte'] }, env.LANG_MODEL, { thinking: 'low', timeoutMs: 90_000 });
  const text = String(raw.texte || '').slice(0, 20000);
  return { text, words: countWords(text) };
}

// Pages réservées pour une copie. Si l'enseignant perd la connexion pendant la correction (écran éteint, réseau
// coupé), il ne reçoit jamais le résultat : les pages réservées lui sont rendues (le remboursement continue après
// la coupure grâce à waitUntil). Un remboursement ne rend jamais plus que ce qui a été réservé.
async function reserve(env, key, n, request, ctx, kind) {
  const reserved = await env.DB.prepare('UPDATE access_keys SET pages = pages - ? WHERE key = ? AND pages >= ?').bind(n, key, n).run();
  if (!reserved.meta.changes) {
    await getKey(env, key); // 401 si la clé n'existe pas
    throw new HttpError(402, 'Solde de pages insuffisant. Rechargez votre compte pour continuer.');
  }
  // Journal d'utilisation : une statistique, jamais un obstacle à la correction.
  const log = (pages) => env.DB.prepare('INSERT INTO usage (key, pages, kind, created_at) VALUES (?, ?, ?, ?)').bind(key, pages, kind, Date.now()).run()
    .catch((e) => console.error('Journal d\'utilisation :', e.message));
  await log(n);
  const paying = payReferrer(env, key); // un collègue parrainé qui atteint 30 pages : le parrain reçoit ses pages
  if (ctx) ctx.waitUntil(paying); else await paying;
  let back = 0;
  const refund = async (k) => {
    k = Math.min(k, n - back);
    if (k <= 0) return;
    back += k;
    await env.DB.prepare('UPDATE access_keys SET pages = pages + ? WHERE key = ?').bind(k, key).run();
    await log(-k);
  };
  const onAbort = () => { const p = refund(n).catch((e) => console.error('Remboursement impossible :', e.message)); ctx?.waitUntil(p); };
  request.signal?.addEventListener?.('abort', onAbort);
  return { refund, close: () => request.signal?.removeEventListener?.('abort', onAbort) };
}

async function language(request, env, url, ctx) {
  const key = bearer(request);
  const body = await readJson(request);
  checkImages(body.pages, MAX_PAGES_PER_COPY, 'Copie', MAX_LANG_IMAGE_CHARS);
  if (!body.pages.length) throw new HttpError(400, 'Copie vide');
  const cats = (Array.isArray(body.categories) ? body.categories : Object.keys(LANG_CATEGORIES)).filter((c) => LANG_CATEGORIES[c]);
  if (!cats.length) throw new HttpError(400, 'Choisissez au moins un type de faute');

  const n = body.pages.length; // 1 page de copie = 1 page décomptée
  const pay = await reserve(env, key, n, request, ctx, 'langue');
  try {
    return await analyzeLanguagePages(request, env, key, body, cats, n, pay);
  } catch (err) {
    await pay.refund(n).catch((e) => console.error('Remboursement impossible :', e.message)); // ce qui n'a pas déjà été rendu
    throw err;
  } finally { pay.close(); }
}

async function analyzeLanguagePages(request, env, key, body, cats, n, pay) {
  const pda = readPda(body.pda);
  const system = langSystem(request, body, cats, pda);

  const identity = body.identify === false ? Promise.resolve({}) : geminiNative(env, [{ text: "Recopie le nom de l'élève et son groupe s'ils sont écrits sur cette copie (sinon chaînes vides)." }, inlineImage(body.pages[0])],
    { type: 'OBJECT', properties: { nom: { type: 'STRING' }, groupe: { type: 'STRING' } }, required: ['nom', 'groupe'] }, env.LANG_MODEL).catch(() => ({}));
  const counts = pda ? Promise.all(body.pages.map((url) => transcribe(env, url).catch(() => null))) : Promise.resolve([]);
  const results = await Promise.allSettled(body.pages.map((url) => geminiVision(env, system, url, pda, orthoOn(request, body))));
  const failed = results.filter((x) => x.status === 'rejected').length;
  if (failed) {
    await pay.refund(failed);
    console.error('Langue : pages en échec :', results.filter((x) => x.status === 'rejected').map((x) => x.reason?.message).join(' / '));
  }
  if (failed === n) throw new HttpError(502, "L'analyse de la langue a échoué. Aucune page n'a été décomptée, réessayez.");

  const ok = results.map((x) => (x.status === 'fulfilled' ? x.value : null));
  const ts = Date.now();
  const pages = await Promise.all(ok.map(async (raw, i) => (raw
    ? { errors: langErrors(raw.fautes, cats, pda), reread: { ts, token: await rereadToken(env, key, body.pages[i], ts) } }
    : { errors: [], failed: true })));
  (await counts).forEach((c, i) => { if (c && !pages[i].failed) Object.assign(pages[i], c); });
  const who = await identity;
  const name = String(who.nom || '').trim();
  const group = String(who.groupe || '').trim();
  const left = await env.DB.prepare('SELECT pages FROM access_keys WHERE key = ?').bind(key).first();
  return json({ name, group, pages, failedPages: failed, pagesLeft: left?.pages ?? 0 });
}

// Réécrire le commentaire (gratuit) : après que l'enseignant a changé des notes ou des niveaux, l'IA refait le commentaire
// à partir de la correction validée (questions, notes, justifications, résumé des réponses). Elle ne revoit pas la copie.
async function rewriteComment(request, env) {
  await getKey(env, bearer(request));
  const body = await readJson(request);
  const en = String(body.lang || '').startsWith('en');
  const letters = !!body.letters;
  const qs = (Array.isArray(body.questions) ? body.questions : []).slice(0, 40).map((q) => ({
    question: String(q?.question || '').slice(0, 200), answer: String(q?.answer || '').slice(0, 300), why: String(q?.justification || '').slice(0, 500),
    level: String(q?.level || '').slice(0, 40), points: Number(q?.points), max: Number(q?.max),
  })).filter((q) => q.question);
  if (!qs.length) throw new HttpError(400, 'Correction vide');
  const avoid = readAvoid(body.avoid);
  // Versions déjà proposées pour CETTE copie : sans elles, chaque clic redonnait le même commentaire.
  const before = (Array.isArray(body.previous) ? body.previous : []).slice(-5).map((t) => String(t || '').trim().slice(0, 800)).filter(Boolean);
  const mark = (q) => (letters && q.level ? `niveau ${q.level}` : `${fr(q.points)} / ${fr(q.max)}`);
  const first = String(body.firstName || '').replace(/[^\p{L}' -]/gu, '').trim().slice(0, 30);
  const age = { primaire: en ? 'an elementary-school child (6 to 12 years old)' : 'un enfant du primaire (6 à 12 ans)',
    secondaire: en ? 'a high-school student (12 to 17 years old)' : 'un élève du secondaire (12 à 17 ans)',
    cegep: en ? 'a college student (17 years old and up)' : 'un étudiant du cégep (17 ans et plus)' }[body.niveau];
  // Ton : la réécriture perdait le prénom, la chaleur et employait des mots trop difficiles (« rébarbative » à 13 ans).
  const tone = en
    ? `Keep a warm, encouraging tone, as a teacher who believes in the student${age ? `. The reader is ${age}: use simple, everyday words they understand, no jargon or rare words` : ''}.${first ? ` Address the student by first name (${first}) once, naturally.` : ''}`
    : `Garde un ton chaleureux et encourageant, celui d'un enseignant qui croit en l'élève${age ? `. Le lecteur est ${age} : emploie des mots simples et courants qu'il comprend, sans jargon ni mots rares` : ''}.${first ? ` Interpelle l'élève par son prénom (${first}) une fois, naturellement.` : ''}`;
  const system = [
    "Tu es un enseignant qui rédige le commentaire final d'une copie d'élève, à partir de la correction qu'il vient de valider.",
    en ? `Rédige EN ANGLAIS, 2 à 4 phrases adressées à l'élève (« you »), concrètes et constructives : une réussite, l'erreur principale, une piste de progrès. ${COMMENT_VARIETY.en}`
      : `Rédige 2 à 4 phrases adressées à l'élève (tutoiement), concrètes et constructives : une réussite, l'erreur principale, une piste de progrès. ${COMMENT_VARIETY.fr}`,
    "Les notes et les niveaux ci-dessous sont ceux de l'enseignant : ils priment sur les justifications. Un critère réussi ne doit pas être présenté comme une faiblesse.",
    letters ? 'Ne mentionne aucun point ni aucune note chiffrée : seulement les niveaux, au besoin.' : '',
    tone,
    first ? "N'écris jamais son nom de famille." : "N'écris jamais le nom de l'élève.",
  ].filter(Boolean).join('\n');
  const content = `CORRECTION VALIDÉE${body.grade != null ? ` (${letters && body.letter ? `cote ${String(body.letter).slice(0, 20)}` : `${fr(Number(body.grade))} / ${fr(Number(body.total))}`})` : ''} :
${qs.map((q, i) => `${i + 1}. ${q.question} — ${mark(q)}${q.answer ? ` — réponse de l'élève : « ${q.answer} »` : ''}${q.why ? ` — justification : ${q.why}` : ''}`).join('\n')}${avoid.length ? avoidText(avoid) : ''}${before.length ? `

VERSIONS DÉJÀ PROPOSÉES POUR CETTE COPIE (l'enseignant en veut une autre) :
${before.map((t, i) => `${i + 1}. « ${t} »`).join('\n')}
Écris une version VRAIMENT différente : souligne une autre réussite, aborde la faiblesse sous un autre angle, propose une autre piste concrète et commence autrement. Ne reprends aucune phrase de ces versions.` : ''}`;
  let raw;
  try {
    raw = await aiChat(env, system, content, { type: 'json_schema', json_schema: { name: 'commentaire', schema: { type: 'object', required: ['commentaire'], properties: { commentaire: { type: 'string' } } } } }, { temperature: 0.9 });
  } catch (err) {
    console.error('Commentaire impossible :', err.message);
    throw new HttpError(502, 'Le commentaire n\'a pas pu être réécrit. Réessayez.');
  }
  return json({ comment: String(raw.commentaire || '').trim().slice(0, 1500) });
}

// ---------- Fiche du scripteur (orthopédagogie) ----------
// Gratuite (texte seulement, ~½ ¢) : établie à partir des erreurs VALIDÉES par l'orthopédagogue (fausses fautes retirées,
// oublis ajoutés) et de la transcription du texte. L'IA ne revoit pas la copie. Rien n'est conservé.
// Ce que la fiche ne fait pas, volontairement : juger la motivation (invisible sur une copie), la planification ou la
// révision sans brouillon, ni décider du niveau d'intervention (RàI) : c'est le jugement de l'orthopédagogue.
const PROFILE_ACTIVITIES = [
  'Entretien métagraphique ciblé sur une erreur récurrente',
  'Phrase dictée du jour (avec justification des choix orthographiques)',
  'Dictée zéro faute (questions permises, réponses expliquées)',
  'Chantier orthographique (découverte d’une régularité à partir d’un corpus)',
  'Familles de mots et manipulation des morphèmes (préfixes, suffixes, radical)',
  'Travail de conscience phonologique (segmentation en syllabes et en sons)',
  'Combinaison de phrases (10 à 15 minutes en début de séance)',
  'Analyse à partir du modèle de la phrase de base (sujet, prédicat, complément de phrase)',
  'Manipulations syntaxiques : ajout, suppression, déplacement, remplacement',
  'Lecture du texte à voix haute, seul ou à un pair, pour la ponctuation',
  'Enseignement explicite d’une seule opération de révision à la fois',
  'Grille de correction évolutive limitée à 1 ou 2 cibles',
  'Justification écrite ou orale de quelques accords ciblés (flèches d’accord, donneur et receveur)',
  'Remplacement par un mot témoin pour les homophones (avait/a, vendre/vendu)',
];
const PROFILE_ADAPTATIONS = [
  'Dictionnaire phonologique ou prédicteur de mots',
  'Organisateur graphique, ou enregistrement oral des idées avant d’écrire',
  'Synthèse vocale pour la relecture, ou lecture du texte par un tiers',
  'Réduire la longueur exigée ou limiter la correction à un paragraphe ou à une cible',
];
// Paliers (syntaxe et orthographe seulement), d'après les descripteurs du profil du scripteur.
const PROFILE_LEVELS = {
  1: 'Apprentissages non acquis : orthographie peu de mots fréquents, fait peu ou pas d’accords, phrases souvent incomplètes, ponctuation de base aléatoire',
  2: 'Apprentissages peu acquis : orthographie plusieurs mots fréquents, quelques accords dans le GN et parfois du verbe, phrases complètes mais peu variées',
  3: 'Apprentissages en voie d’acquisition : orthographie la majorité des mots fréquents, accords présents dans le GN et souvent dans le GV, structures variées avec des erreurs qui nuisent parfois à la compréhension',
  4: 'Apprentissages presque acquis : orthographie la plupart des mots fréquents et précis, fait la plupart des accords, rares erreurs de syntaxe, bonne ponctuation',
  5: 'Apprentissages acquis : maîtrise les règles syntaxiques et orthographiques attendues à son niveau',
};
const PROFILE_SCHEMA = { type: 'OBJECT', properties: {
  forces: { type: 'ARRAY', items: { type: 'STRING' }, description: '1 à 3 forces observées dans ce texte, concrètes.' },
  orthographe_usage: { type: 'STRING', description: "Tendance en orthographe d'usage, d'après les sous-types (ex. : surtout des erreurs morphologiques : lettres muettes non dérivées). Chaîne vide si rien à signaler." },
  orthographe_grammaticale: { type: 'STRING', description: 'Tendance en orthographe grammaticale (accords, terminaisons, homophones verbaux).' },
  syntaxe_ponctuation: { type: 'STRING', description: 'Bilan de la construction des phrases et de la ponctuation.' },
  organisation: { type: 'STRING', description: "Observation sur l'organisation et la cohérence du texte (paragraphes, marqueurs de relation, reprise de l'information, temps verbaux). Chaîne vide si le texte est trop court ou absent." },
  palier: { type: 'INTEGER', description: 'Palier provisoire en syntaxe et orthographe, de 1 à 5.' },
  palier_raison: { type: 'STRING', description: 'Une phrase qui justifie le palier par des faits du texte.' },
  cibles: { type: 'ARRAY', items: { type: 'OBJECT', properties: { cible: { type: 'STRING' }, raison: { type: 'STRING' } }, required: ['cible', 'raison'] }, description: '1 ou 2 cibles prioritaires, pas plus (éviter la surcharge).' },
  questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { extrait: { type: 'STRING' }, question: { type: 'STRING' } }, required: ['extrait', 'question'] }, description: "2 ou 3 questions d'entretien métagraphique, chacune sur une erreur représentative." },
  activites: { type: 'ARRAY', items: { type: 'STRING', enum: PROFILE_ACTIVITIES }, description: '2 à 4 pistes, en lien avec les cibles.' },
  adaptations: { type: 'ARRAY', items: { type: 'STRING', enum: PROFILE_ADAPTATIONS }, description: "0 à 2 mesures, seulement si le texte en donne un indice clair." },
  outils: { type: 'STRING', description: "Si des outils d'aide ont servi (conditions de rédaction) : erreurs qui pourraient venir de leur usage (mot choisi trop vite dans une prédiction, correction acceptée sans vérifier), au conditionnel. Chaîne vide sinon." },
  bilan_pi: { type: 'STRING', description: "Paragraphe de 4 à 6 phrases prêt pour le dossier d'aide ou le plan d'intervention : forces, défis prioritaires chiffrés (avec les nombres fournis seulement), puis l'objectif proposé." },
  objectif_smart: { type: 'STRING', description: "Un objectif SMART pour les prochaines semaines, lié à la 1re cible : spécifique, mesurable (critère chiffré), atteignable, réaliste, avec une échéance (« d'ici 6 à 8 semaines »)." },
}, required: ['forces', 'orthographe_usage', 'orthographe_grammaticale', 'syntaxe_ponctuation', 'organisation', 'palier', 'palier_raison', 'cibles', 'questions', 'activites', 'adaptations', 'outils', 'bilan_pi', 'objectif_smart'] };

async function writerProfile(request, env) {
  await getKey(env, bearer(request));
  const body = await readJson(request);
  const level = body.level === 'primaire' ? 'primaire' : 'secondaire';
  const year = Number(body.year);
  const who = year >= 1 && year <= (level === 'primaire' ? 6 : 5)
    ? (level === 'primaire' ? `${year}${year === 1 ? 're' : 'e'} année du primaire` : `${year}${year === 1 ? 're' : 'e'} secondaire`)
    : level;
  const errors = (Array.isArray(body.errors) ? body.errors : []).slice(0, 200).map((e) => ({
    text: String(e?.text || '').slice(0, 120), correction: String(e?.correction || '').slice(0, 120),
    category: LANG_CATEGORIES[e?.category] ? e.category : '', subtype: ORTHO_TYPES[e?.subtype] ? e.subtype : '',
    why: String(e?.explanation || '').slice(0, 200), grey: !!e?.grey,
  })).filter((e) => e.text || e.correction);
  const text = String(body.text || '').slice(0, 8000);
  const words = Number(body.words) || countWords(text);
  const focus = String(body.focus || '').trim().slice(0, 500);
  const conditions = (Array.isArray(body.conditions) ? body.conditions : []).map((c) => String(c || '').slice(0, 40)).filter(Boolean).slice(0, 8);
  const ix = body.indices && typeof body.indices === 'object' ? body.indices : {};
  if (!errors.length && !text) throw new HttpError(400, 'Rien à analyser');
  // Les nombres viennent du code, pas de l'IA : toujours exacts et vérifiables dans la fiche.
  const by = {};
  for (const e of errors.filter((x) => !x.grey)) { const k = e.subtype || e.category || 'autre'; by[k] = (by[k] || 0) + 1; }
  const usage = Object.entries(by).filter(([k]) => ORTHO_CODES[k] === 'U').reduce((a, [, n]) => a + n, 0);
  // Effet de levier : les types les plus fréquents, et la part des erreurs qu'ils représentent.
  const total = Object.values(by).reduce((a, n) => a + n, 0);
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lever = total ? top.map(([k, n]) => `${ORTHO_CODES[k] ? `${ORTHO_CODES[k]}-` : ''}${k} : ${n} sur ${total} (${Math.round((100 * n) / total)} %)`).join(' ; ') : '';
  const rate = (n) => (words ? `${Math.round((1000 * n) / words) / 10} pour 100 mots` : '');
  // Alerte : des erreurs phonologiques fréquentes à partir du 2e cycle du primaire (3e année) sont un signal prioritaire.
  const late = level === 'secondaire' || year >= 3;
  const alert = late && (by.phonologique || 0) >= 3 && (by.phonologique || 0) >= 0.2 * usage
    ? `Erreurs phonologiques fréquentes (${by.phonologique}) pour un élève de ${who} : à examiner en priorité (conscience phonologique, accès au dictionnaire phonologique).` : '';
  const system = [
    "Tu assistes une orthopédagogue québécoise. À partir d'UNE production écrite d'un élève et de la liste de ses erreurs, déjà validée par l'orthopédagogue, prépare une fiche du scripteur PROVISOIRE, qu'elle complétera par ses propres observations.",
    "Principes : chaque erreur est un indice du raisonnement orthographique ou syntaxique actuel de l'élève, pas une faute à comptabiliser. Cherche les régularités (ce qui revient), distingue ce qui semble acquis de ce qui ne l'est pas, et repère une règle qui semble connue mais non appliquée (surcharge cognitive : elle est réussie à un endroit et ratée ailleurs).",
    "Les erreurs marquées « en apprentissage » portent sur des notions pas encore attendues à son année : ce ne sont pas des difficultés, mentionne-les seulement comme des notions en cours.",
    "Interdits : ne juge pas la motivation, l'attitude ou les émotions de l'élève (rien ne le montre sur une copie) ; ne juge pas la planification ni la révision (pas de brouillon fourni) ; ne recommande aucun niveau d'intervention ni diagnostic. N'invente aucun exemple : cite seulement des extraits réels de la liste ou du texte. N'écris jamais le nom de l'élève : « l'élève ».",
    `Palier (syntaxe et orthographe), indice provisoire de 1 à 5, en tenant compte de ce qui est attendu en ${who} :\n${Object.entries(PROFILE_LEVELS).map(([k, v]) => `${k}. ${v}`).join('\n')}`,
    "Questions d'entretien métagraphique : courtes, au tutoiement, chacune sur une erreur précise de l'élève, pour faire expliciter son raisonnement sans donner la réponse. Modèles : « Comment as-tu fait pour écrire « [mot] » ? Connais-tu un mot de la même famille qui pourrait t'aider ? » ; « Dans « [extrait] », quel est le mot qui donne son accord ? » ; « Comment as-tu trouvé la terminaison du verbe « [verbe] » ? Quel est son sujet ? » ; « Lis-moi cette phrase à voix haute : où ton lecteur doit-il s'arrêter ? »",
    "Rédige en français, phrases courtes et précises, vocabulaire de l'orthopédagogie (donneur d'accord, GN, morphogramme, homophones, marqueurs de relation).",
    focus ? `L'orthopédagogue veut observer en particulier : ${focus}. Fais une place à ces aspects dans les tendances et les cibles (sans inventer d'erreurs).` : '',
    "Cibles : privilégie l'effet de levier, les types qui regroupent le plus d'erreurs (voir les nombres), sauf si un signal prioritaire existe. Un élève qui fait peu d'erreurs avec des phrases très courtes et peu de subordonnées évite peut-être la difficulté : dis-le dans la syntaxe.",
    "Bilan pour le plan d'intervention et objectif : utilise SEULEMENT les nombres fournis ci-dessous (ne recalcule rien, n'invente aucun pourcentage).",
    alert ? `Signal à mentionner dans les cibles : ${alert}` : '',
  ].filter(Boolean).join('\n\n');
  const content = `ÉLÈVE : ${who}. Texte de ${words || '?'} mots.${conditions.length ? `
CONDITIONS DE RÉDACTION : ${conditions.join(', ')}.` : ''}
INDICES DU TEXTE (calculés) : ${[ix.sentences ? `${ix.sentences} phrases selon la ponctuation de l'élève` : '', ix.avgLen ? `${ix.avgLen} mots par phrase en moyenne` : '', ix.distinct ? `${ix.distinct} mots différents (${ix.diversity} %)` : '', ix.subord != null ? `${ix.subord} subordonnants (qui, que, quand, parce que…)` : ''].filter(Boolean).join(' ; ') || 'non disponibles'}
EFFET DE LEVIER : ${lever || 'aucune erreur'}

ERREURS VALIDÉES (${errors.length}) — « écrit » → « attendu » [catégorie / sous-type] :
${errors.map((e) => `- « ${e.text} » → « ${e.correction} » [${e.category || '?'}${e.subtype ? ` / ${e.subtype}` : ''}]${e.grey ? ' (notion en apprentissage)' : ''}${e.why ? ` — ${e.why}` : ''}`).join('\n') || '(aucune)'}

NOMBRE PAR SOUS-TYPE (hors notions en apprentissage) : ${Object.entries(by).map(([k, n]) => `${ORTHO_CODES[k] ? `${ORTHO_CODES[k]}-` : ''}${k} ${n}${rate(n) ? ` (${rate(n)})` : ''}`).join(', ') || 'aucune erreur'}

TEXTE DE L'ÉLÈVE (transcription, sans correction) :
${text || '(non disponible)'}`;
  let raw;
  try {
    raw = await geminiNative(env, [{ text: `${system}\n\n${content}` }], PROFILE_SCHEMA, env.LANG_MODEL, { timeoutMs: 90_000 });
  } catch (err) {
    console.error('Fiche du scripteur impossible :', err.message);
    throw new HttpError(502, "La fiche n'a pas pu être établie. Réessayez.");
  }
  const str = (v, n = 600) => String(v || '').trim().slice(0, n);
  const list = (v, n, len = 300) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, n);
  const palier = Math.min(5, Math.max(1, Math.round(Number(raw.palier) || 0))) || null;
  return json({
    forces: list(raw.forces, 3), usage: str(raw.orthographe_usage), grammar: str(raw.orthographe_grammaticale),
    syntax: str(raw.syntaxe_ponctuation), organisation: str(raw.organisation),
    level: palier, levelLabel: palier ? PROFILE_LEVELS[palier].split(' : ')[0] : '', levelWhy: str(raw.palier_raison),
    targets: (Array.isArray(raw.cibles) ? raw.cibles : []).slice(0, 2).map((c) => ({ target: str(c?.cible, 200), why: str(c?.raison, 300) })).filter((c) => c.target),
    questions: (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 3).map((q) => ({ excerpt: str(q?.extrait, 150), question: str(q?.question, 300) })).filter((q) => q.question),
    activities: list(raw.activites, 4).filter((a) => PROFILE_ACTIVITIES.includes(a)),
    adaptations: list(raw.adaptations, 2).filter((a) => PROFILE_ADAPTATIONS.includes(a)),
    tools: conditions.some((c) => !/sans aide/i.test(c)) ? str(raw.outils) : '',
    pi: str(raw.bilan_pi, 1500), smart: str(raw.objectif_smart, 500),
    alert,
  });
}

// ---------- Progression du scripteur ----------
// Gratuite (texte seulement). Compare le profil actuel avec une évaluation précédente du même élève : un autre texte
// analysé dans la séance (erreurs classées) ou un document de l'orthopédagogue (ancienne fiche, rapport). Rien n'est conservé.
const PROGRESS_SCHEMA = { type: 'OBJECT', properties: {
  resume: { type: 'STRING', description: "2 ou 3 phrases : l'évolution d'ensemble, avec prudence." },
  progres: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Ce qui est acquis ou en progrès, avec un fait précis de chaque texte.' },
  persistants: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Difficultés qui persistent, avec un exemple récent.' },
  nouveaux: { type: 'ARRAY', items: { type: 'STRING' }, description: "Difficultés nouvelles (souvent liées à des textes plus longs ou plus complexes) ; liste vide s'il n'y en a pas." },
  cibles: { type: 'ARRAY', items: { type: 'OBJECT', properties: { cible: { type: 'STRING' }, raison: { type: 'STRING' } }, required: ['cible', 'raison'] }, description: '1 ou 2 cibles ajustées pour la suite.' },
  prudence: { type: 'STRING', description: "Limites de la comparaison (longueur ou genre des textes différents, une seule production chacun, document incomplet). Chaîne vide si rien à signaler." },
}, required: ['resume', 'progres', 'persistants', 'nouveaux', 'cibles', 'prudence'] };
const errorLines = (list) => list.map((e) => `- « ${e.text} » → « ${e.correction} » [${e.category || '?'}${e.subtype ? ` / ${e.subtype}` : ''}]${e.grey ? ' (notion en apprentissage)' : ''}`).join('\n') || '(aucune)';
const readErrors = (raw) => (Array.isArray(raw) ? raw : []).slice(0, 200).map((e) => ({
  text: String(e?.text || '').slice(0, 120), correction: String(e?.correction || '').slice(0, 120),
  category: LANG_CATEGORIES[e?.category] ? e.category : '', subtype: ORTHO_TYPES[e?.subtype] ? e.subtype : '', grey: !!e?.grey,
})).filter((e) => e.text || e.correction);
async function writerProgress(request, env) {
  await getKey(env, bearer(request));
  const body = await readJson(request);
  const level = body.level === 'primaire' ? 'primaire' : 'secondaire';
  const year = Number(body.year);
  const who = year >= 1 && year <= (level === 'primaire' ? 6 : 5)
    ? (level === 'primaire' ? `${year}${year === 1 ? 're' : 'e'} année du primaire` : `${year}${year === 1 ? 're' : 'e'} secondaire`) : level;
  const cur = body.current || {}, prev = body.previous || {};
  const now = readErrors(cur.errors), before = readErrors(prev.errors);
  const doc = String(prev.text || '').trim().slice(0, 12000);
  if (!before.length && !doc && !Number(prev.words)) throw new HttpError(400, 'Évaluation précédente vide');
  const profile = cur.profile || {};
  const line = (k, v) => (v ? `${k} : ${String(v).slice(0, 600)}` : '');
  const system = [
    "Tu assistes une orthopédagogue québécoise. Compare la production ACTUELLE d'un élève avec une évaluation PRÉCÉDENTE du même élève, et analyse l'évolution de son profil de scripteur.",
    "Raisonne sur les régularités, pas sur des fautes isolées. Tiens compte des longueurs : compare des taux (par 100 mots) plutôt que des nombres quand les deux sont connus. Un texte plus long ou plus complexe fait souvent apparaître de nouvelles erreurs : ce n'est pas un recul. Les notions « en apprentissage » ne sont pas des difficultés.",
    "Interdits : ne juge pas la motivation, l'attitude ou les émotions de l'élève ; aucun diagnostic ; aucun niveau d'intervention. N'invente aucun exemple : cite seulement ce qui est dans les données. N'écris jamais le nom de l'élève : « l'élève ».",
    "Si l'évaluation précédente est un document de l'orthopédagogue (fiche, rapport), repère les cibles qu'elle visait et dis si la production actuelle montre un progrès sur ces cibles.",
    "Si les conditions de rédaction diffèrent (avec ou sans outils d'aide : WordQ, Antidote, synthèse vocale…), compare l'effet des outils et dis-le dans la prudence.",
    "Rédige en français, phrases courtes, vocabulaire de l'orthopédagogie.",
  ].join('\n\n');
  const content = `ÉLÈVE : ${who}.

ÉVALUATION PRÉCÉDENTE (${String(prev.label || 'précédente').slice(0, 120)})${Array.isArray(prev.conditions) && prev.conditions.length ? `, conditions : ${prev.conditions.slice(0, 8).map((c) => String(c).slice(0, 40)).join(', ')}` : ''} :
${doc ? `Document de l'orthopédagogue :\n${doc}` : `Texte de ${Number(prev.words) || '?'} mots. Erreurs validées :\n${errorLines(before)}`}

PRODUCTION ACTUELLE${Array.isArray(cur.conditions) && cur.conditions.length ? ` (conditions : ${cur.conditions.slice(0, 8).map((c) => String(c).slice(0, 40)).join(', ')})` : ''} : texte de ${Number(cur.words) || '?'} mots. Erreurs validées :
${errorLines(now)}
${[line('Tendance en orthographe d’usage', profile.usage), line('Tendance en orthographe grammaticale', profile.grammar), line('Syntaxe et ponctuation', profile.syntax), line('Cibles actuelles', (Array.isArray(profile.targets) ? profile.targets : []).map((t) => t?.target).filter(Boolean).join(' ; '))].filter(Boolean).join('\n')}`;
  let raw;
  try {
    raw = await geminiNative(env, [{ text: `${system}\n\n${content}` }], PROGRESS_SCHEMA, env.LANG_MODEL, { timeoutMs: 90_000 });
  } catch (err) {
    console.error('Progression impossible :', err.message);
    throw new HttpError(502, "La comparaison n'a pas pu être faite. Réessayez.");
  }
  const str = (v, n = 600) => String(v || '').trim().slice(0, n);
  const list = (v, n) => (Array.isArray(v) ? v : []).map((x) => str(x, 400)).filter(Boolean).slice(0, n);
  return json({
    summary: str(raw.resume, 900), progress: list(raw.progres, 5), persistent: list(raw.persistants, 5), fresh: list(raw.nouveaux, 4),
    targets: (Array.isArray(raw.cibles) ? raw.cibles : []).slice(0, 2).map((c) => ({ target: str(c?.cible, 200), why: str(c?.raison, 300) })).filter((c) => c.target),
    caution: str(raw.prudence, 500),
  });
}

// Rédige une grille avec descripteurs de niveaux à partir des consignes (gratuit, l'enseignant la valide ensuite).
async function rubric(request, env) {
  await getKey(env, bearer(request));
  const body = await readJson(request);
  const copy = !!body.copy; // « Avec une grille » : recopier la grille de l'enseignant telle quelle, total compris
  const total = Number(body.total);
  if (!copy && !(total > 0 && total <= 1000)) throw new HttpError(400, 'Barème invalide');
  const text = String(body.rubric || '').slice(0, copy ? 60000 : 8000); // une grille Word de 6 pages : environ 20 000 caractères
  checkImages(body.rubricPages || [], MAX_RUBRIC_PAGES, 'Corrigé');
  if (!text.trim() && !(body.rubricPages || []).length) throw new HttpError(400, "Écrivez d'abord vos consignes ou ajoutez votre corrigé.");
  const unit = body.wholePoints ? 1 : 0.5;
  const system = copy ? [
    "Tu es conseiller pédagogique. Voici la grille d'évaluation d'un enseignant (image ou texte). Recopie-la FIDÈLEMENT, sans rien inventer ni reformuler :",
    "- chaque critère de la grille, dans l'ordre, avec son nom exact et ses points maximum (sa pondération) ;",
    "- pour chaque critère, tous ses niveaux du plus élevé au plus bas : « etiquette » = l'étiquette courte du niveau, sans pourcentage ni points (« A » et non « A (100 %) » ; aussi 5, 4, 3 ; « Marquée », « Assurée »… ; vide s'il n'y en a pas), « points » = les points de ce niveau (pour une plage comme « 18-20 », « points » = 20 et « points_min » = 18 ; sans plage, pas de « points_min »), « description » = le texte exact du niveau (corrige seulement les coquilles évidentes ; s'il dépasse 80 mots, garde ses éléments observables en 80 mots au plus).",
    "- Ignore les pages qui ne contiennent pas la grille (page titre, consignes générales) ; une remarque utile à la correction (pénalité, politique sur la langue) peut aller dans la description du critère concerné.",
    "- Si la grille donne une échelle commune à tous les critères (ex. une légende A à E), répète-la pour chaque critère, avec les points correspondants.",
    "- Si la grille comporte une table de conversion des niveaux ou des cotes en points ou en pourcentages (ex. : « Excellent = 100 %, Très bien = 85 %… », « A = 10 pts »), applique-la à chaque critère : elle prime sur tout le reste.",
    "- Si un niveau n'a pas de points écrits, calcule-les à partir des points maximum du critère : le plus haut niveau = 100 %, puis 80 %, 60 %, 40 %, 20 % (0 pour un niveau qui signifie « absent » ou « non fait »). Si un critère n'a pas de points maximum, mets 10.",
    `- Les points doivent être des multiples de ${fr(unit)}.`,
    "- « points_ecrits » = vrai seulement si les niveaux eux-mêmes sont des points écrits dans la grille (ex. « 18-20 », « 15-17 », « 4 pts » dans chaque case ou en tête de colonne) ; faux si les niveaux sont des cotes ou des échelons (A à E, Excellent, Marquée…), même avec une pondération par critère, un total ou une table de conversion en pourcentages.",
    "Ne recopie ni le nom de l'élève, ni les notes ou cochages éventuels : seulement la grille vierge. Garde la langue de la grille.",
  ].join('\n') : [
    "Tu es conseiller pédagogique. À partir des consignes et du corrigé d'un enseignant, rédige une grille d'évaluation critériée.",
    `Barème total : ${fr(total)} points. Les points maximum des critères doivent totaliser exactement ${fr(total)}.`,
    "Reprends les critères et les points de l'enseignant s'il en donne ; n'en invente pas d'autres. S'il n'en donne pas, propose 3 à 6 critères pertinents.",
    `Pour chaque critère, rédige 4 ou 5 niveaux, du maximum à 0, avec des points multiples de ${fr(unit)}.`,
    "Chaque description de niveau doit être concrète et observable dans une copie (ce qui est présent, combien, avec quelle qualité), pour que deux correcteurs différents choisissent le même niveau.",
    "Appuie-toi sur les exigences précises des consignes (éléments obligatoires, nombre de causes, sections attendues, etc.).",
    isEnglish(request) ? 'Rédige la grille (noms des critères et descriptions) en anglais.' : 'Rédige en français.',
  ].join('\n');
  const image = (url) => ({ type: 'image_url', image_url: { url, detail: 'high' } });
  const content = [{ type: 'text', text: copy ? (text ? `GRILLE OU PRÉCISIONS DE L'ENSEIGNANT :\n${text}` : 'Grille : voir le document joint.')
    : text ? `CONSIGNES DE L'ENSEIGNANT :\n${text}` : 'Consignes : voir le corrigé joint.' },
    ...(body.rubricPages || []).map(image)];
  let raw;
  // Une grille de cégep de plusieurs pages (20 critères × 6 niveaux) dépassait la longueur de réponse par défaut :
  // le JSON était coupé et la lecture échouait. Recopier demande peu de réflexion et beaucoup de texte.
  try { raw = await aiChat(env, system, content, GRID_SCHEMA, { maxTokens: 60000, reasoning: 'low' }); } catch (err) {
    console.error('Grille impossible :', err.message);
    throw new HttpError(502, /coupée/.test(err.message)
      ? 'Grille trop longue à recopier d’un coup. Retirez les pages sans grille (page titre, consignes), puis réessayez.'
      : 'La lecture de la grille a échoué. Réessayez dans un instant.');
  }
  const snap = (n) => Math.round((Number(n) || 0) / unit) * unit;
  const grid = (raw.criteres || []).map((c) => {
    const max = Math.max(unit, snap(c.points_max));
    const levels = (c.niveaux || []).map((l) => ({ points: Math.min(max, Math.max(0, snap(l.points))), description: String(l.description || '').trim(),
      ...(copy && l.points_min != null && snap(l.points_min) >= 0 && snap(l.points_min) < snap(l.points) ? { min: snap(l.points_min) } : {}),
      // « A (100 %) » → « A » : les points sont déjà dans « points »
      label: String(l.etiquette || '').replace(/\s*[([][^)\]]*(?:%|pts?|points?)[^)\]]*[)\]]\s*$/i, '').trim().slice(0, 40) }))
      .sort((x, y) => y.points - x.points);
    return { name: String(c.nom || 'Critère').trim(), max, levels };
  });
  if (!grid.length) throw new HttpError(502, "L'IA n'a pas pu préparer de grille à partir de ces consignes. Précisez les critères et réessayez.");
  return json({ grid, pointsWritten: copy ? !!raw.points_ecrits : true });
}

// Mode simple (gratuit) : l'enseignant dépose tout au même endroit ; pour chaque fichier, l'IA dit si sa première page
// est une grille d'évaluation, un corrigé ou une copie d'élève, et le total de points indiqué s'il y en a un.
async function classify(request, env) {
  await getKey(env, bearer(request));
  const { files } = await readJson(request);
  const ok = (f) => f && typeof f.page === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(f.page) && f.page.length <= MAX_THUMB_CHARS;
  if (!Array.isArray(files) || !files.length || files.length > 40 || !files.every(ok)) throw new HttpError(400, 'Fichiers invalides');
  const parts = [{ text: "Un enseignant a déposé ces fichiers pour corriger des copies. Chaque image est la première page d'un fichier. Pour chacune, dis ce que c'est : "
    + "« grille » = grille d'évaluation VIERGE (critères et niveaux de réussite, sans réponse d'élève) ; "
    + "« corrige » = corrigé, clé de réponses ou barème de l'enseignant (questions avec les réponses attendues) ; "
    + "« copie » = travail ou examen rempli par un élève (écriture d'élève, réponses personnelles), même s'il porte une grille ou un barème imprimé ; "
    + "« autre » = rien de cela. « total » = le total de points indiqué sur une grille ou un corrigé (ex. « /40 », « Total : 100 points ») ; 0 s'il n'est pas indiqué ou pour une copie." }];
  files.forEach((f, k) => parts.push({ text: `Image ${k} :` }, inlineImage(f.page)));
  let raw;
  try {
    raw = await geminiNative(env, parts, { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      image: { type: 'INTEGER' }, type: { type: 'STRING', enum: ['grille', 'corrige', 'copie', 'autre'] }, total: { type: 'NUMBER' } }, required: ['image', 'type', 'total'] } },
    env.LANG_MODEL, { thinking: 'low', timeoutMs: 45_000 });
  } catch (err) {
    console.error('Classement impossible :', err.message);
    return json({ types: files.map(() => ({ type: 'copie', total: 0 })) }); // en cas de doute : des copies, comme avant
  }
  const byImage = new Map((Array.isArray(raw) ? raw : []).map((x) => [Number(x.image), x]));
  return json({ types: files.map((_, k) => {
    const x = byImage.get(k) || {};
    const total = Number(x.total);
    return { type: ['grille', 'corrige', 'copie', 'autre'].includes(x.type) ? x.type : 'copie', total: total > 0 && total <= 1000 ? total : 0 };
  }) });
}

// ---------- Détection des copies (gratuite) ----------

const SPLIT_BATCH = 40;
const MAX_THUMB_CHARS = 250_000;

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

async function grade(request, env, url, ctx) {
  const key = bearer(request);
  const body = await readJson(request);
  // Mode simple : sans barème fourni (autoTotal), l'IA prend les points indiqués sur la copie ou le corrigé, et le
  // total de la copie devient la somme des points maximum des questions.
  let total = Number(body.total);
  const autoTotal = !(total > 0) && !!body.autoTotal;
  if (!autoTotal && !(total > 0 && total <= 1000)) throw new HttpError(400, 'Barème invalide');
  checkImages(body.pages, MAX_PAGES_PER_COPY, 'Copie');
  if (!body.pages.length) throw new HttpError(400, 'Copie vide');
  if (body.pages.reduce((n, p) => n + p.length, 0) > MAX_COPY_CHARS) throw new HttpError(413, 'Copie trop lourde : rechargez la page et réessayez, ou séparez-la en deux.');
  checkImages(body.rubricPages || [], MAX_RUBRIC_PAGES, 'Corrigé');

  // Réserve les pages de façon atomique (le corrigé n'est pas facturé).
  // Mode approfondi : deux corrections, donc deux pages décomptées par page de copie.
  const deep = body.deep !== false;
  const perPage = deep ? 2 : 1;
  const n = body.pages.length * perPage;
  const pay = await reserve(env, key, n, request, ctx, 'copies');
  const refund = pay.refund;
  // Toute erreur imprévue après la réservation (bogue, IA qui plante) rend les pages pas encore remboursées.
  try {

    const unit = body.wholePoints ? 1 : 0.5;
    const grid = readGrid(body.grid);
    const prompt = buildPrompt({ exam: String(body.exam || '').slice(0, 200), total, wholePoints: !!body.wholePoints,
      checkLanguage: !!body.checkLanguage, rubric: String(body.rubric || '').slice(0, 20000), grid, english: isEnglish(request),
      hasKey: !!(String(body.rubric || '').trim() || (body.rubricPages || []).length || grid), anonymous: !!body.anonymous, annotate: !!body.annotate,
      calibration: readCalibration(body.calibration), avoid: readAvoid(body.avoid) });

    // Double correction : la 1re fixe le découpage en questions, la 2e corrige indépendamment
    // les mêmes questions (intitulés et points maximum, sans les notes de la 1re).
    const rubricPages = body.rubricPages || [];
    const errors = [];
    const attempt = async (p, opts) => {
      try { return normalize(await callModel(env, p, rubricPages, body.pages, { ...opts, annotate: !!body.annotate }), total || Infinity, unit); } catch (err) { errors.push(err); return null; }
    };
    const impose = (list) => `${prompt}

STRUCTURE IMPOSÉE : corrige exactement ces ${list.length} questions ou critères, dans cet ordre, avec ces intitulés et ces points maximum. Fais ta propre correction, indépendante.
${list.map((q, i) => `${i + 1}. ${q.name} (sur ${fr(q.max)} points)`).join('\n')}`;
    const structure = grid ? null : readStructure(body.structure);
    const fixed = grid || structure;
    const promptA = fixed ? impose(fixed) : prompt;
    // Contre-vérification réellement indépendante : un autre modèle, une autre consigne de lecture et un peu de variabilité,
    // pour que deux corrections d'accord veuillent dire quelque chose (et non la même réponse répétée).
    const SECOND_LOOK = "\n\nDEUXIÈME CORRECTEUR : tu es un second enseignant qui corrige cette copie sans connaître la première correction. Relis chaque réponse mot à mot avant de noter ; ne donne le bénéfice du doute que si la réponse le justifie.";
    const secondOpts = { model: env.SECOND_MODEL || env.LANG_MODEL, temperature: 0.4 };
    // Questions déjà connues : la 2e correction n'attend pas la 1re (deux fois plus rapide).
    const early = deep && fixed ? attempt(promptA + SECOND_LOOK, secondOpts) : null;
    const a = (await attempt(promptA)) || (await attempt(promptA));
    if (!a) {
      await refund(n);
      const reasons = errors.map((e) => e?.message || '').join(' / ');
      console.error('Correction impossible :', reasons);
      const code = (reasons.match(/IA (\d{3})/) || [])[1];
      const hint = code === '401' || code === '403' ? ' (clé IA refusée : vérifiez AI_API_KEY)'
        : code === '429' ? ' (limite du fournisseur IA atteinte : facturation activée ?)'
        : code === '400' || code === '404' ? ` (requête refusée par l'IA, code ${code} : modèle ou format)`
        : code ? ` (erreur IA ${code})` : reasons.includes('JSON') ? " (réponse de l'IA illisible)" : '';
      throw new HttpError(502, `La correction a échoué${hint}. Aucune page n'a été décomptée, réessayez.`);
    }

    if (autoTotal) total = a.sumMax > 0 && a.sumMax <= 1000 ? a.sumMax : 10;
    const b = deep && a.questions.length && !a.illegible
      ? await (early || attempt(impose(a.questions.map((q) => ({ name: q.question, max: q.max }))) + SECOND_LOOK, secondOpts)) : null;
    if (grid) { snapToGrid(a, grid, unit); if (b) snapToGrid(b, grid, unit); }
    const flags = [];
    if (a.manipulation) flags.push(`Tentative de manipulation de l'IA détectée et ignorée : « ${a.manipulation} »`);
    if (a.illegible) {
      // Copie illisible : aucune note inventée, et rien n'est facturé.
      await refund(n);
      const left = await env.DB.prepare('SELECT pages FROM access_keys WHERE key = ?').bind(key).first();
      return json({ name: '', group: body.anonymous ? '' : a.group, grade: null, total, illegible: true, comment: '', reliability: null, secondGrade: null,
        questions: a.questions.map(({ raw, ...q }) => ({ ...q, points: 0, second: null, justification: q.justification || 'Illisible' })),
        flags: [...flags, "Copie illisible (photo floue, sombre ou coupée) : aucune note n'a été attribuée et aucune page n'a été décomptée. Reprenez la photo ou corrigez cette copie vous-même."],
        pagesLeft: left?.pages ?? 0 });
    }
    if (a.partial) flags.push("Certains passages sont difficiles à lire : vérifiez les questions concernées.");
    if (a.uncertain && a.reason) flags.push(a.reason);
    else if (a.uncertain) flags.push("L'IA a un doute sur cette copie.");
    // Nom absent : signalé par le champ « Nom à compléter » de la fiche, pas par une alerte qui noierait les vraies.
    if (Math.abs(a.sumMax - total) > 1e-9) flags.push(`Les questions totalisent ${fr(a.sumMax)} points au lieu de ${fr(total)} : la note a été ramenée sur ${fr(total)}. Vérifiez le barème.`);
    if (deep && !b) {
      // La contre-vérification a échoué : on ne facture que la correction simple.
      await refund(body.pages.length);
      flags.push("La contre-vérification a échoué : correction simple seulement (une seule page décomptée par page).");
    }
    const { reliability: score, questions: compared } = compare(a, b, total, !!body.anonymous);
    // Mode approfondi : la note retenue est la moyenne des deux corrections, question par question.
    const sameShape = b && b.questions.length === a.questions.length;
    const questions = compared.map((q, i) => {
      if (!sameShape || q.second == null) return q;
      const mean = Math.round(((q.points + b.questions[i].points) / 2) / unit) * unit;
      return { ...q, first: q.points, points: Math.min(q.max, mean) };
    }).map(({ raw, ...q }) => q);
    // Si les questions ne totalisent pas le barème, on ramène la note à l'échelle au lieu de la plafonner en silence.
    const sumMax = questions.reduce((x, q) => x + q.max, 0);
    const sum = questions.reduce((x, q) => x + q.points, 0);
    const finalGrade = sumMax > 0 && Math.abs(sumMax - total) > 1e-9 ? Math.round((sum * total / sumMax) / unit) * unit : Math.min(total, sum);
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
  } catch (err) {
    await refund(n).catch((e) => console.error('Remboursement impossible :', e.message));
    throw err;
  } finally { pay.close(); }
}
