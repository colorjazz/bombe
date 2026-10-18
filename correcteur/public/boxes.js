// Recalage des surlignages sur les mots réellement écrits.
// Gemini trouve très bien la bonne ligne, mais se trompe souvent de position horizontale (d'un demi-mot à deux mots).
// En revanche, il recopie fidèlement la ligne où se trouve la faute. On découpe donc la ligne en mots d'après l'encre
// (colonnes sombres séparées par des espaces) et on encadre le mot au bon rang.
// Mesuré sur des copies manuscrites dont la position des mots est connue : de 45-63 % à 86-96 % de cadres justes.

const MIN_WORD = 0.12; // une trace plus étroite que 12 % de la hauteur de ligne n'est pas un mot (point, accent)

function inkColumns(img, top, bot, left, right) {
  const { data, width: W } = img;
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  // seuil adaptatif : nettement plus sombre que le papier de la bande (supporte l'éclairage inégal d'une photo)
  const samples = [];
  for (let y = top; y <= bot; y += 2) for (let x = left; x <= right; x += 4) samples.push(lum(x, y));
  samples.sort((a, b) => a - b);
  const thr = samples[Math.floor(samples.length * 0.6)] - 70;
  const col = new Array(right - left + 1).fill(0);
  for (let x = left; x <= right; x++) for (let y = top; y <= bot; y++) if (lum(x, y) < thr) col[x - left]++;
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

const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Découpe la bande [top, bot] en mots, avec l'écart entre mots qui donne le nombre de mots le plus proche de `want`.
function wordsOfBand(img, top, bot, lh, want) {
  const col = inkColumns(img, top, bot, 0, img.width - 1);
  const minInk = Math.max(1, Math.round((bot - top) * 0.03));
  let words = [], bestDiff = Infinity;
  for (let g = 0.14; g <= 0.7; g += 0.02) {
    const w = segments(col, 0, minInk, lh * g, lh * MIN_WORD);
    const diff = Math.abs(w.length - want) + Math.abs(g - 0.3) * 0.01; // à égalité, l'écart le plus courant
    if (diff < bestDiff) { bestDiff = diff; words = w; }
  }
  return { words, diff: Math.round(bestDiff) };
}

// img : ImageData de la page · box : [ymin, xmin, ymax, xmax] sur 1000 · text : mot fautif · line : ligne recopiée par l'IA.
// Renvoie un cadre recalé, le cadre d'origine si la ligne ne peut pas être analysée, ou null s'il tombe sur du papier vierge.
export function snapToInk(img, box, text, line) {
  const { width: W, height: H } = img;
  let [y0, x0, y1, x1] = box;
  const lh = Math.max(8, ((y1 - y0) / 1000) * H);
  let top = Math.max(0, Math.round((y0 / 1000) * H + lh * 0.2)), bot = Math.min(H - 1, Math.round((y1 / 1000) * H - lh * 0.2));
  if (bot <= top || !text?.trim()) return box;
  const toks = String(line || '').trim().split(/\s+/).filter(Boolean);
  const errToks = text.trim().split(/\s+/).map(norm).filter(Boolean);
  const k = Math.max(1, errToks.length);
  const nt = toks.map(norm);
  const hits = [];
  for (let i = 0; i + k <= nt.length; i++) {
    if (errToks.every((t, j) => nt[i + j] && (nt[i + j] === t || nt[i + j].includes(t) || t.includes(nt[i + j])))) hits.push(i);
  }
  const col = inkColumns(img, top, bot, 0, W - 1);
  const minInk = Math.max(1, Math.round((bot - top) * 0.03));
  const pad = lh * 0.08;
  const toBox = ([a, b]) => [y0, Math.max(0, ((a - pad) / W) * 1000), y1, Math.min(1000, ((b + pad) / W) * 1000)];

  if (!hits.length) {
    // Ligne inconnue : on garde le groupe de mots qui recouvre le mieux le cadre de l'IA.
    const words = segments(col, 0, minInk, lh * 0.32, lh * MIN_WORD);
    const bx0 = (x0 / 1000) * W, bx1 = (x1 / 1000) * W;
    let best = null, bestScore = 0.05;
    for (let i = 0; i + k <= words.length; i++) {
      const a = words[i][0], b = words[i + k - 1][1];
      const score = Math.max(0, Math.min(b, bx1) - Math.max(a, bx0)) / (Math.max(b, bx1) - Math.min(a, bx0));
      if (score > bestScore) { bestScore = score; best = [a, b]; }
    }
    return best ? toBox(best) : box;
  }

  // L'espace entre les mots varie d'un élève à l'autre : on cherche l'écart qui donne autant de mots que la ligne recopiée.
  let { words, diff } = wordsOfBand(img, top, bot, lh, toks.length);
  // Rarement, l'IA se trompe de ligne : si la ligne visée ne ressemble pas à la ligne recopiée (ou est vide),
  // on cherche, juste au-dessus et au-dessous, la ligne dont le nombre de mots concorde.
  if (!words.length || diff >= 3) {
    let found = null;
    for (let step = 1; step <= 14 && !found; step++) {
      for (const dir of [-1, 1]) {
        const dy = dir * step * lh * 0.25;
        const t2 = Math.round(top + dy), b2 = Math.round(bot + dy);
        if (t2 < 0 || b2 >= H) continue;
        const r = wordsOfBand(img, t2, b2, lh, toks.length);
        if (r.words.length && r.diff <= 1) { found = { ...r, dy }; break; }
      }
    }
    if (found) {
      ({ words } = found);
      const d = (found.dy / H) * 1000;
      y0 += d; y1 += d;
    } else if (!words.length) return null; // cadre sur du papier vierge : mieux vaut « non localisée » qu'un cadre trompeur
  }

  // Position attendue de chaque occurrence d'après les caractères ; on garde la plus proche du cadre de l'IA.
  const lx0 = words[0][0], lx1 = words[words.length - 1][1];
  const chars = toks.join(' ').length;
  const expected = (i) => {
    const start = toks.slice(0, i).join(' ').length + (i ? 1 : 0);
    return lx0 + ((start + toks.slice(i, i + k).join(' ').length / 2) / chars) * (lx1 - lx0);
  };
  const cx = ((x0 + x1) / 2000) * W;
  const i = hits.sort((a, b) => Math.abs(expected(a) - cx) - Math.abs(expected(b) - cx))[0];
  // Même nombre de mots : on prend le mot au bon rang, sauf s'il est loin de la position attendue
  // (un mot collé et un mot coupé peuvent se compenser et décaler le rang).
  const avgW = (lx1 - lx0) / Math.max(1, toks.length);
  if (words.length === toks.length) {
    const c = (words[i][0] + words[i + k - 1][1]) / 2;
    if (Math.abs(c - expected(i)) <= avgW * 0.8) return toBox([words[i][0], words[i + k - 1][1]]);
  }
  // Découpage imparfait (mots collés ou coupés) : le groupe de mots le plus proche de la position attendue.
  const target = expected(i);
  let pick = null, bestD = Infinity;
  for (let j = 0; j + k <= words.length; j++) {
    const d = Math.abs((words[j][0] + words[j + k - 1][1]) / 2 - target);
    if (d < bestD) { bestD = d; pick = [words[j][0], words[j + k - 1][1]]; }
  }
  return pick ? toBox(pick) : box;
}
