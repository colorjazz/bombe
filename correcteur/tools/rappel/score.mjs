// Rappel et précision de la correction de la langue, d'après truth.json et un ou plusieurs runs-*.json (mesure.mjs).
//   node score.mjs <dossier> [runs-a.json runs-b.json …] [--detail] [--union a.json+b.json] [--paires]
// --union : réunion des 1res lectures de deux passages ; --paires : réunion des 1res lectures de deux essais d'un même
// passage (essais 1+2, 3+4…), soit deux lectures indépendantes de la même page lancées en parallèle.
// Rappel = fautes trouvées ÷ vraies fautes ; précision = signalements justes ÷ signalements (« à vérifier » compris,
// comptés à part). Pour chaque faute manquée : « filtrée » si l'IA l'a relevée mais que le filtre (PDA, catégorie,
// correction identique) l'a écartée, sinon « jamais vue ».
import fs from 'node:fs';
import path from 'node:path';

// Prix publics Gemini, USD par million de jetons (sortie = réponse + réflexion), relevés le 15 novembre 2026 sur
// ai.google.dev/gemini-api/docs/pricing. 3.8 Flash : prix de lancement jusqu'au 31 décembre 2026, puis 1,50 / 7,50.
export const PRICES = { 'gemini-3.5-flash': { in: 1.5, out: 9 }, 'gemini-3.7-flash': { in: 0.75, out: 3.75 },
  'gemini-3.8-flash': { in: 0.75, out: 3.75 }, 'gemini-3.1-pro-preview': { in: 2, out: 12 } };
export const USD_CAD = 1.38;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/[^a-z0-9']/g, '');
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// Une lettre de différence (lecture de l'écriture) : « obsédé » lu « obsede », « jardi » lu « jardin ».
const near = (a, b) => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(a.length, b.length) - i - j <= 1;
};

// Mots de la page couverts par une faute signalée : la suite de mots égale au texte fautif, la plus proche de son cadre
// (copies générées) ou de sa ligne recopiée (vraies photos, dont la vérité n'a pas la position des mots).
export function span(page, err) {
  const words = page.words.map((w) => norm(w.w));
  const toks = String(err.text || '').split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length) return null;
  const at = (i) => page.words[i].box;
  const cands = [];
  for (const loose of [false, true]) {
    const eq = (w, t) => w === t || (loose && near(w, t));
    for (let i = 0; i + toks.length <= words.length; i++) {
      if (toks.every((t, j) => eq(words[i + j], t) || (j === toks.length - 1 && words[i + j].startsWith(t)) || (j === 0 && words[i + j].endsWith(t)))) cands.push([i, i + toks.length - 1]);
    }
    if (cands.length) break;
  }
  // Texte mal recopié par l'IA : on se rabat sur un mot de la page qu'il contient.
  if (!cands.length) toks.forEach((t) => words.forEach((w, i) => { if (w === t || near(w, t)) cands.push([i, i]); }));
  if (!cands.length) return null;
  if (err.box && at(0)) {
    const [py, px] = center(err.box);
    const d = ([a]) => { const [y, x] = center(at(a)); return Math.hypot(y - py, x - px); };
    return cands.sort((a, b) => d(a) - d(b))[0];
  }
  // Sans position : le passage dont les mots voisins ressemblent le plus à la ligne recopiée par l'IA.
  const line = new Set(String(err.line || '').split(/\s+/).map(norm).filter(Boolean));
  if (!line.size) return cands[0];
  const fit = ([a, b]) => words.slice(Math.max(0, a - 6), b + 7).filter((w) => line.has(w)).length;
  return cands.sort((x, y) => fit(y) - fit(x))[0];
}

// Vraies fautes reconnues par un signalement. Ponctuation et syntaxe : le cadre peut tomber sur le mot voisin.
export function matches(page, err) {
  const s = span(page, err);
  if (!s) return [];
  const hit = page.faults.filter((f) => f.index >= s[0] - (['ponctuation', 'syntaxe'].includes(f.category) ? 1 : 0) && f.index <= s[1] + (['ponctuation', 'syntaxe'].includes(f.category) ? 1 : 0));
  if (hit.length <= 1) return hit;
  // Plusieurs fautes sous un même cadre (« seul et abandonné ») : celles dont la correction est reprise, sinon la plus proche.
  const corr = norm(err.correction);
  const named = hit.filter((f) => corr.includes(norm(f.correction)) || norm(err.text) === norm(f.written));
  return named.length ? named : [hit.sort((a, b) => Math.abs(a.index - s[0]) - Math.abs(b.index - s[0]))[0]];
}

