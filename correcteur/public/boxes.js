// Resserrement d'un cadre sur l'encre du mot qu'il désigne (cadre tracé à la main par l'enseignant).
// Les surlignages de l'IA ne sont plus recalés : avec gemini-3.7-flash, ses cadres sont exacts à 81 % sur de vraies copies,
// et tout recalage automatique les dégradait (69 %). Mesures et historique : tools/surlignages/README.md.

function inkColumns(img, top, bot, left, right) {
  const { data, width: W } = img;
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  // Seuil adaptatif : nettement plus sombre que le papier de la bande, selon le contraste de la photo (encre pâle comprise).
  const samples = [];
  for (let y = top; y <= bot; y += 2) for (let x = left; x <= right; x += 4) samples.push(lum(x, y));
  samples.sort((a, b) => a - b);
  const paper = samples[Math.floor(samples.length * 0.6)], ink = samples[Math.floor(samples.length * 0.02)];
  const thr = paper - Math.min(70, Math.max(35, (paper - ink) * 0.5));
  const width = right - left + 1;
  const col = new Array(width).fill(0);
  for (let y = top; y <= bot; y++) {
    let n = 0;
    const row = [];
    for (let x = left; x <= right; x++) if (lum(x, y) < thr) { row.push(x - left); n++; }
    if (n > width * 0.35) continue; // ligne du papier (réglure) : pas de l'écriture
    for (const x of row) col[x]++;
  }
  return col;
}

function segments(col, offset, minInk, gap, minWidth) {
  const segs = [];
  let s = -1, last = -1e9;
  for (let i = 0; i < col.length; i++) {
    if (col[i] < minInk) continue;
    if (s < 0 || i - last > gap) { if (s >= 0) segs.push([s + offset, last + offset]); s = i; }
    last = i;
  }
  if (s >= 0) segs.push([s + offset, last + offset]);
  return segs.filter(([a, b]) => b - a >= minWidth);
}

// Garde les traces d'encre dont la majeure partie est dans le cadre de l'IA, et les englobe entièrement.
function tighten(col, minInk, lh, x0, x1, W) {
  const bx0 = (x0 / 1000) * W, bx1 = (x1 / 1000) * W;
  const inside = segments(col, 0, minInk, lh * 0.18, lh * 0.05)
    .filter(([a, b]) => Math.min(b, bx1) - Math.max(a, bx0) >= (b - a) * 0.5);
  if (!inside.length) return null;
  return [inside[0][0], inside[inside.length - 1][1]];
}

// Resserre un cadre déjà bien placé (tracé à la main, ou deuxième repérage de l'IA) sur l'encre du mot, sans changer de mot.
export function refineToInk(img, box) {
  const { width: W, height: H } = img;
  const [y0, x0, y1, x1] = box;
  const lh = Math.max(8, ((y1 - y0) / 1000) * H);
  const top = Math.max(0, Math.round((y0 / 1000) * H + lh * 0.15)), bot = Math.min(H - 1, Math.round((y1 / 1000) * H - lh * 0.15));
  if (bot <= top) return box;
  const col = inkColumns(img, top, bot, 0, W - 1);
  const minInk = Math.max(1, Math.round((bot - top) * 0.03));
  const t = tighten(col, minInk, lh, x0, x1, W);
  if (!t) return box;
  const pad = lh * 0.08;
  return [y0, Math.max(0, ((t[0] - pad) / W) * 1000), y1, Math.min(1000, ((t[1] + pad) / W) * 1000)];
}
