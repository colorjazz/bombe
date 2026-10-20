// Brûle la pile — application de l'enseignant.
// Les copies restent en mémoire dans cet onglet ; seule la clé d'accès est retenue sur l'appareil.

const MAX_SIDE = 2000;          // pixels, côté le plus long d'une page envoyée (précision du surlignage)
const JPEG_QUALITY = 0.85;
const MAX_PAGES_PER_COPY = 10;
const MAX_RUBRIC_PAGES = 6;
const CONCURRENCY = 5;
const KEY_STORAGE = 'ce.accessKey';
const PDFJS = '/vendor/pdfjs'; // pdf.js 3.11.174, hébergé sur le site

import { t, tr, lang, startI18n } from './i18n.js';
import { refineToInk } from './boxes.js';
import { looksSideways, rotateDataUrl } from './orient.js';
import { startCamera } from './camera.js';

const $ = (id) => document.getElementById(id);
const state = {
  key: null,
  pagesLeft: null,
  rubricPages: [],   // { id, url }
  pages: [],         // { id, url, file, startsNew }
  status: {},        // id de la première page d'une copie → { state: 'running'|'error', msg }
  results: [],
  open: new Set(),
  running: false,
  kind: 'content', // 'content' : correction de copies · 'lang' : correction de la langue
  exported: true,
};

// ---------- Petits utilitaires ----------

const uid = () => crypto.randomUUID();
const pctText = (n) => (lang === 'en' ? `${n}%` : `${n} %`); // typographie : « 85 % » en français, « 85% » en anglais
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA', { maximumFractionDigits: 2 }));

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k.includes('-')) el.setAttribute(k, v);
    else if (v !== false && v != null) el[k] = v;
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const store = {
  get: () => { try { return localStorage.getItem(KEY_STORAGE); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(KEY_STORAGE, v); } catch { /* navigation privée */ } },
  del: () => { try { localStorage.removeItem(KEY_STORAGE); } catch { /* idem */ } },
};

