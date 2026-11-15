// Fait passer les copies de truth.json dans la vraie chaîne de correction de la langue (src/worker.js : 1re lecture,
// puis relecture), sans wrangler : le Worker tourne dans Node, avec une base D1 en mémoire (node:sqlite).
// Les réponses brutes de Gemini sont gardées, avant le filtre (PDA, catégories) : score.mjs distingue ainsi les fautes
// écartées par le filtre de celles que l'IA n'a jamais vues.
//
//   node mesure.mjs <dossier> [--essais 2] [--modele gemini-3.7-flash] [--reflexion low|medium|high] [--cote 2000]
//                             [--ortho] [--sans-pda] [--nom essai] [--pages 1,3]
//
// Clé : AI_API_KEY dans correcteur/.dev.vars (jamais dans le dépôt). Réponses → <dossier>/runs-<nom>.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { PDA_SEC_NOTIONS, pdaDefault } from '../../public/pda.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = args[0];
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);
if (!dir) { console.error('usage : node mesure.mjs <dossier> [options]'); process.exit(1); }

// Variables du Worker : wrangler.toml, puis .dev.vars, puis les options.
const vars = {};
const toml = fs.readFileSync(path.join(here, '../../wrangler.toml'), 'utf8').split('[vars]')[1].split(/\n\[/)[0];
for (const m of toml.matchAll(/^([A-Z_]+)\s*=\s*"([^"]*)"/gm)) vars[m[1]] = m[2];
const devVars = path.join(here, '../../.dev.vars');
if (fs.existsSync(devVars)) for (const m of fs.readFileSync(devVars, 'utf8').matchAll(/^([A-Z_]+)\s*=\s*"?([^"\n]*)"?/gm)) vars[m[1]] = m[2];
if (opt('modele')) vars.LANG_MODEL = opt('modele');
if (opt('reflexion')) vars.LANG_THINKING = opt('reflexion');
for (const kv of (opt('var', '') || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); vars[k] = v; } // ex. --var LANG_STRATEGY=deux-temps
if (!vars.AI_API_KEY) { console.error('AI_API_KEY manquante dans correcteur/.dev.vars'); process.exit(1); }

// D1 minimale au-dessus de node:sqlite (prepare / bind / first / all / run / batch).
const sql = new DatabaseSync(':memory:');
const stmt = (q, params = []) => ({
  bind: (...p) => stmt(q, p),
  first: async () => sql.prepare(q).get(...params) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...params) }),
  run: async () => { const r = sql.prepare(q).run(...params); return { meta: { changes: Number(r.changes) } }; },
});
const DB = { prepare: (q) => stmt(q), batch: async (list) => Promise.all(list.map((s) => s.run())) };
const env = { ...vars, DB, IP_SALT: 'mesure', ASSETS: { fetch: () => new Response('') } };

// Chaque appel à Gemini est noté (lecture, jetons, réponse brute) pour la page et l'essai en cours.
const ctx = new AsyncLocalStorage();
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const res = await realFetch(url, init);
  const store = ctx.getStore();
  if (!store || !String(url).includes('generateContent') || !res.ok) return res;
  const body = JSON.parse(init.body);
  const prompt = body.contents[0].parts.map((p) => p.text || '').join('\n');
  const out = await res.clone().json();
  const u = out.usageMetadata || {};
  const kind = prompt.includes('RELECTURE') ? 'reread' : prompt.includes('mot_fautif') || body.generationConfig.responseSchema?.items?.properties?.mot_fautif ? 'first' : 'other';
  let raw = null;
  try { raw = JSON.parse(out.candidates[0].content.parts.map((p) => p.text || '').join('')); } catch { /* réponse illisible : le Worker la signalera */ }
  calls.push({ ...store, kind, model: String(url).match(/models\/([^:]+)/)[1], tin: u.promptTokenCount || 0, tout: (u.totalTokenCount || 0) - (u.promptTokenCount || 0),
    thoughts: u.thoughtsTokenCount || 0, raw: kind === 'other' ? undefined : raw });
  return res;
};

