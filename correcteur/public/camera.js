// Mode caméra : le téléphone filme la pile de copies et photographie chaque feuille tout seul, dès qu'elle est
// cadrée, immobile et nette. L'enseignant n'a qu'à tourner les pages au signal (bip, vibration, éclair vert).
// L'analyse se fait sur une image réduite, plusieurs fois par seconde ; rien ne quitte le téléphone avant la prise.

const SMALL = 160;          // largeur de l'image réduite analysée
const STABLE_MS = 250;      // durée d'immobilité avant la prise (la netteté est vérifiée en plus)
const MOVE = 4.5;           // écart moyen (0-255) entre deux images réduites au-delà duquel ça bouge (une main qui tient le téléphone tremble un peu)
const SAME_PAGE = 9;        // écart moyen sous lequel la feuille est celle déjà photographiée (une autre feuille : 15 et plus)
const COOLDOWN_MS = 500;    // pause après une prise (la même feuille n'est de toute façon pas reprise)

function lumOf(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) out[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  return out;
}

const meanDiff = (a, b) => {
  if (!a || !b || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

// La feuille = la grande zone claire : son cadre, la part de l'image qu'elle occupe et la part d'encre qu'elle porte.
function pageOf(lum, w, h) {
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const paper = sorted[Math.floor(sorted.length * 0.9)];
  const thr = paper * 0.72;
  const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum[y * w + x] > thr) { rows[y]++; cols[x]++; }
  const first = (arr, n) => arr.findIndex((c) => c > n * 0.35);
  const last = (arr, n) => arr.length - 1 - [...arr].reverse().findIndex((c) => c > n * 0.35);
  const y0 = first(rows, w), x0 = first(cols, h);
  if (y0 < 0 || x0 < 0 || paper < 90) return null;
  const y1 = last(rows, w), x1 = last(cols, h);
  let ink = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { n++; if (lum[y * w + x] < paper * 0.75) ink++; }
  return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h, cover: ((x1 - x0 + 1) * (y1 - y0 + 1)) / (w * h), ink: ink / Math.max(1, n) };
}

// Netteté : variance du laplacien sur la feuille, à 480 px de large.
function sharpness(video, box, canvas) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const sx = box.x0 * vw, sy = box.y0 * vh, sw = (box.x1 - box.x0) * vw, sh = (box.y1 - box.y0) * vh;
  const w = 480, h = Math.max(1, Math.round((480 * sh) / sw));
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  const l = lumOf(g, w, h);
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * l[i] - l[i - 1] - l[i + 1] - l[i - w] - l[i + w];
    s += v; s2 += v * v; n++;
  }
  return n ? s2 / n - (s / n) ** 2 : 0;
}

function beep(audio) {
  try {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.12);
  } catch { /* son indisponible */ }
}

// Ouvre la caméra arrière dans `video` et appelle onCapture(canvas) pour chaque feuille photographiée.
// onStatus(message, kind, box) décrit ce qu'il faut faire ; box = la feuille repérée (fractions de l'image) ou null.
// Renvoie { capture(), stop() }.
export async function startCamera(video, { onCapture, onStatus }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  const Audio = window.AudioContext || window.webkitAudioContext;
  const audio = Audio ? new Audio() : null; // créé pendant le geste qui ouvre la caméra : le son est permis

  const small = document.createElement('canvas'), work = document.createElement('canvas');
  // En pause au départ : rien n'est photographié (la table, la main…) avant que l'enseignant touche « Démarrer ».
  let armed = false, prev = null, lastShot = null, stableSince = 0, coolUntil = 0, bestSharp = 0, stopped = false, timer = 0;

  const shoot = (box) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const m = 0.02; // une petite marge autour de la feuille
    const b = box || { x0: 0, y0: 0, x1: 1, y1: 1 };
    const sx = Math.max(0, (b.x0 - m) * vw), sy = Math.max(0, (b.y0 - m) * vh);
    const sw = Math.min(vw - sx, (b.x1 - b.x0 + 2 * m) * vw), sh = Math.min(vh - sy, (b.y1 - b.y0 + 2 * m) * vh);
    const c = document.createElement('canvas');
    c.width = Math.round(sw); c.height = Math.round(sh);
    c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    if (audio) beep(audio);
    navigator.vibrate?.(80);
    coolUntil = performance.now() + COOLDOWN_MS;
    onCapture(c);
  };

  const tick = () => {
    if (stopped) return;
    timer = setTimeout(tick, 80);
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const w = SMALL, h = Math.max(1, Math.round((SMALL * vh) / vw));
    small.width = w; small.height = h;
    const g = small.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, w, h);
    const lum = lumOf(g, w, h);
    const now = performance.now();
    const moving = meanDiff(lum, prev) > MOVE;
    prev = lum;
    if (moving) stableSince = now;
    if (now < coolUntil) return;
    const page = pageOf(lum, w, h);
    if (!page || page.cover < 0.3) { onStatus('Placez une feuille dans le cadre', 'wait', null); return; }
    if (page.ink < 0.002) { onStatus('Feuille vide ?', 'wait', page); return; } // à 160 px, l'écriture ne couvre que 0,5 à 2 % de la feuille
    if (!armed) { onStatus('En pause : placez la première feuille, puis touchez « Démarrer »', 'wait', page); return; }
    if (lastShot && meanDiff(lum, lastShot) < SAME_PAGE) { onStatus('✓ Photographiée — tournez la page', 'done', page); return; }
    if (moving || now - stableSince < STABLE_MS) { onStatus('Tenez immobile…', 'hold', page); return; }
    const sharp = sharpness(video, page, work);
    if (sharp < Math.max(20, bestSharp * 0.45)) { onStatus('Image floue : tenez le téléphone immobile', 'hold', page); return; }
    bestSharp = Math.max(bestSharp * 0.9, sharp);
    lastShot = lum;
    shoot(page);
    onStatus('✓ Photographiée — tournez la page', 'done', page);
  };
  tick();

  return {
    // Démarrer / mettre en pause la prise automatique.
    setArmed(on) { armed = !!on; stableSince = performance.now(); },
    // Déclencheur manuel : toute l'image, sans attendre.
    capture() { const w = small.width, h = small.height; lastShot = prev; shoot(prev ? pageOf(prev, w, h) : null); },
    stop() {
      stopped = true; clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      audio?.close?.();
    },
  };
}