// Réponse brute de Gemini → même forme que les fautes affichées (pour savoir ce que le filtre a écarté).
const rawErrors = (raw) => (Array.isArray(raw) ? raw : raw?.fautes || []).map((f) => ({ text: f.mot_fautif ?? f.texte, correction: f.correction, box: f.box, line: f.ligne, notion: f.notion, category: f.categorie }));

export function score(truth, data) {
  const t = { first: { found: 0, sig: 0, ok: 0, doubt: 0 }, both: { found: 0, sig: 0, ok: 0, doubt: 0 } };
  const by = {}; // par catégorie et par type
  const missed = { filtered: 0, unseen: 0, list: [] };
  const fps = [];
  const boxes = { n: 0, ok: 0 }; // copies générées : cadre juste si IoU ≥ 0,4 avec les mots fautifs (comme tools/surlignages)
  const cost = { usd: 0, tin: 0, tout: 0, thoughts: 0, calls: 0, pages: 0, sec: 0 };
  const runs = data.runs.filter((r) => !r.error);
  for (const r of runs) {
    const page = truth[r.page];
    const read = (errs) => { const found = new Set(); let ok = 0, doubt = 0;
      for (const e of errs) { const m = matches(page, e); m.forEach((f) => found.add(f.index)); if (m.length) ok++; else fps.push(`p${r.page + 1} « ${e.text} » → « ${e.correction} »${e.doubtful ? ' (à vérifier)' : ''}`); if (e.doubtful) doubt++; }
      return { found, ok, doubt, sig: errs.length }; };
    const a = read(r.first || []), b = read([...(r.first || []), ...(r.reread || [])]);
    if (page.words[0]?.box) for (const e of [...(r.first || []), ...(r.reread || [])]) {
      const sp = matches(page, e).length && span(page, e);
      if (!sp || !e.box) continue;
      const ws = page.words.slice(sp[0], sp[1] + 1).map((w) => w.box).filter((x) => Math.abs(x[0] - page.words[sp[0]].box[0]) < 5);
      const t = [Math.min(...ws.map((x) => x[0])), Math.min(...ws.map((x) => x[1])), Math.max(...ws.map((x) => x[2])), Math.max(...ws.map((x) => x[3]))];
      const ih = Math.max(0, Math.min(t[2], e.box[2]) - Math.max(t[0], e.box[0])), iw = Math.max(0, Math.min(t[3], e.box[3]) - Math.max(t[1], e.box[1]));
      const u = (t[2] - t[0]) * (t[3] - t[1]) + (e.box[2] - e.box[0]) * (e.box[3] - e.box[1]) - ih * iw;
      boxes.n++; if (u > 0 && (ih * iw) / u >= 0.4) boxes.ok++;
    }
    // Une « faute » dont la correction est le mot lui-même (« obsédée » → « obsédée ») veut dire que l'IA a lu la bonne forme :
    // elle n'a pas vu la faute, même si le filtre retire ensuite cette ligne.
    const rawSeen = new Set(r.calls.filter((c) => c.kind !== 'other').flatMap((c) => rawErrors(c.raw))
      .filter((e) => norm(e.text) !== norm(e.correction)).flatMap((e) => matches(page, e).map((f) => f.index)));
    const real = (v) => [...v.found].filter((i) => !page.faults.find((f) => f.index === i).optional).length;
    for (const [k, v] of [['first', a], ['both', b]]) { t[k].found += real(v); t[k].sig += v.sig; t[k].ok += v.ok; t[k].doubt += v.doubt; }
    for (const f of page.faults.filter((x) => !x.optional)) {
      for (const key of [`cat:${f.category}`, `type:${f.type}`]) {
        by[key] ||= { n: 0, first: 0, both: 0 };
        by[key].n++; if (a.found.has(f.index)) by[key].first++; if (b.found.has(f.index)) by[key].both++;
      }
      if (!b.found.has(f.index)) {
        const why = rawSeen.has(f.index) ? 'filtered' : 'unseen';
        missed[why]++;
        missed.list.push(`p${r.page + 1} ${f.written} → ${f.correction} (${f.type}, ${why === 'filtered' ? 'filtrée' : 'jamais vue'})`);
      }
    }
    for (const c of r.calls) {
      const p = PRICES[c.model] || {};
      cost.usd += (c.tin * (p.in ?? NaN) + c.tout * (p.out ?? NaN)) / 1e6;
      cost.tin += c.tin; cost.tout += c.tout; cost.thoughts += c.thoughts; cost.calls++;
    }
    cost.pages++; cost.sec += (r.secFirst || 0) + (r.secReread || 0);
  }
  const n = runs.reduce((s, r) => s + truth[r.page].faults.filter((f) => !f.optional).length, 0);
  return { name: data.name, n, runs: runs.length, failed: data.runs.length - runs.length, t, by, missed, fps, cost, boxes };
}