function banner(type, text) {
  $('banner').replaceChildren(text ? h('div', { class: `banner ${type}` }, h('span', { textContent: text }),
    h('button', { class: 'icon-btn', type: 'button', textContent: '×', onclick: () => banner() })) : '');
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'X-Lang': $('out-lang').value || lang, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && state.key ? { Authorization: `Bearer ${state.key}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status });
  return data;
}

// ---------- Accès (clé, essai, achat) ----------

function setBalance(pages) {
  state.pagesLeft = pages;
  const b = $('balance');
  b.hidden = pages == null;
  b.textContent = `${fmt(pages)} page${pages > 1 ? 's' : ''} restante${pages > 1 ? 's' : ''}`;
  b.classList.toggle('low', pages < 30);
  renderSummary();
}

async function useKey(key) {
  state.key = key.trim().toUpperCase();
  const data = await api('/api/balance');
  store.set(state.key);
  setBalance(data.pages);
  $('gate').hidden = true;
  $('app').hidden = false;
  $('buy-open').hidden = $('logout').hidden = false;
}

function showGate(msg = '') {
  state.key = null;
  $('gate').hidden = false;
  $('app').hidden = true;
  $('balance').hidden = $('buy-open').hidden = $('logout').hidden = true;
  $('gate-msg').textContent = msg;
}

async function startTrial() {
  $('trial').disabled = true;
  try {
    const { key } = await api('/api/trial', { method: 'POST', auth: false });
    await useKey(key);
    $('newkey-value').textContent = key;
    $('newkey').hidden = false;
  } catch (err) {
    $('gate-msg').textContent = err.message;
  } finally {
    $('trial').disabled = false;
  }
}

async function buy(pack) {
  $('buy-msg').textContent = '';
  try {
    const { url } = await api('/api/checkout', { method: 'POST', auth: false, body: { pack, key: state.key || undefined } });
    if (state.results.length && !state.exported && !confirm(tr('Vos résultats non téléchargés seront perdus en quittant la page. Continuer vers le paiement ?'))) return;
    state.exported = true;
    location.href = url;
  } catch (err) {
    $('buy-msg').textContent = err.message;
  }
}

// ---------- Préparation des pages (redimensionnement, PDF → images) ----------

function canvasToJpeg(canvas) { return canvas.toDataURL('image/jpeg', JPEG_QUALITY); }

function fitCanvas(w, h, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  return c;
}

// Bibliothèques chargées seulement au besoin (versions figées).
const LIBS = {
  heic: '/vendor/heic2any-0.0.4.min.js',
  mammoth: '/vendor/mammoth-1.8.0.browser.min.js',
  html2canvas: '/vendor/html2canvas-1.4.1.min.js',
};
const loaded = {};
function loadLib(name) {
  loaded[name] ||= new Promise((resolve, reject) => {
    const s = h('script', { src: LIBS[name] });
    s.onload = resolve;
    s.onerror = () => { loaded[name] = null; reject(new Error(tr('module de lecture indisponible (rechargez la page)'))); };
    document.head.append(s);
  });
  return loaded[name];
}

const ext = (file) => (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const isHeic = (file) => /heic|heif/.test(file.type) || ['heic', 'heif'].includes(ext(file));
const isImage = (file) => file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(ext(file));
const isDocx = (file) => ext(file) === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isText = (file) => ext(file) === 'txt' || file.type === 'text/plain';

async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    // Photos d'iPhone (HEIC) : Chrome et Edge ne savent pas les lire, on les convertit d'abord.
    if (!isHeic(file)) throw new Error('image illisible');
    await loadLib('heic');
    const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return createImageBitmap(Array.isArray(out) ? out[0] : out);
  }
}

// Word et texte brut : mis en page comme des feuilles lettre, puis découpés en pages images.
async function documentToJpegs(html) {
  await loadLib('html2canvas');
  const sheet = h('div');
  sheet.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;padding:72px;box-sizing:border-box;background:#fff;color:#111;font:15px/1.6 Georgia,serif';
  sheet.innerHTML = html; // contenu converti localement (Word / texte), jamais exécuté : aucune balise script n'est produite
  sheet.querySelectorAll('script, iframe, object').forEach((el) => el.remove());
  sheet.querySelectorAll('img').forEach((img) => { img.style.maxWidth = '100%'; });
  document.body.append(sheet);
  try {
    const full = await window.html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const pageH = 1056 * 2;
    const out = [];
    for (let y = 0; y < full.height; y += pageH) {
      const c = document.createElement('canvas');
      c.width = full.width; c.height = pageH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(full, 0, y, full.width, Math.min(pageH, full.height - y), 0, 0, full.width, Math.min(pageH, full.height - y));
      const f = fitCanvas(c.width, c.height);
      f.getContext('2d').drawImage(c, 0, 0, f.width, f.height);
      out.push(canvasToJpeg(f));
    }
    return out;
  } finally {
    sheet.remove();
  }
}

async function docxToJpegs(file) {
  await loadLib('mammoth');
  const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  if (!value.trim()) throw new Error('document vide');
  return documentToJpegs(value);
}

async function textToJpegs(file) {
  const text = await file.text();
  if (!text.trim()) throw new Error('document vide');
  const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return documentToJpegs(`<div style="white-space:pre-wrap">${esc}</div>`);
}

// `rot` : rotation horaire (0, 90, 180, 270) pour redresser une photo prise de côté.
async function imageToJpeg(file, maxSide = MAX_SIDE, quality = JPEG_QUALITY, rot = 0) {
  const bmp = await decodeImage(file);
  const side = rot % 180 !== 0;
  const c = fitCanvas(side ? bmp.height : bmp.width, side ? bmp.width : bmp.height, maxSide);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  const [w, hh] = side ? [c.height, c.width] : [c.width, c.height];
  ctx.drawImage(bmp, -w / 2, -hh / 2, w, hh);
  bmp.close?.();
  return c.toDataURL('image/jpeg', quality);
}

let pdfjsPromise;
function loadPdfJs() {
  pdfjsPromise ||= new Promise((resolve, reject) => {
    const s = h('script', { src: `${PDFJS}/pdf.min.js` });
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfjsPromise = null; reject(new Error(tr('lecteur PDF indisponible (rechargez la page)'))); };
    document.head.append(s);
  });
  return pdfjsPromise;
}

async function pdfToJpegs(file, onPage) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onPage?.(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, MAX_SIDE / Math.max(base.width, base.height)) });
    const c = fitCanvas(viewport.width, viewport.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(canvasToJpeg(c));
    page.cleanup();
  }
  await pdf.destroy();
  return out;
}

async function filesToPages(files) {
  const out = [];
  const errors = [];
  for (const file of files) {
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const urls = await pdfToJpegs(file, (i, n) => banner('info', `Lecture de « ${file.name} » : page ${i}/${n}…`));
        urls.forEach((url, i) => out.push({ id: uid(), url, file: file.name, firstOfFile: i === 0 }));
      } else if (isImage(file)) {
        // `source` garde la photo d'origine : la correction de la langue l'envoie en pleine résolution.
        out.push({ id: uid(), url: await imageToJpeg(file), file: file.name, firstOfFile: true, source: file });
      } else if (isDocx(file) || isText(file)) {
        banner('info', `Mise en page de « ${file.name} »…`);
        const urls = await (isDocx(file) ? docxToJpegs(file) : textToJpegs(file));
        urls.forEach((url, i) => out.push({ id: uid(), url, file: file.name, firstOfFile: i === 0 }));
      } else {
        errors.push(`${file.name} (format non pris en charge : enregistrez-le en PDF${ext(file) === 'doc' ? ' ou en .docx' : ''})`);
      }
    } catch (err) {
      errors.push(`${file.name} (${err.message || 'illisible'})`);
    }
  }
  if (out.length) banner('info', 'Vérification de l’orientation des pages…');
  const turned = await straighten(out);
  banner(errors.length ? 'err' : turned ? 'info' : '', errors.length ? `Fichiers ignorés : ${errors.join(', ')}`
    : turned ? `${turned} page(s) photographiée(s) de côté ont été redressées. Vérifiez les miniatures (bouton ↻ pour pivoter).` : '');
  return out;
}

// Redresse les pages photographiées de côté : l'appli repère les lignes verticales, l'IA donne le sens (gratuit).
async function straighten(pages) {
  if (!state.key) return 0;
  let turned = 0, next = 0;
  const one = async (p) => {
    try {
      const img = await loadImage(p.url);
      if (!looksSideways(img)) return;
      // L'IA reçoit la page tournée dans les deux sens possibles et choisit celle qui se lit à l'endroit.
      // Seule la partie centrale de la page part, que le nom soit masqué ou non : l'en-tête est sur un bord (lequel, on ne
      // le sait pas encore), et la case « Masquer le nom » peut être cochée après l'import. Le centre suffit (18/18 sur de vraies copies).
      const small = await thumbnail(p.url, 768, [0.25, 0.15, 0.75, 0.85]);
      const images = await Promise.all([90, 270].map((d) => rotateDataUrl(small, d, 0.6)));
      const { choice } = await api('/api/orient', { method: 'POST', body: { images } });
      const rotation = choice ? 270 : 90;
      p.url = await rotateDataUrl(p.url, rotation);
      p.rot = rotation;
      turned++;
    } catch { /* en cas de doute, on laisse la page telle quelle : le bouton ↻ permet de la pivoter */ }
  };
  // 4 pages à la fois : l'IA met quelques secondes par page
  await Promise.all(Array.from({ length: Math.min(4, pages.length) }, async () => { while (next < pages.length) await one(pages[next++]); }));
  return turned;
}

async function rotatePage(p) {
  p.url = await rotateDataUrl(p.url, 90);
  p.rot = ((p.rot || 0) + 90) % 360;
  renderPages();
}

// ---------- Regroupement des pages en copies ----------

function applyMode() {
  const mode = $('mode').value;
  const per = Math.round(Number($('per').value));
  state.pages.forEach((p, i) => {
    // Tant que le regroupement n'est pas choisi (ou le nombre de pages pas saisi), on affiche un fichier par copie.
    p.startsNew = mode === 'auto' ? (p.autoStart ?? p.firstOfFile)
      : mode === 'fixed' && per >= 1 ? i % per === 0 : p.firstOfFile;
  });
  if (state.pages[0]) state.pages[0].startsNew = true;
}

// ---------- Détection automatique des copies ----------

// Option « masquer le nom » : le haut de la 1re page (en-tête avec le nom) est blanchi dans le navigateur
// avant l'envoi (le redressement des photos n'envoie jamais que le centre de la page) ; l'enseignant voit toujours la copie complète.
// Hauteur de la bande masquée (part de la page) et pages concernées : réglables, aperçu hachuré sur les miniatures.
const maskFrac = () => Number($('anon-h').value) || 0.14;
const masked = (i) => anonymous() && (i === 0 || $('anon-all').checked);
const anonymous = () => $('anon').checked;
function maskTop(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, Math.round(c.height * maskFrac()));
      resolve(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// crop : [x0, y0, x1, y1] en fractions de l'image, pour n'en envoyer qu'une partie.
function thumbnail(url, size = 640, crop = null) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const [fx0, fy0, fx1, fy1] = crop || [0, 0, 1, 1];
      const sx = img.width * fx0, sy = img.height * fy0, sw = img.width * (fx1 - fx0), sh = img.height * (fy1 - fy0);
      const scale = Math.min(1, size / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * scale);
      c.height = Math.round(sh * scale);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => reject(new Error('image illisible'));
    img.src = url;
  });
}

const SPLIT_BATCH = 40;
async function detectCopies() {
  const todo = state.pages.filter((p) => p.autoStart === undefined);
  if (!todo.length) { applyMode(); renderPages(); return; }
  state.detecting = true;
  banner();
  try {
    for (let i = 0; i < todo.length; i += SPLIT_BATCH) {
      state.detectProgress = `pages ${i + 1} à ${Math.min(i + SPLIT_BATCH, todo.length)} sur ${todo.length}`;
      renderPages();
      const batch = todo.slice(i, i + SPLIT_BATCH);
      const before = state.pages[state.pages.indexOf(batch[0]) - 1];
      const { pages } = await api('/api/split', { method: 'POST', body: {
        pages: await Promise.all(batch.map(async (p) => thumbnail(anonymous() ? await maskTop(p.url) : p.url))), // page de début possible : toujours masquée
        previous: before ? await thumbnail(anonymous() ? await maskTop(before.url) : before.url) : undefined,
      } });
      batch.forEach((p, j) => { p.autoStart = pages[j].startsNew; p.detectedName = pages[j].name; });
    }
    applyMode();
    banner('info', `${bundles().length} copie(s) détectée(s). Vérifiez les regroupements (noms affichés sur chaque copie) avant de corriger.`);
  } catch (err) {
    banner('err', `${err.message} Les pages non analysées restent regroupées par fichier.`);
  } finally {
    state.detecting = false;
    renderPages();
  }
}

function bundles() {
  const list = [];
  for (const p of state.pages) {
    if (p.startsNew || !list.length) list.push([]);
    list[list.length - 1].push(p);
  }
  return list;
}

function renderPages() {
  const list = bundles();
  $('pages-zone').hidden = !state.pages.length;
  const mode = $('mode').value;
  $('per').hidden = mode !== 'fixed';
  $('mode-hint').hidden = !!mode;
  if (state.detecting) {
    $('bundles').replaceChildren(h('div', { class: 'analyzing' },
      h('div', { class: 'spinner' }), h('b', { textContent: 'Un instant, nous analysons vos copies…' }),
      h('span', { class: 'muted small', textContent: `L'IA repère où commence chaque copie (${state.detectProgress || ''}). Cette étape est gratuite.` })));
    renderSummary();
    return;
  }
  const ready = mode && !(mode === 'fixed' && !(Number($('per').value) >= 1));
  // Numéros que les copies recevront à la correction (les copies déjà relancées gardent le leur).
  let seq = state.seq || 0;
  const nos = list.map((b) => b[0].no ?? ++seq);
  $('bundles').replaceChildren(...list.map((b, bi) => {
    const st = state.status[b[0].id];
    const tooLong = ready && b.length > MAX_PAGES_PER_COPY;
    const label = st?.state === 'running' ? 'Correction en cours…' : st?.state === 'error' ? `⚠ ${st.msg}` : tooLong ? `⚠ ${MAX_PAGES_PER_COPY} pages max : plusieurs élèves ? Utilisez « Nombre fixe de pages par élève » ou ✂` : '';
    return h('div', { class: 'bundle' },
      h('div', { class: 'bundle-head' },
        h('span', {}, `Copie ${nos[bi]}${b[0].detectedName ? ` · ${b[0].detectedName}` : ''} · ${b.length} page${b.length > 1 ? 's' : ''}`),
        h('span', { class: `st ${st?.state === 'error' || tooLong ? 'err' : ''}`, textContent: label }),
        bi > 0 ? h('button', { class: 'btn ghost merge', type: 'button', textContent: 'fusionner avec la précédente', disabled: state.running,
          onclick: () => { b[0].startsNew = false; b[0].autoStart = false; renderPages(); } }) : null),
      h('div', { class: 'bundle-pages' }, b.map((p, pi) => [
        pi > 0 ? h('button', { class: 'split', type: 'button', title: 'Séparer : une nouvelle copie commence ici', textContent: '✂', disabled: state.running,
          onclick: () => { p.startsNew = true; p.autoStart = true; renderPages(); } }) : null,
        h('div', { class: 'thumb', title: p.file },
          masked(pi) ? h('div', { class: 'mask-band', style: `height:${maskFrac() * 100}%`, title: 'Zone masquée : non envoyée' }) : null,
          h('img', { src: p.url, alt: `Page ${pi + 1}`, title: 'Agrandir', onclick: () => openZoom([p.url], `Copie ${nos[bi]} · page ${pi + 1} · ${p.file}`) }),
          h('button', { class: 'rot', type: 'button', textContent: '↻', title: 'Pivoter la page de 90°', disabled: state.running, onclick: () => rotatePage(p) }),
          h('button', { class: 'x', type: 'button', textContent: '×', title: 'Retirer cette page', disabled: state.running,
            onclick: () => removePage(p) })),
      ])));
  }));
  renderSummary();
}

function removePage(p) {
  const i = state.pages.indexOf(p);
  if (p.startsNew && state.pages[i + 1] && !state.pages[i + 1].startsNew) state.pages[i + 1].startsNew = true;
  state.pages.splice(i, 1);
  if (state.pages[0]) state.pages[0].startsNew = true;
  renderPages();
}

