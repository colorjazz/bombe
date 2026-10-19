// Détection des pages photographiées de côté (fréquent avec un cellulaire tenu à l'horizontale).
// Une page droite a des rangées vides entre ses lignes de texte ; une page de côté a des colonnes vides.
// Validé sur 72 pages (9 vraies photos de copies, copies générées droites et tournées dans les deux sens) : 71/72
// (la seule fausse alerte est confirmée « droite » par l'IA, qui donne le sens de rotation).

const SIZE = 400;

function inkMask(img) {
  const scale = Math.min(1, SIZE / Math.max(img.width, img.height));
  const W = Math.max(1, Math.round(img.width * scale)), H = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // moyenne locale (fenêtre 25 px) par image intégrale : supporte l'éclairage inégal d'une photo
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0, row = 0; x < W; x++) { row += lum[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
  const R = 12, m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
      const mean = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((y1 - y0) * (x1 - x0));
      m[y * W + x] = lum[y * W + x] < mean - 55 ? 1 : 0; // encre foncée seulement (pas les lignes bleu pâle du papier)
    }
  }
  return { W, H, m };
}

// Part des rangées presque vides dans la zone écrite.
function gaps(p) {
  let a = 0, b = p.length - 1;
  while (a < p.length && !p[a]) a++;
  while (b > a && !p[b]) b--;
  if (b - a < 10) return 0;
  let mx = 0; for (let i = a; i <= b; i++) mx = Math.max(mx, p[i]);
  let n = 0; for (let i = a; i <= b; i++) if (p[i] <= mx * 0.04) n++;
  return n / (b - a + 1);
}
function rough(p) {
  let s = 0, t = 0;
  for (let i = 0; i < p.length; i++) { s += p[i]; if (i) t += Math.abs(p[i] - p[i - 1]); }
  return s ? t / s : 0;
}

// Vrai si les lignes de texte semblent verticales (page de côté). Le sens de rotation est ensuite demandé à l'IA :
// deviner le sens d'après la marge s'est révélé peu fiable (erreurs « sûres » sur de vraies copies).
export function looksSideways(img) {
  const { W, H, m } = inkMask(img);
  const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { rows[y]++; cols[x]++; }
  const e = 1e-3;
  return Math.log((gaps(cols) + e) / (gaps(rows) + e)) + Math.log((rough(cols) + e) / (rough(rows) + e)) > -1.3;
}

// Tourne une image (data URL) de 90, 180 ou 270° dans le sens horaire.
export function rotateDataUrl(url, deg, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const q = ((deg % 360) + 360) % 360;
      c.width = q % 180 ? img.height : img.width;
      c.height = q % 180 ? img.width : img.height;
      const g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      g.rotate((q * Math.PI) / 180);
      g.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}