// Réunion de plusieurs passages (ex. deux lectures indépendantes en parallèle) : mêmes pages et essais, fautes mises
// ensemble, doublons (même mot, même endroit) retirés.
export function union(list) {
  const key = (r) => `${r.page}:${r.trial}`;
  const runs = list[0].runs.map((r) => {
    const others = list.slice(1).map((d) => d.runs.find((o) => key(o) === key(r)));
    if (r.error || others.some((o) => !o || o.error)) return { ...r, error: 'incomplet' };
    const all = [r, ...others];
    const first = [];
    for (const e of all.flatMap((o) => o.first)) if (!first.some((x) => norm(x.text) === norm(e.text) && x.box && e.box && Math.abs(center(x.box)[0] - center(e.box)[0]) < 15 && Math.abs(center(x.box)[1] - center(e.box)[1]) < 30)) first.push(e);
    return { page: r.page, trial: r.trial, first, reread: [], calls: all.flatMap((o) => o.calls.filter((c) => c.kind !== 'reread')), secFirst: Math.max(...all.map((o) => o.secFirst)) };
  });
  return { name: list.map((d) => d.name).join(' + '), runs };
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
export function report(s, detail) {
  const c = s.cost, cad = (c.usd * USD_CAD * 100) / c.pages;
  const out = [`## ${s.name}  (${s.runs} lectures de page${s.failed ? `, ${s.failed} en échec` : ''}, ${s.n} vraies fautes au total)`,
    `rappel      1re lecture ${pct(s.t.first.found, s.n)} · avec la relecture ${pct(s.t.both.found, s.n)}`,
    `précision   1re lecture ${pct(s.t.first.ok, s.t.first.sig)} (${s.t.first.sig - s.t.first.ok} fausses sur ${s.t.first.sig}) · avec la relecture ${pct(s.t.both.ok, s.t.both.sig)} (${s.t.both.sig - s.t.both.ok} fausses sur ${s.t.both.sig}, dont « à vérifier » ${s.t.both.doubt})`,
    `manquées    ${s.missed.filtered + s.missed.unseen} : écartées par le filtre ${s.missed.filtered}, jamais vues ${s.missed.unseen}`,
    `coût/page   ${Number.isNaN(cad) ? 'prix du modèle inconnu' : `${cad.toFixed(2)} ¢ CA`} (${Math.round(c.tin / c.pages)} jetons d'entrée, ${Math.round(c.tout / c.pages)} de sortie dont ${Math.round(c.thoughts / c.pages)} de réflexion, ${(c.calls / c.pages).toFixed(1)} appels) · ${Math.round(c.sec / c.pages)} s/page`,
    ...(s.boxes.n ? [`cadres     ${pct(s.boxes.ok, s.boxes.n)} justes (${s.boxes.ok} sur ${s.boxes.n} fautes trouvées)`] : []),
    'par catégorie et par type (1re lecture → avec relecture) :',
    ...Object.entries(s.by).sort().map(([k, v]) => `   ${k.padEnd(20)} ${String(v.n).padStart(3)}  ${pct(v.first, v.n).padStart(5)} → ${pct(v.both, v.n).padStart(5)}`)];
  if (detail) out.push('manquées :', ...s.missed.list.map((x) => `   ${x}`), 'fausses fautes :', ...s.fps.map((x) => `   ${x}`));
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dir = args[0];
  const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
  const load = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(dir, f), 'utf8'));
  const ui = args.indexOf('--union');
  const files = args.slice(1).filter((a, i) => !a.startsWith('--') && args[i] !== '--union');
  const list = files.length ? files : fs.readdirSync(dir).filter((f) => /^runs-.*\.json$/.test(f));
  for (const f of list) {
    const data = load(f);
    console.log(report(score(truth, data), args.includes('--detail')), '\n');
    if (args.includes('--paires')) {
      const a = { name: data.name, runs: data.runs.filter((r) => r.trial % 2 === 0) };
      const b = { name: data.name, runs: data.runs.filter((r) => r.trial % 2 === 1).map((r) => ({ ...r, trial: r.trial - 1 })) };
      console.log(report(score(truth, { ...union([a, b]), name: `${data.name} : deux 1res lectures réunies` }), args.includes('--detail')), '\n');
    }
  }
  if (ui >= 0) console.log(report(score(truth, union(args[ui + 1].split('+').map(load))), args.includes('--detail')));
}