function renderSummary() {
  const list = bundles();
  const n = state.pages.length;
  const tooLong = list.some((b) => b.length > MAX_PAGES_PER_COPY);
  const mode = $('mode').value;
  const grouped = mode && !(mode === 'fixed' && !(Number($('per').value) >= 1));
  $('summary').replaceChildren(...(n ? [h('b', { textContent: String(list.length) }), ` ${tr(list.length > 1 ? 'copies' : 'copie')} · `,
    h('b', { textContent: String(n) }), ` ${tr(n > 1 ? 'pages' : 'page')}`] : [tr('Aucune copie importée')]));
  const cost = n * (state.kind === 'content' && $('deep').value === '1' ? 2 : 1);
  $('cost').textContent = n ? `${cost} page(s) seront décomptées` : '';
  const enough = state.pagesLeft == null || state.pagesLeft >= cost;
  const run = $('run');
  const gridSum = state.grid ? state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0) : null;
  const gridOk = state.kind === 'lang' || gridSum == null || Math.abs(gridSum - Number($('total').value)) < 1e-9;
  run.disabled = state.running || state.detecting || !n || !grouped || tooLong || !enough || !gridOk || !(Number($('total').value) > 0);
  run.textContent = state.running ? (state.kind === 'lang' ? 'Analyse en cours…' : 'Correction en cours…')
    : state.detecting ? 'Analyse des copies en cours…'
    : n && !mode ? 'Choisissez comment regrouper les pages'
    : n && !grouped ? 'Indiquez le nombre de pages par élève'
    : !enough ? 'Solde insuffisant : rechargez votre compte'
    : n && !gridOk ? `La grille totalise ${fmt(gridSum)} points au lieu de ${fmt(Number($('total').value))}`
    : n ? `${state.kind === 'lang' ? 'Analyser la langue de' : 'Corriger'} ${list.length} copie(s)` : 'Corriger';
  $('export').disabled = $('end').disabled = state.running || !state.results.length;
}

function renderRubric() {
  $('rubric-thumbs').replaceChildren(...state.rubricPages.map((p) => h('div', { class: 'thumb' },
    h('img', { src: p.url, alt: 'Corrigé' }),
    h('button', { class: 'x', type: 'button', textContent: '×', onclick: () => {
      state.rubricPages = state.rubricPages.filter((x) => x !== p); renderRubric();
    } }))));
}

// ---------- Grille détaillée ----------

// Chaque ligne « points : description » est un niveau ; les autres lignes forment une remarque transmise à l'IA (rien n'est perdu).
const LEVEL_LINE = /^\s*[•*-]?\s*(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)?\s*[:–-]\s*(.+)$/i;
function parseCriterion(text) {
  const levels = [], notes = [];
  for (const line of text.split('\n')) {
    const m = line.match(LEVEL_LINE);
    if (m) levels.push({ points: toNumber(m[1]), description: m[2].trim() });
    else if (line.trim()) notes.push(line.trim());
  }
  return { levels, note: notes.join(' ') };
}
const levelsText = (levels, note) => [...levels.map((l) => `${fmt(l.points)} : ${l.description}`), ...(note ? [note] : [])].join('\n');
const toNumber = (v) => Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
// Les grilles générées contiennent parfois des lettres cyrilliques ou grecques identiques en apparence.
const HOMOGLYPHS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Х': 'X', 'Т': 'T', 'Н': 'H', 'К': 'K', 'М': 'M', 'В': 'B', 'ο': 'o', 'α': 'a' };
const cleanText = (t) => String(t).replace(/[аеорсхуіјѕАЕОРСХТНКМВοα]/g, (c) => HOMOGLYPHS[c]);

function updateGridTotal() {
  if (!state.grid) return;
  const sum = state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0);
  const total = Number($('total').value);
  const el = $('grid-total');
  el.textContent = `Total : ${fmt(sum)} / ${fmt(total)} points`;
  el.className = `small ${Math.abs(sum - total) < 1e-9 ? 'ok' : 'bad'}`;
  renderSummary();
}

function renderGrid() {
  $('grid-editor').hidden = !state.grid;
  $('make-grid').textContent = state.grid ? 'Régénérer la grille' : 'Préparer une grille détaillée (gratuit)';
  if (!state.grid) { renderSummary(); return; }
  $('grid-criteria').replaceChildren(...state.grid.map((c) => h('div', { class: 'crit' },
    h('div', { class: 'crit-top' },
      h('input', { type: 'text', value: c.name, 'aria-label': 'Critère', oninput: (e) => { c.name = e.target.value; } }),
      h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: fmt(c.max), 'aria-label': 'Points maximum', title: 'Points maximum',
        oninput: (e) => { c.max = toNumber(e.target.value); updateGridTotal(); } })),
    h('textarea', { rows: Math.max(3, c.levels.length + (c.note ? 1 : 0)), value: levelsText(c.levels, c.note),
      oninput: (e) => { Object.assign(c, parseCriterion(e.target.value)); } }),
    h('div', { class: 'muted small', textContent: c.note ? `Remarque transmise à l'IA : ${c.note}` : '' }))));
  updateGridTotal();
}

async function makeGrid() {
  if (state.grid && !confirm(tr('Remplacer la grille actuelle par une nouvelle ?'))) return;
  const btn = $('make-grid');
  btn.disabled = true;
  btn.textContent = 'Un instant, l’IA prépare la grille…';
  try {
    const { grid } = await api('/api/rubric', { method: 'POST', body: {
      rubric: $('rubric').value.trim(), rubricPages: state.rubricPages.map((p) => p.url),
      total: Number($('total').value), wholePoints: $('whole').value === '1',
    } });
    state.grid = grid.map((c) => ({ ...c, name: cleanText(c.name), levels: c.levels.map((l) => ({ ...l, description: cleanText(l.description) })) }));
    banner('info', 'Grille préparée : relisez-la et ajustez au besoin. Elle sera appliquée à toutes les copies.');
  } catch (err) {
    banner('err', err.message);
  } finally {
    btn.disabled = false;
    renderGrid();
  }
}

// ---------- Correction ----------

// only : les copies à corriger (par défaut toutes) ; le mode caméra n'envoie que les copies complètes.
async function runAll(only) {
  const list = only || bundles();
  if (!list.length) return;
  state.running = true;
  list.forEach((b) => { state.status[b[0].id] = null; });
  banner();
  renderPages();

  const settings = {
    exam: $('exam').value.trim(),
    group: $('group').value.trim(),
    total: Number($('total').value),
    wholePoints: $('whole').value === '1',
    deep: $('deep').value === '1',
    checkLanguage: $('language').checked,
    rubric: $('rubric').value.trim(),
    rubricPages: state.rubricPages.map((p) => p.url),
    grid: state.grid || undefined,
    anonymous: anonymous(),
  };
  const hasKey = !!(settings.rubric || settings.rubricPages.length || settings.grid);
  // Même examen que la copie déjà corrigée : on réutilise son découpage en questions (voir plus bas).
  const examKey = JSON.stringify([settings.exam, settings.total, settings.wholePoints, settings.rubric, settings.rubricPages.length, !!settings.grid]);
  if (state.structure?.key !== examKey) state.structure = null;

  // N° de copie dans l'ordre d'importation, gardé si la copie est relancée : il permet de retrouver la copie papier.
  for (const b of list) b[0].no ??= (state.seq = (state.seq || 0) + 1);
  let next = 0, done = 0, failed = 0, stop = '';
  // Temps restant : moyenne des copies déjà corrigées (ou estimation de départ), réparti sur les corrections en parallèle.
  const durations = [];
  const started = new Map(); // id → début de correction
  const guess = (b) => (state.kind === 'lang' ? 8 + 6 * b.length : (settings.deep ? 30 : 15) + 4 * b.length) * 1000;
  const updateProgress = () => {
    const finished = done + failed;
    const avg = (b) => (durations.length ? durations.reduce((x, y) => x + y, 0) / durations.length : guess(b));
    let work = 0;
    for (const b of list.slice(next)) work += avg(b);
    for (const [, t] of started) work += Math.max(avg(list[0]) * 0.15, avg(list[0]) - (Date.now() - t));
    const lanes = Math.max(1, Math.min(CONCURRENCY, list.length - finished));
    const min = Math.ceil(work / lanes / 60000);
    $('progress-count').textContent = `Correction : ${finished} / ${list.length} copie(s)`;
    $('progress-eta').textContent = finished === list.length ? '' : min <= 1 ? 'Moins d’une minute restante' : `Environ ${min} min restantes`;
    $('progress-bar').style.width = `${Math.round((finished / list.length) * 100)}%`;
  };
  $('progress').hidden = false;
  updateProgress();
  const timer = setInterval(updateProgress, 1000);

  const one = async (b) => {
    const id = b[0].id;
    started.set(id, Date.now());
    state.status[id] = { state: 'running' };
    renderPages();
    try {
      if (state.kind === 'lang') {
        const r = await analyzeLanguage(b);
        setBalance(r.pagesLeft);
        const res = { kind: 'lang', id, no: b[0].no, file: b[0].file, exam: settings.exam, group: r.group || settings.group, name: r.name, pageCount: b.length,
          pages: b.map((p, i) => ({ url: p.url, errors: r.pages[i].errors, failed: !!r.pages[i].failed, reread: r.pages[i].reread, sent: r.urls[i] })),
          scoring: langScoring(), flags: r.failedPages ? [`${r.failedPages} page(s) n'ont pas pu être analysées (non décomptées).`] : [] };
        langGrade(res);
        state.results.unshift(res);
        reread(res);
      } else {
      const pages = await Promise.all(b.map((p, i) => (masked(i) ? maskTop(p.url) : p.url)));
      const r = await api('/api/grade', { method: 'POST', body: { ...settings, pages, structure: state.structure?.list } });
      // 1re copie bien corrigée avec un corrigé : ses questions servent de modèle pour les suivantes. Elles sont
      // découpées pareil, et les deux corrections du mode approfondi partent en même temps (deux fois plus rapide).
      // Seulement si les points maximum totalisent le barème : une question oubliée ne se propage pas.
      if (!state.structure && hasKey && !settings.grid && !r.illegible && r.questions.length
        && Math.abs(r.questions.reduce((x, q) => x + q.max, 0) - settings.total) < 1e-9) {
        state.structure = { key: examKey, list: r.questions.map((q) => ({ name: q.question, max: q.max })) };
      }
      setBalance(r.pagesLeft);
      state.results.unshift({
        id, no: b[0].no, file: b[0].file, pageUrls: b.map((p) => p.url), exam: settings.exam, group: r.group || settings.group, name: r.name, reliability: r.reliability, grade: r.grade, total: r.total,
        unit: settings.wholePoints ? 1 : 0.5, questions: r.questions, comment: r.comment, pageCount: b.length, illegible: !!r.illegible,
        flags: hasKey || r.illegible ? r.flags : [...r.flags, 'Corrigée sans corrigé : vérifiez que la note n’est pas trop généreuse.'],
      });
      }
      state.exported = false;
      state.pages = state.pages.filter((p) => !b.includes(p));
      if (state.pages[0]) state.pages[0].startsNew = true;
      delete state.status[id];
      durations.push(Date.now() - started.get(id));
      done++;
      renderResults();
    } catch (err) {
      failed++;
      state.status[id] = { state: 'error', msg: err.message };
      if (err.status === 402 || err.status === 401) stop = err.message;
    }
    started.delete(id);
    updateProgress();
    renderPages();
  };
  const worker = async () => { while (next < list.length && !stop) await one(list[next++]); };
  // Grosse pile d'un même examen : la 1re copie passe seule, pour que toutes les autres profitent de son découpage.
  if (state.kind === 'content' && hasKey && !settings.grid && !state.structure && list.length > CONCURRENCY) await one(list[next++]);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  clearInterval(timer);
  $('progress').hidden = true;
  state.running = false;
  renderPages();
  if (stop) banner('err', stop);
  else if (failed) banner('err', `${done} copie(s) corrigée(s), ${failed} en erreur : elles restent dans la liste, relancez pour réessayer.`);
  else if (state.kind === 'lang') banner('ok', `${done} copie(s) analysée(s). Vérifiez en priorité les copies marquées ⚠.`);
  else if (!hasKey) banner('info', `${done} copie(s) corrigée(s) sans corrigé : les notes ont tendance à être généreuses. Vérifiez-les, ou ajoutez votre corrigé pour des notes plus justes.`);
  else banner('ok', `${done} copie(s) corrigée(s). Vérifiez en priorité les copies marquées ⚠.`);
}

