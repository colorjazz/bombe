// Mesure la précision des surlignages : compare les cadres renvoyés à la position réelle des mots.
// node score.mjs <dossier> run <nbEssais>   → appelle /api/language et enregistre les réponses (runs.json)
// node score.mjs <dossier> eval [fichier]   → calcule les scores d'un fichier de réponses (cadres éventuellement retouchés)
import fs from 'node:fs';
const [dir, mode, arg] = process.argv.slice(2);
const truth = JSON.parse(fs.readFileSync(`${dir}/truth.json`, 'utf8'));
const KEY = 'CE-TESTS-AAAAA-BBBBB';
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']/g, '');

if (mode === 'run') {
  const runs = [];
  const n = Number(arg || 1);
  await Promise.all(truth.flatMap((t, i) => Array.from({ length: n }, async (_, k) => {
    const url = `data:image/jpeg;base64,${fs.readFileSync(`${dir}/${t.file}`).toString('base64')}`;
    const r = await fetch('http://127.0.0.1:8787/api/language', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ pages: [url], level: 'secondaire3', identify: false }) });
    const d = await r.json();
    runs.push({ page: i, trial: k, errors: d.pages?.[0]?.errors || [] });
  })));
  fs.writeFileSync(`${dir}/runs.json`, JSON.stringify(runs));
  console.log('réponses enregistrées :', runs.length);
}

// Trouve les mots de la vérité correspondant au texte fautif (le plus proche du cadre proposé s'il y a plusieurs occurrences).
function locate(page, text, box) {
  const words = truth[page].words.map((w) => norm(w.w));
  const toks = text.split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length) return null;
  const cands = [];
  for (let i = 0; i + toks.length <= words.length; i++) {
    if (toks.every((t, j) => words[i + j] === t || (j === toks.length - 1 && words[i + j].startsWith(t)) || (j === 0 && words[i + j].endsWith(t)))) {
      const ws = truth[page].words.slice(i, i + toks.length).map((w) => w.box);
      // plusieurs lignes : on garde le premier mot (le surlignage d'un mot coupé est ambigu)
      const same = ws.filter((b) => Math.abs(b[0] - ws[0][0]) < 5);
      cands.push([Math.min(...same.map((b) => b[0])), Math.min(...same.map((b) => b[1])), Math.max(...same.map((b) => b[2])), Math.max(...same.map((b) => b[3]))]);
    }
  }
  if (!cands.length) return null;
  const c = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  if (!box) return cands[0];
  const [py, px] = c(box);
  return cands.sort((a, b) => Math.hypot(c(a)[0] - py, c(a)[1] - px) - Math.hypot(c(b)[0] - py, c(b)[1] - px))[0];
}
const iou = (a, b) => {
  const ih = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iw = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ih * iw, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return u > 0 ? inter / u : 0;
};
// Pour l'enseignant, le surlignage est « juste » s'il couvre l'essentiel du mot sans déborder sur les voisins.
export function grade(runs) {
  let total = 0, ok = 0, near = 0, miss = 0, nobox = 0, unmatched = 0; const bad = [];
  for (const r of runs) for (const e of r.errors) {
    const t = locate(r.page, e.text, e.box);
    if (!t) { unmatched++; continue; }
    total++;
    if (!e.box) { nobox++; continue; }
    const v = iou(e.box, t);
    const [cy, cx] = [(e.box[0] + e.box[2]) / 2, (e.box[1] + e.box[3]) / 2];
    const inside = cy >= t[0] && cy <= t[2] && cx >= t[1] && cx <= t[3];
    if (v >= 0.4) ok++; else if (inside) near++; else { miss++; bad.push(`${e.text} (iou ${v.toFixed(2)})`); }
  }
  return { total, ok, near, miss, nobox, unmatched, pct: Math.round((ok / total) * 100), pctOnWord: Math.round(((ok + near) / total) * 100), bad };
}
if (mode === 'eval') {
  const runs = JSON.parse(fs.readFileSync(arg || `${dir}/runs.json`, 'utf8'));
  const g = grade(runs);
  console.log(`fautes appariées ${g.total} (non retrouvées dans le texte : ${g.unmatched}) · justes ${g.ok} (${g.pct} %) · centre sur le mot ${g.ok + g.near} (${g.pctOnWord} %) · à côté ${g.miss} · sans cadre ${g.nobox}`);
  console.log('à côté :', g.bad.slice(0, 25).join(' | '));
}