const worker = (await import('../../src/worker.js')).default;
const KEY = 'CE-MESUR-AAAAA-BBBBB';
await worker.fetch(new Request('http://x/api/balance', { headers: { Authorization: `Bearer ${KEY}` } }), env, {}); // crée les tables
sql.prepare('INSERT OR REPLACE INTO access_keys (key, pages, is_trial, created_at) VALUES (?, 1000000, 0, ?)').run(KEY, Date.now());
const api = async (route, body) => {
  const r = await worker.fetch(new Request(`http://x${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  const d = await r.json();
  if (!r.ok) throw new Error(`${route} ${r.status} : ${d.error}`);
  return d;
};

// Réglages envoyés par l'appli (langSettings de public/app.js) : secondaire selon la PDA, étape 3, toutes les catégories.
const settings = (year) => (flag('sans-pda') ? { level: 'secondaire3', categories: ['orthographe', 'accord', 'conjugaison', 'ponctuation', 'syntaxe', 'vocabulaire'] } : {
  level: 'primaire', categories: ['orthographe', 'accord', 'conjugaison', 'ponctuation', 'syntaxe', 'vocabulaire'],
  pda: { level: 'secondaire', year, notions: PDA_SEC_NOTIONS.map((n) => ({ id: n.id, cat: n.cat, label: n.label, state: pdaDefault(n, year, 3) })).filter((n) => n.state !== 'ignore'),
    ignored: PDA_SEC_NOTIONS.filter((n) => pdaDefault(n, year, 3) === 'ignore').map((n) => n.label) },
});

// Image envoyée comme par l'appli (JPEG 0,9), éventuellement réduite (--cote : côté le plus long, en pixels).
const side = Number(opt('cote', 0));
const image = (file) => {
  let buf = fs.readFileSync(path.join(dir, file));
  if (side) buf = execFileSync('convert', ['-', '-resize', `${side}x${side}>`, '-quality', '90', 'jpg:-'], { input: buf, maxBuffer: 64 << 20 });
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
};

const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
const only = opt('pages') ? opt('pages').split(',').map((n) => Number(n) - 1) : truth.map((_, i) => i);
const trials = Number(opt('essais', 2));
const name = opt('nom', `${vars.LANG_MODEL}-${vars.LANG_THINKING || 'defaut'}${side ? `-${side}` : ''}${flag('ortho') ? '-ortho' : ''}`);
const runs = [];
const t0 = Date.now();
await Promise.all(only.flatMap((page) => Array.from({ length: trials }, (_, trial) => ctx.run({ page, trial }, async () => {
  const s = { ...settings(truth[page].year), ...(flag('ortho') ? { ortho: true } : {}) };
  const url = image(truth[page].file);
  const run = { page, trial };
  try {
    const t = Date.now();
    const first = await api('/api/language', { pages: [url], identify: false, ...s });
    run.first = first.pages[0].errors; run.secFirst = (Date.now() - t) / 1000;
    const t2 = Date.now();
    const more = await api('/api/language-reread', { page: url, ...first.pages[0].reread, ...s, known: run.first.map(({ text, correction, box }) => ({ text, correction, box })) });
    run.reread = more.errors; run.secReread = (Date.now() - t2) / 1000;
  } catch (err) { run.error = err.message; console.error(`page ${page + 1} essai ${trial + 1} :`, err.message); }
  runs.push(run);
}))));
for (const r of runs) r.calls = calls.filter((c) => c.page === r.page && c.trial === r.trial).map(({ page, trial, ...c }) => c);
const file = path.join(dir, `runs-${name}.json`);
fs.writeFileSync(file, JSON.stringify({ name, vars: { LANG_MODEL: vars.LANG_MODEL, LANG_THINKING: vars.LANG_THINKING || null, LANG_STRATEGY: vars.LANG_STRATEGY || null }, side: side || null, ortho: flag('ortho'), pda: !flag('sans-pda'), runs }));
console.log(`${runs.length} lectures en ${Math.round((Date.now() - t0) / 1000)} s → ${file}`);