// ---------- Résultats ----------

function showRelHelp() { $('rel-help').hidden = false; }
const infoButton = () => h('button', { type: 'button', class: 'info', textContent: 'ⓘ', 'aria-label': 'Que veut dire la fiabilité ?', onclick: showRelHelp });

function recompute(r) {
  r.illegible = false; // l'enseignant a noté la copie lui-même
  r.grade = Math.min(r.total, r.questions.reduce((a, q) => a + q.points, 0));
  state.exported = false;
}

function renderStats() {
  const graded = state.results.filter((r) => (r.kind === 'lang') === (state.kind === 'lang') && r.grade != null && r.total > 0);
  $('stats').hidden = !graded.length;
  if (!graded.length) return;
  const pct = graded.map((r) => (r.grade / r.total) * 100);
  const avg = pct.reduce((a, b) => a + b, 0) / pct.length;
  const flagged = graded.filter((r) => r.flags.length).length;
  const withRel = graded.filter((r) => r.reliability != null);
  const rel = withRel.length ? pctText(fmt(withRel.reduce((a, r) => a + r.reliability, 0) / withRel.length)) : '—';
  const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'v', textContent: v }), h('div', { class: 'l', textContent: l }));
  $('stats').replaceChildren(stat(String(graded.length), 'copies'),
    stat(pctText(fmt(avg)), `moyenne (min ${fmt(Math.min(...pct))} – max ${fmt(Math.max(...pct))})`),
    h('div', { class: 'stat' }, h('div', { class: 'v', textContent: rel }),
      h('div', { class: 'l' }, 'fiabilité moyenne ', infoButton())), stat(String(flagged), 'à vérifier ⚠'));
}

function renderResults() {
  const q = $('search').value.trim().toLowerCase();
  const mine = state.results.filter((r) => (r.kind === 'lang') === (state.kind === 'lang'));
  const shown = mine.filter((r) => !q || `${r.name} ${r.group} ${r.exam} ${r.file}`.toLowerCase().includes(q))
    .sort((x, y) => (x.no ?? 0) - (y.no ?? 0)); // même ordre que la pile de copies
  $('empty').hidden = !!mine.length;
  $('cards').replaceChildren(...shown.map((r) => (r.kind === 'lang' ? langCard(r) : card(r))));
  renderStats();
  renderSummary();
}

const copyTitle = (r) => [r.no ? `Copie ${r.no}` : '', r.name].filter(Boolean).join(' · ');
const copyLabel = (r) => [r.no ? `Copie ${r.no}` : '', r.file, r.exam, `${r.pageCount} page(s)`].filter(Boolean).join(' · ');

// Agrandissement des pages (miniatures avant correction, ou copie corrigée à côté de sa fiche).
function openZoom(urls, title) {
  $('zoom-title').textContent = title;
  $('zoom-pages').replaceChildren(...urls.map((url, i) => h('img', { src: url, alt: `Page ${i + 1}` })));
  $('zoom').hidden = false;
}

// Fiche d'une copie : une ligne compacte (n°, nom, groupe, note), toujours fermée ; un clic sur la ligne l'ouvre.
function cardShell(r, cells, body) {
  const el = h('article', { class: `card ${r.flags.length ? 'flag' : ''}` });
  const setOpen = (on) => { body.hidden = !on; el.classList.toggle('open', on); };
  const head = h('div', { class: 'card-head', onclick: (e) => {
    if (e.target.closest('input, textarea, select, button:not(.chev)')) return;
    if (state.open.has(r.id)) state.open.delete(r.id); else state.open.add(r.id);
    setOpen(state.open.has(r.id));
  } },
    h('span', { class: 'no', title: r.flags.length ? 'À vérifier' : '', textContent: `${r.flags.length ? '⚠ ' : ''}${r.no ?? ''}` }),
    h('input', { class: 'name', type: 'text', value: r.name, placeholder: r.no ? `Nom à compléter (copie ${r.no})` : 'Nom à compléter', 'aria-label': "Nom de l'élève",
      oninput: (e) => { r.name = e.target.value; state.exported = false; } }),
    h('input', { class: 'group', type: 'text', value: r.group, placeholder: 'Groupe', 'aria-label': 'Groupe',
      oninput: (e) => { r.group = e.target.value; state.exported = false; } }),
    ...cells,
    h('button', { class: 'icon-btn chev', type: 'button', textContent: '▾', 'aria-label': 'Détails' }));
  el.append(head, body);
  setOpen(state.open.has(r.id));
  return el;
}

function card(r) {
  const gradeEl = h('span', { class: 'grade' });
  const updateGrade = () => { gradeEl.replaceChildren(...(r.grade == null ? [tr('Illisible')] : [fmt(r.grade), h('small', {}, ` / ${fmt(r.total)}`)])); };
  updateGrade();

  const body = h('div', { class: 'card-body' },
    r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
    h('table', { class: 'qtable' },
      h('thead', {}, h('tr', {}, h('th', { textContent: 'Question' }), h('th', { textContent: 'Points' }), h('th', { textContent: 'Justification' }))),
      h('tbody', {}, r.questions.map((qq) => {
        const rowClass = () => [qq.points < qq.max ? 'lost' : '', qq.second != null ? 'disputed' : ''].join(' ');
        const tr = h('tr', { class: rowClass() });
        const second = qq.second != null
          ? h('div', { class: 'second', textContent: qq.first != null
            ? `⚖ Corrections : ${fmt(qq.first)} et ${fmt(qq.second)} → moyenne retenue`
            : `⚖ 2e correction : ${fmt(qq.second)} / ${fmt(qq.max)}` }) : null;
        const input = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: fmt(qq.points), 'aria-label': 'Points',
          onchange: () => {
            const v = Math.round((toNumber(input.value) || 0) / r.unit) * r.unit;
            qq.points = Math.min(qq.max, Math.max(0, v));
            input.value = fmt(qq.points);
            qq.second = null; // l'enseignant a tranché
            second?.remove();
            tr.className = rowClass();
            recompute(r); updateGrade(); renderStats();
          } });
        tr.append(h('td', { class: 'q', textContent: qq.question }),
          h('td', { class: 'pts' }, input, h('span', { class: 'muted', textContent: ` / ${fmt(qq.max)}` }), second),
          h('td', { class: 'just', textContent: qq.justification }));
        return tr;
      }))),
    h('label', { class: 'field comment' }, 'Commentaire pour l\'élève',
      h('textarea', { rows: 3, value: r.comment, oninput: (e) => { r.comment = e.target.value; state.exported = false; } })),
    h('div', { class: 'card-foot' },
      h('span', { textContent: copyLabel(r) }),
      h('div', { style: 'display:flex;gap:.4rem' },
        r.pageUrls ? h('button', { class: 'btn small', type: 'button', textContent: 'Voir la copie', onclick: () => openZoom(r.pageUrls, copyTitle(r)) }) : null,
        h('button', { class: 'btn ghost small', type: 'button', textContent: 'Supprimer', onclick: () => {
          if (!confirm(tr(`Supprimer la correction de ${r.name || 'cet élève'} ?`))) return;
          state.results = state.results.filter((x) => x !== r); renderResults();
        } }))));
  return cardShell(r, [
    r.reliability == null ? h('span') : h('button', {
      type: 'button', class: `rel ${r.reliability >= 90 ? 'hi' : r.reliability >= 80 ? 'mid' : 'lo'}`,
      title: 'Fiabilité de la correction : cliquez pour en savoir plus', onclick: showRelHelp,
      textContent: `${pctText(r.reliability)} ⓘ` }),
    gradeEl], body);
}

// ---------- Correction de la langue ----------

const CATS = {
  orthographe: { label: 'Orthographe', cls: 'c-orth', color: '#f43f5e' },
  accord: { label: 'Accords', cls: 'c-acc', color: '#f59e0b' },
  conjugaison: { label: 'Conjugaison', cls: 'c-conj', color: '#a855f7' },
  ponctuation: { label: 'Ponctuation', cls: 'c-ponc', color: '#38bdf8' },
  syntaxe: { label: 'Syntaxe', cls: 'c-synt', color: '#10b981' },
  vocabulaire: { label: 'Vocabulaire', cls: 'c-voc', color: '#94a3b8' },
};

// Photos envoyées en pleine résolution (comme la version Gemini d'origine), une requête par page.
const LANG_MAX_SIDE = 4096;
async function analyzeLanguage(bundle) {
  const anon = anonymous();
  const urls = await Promise.all(bundle.map(async (p, i) => {
    const url = p.source ? await imageToJpeg(p.source, LANG_MAX_SIDE, 0.9, p.rot || 0) : p.url;
    return masked(i) ? maskTop(url) : url;
  }));
  const parts = await Promise.all(urls.map((url, i) => api('/api/language', { method: 'POST',
    body: { pages: [url], identify: i === 0 && !anon, ...langSettings() } }).catch((error) => ({ error }))));
  const blocking = parts.find((x) => x.error && (x.error.status === 401 || x.error.status === 402));
  if (blocking) throw blocking.error;
  if (parts.every((x) => x.error)) throw parts[0].error;
  return {
    name: parts[0].name || '', group: parts[0].group || '', urls,
    pages: parts.map((x) => (x.error ? { errors: [], failed: true } : x.pages[0])),
    failedPages: parts.reduce((a, x) => a + (x.error ? 1 : x.failedPages || 0), 0),
    pagesLeft: Math.min(...parts.filter((x) => !x.error).map((x) => x.pagesLeft)),
  };
}

// Relecture : une seconde lecture de chaque page, qui connaît les fautes déjà relevées et cherche les oubliées.
// L'enseignant voit la copie dès la première lecture ; les fautes ajoutées arrivent environ 40 s plus tard (gratuit).
// Chaque faute passe aussi à la loupe (voir verifyErrors) : celles qui disparaissent quand on agrandit le mot sont marquées « à vérifier ».
function reread(res) {
  const todo = res.pages.filter((p) => p.reread && p.sent);
  res.rereading = todo.length;
  const refresh = () => { langGrade(res); state.exported = false; renderResults(); if (viewing === res) renderViewer(); };
  for (const p of todo) {
    const first = verifyErrors(p, p.errors).then(refresh);
    const more = api('/api/language-reread', { method: 'POST', body: { page: p.sent, ...p.reread, ...langSettings(),
      known: p.errors.map(({ text, correction, box }) => ({ text, correction, box })) } })
      .then(async (r) => { await verifyErrors(p, r.errors); p.errors.push(...r.errors); })
      .catch(() => { /* la première lecture reste valable */ });
    Promise.all([first, more]).finally(() => {
      delete p.sent; // libère la mémoire : l'image envoyée n'est plus utile
      res.rereading--;
      refresh();
    });
  }
}

// Vérification à la loupe : le mot de chaque faute est recadré, agrandi et recopié lettre par lettre par l'IA.
// Si ce qu'elle lit égale la correction (« guerre » bien écrit, lu « guere » sur la page entière), la faute est douteuse.
async function verifyErrors(p, errors) {
  const located = errors.filter((e) => e.box && !e.manual);
  if (!located.length) return;
  try {
    const img = await loadImage(p.sent);
    const crops = located.map((e) => {
      const [y0, x0, y1, x1] = e.box.map((v) => v / 1000);
      const h = (y1 - y0) * img.height;
      const sx = Math.max(0, x0 * img.width - h * 1.2), sy = Math.max(0, y0 * img.height - h * 0.6);
      const sw = Math.min(img.width - sx, (x1 - x0) * img.width + h * 2.4), sh = Math.min(img.height - sy, h * 2.2);
      const k = Math.min(Math.max(1, 220 / sh), 1400 / sw);
      const c = document.createElement('canvas');
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return { image: c.toDataURL('image/jpeg', 0.85), text: e.text, correction: e.correction };
    });
    const batches = [];
    for (let i = 0; i < crops.length; i += 12) batches.push(i);
    await Promise.all(batches.map(async (i) => {
      const { results } = await api('/api/language-verify', { method: 'POST', body: { crops: crops.slice(i, i + 12) } });
      results.forEach((r, j) => {
        const e = located[i + j];
        // À la loupe, l'IA lit parfois le mot bien écrit alors que l'élève a fait la faute (« sistème » lu « système ») :
        // un désaccord ne retire donc jamais la faute, il la marque « à vérifier » (montrée, non comptée).
        if (r && !r.error) e.doubtful = true;
      });
    }));
  } catch { /* vérification impossible : les fautes restent telles quelles */ }
}

// Pixels d'une page : servent à resserrer sur l'encre un cadre tracé à la main (voir boxes.js).
const loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
async function pageData(url) {
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

const langSettings = () => ({
  level: $('lang-level').value,
  categories: [...document.querySelectorAll('#lang-cats input:checked')].map((i) => i.value),
});

function langScoring() {
  const num = (id) => Number(String($(id).value).replace(',', '.'));
  const total = num('lang-total'), per = num('lang-per'), max = num('lang-max');
  return total > 0 && per > 0 ? { total, per, max: max > 0 ? max : total } : null;
}

// Note de langue : total − (points par faute × nombre de fautes), plafonné au retrait maximum.
// Les fautes à la lecture incertaine sont montrées « à vérifier » mais ne comptent pas dans la note.
const counted = (errors) => errors.filter((e) => !e.doubtful);
function langGrade(r) {
  const count = r.pages.reduce((a, p) => a + counted(p.errors).length, 0);
  if (!r.scoring) { r.grade = null; r.total = null; return count; }
  r.total = r.scoring.total;
  r.grade = Math.max(0, r.scoring.total - Math.min(r.scoring.max, r.scoring.per * count));
  return count;
}

function categoryChips(errors) {
  return h('div', { class: 'chips' }, Object.entries(CATS).map(([k, c]) => {
    const n = errors.filter((e) => e.category === k).length;
    return n ? h('span', { class: `cat ${c.cls}`, textContent: `${c.label} ${n}` }) : null;
  }));
}

function langCard(r) {
  const errors = r.pages.flatMap((p) => p.errors);
  const n = counted(errors).length;
  const gradeEl = h('span', { class: 'grade' });
  gradeEl.replaceChildren(r.grade == null ? `${n} faute${n > 1 ? 's' : ''}`
    : h('span', {}, fmt(r.grade), h('small', {}, ` / ${fmt(r.total)} · ${n} faute(s)`)));
  return cardShell(r, [h('span'), gradeEl],
    h('div', { class: 'card-body' },
      r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
      errors.length ? categoryChips(errors) : h('p', { class: 'muted small', style: 'margin:0', textContent: 'Aucune faute relevée.' }),
      r.rereading ? h('p', { class: 'muted small', style: 'margin:0', textContent: 'Relecture en cours : d’autres fautes peuvent s’ajouter…' }) : null,
      h('div', { class: 'card-foot' },
        h('span', { textContent: copyLabel(r) }),
        h('div', { style: 'display:flex;gap:.4rem' },
          h('button', { class: 'btn primary small', type: 'button', textContent: 'Voir la copie annotée', onclick: () => openViewer(r) }),
          h('button', { class: 'btn ghost small', type: 'button', textContent: 'Supprimer', onclick: () => {
            if (!confirm(tr(`Supprimer l'analyse de ${r.name || 'cet élève'} ?`))) return;
            state.results = state.results.filter((x) => x !== r); renderResults();
          } })))));
}

// Visionneuse : la copie avec les fautes surlignées, et la liste des fautes (supprimables si l'IA s'est trompée).
let viewing = null;
let adding = null; // ajout d'une faute oubliée : { stage: 'draw' } puis { stage: 'form', page, box }
function openViewer(r) {
  viewing = r;
  adding = null;
  $('viewer-pages').classList.remove('zoom');
  $('viewer').hidden = false;
  renderViewer();
}

function renderViewer(focus) {
  const r = viewing;
  const count = langGrade(r);
  $('viewer-title').textContent = `${copyTitle(r) || 'Élève'} · ${count} faute(s)${r.grade != null ? ` · ${fmt(r.grade)} / ${fmt(r.total)}` : ''}`;
  let n = 0;
  const numbered = r.pages.map((p) => p.errors.map((e) => ({ e, p, n: ++n })));
  const place = (el, [y0, x0, y1, x1]) => { el.style.cssText = `top:${y0 / 10}%;left:${x0 / 10}%;height:${(y1 - y0) / 10}%;width:${(x1 - x0) / 10}%`; return el; };
  $('viewer-add').textContent = adding ? 'Annuler l’ajout' : '+ Ajouter une faute';
  $('viewer-hint').hidden = adding?.stage !== 'draw';
  $('viewer-pages').replaceChildren(...r.pages.map((p, pi) => {
    const wrap = h('div', { class: `page-wrap ${adding?.stage === 'draw' ? 'adding' : ''}` },
      h('img', { src: p.url, alt: `Page ${pi + 1}`, title: adding ? '' : 'Cliquez pour agrandir ou réduire', draggable: false,
        onclick: () => { if (!adding) $('viewer-pages').classList.toggle('zoom'); } }),
      numbered[pi].filter(({ e }) => e.box).map(({ e, n: k }) => place(h('div', { class: `hl ${CATS[e.category].cls} ${focus === e ? 'focus' : ''}`,
        title: `${e.text} → ${e.correction}\n${e.explanation}`, onclick: () => { if (!adding) renderViewer(e); } }, h('span', { textContent: String(k) })), e.box)),
      adding?.stage === 'form' && adding.page === p ? place(h('div', { class: 'hl draft' }), adding.box) : null);
    if (adding?.stage === 'draw') drawBox(wrap, p);
    return wrap;
  }));
  const items = numbered.flat();
  $('viewer-list').replaceChildren(...[
    adding?.stage === 'form' ? addErrorForm() : null,
    items.length ? categoryChips(items.map((i) => i.e)) : h('p', { class: 'muted', textContent: 'Aucune faute relevée.' }),
    ...items.map(({ e, p, n: k }) => {
      const el = h('div', { class: `err ${CATS[e.category].cls} ${focus === e ? 'focus' : ''}`, onclick: () => renderViewer(e) },
        h('div', { class: 'err-head' }, h('b', { textContent: `${k}. ${CATS[e.category].label}${e.box ? '' : ' (non localisée)'}${e.doubtful ? ' · à vérifier' : ''}` }),
          h('button', { class: 'icon-btn', type: 'button', textContent: '×', title: "Ce n'est pas une faute : retirer", onclick: (ev) => {
            ev.stopPropagation();
            p.errors = p.errors.filter((x) => x !== e);
            state.exported = false;
            renderViewer(); renderResults();
          } })),
        h('div', { class: 'fix' }, h('s', { textContent: e.text }), ' → ', h('b', { textContent: e.correction })),
        h('div', { class: 'muted small', textContent: e.explanation }));
      if (focus === e) setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
      return el;
    })].filter(Boolean)); // replaceChildren afficherait « null » en texte
}

// Tracer un cadre à la souris ou au doigt autour d'une faute que l'IA a oubliée.
function drawBox(wrap, page) {
  let start = null, draft = null;
  const at = (ev) => { const r = wrap.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, ((ev.clientY - r.top) / r.height) * 1000)), Math.max(0, Math.min(1000, ((ev.clientX - r.left) / r.width) * 1000))]; };
  const boxOf = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  wrap.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); wrap.setPointerCapture(ev.pointerId);
    start = at(ev); draft = h('div', { class: 'hl draft' }); wrap.append(draft);
  });
  wrap.addEventListener('pointermove', (ev) => {
    if (!start) return;
    const [y0, x0, y1, x1] = boxOf(start, at(ev));
    draft.style.cssText = `top:${y0 / 10}%;left:${x0 / 10}%;height:${(y1 - y0) / 10}%;width:${(x1 - x0) / 10}%`;
  });
  wrap.addEventListener('pointerup', (ev) => {
    if (!start) return;
    const box = boxOf(start, at(ev));
    start = null;
    if (box[2] - box[0] < 5 || box[3] - box[1] < 5) { draft.remove(); return; } // simple clic : on ignore
    adding = { stage: 'form', page, box };
    renderViewer();
  });
}

function addErrorForm() {
  const field = (label, input) => h('label', { class: 'field' }, label, input);
  const text = h('input', { type: 'text', placeholder: 'Ex. : ils mange' });
  const fix = h('input', { type: 'text', placeholder: 'Ex. : ils mangent' });
  const cat = h('select', {}, Object.entries(CATS).map(([k, c]) => h('option', { value: k, textContent: c.label })));
  const why = h('input', { type: 'text', placeholder: 'Ex. : accord du verbe avec le sujet' });
  const save = async () => {
    if (!text.value.trim() || !fix.value.trim()) { text.focus(); return; }
    const { page, box } = adding;
    // Le cadre tracé à la main est resserré sur l'encre du mot (on garde le tracé si l'encre n'est pas trouvée).
    let snapped = box;
    try { snapped = refineToInk(await pageData(page.url), box); } catch { /* tracé gardé */ }
    const e = { text: text.value.trim(), correction: fix.value.trim(), category: cat.value, explanation: why.value.trim(), box: snapped, manual: true };
    page.errors.push(e);
    adding = null;
    state.exported = false;
    renderViewer(e); renderResults();
  };
  setTimeout(() => text.focus(), 0);
  return h('div', { class: 'err add-form' },
    h('b', { textContent: 'Nouvelle faute' }),
    field('Mot ou passage écrit', text), field('Correction', fix), field('Catégorie', cat), field('Explication (facultatif)', why),
    h('div', { style: 'display:flex;gap:.5rem' },
      h('button', { class: 'btn primary small', type: 'button', textContent: 'Ajouter', onclick: save }),
      h('button', { class: 'btn ghost small', type: 'button', textContent: 'Annuler', onclick: () => { adding = null; renderViewer(); } })));
}

// Impression : chaque page avec ses surlignages dessinés, puis la liste des corrections. « Enregistrer en PDF » depuis l'impression.
async function printViewer() {
  const r = viewing;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let n = 0;
  const sheets = [];
  for (const p of r.pages) {
    const list = [];
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = p.url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    for (const e of p.errors) {
      const k = ++n;
      list.push(`<li><b style="color:${CATS[e.category].color}">${k}. ${esc(tr(CATS[e.category].label))}</b> — <s>${esc(e.text)}</s> → <b>${esc(e.correction)}</b><br><small>${esc(e.explanation)}</small></li>`);
      if (!e.box) continue;
      const [y0, x0, y1, x1] = e.box.map((v) => v / 1000);
      ctx.strokeStyle = ctx.fillStyle = CATS[e.category].color;
      ctx.lineWidth = Math.max(2, c.width / 500);
      ctx.globalAlpha = 0.22; ctx.fillRect(x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height);
      ctx.globalAlpha = 1; ctx.strokeRect(x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height);
      ctx.font = `bold ${Math.round(c.width / 55)}px sans-serif`;
      ctx.fillText(String(k), x0 * c.width, y0 * c.height - 4);
    }
    // Image réduite selon la longueur de la liste (2 colonnes, environ 9 mm par faute) pour tenir sur une seule feuille.
    const imgMax = Math.max(110, Math.min(205, 248 - Math.ceil(list.length / 2) * 9));
    sheets.push(`<section class="sheet"><img src="${c.toDataURL('image/jpeg', 0.85)}" style="max-height:${imgMax}mm">${list.length ? `<ol>${list.join('')}</ol>` : ''}</section>`);
  }
  const w = window.open('', '_blank');
  if (!w) { alert(tr('Autorisez les fenêtres surgissantes pour imprimer.')); return; }
  w.document.write(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(r.name || tr('Copie'))} — ${tr('correction de la langue')}</title>
    <style>@page{size:letter;margin:10mm}body{font:10.5px/1.35 system-ui,sans-serif;margin:0;color:#111}
    h1{font-size:14px;margin:0 0 4px}.sheet{break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}
    img{display:block;max-width:100%;max-height:205mm;margin:0 auto 6px;object-fit:contain}
    ol{list-style:none;padding:0;margin:0;column-count:2;column-gap:14px}li{break-inside:avoid;margin:0 0 4px}
    @media screen{body{margin:16px;width:740px}.sheet{border-bottom:1px dashed #bbb;padding-bottom:12px;margin-bottom:12px}}</style></head><body>
    <h1>${esc(copyTitle(r) || tr('Élève'))}${r.group ? ` · ${esc(r.group)}` : ''} — ${tr(`${n} faute(s)`)}${r.grade != null ? ` · ${fmt(r.grade)} / ${fmt(r.total)}` : ''}</h1>
    ${sheets.join('')}
    <script>window.onload=()=>{
      // Chaque page de copie tient sur une feuille : on réduit l'image tant que la feuille déborde (lettre, marges de 10 mm).
      const max=(279.4-20)*96/25.4-4;
      document.querySelectorAll('.sheet').forEach((s,i)=>{const im=s.querySelector('img');const extra=i===0?document.querySelector('h1').offsetHeight:0;
        while(s.offsetHeight+extra>max&&im.offsetHeight>250)im.style.maxHeight=(im.offsetHeight-15)+'px';});
      window.print();}<\/script></body></html>`);
  w.document.close();
}

function setKind(kind) {
  if (state.running) return;
  state.kind = kind;
  $('kind-content').classList.toggle('active', kind === 'content');
  $('kind-lang').classList.toggle('active', kind === 'lang');
  $('kind-content').setAttribute('aria-selected', String(kind === 'content'));
  $('kind-lang').setAttribute('aria-selected', String(kind === 'lang'));
  document.querySelector('.kind').dataset.active = kind;
  $('content-settings').hidden = kind !== 'content';
  $('lang-settings').hidden = kind !== 'lang';
  $('step1-title').textContent = kind === 'lang' ? 'Correction de la langue' : 'Évaluation et copies';
  $('empty-text').textContent = kind === 'lang' ? 'Les copies analysées apparaîtront ici, avec les fautes surlignées.'
    : 'Les copies corrigées apparaîtront ici, avec le détail des points par question.';
  renderSummary();
  renderResults();
}

// ---------- Export ----------

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // empêche Excel d'interpréter une formule
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCSV(rows, suffix) {
  // Excel : « ; » en français, « , » en anglais ; en-têtes traduits.
  const sep = lang === 'en' ? ',' : ';';
  rows[0] = rows[0].map(tr);
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(sep)).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const name = [$('exam').value, $('group').value].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'corrections';
  const a = h('a', { href: url, download: `${name}${suffix}_${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV() {
  const num = (n) => (lang === 'en' ? String(n) : String(n).replace('.', ','));
  const langRes = state.results.filter((r) => r.kind === 'lang');
  if (langRes.length) {
    const keys = Object.keys(CATS);
    const rows = [['N° copie', 'Fichier', 'Évaluation', 'Groupe', 'Élève', 'Fautes', ...keys.map((k) => CATS[k].label), 'Note', 'Sur', 'Détail des fautes']];
    for (const r of [...langRes].sort((x, y) => (x.no ?? 0) - (y.no ?? 0))) {
      const errs = r.pages.flatMap((p) => p.errors);
      rows.push([r.no ?? '', r.file || '', r.exam, r.group, r.name, counted(errs).length, ...keys.map((k) => counted(errs).filter((e) => e.category === k).length),
        r.grade == null ? '' : num(r.grade), r.grade == null ? '' : num(r.total),
        errs.map((e) => `${e.text} → ${e.correction} (${e.explanation})${e.doubtful ? ' [à vérifier, non comptée]' : ''}`).join(' | ')]);
    }
    downloadCSV(rows, lang === 'en' ? '_writing' : '_langue');
  }
  const content = state.results.filter((r) => r.kind !== 'lang');
  if (!content.length) { state.exported = true; return; }
  // Une colonne par question quand toutes les copies ont le même découpage (prêt pour le logiciel de notes).
  // Par groupe et nom ; à égalité (noms absents), par n° de copie.
  const byName = (x, y) => `${x.group} ${x.name}`.localeCompare(`${y.group} ${y.name}`, 'fr', { sensitivity: 'base', numeric: true }) || (x.no ?? 0) - (y.no ?? 0);
  const sorted = [...content].sort(byName);
  const shape = sorted.find((r) => !r.illegible)?.questions || [];
  const perQuestion = shape.length > 0 && sorted.every((r) => r.illegible || r.questions.length === shape.length);
  const qHeads = perQuestion ? shape.map((q, i) => `Q${i + 1} (/${num(q.max)})`) : [];
  const rows = [['N° copie', 'Fichier', 'Évaluation', 'Groupe', 'Élève', 'Note', 'Sur', 'Pourcentage', ...qHeads, 'Fiabilité (%)', 'Détail par question', 'Commentaire', 'À vérifier']];
  for (const r of sorted) {
    const ok = r.grade != null;
    rows.push([r.no ?? '', r.file || '', r.exam, r.group, r.name, ok ? num(r.grade) : tr('Illisible'), num(r.total), ok ? num(Math.round((r.grade / r.total) * 1000) / 10) : '',
      ...(perQuestion ? shape.map((_, i) => (ok && r.questions[i] ? num(r.questions[i].points) : '')) : []), r.reliability ?? '',
      r.questions.map((q) => `${q.question} : ${num(q.points)}/${num(q.max)}${q.points < q.max && q.justification ? ` (${q.justification})` : ''}`).join(' | '),
      r.comment, r.flags.join(' ')]);
  }
  downloadCSV(rows, '');
  state.exported = true;
}

function endSession() {
  if (!confirm(tr('Terminer la session et tout effacer (copies, corrigé, résultats) ?'))) return;
  if (state.results.length && !state.exported && confirm(tr('Télécharger les notes (CSV) avant d’effacer ?'))) exportCSV();
  // Ordinateur partagé : la clé mémorisée permettrait au suivant d'utiliser les pages restantes.
  const forget = confirm(`${tr('Oublier aussi la clé d’accès sur cet ordinateur ? Notez-la d’abord pour utiliser vos pages restantes :')} ${state.key}`);
  Object.assign(state, { results: [], pages: [], rubricPages: [], status: {}, open: new Set(), exported: true, seq: 0, structure: null });
  $('mode').value = ''; $('per').value = '';
  ['exam', 'group', 'rubric', 'search'].forEach((id) => { $(id).value = ''; });
  state.grid = null;
  renderRubric(); renderGrid(); renderPages(); renderResults(); savePrefs();
  if (forget) { store.del(); location.reload(); return; }
  banner('ok', 'Session terminée : tout a été effacé.');
}

// ---------- Mode caméra ----------

// Chaque feuille photographiée rejoint les pages importées ; avec « Corriger pendant la prise de vue », chaque copie
// complète (autant de pages que prévu par élève) part en correction pendant que l'enseignant tourne les suivantes.
const camState = { session: null, shots: [], graded: 0 };
const camPer = () => Number($('cam-per').value) || 1;

function camCount() {
  const n = camState.shots.length;
  const graded = state.results.length - camState.graded;
  const waiting = $('cam-auto').checked && $('run').disabled && !state.running && state.pages.length ? ` · en attente : ${$('run').textContent}` : '';
  $('cam-count').textContent = `${n} page${n > 1 ? 's' : ''} · ${graded} copie(s) corrigée(s)${state.running ? ' · correction en cours…' : ''}${waiting}`;
}

function camGroup() {
  $('mode').value = 'fixed';
  $('per').value = String(camPer());
  applyMode(); renderPages();
}

async function camAutoRun() {
  if (!$('cam-auto').checked || state.running || $('run').disabled) { camCount(); return; }
  const done = bundles().filter((b) => b.length === camPer() && state.status[b[0].id]?.state !== 'error');
  if (!done.length) { camCount(); return; }
  const run = runAll(done);
  camCount();
  await run;
  camAutoRun();
}

async function camCapture(canvas) {
  const flash = $('cam-flash');
  flash.classList.add('on'); setTimeout(() => flash.classList.remove('on'), 60);
  const no = camState.shots.length + 1;
  const page = fitCanvas(canvas.width, canvas.height);
  page.getContext('2d').drawImage(canvas, 0, 0, page.width, page.height);
  // La photo pleine définition sert à la correction de la langue (comme une photo importée).
  const full = fitCanvas(canvas.width, canvas.height, LANG_MAX_SIDE);
  full.getContext('2d').drawImage(canvas, 0, 0, full.width, full.height);
  const blob = await new Promise((r) => full.toBlob(r, 'image/jpeg', 0.9));
  const p = { id: uid(), url: canvasToJpeg(page), file: `Photo ${no}`, firstOfFile: true, source: new File([blob], `photo-${no}.jpg`, { type: 'image/jpeg' }) };
  camState.shots.push(p);
  state.pages.push(p);
  applyMode(); renderPages();
  camAutoRun();
}

// Cibles aux quatre coins : sans feuille, elles montrent où la placer (format lettre) ; ensuite elles suivent la feuille.
function camTarget(box, kind) {
  const v = $('cam-video'), t = $('cam-target');
  if (!v.videoWidth) return;
  const r = v.getBoundingClientRect();
  const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight); // la vidéo est affichée en entier (contain)
  const w = v.videoWidth * s, hgt = v.videoHeight * s, ox = (r.width - w) / 2, oy = (r.height - hgt) / 2;
  let b = box;
  if (!b) { // guide : une feuille lettre (8,5 × 11) qui occupe 82 % de l'image
    const fw = Math.min(0.82 * w, (0.82 * hgt * 8.5) / 11) / w, fh = (fw * w * 11) / 8.5 / hgt;
    b = { x0: (1 - fw) / 2, y0: (1 - fh) / 2, x1: (1 + fw) / 2, y1: (1 + fh) / 2 };
  }
  Object.assign(t.style, { left: `${ox + b.x0 * w}px`, top: `${oy + b.y0 * hgt}px`, width: `${(b.x1 - b.x0) * w}px`, height: `${(b.y1 - b.y0) * hgt}px` });
  t.className = `cam-target ${box ? kind : 'guide'}`;
}

async function openCamera() {
  if (state.running) return;
  camState.shots = []; camState.graded = state.results.length;
  if ($('mode').value === 'fixed' && Number($('per').value) >= 1) $('cam-per').value = String(Math.round(Number($('per').value)));
  camGroup();
  $('cam').hidden = false;
  // Le geste « retour » du téléphone ferme la caméra au lieu de quitter le site.
  history.pushState({ cam: true }, '');
  camCount();
  const status = $('cam-status');
  try {
    camState.session = await startCamera($('cam-video'), {
      onCapture: camCapture,
      onStatus: (msg, kind, box) => { status.textContent = tr(msg); status.className = `cam-status ${kind}`; camTarget(box, kind); },
    });
    camArm(false);
  } catch (err) {
    $('cam').hidden = true;
    if (history.state?.cam) history.back();
    banner('err', 'Caméra indisponible : autorisez l’accès à la caméra pour ce site, puis réessayez.');
  }
}

function closeCamera(fromHistory) {
  if ($('cam').hidden) return;
  if (!fromHistory && history.state?.cam) { history.back(); return; } // repasse par popstate, qui ferme
  camState.session?.stop();
  camState.session = null;
  $('cam').hidden = true;
  const n = camState.shots.length;
  renderPages();
  if (!n) return;
  // Par défaut rien n'est encore corrigé : l'enseignant vérifie d'un coup d'œil les miniatures (photo floue, page de
  // trop, pages bien regroupées) avant de lancer — et de payer — la correction.
  camState.review = state.pages.length > 0;
  banner(camState.review ? 'info' : 'ok', camState.review
    ? `${n} page(s) photographiée(s). Vérifiez les miniatures (photo floue, page de trop, pages bien regroupées par élève), puis lancez la correction.`
    : `${n} page(s) photographiée(s).${state.running ? ' La correction se poursuit.' : ''}`);
  if (camState.review) $('pages-zone').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (navigator.mediaDevices?.getUserMedia) $('cam-open').hidden = $('cam-hint').hidden = false;
$('cam-open').addEventListener('click', openCamera);
$('cam-done').addEventListener('click', () => closeCamera());
window.addEventListener('popstate', () => closeCamera(true));
$('cam-shoot').addEventListener('click', () => camState.session?.capture());
// Démarrer / Pause : la prise automatique ne commence qu'à la demande de l'enseignant.
function camArm(on) {
  camState.armed = on;
  camState.session?.setArmed(on);
  $('cam-go').textContent = tr(on ? '⏸ Pause' : '▶ Démarrer');
  $('cam-go').classList.toggle('primary', !on);
}
$('cam-go').addEventListener('click', () => camArm(!camState.armed));
$('cam-per').addEventListener('change', () => { camGroup(); camAutoRun(); });
$('cam-auto').addEventListener('change', camAutoRun);
$('cam-undo').addEventListener('click', () => {
  const p = camState.shots.at(-1);
  // Une page déjà partie en correction ne peut plus être retirée.
  const b = bundles().find((x) => x.includes(p));
  if (!p || !b || state.status[b[0].id]?.state === 'running') return;
  camState.shots.pop();
  removePage(p);
  camCount();
});

// ---------- Événements ----------

function dropzone(zone, input, onFiles) {
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
  zone.addEventListener('drop', (e) => { e.preventDefault(); onFiles([...e.dataTransfer.files]); });
}

dropzone($('drop'), $('files'), async (files) => {
  const added = await filesToPages(files);
  state.pages.push(...added);
  applyMode();
  if ($('mode').value === 'auto') { renderPages(); await detectCopies(); return; }
  renderPages();
});
dropzone($('rubric-drop'), $('rubric-files'), async (files) => {
  const added = await filesToPages(files);
  state.rubricPages.push(...added.map(({ id, url }) => ({ id, url })));
  if (state.rubricPages.length > MAX_RUBRIC_PAGES) {
    state.rubricPages.length = MAX_RUBRIC_PAGES;
    banner('err', `Corrigé limité à ${MAX_RUBRIC_PAGES} pages : les suivantes ont été ignorées.`);
  }
  renderRubric();
});

$('mode').addEventListener('change', () => {
  applyMode(); renderPages();
  if ($('mode').value === 'auto') detectCopies();
});
$('per').addEventListener('input', () => { applyMode(); renderPages(); });
$('clear-pages').addEventListener('click', () => { state.pages = []; state.status = {}; renderPages(); });
$('total').addEventListener('input', () => { renderSummary(); updateGridTotal(); });
$('make-grid').addEventListener('click', makeGrid);
$('kind-content').addEventListener('click', () => setKind('content'));
$('kind-lang').addEventListener('click', () => setKind('lang'));
$('viewer-print').addEventListener('click', printViewer);
$('viewer-add').addEventListener('click', () => { adding = adding ? null : { stage: 'draw' }; renderViewer(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (adding && !$('viewer').hidden) { adding = null; renderViewer(); return; }
  if (!$('cam').hidden) { closeCamera(); return; }
  for (const id of ['zoom', 'viewer', 'rel-help', 'buy']) {
    if (!$(id).hidden) { $(id).hidden = true; if (id === 'viewer') viewing = null; return; }
  }
});
$('zoom-close').addEventListener('click', () => { $('zoom').hidden = true; });
document.querySelectorAll('[data-close-viewer]').forEach((b) => b.addEventListener('click', () => { $('viewer').hidden = true; viewing = null; }));
$('grid-remove').addEventListener('click', () => { state.grid = null; renderGrid(); });
$('deep').addEventListener('change', renderSummary);
$('run').addEventListener('click', () => {
  // Après une numérisation : dernière confirmation, avec le nombre de pages qui seront décomptées.
  if (camState.review) {
    const copies = bundles().length, pages = state.pages.length;
    const cost = pages * (state.kind === 'content' && $('deep').value === '1' ? 2 : 1);
    if (!confirm(tr(`${copies} copie(s), ${pages} page(s) : ${cost} page(s) seront décomptées. Lancer la correction ?`))) return;
    camState.review = false;
  }
  runAll();
});
$('search').addEventListener('input', renderResults);
$('export').addEventListener('click', exportCSV);
$('end').addEventListener('click', endSession);

$('trial').addEventListener('click', startTrial);
$('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await useKey($('key-input').value); } catch (err) { showGate(err.message); }
});
$('logout').addEventListener('click', () => {
  if (state.results.length && !state.exported && !confirm(tr('Des résultats ne sont pas téléchargés. Continuer ?'))) return;
  store.del(); location.reload();
});
$('buy-open').addEventListener('click', () => { $('buy').hidden = false; });
document.querySelectorAll('[data-open-buy]').forEach((b) => b.addEventListener('click', () => { $('buy').hidden = false; }));
document.querySelectorAll('[data-close-buy]').forEach((b) => b.addEventListener('click', () => { $('buy').hidden = true; }));
document.querySelectorAll('[data-pack]').forEach((b) => b.addEventListener('click', () => buy(b.dataset.pack)));
document.querySelectorAll('[data-close-rel]').forEach((b) => b.addEventListener('click', () => { $('rel-help').hidden = true; }));
document.querySelector('[data-close-newkey]').addEventListener('click', () => { $('newkey').hidden = true; });
$('newkey-copy').addEventListener('click', () => navigator.clipboard?.writeText($('newkey-value').textContent));

window.addEventListener('beforeunload', (e) => {
  if (state.running || (state.results.length && !state.exported)) e.preventDefault();
});

// Réglages de l'enseignant retenus d'une session à l'autre (dans ce navigateur seulement ; aucune donnée d'élève).
// Le corrigé tapé et le nom de l'évaluation ne sont gardés que jusqu'à la fermeture de l'onglet : assez pour corriger
// plusieurs groupes de suite, sans laisser le corrigé sur un ordinateur partagé. « Terminer la session » les efface aussi.
// Le regroupement des pages n'est pas retenu : il repart toujours d'un choix neutre.
const PREF_IDS = ['total', 'whole', 'deep', 'language', 'lang-level', 'lang-total', 'lang-per', 'lang-max', 'anon', 'anon-h', 'anon-all', 'out-lang'];
const TAB_IDS = ['exam', 'rubric'];
function savePrefs() {
  const prefs = Object.fromEntries(PREF_IDS.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]));
  prefs.cats = [...document.querySelectorAll('#lang-cats input')].filter((i) => i.checked).map((i) => i.value);
  try { localStorage.setItem('ce.prefs', JSON.stringify(prefs)); } catch { /* navigation privée */ }
  try { sessionStorage.setItem('ce.tab', JSON.stringify(Object.fromEntries(TAB_IDS.map((id) => [id, $(id).value])))); } catch { /* ignoré */ }
}
function loadPrefs() {
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem('ce.prefs') || 'null'); } catch { /* ignoré */ }
  try { const tab = JSON.parse(sessionStorage.getItem('ce.tab') || 'null'); if (tab) TAB_IDS.forEach((id) => { if (tab[id]) $(id).value = tab[id]; }); } catch { /* ignoré */ }
  if (!prefs) return;
  for (const id of PREF_IDS) {
    if (prefs[id] == null) continue;
    if ($(id).type === 'checkbox') $(id).checked = !!prefs[id];
    else if ($(id).tagName !== 'SELECT' || [...$(id).options].some((o) => o.value === prefs[id])) $(id).value = prefs[id];
  }
  if (Array.isArray(prefs.cats)) document.querySelectorAll('#lang-cats input').forEach((i) => { i.checked = prefs.cats.includes(i.value); });
}
$('out-lang').value = lang; // par défaut la langue du site ; le choix de l'enseignant est ensuite retenu
loadPrefs();
$('anon-opts').hidden = !anonymous();
for (const id of [...PREF_IDS, ...TAB_IDS]) $(id).addEventListener('change', savePrefs);
['anon', 'anon-h', 'anon-all'].forEach((id) => $(id).addEventListener('change', () => { $('anon-opts').hidden = !anonymous(); renderPages(); }));
document.querySelectorAll('#lang-cats input').forEach((i) => i.addEventListener('change', savePrefs));

// Affichage simple (par défaut) ou avancé : le mode simple cache les réglages fins (classe « adv »), qui restent appliqués.
// Si l'un d'eux n'a pas sa valeur par défaut, une ligne le signale : rien ne change en douce (ex. double correction facturée).
const advControls = () => [...document.querySelectorAll('.adv input, .adv select')];
const isDefault = (el) => (el.id === 'out-lang' ? el.value === lang
  : el.type === 'checkbox' ? el.checked === el.defaultChecked
  : el.tagName === 'SELECT' ? el.value === ([...el.options].find((o) => o.defaultSelected) || el.options[0])?.value
  : el.value === el.defaultValue);
function setUiMode(adv) {
  $('app').classList.toggle('ui-simple', !adv);
  $('ui-simple').setAttribute('aria-pressed', String(!adv));
  $('ui-adv').setAttribute('aria-pressed', String(adv));
  $('adv-note').hidden = adv || advControls().every(isDefault);
  try { localStorage.setItem('ce.ui', adv ? 'adv' : 'simple'); } catch { /* ignoré */ }
}
const uiAdv = () => !$('app').classList.contains('ui-simple');
$('ui-simple').addEventListener('click', () => setUiMode(false));
$('ui-adv').addEventListener('click', () => setUiMode(true));
$('adv-show').addEventListener('click', (e) => { e.preventDefault(); setUiMode(true); });
advControls().forEach((el) => el.addEventListener('change', () => setUiMode(uiAdv())));
let savedUi = null;
try { savedUi = localStorage.getItem('ce.ui'); } catch { /* ignoré */ }
setUiMode(savedUi === 'adv');

// ---------- Démarrage ----------

startI18n();
const saved = new URLSearchParams(location.search).get('key') || store.get();
if (new URLSearchParams(location.search).has('key')) history.replaceState(null, '', location.pathname);
if (saved) useKey(saved).catch((err) => { if (err.status === 401) store.del(); showGate(err.message); });
else showGate();
renderPages();
renderResults();

// Lien « J'ai une clé » de l'accueil : le curseur est déjà dans le champ de la clé.
if (location.hash === '#cle' && !$('gate').hidden) $('key-input').focus();
