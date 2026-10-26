// Brûle la pile — application de l'enseignant.
// Les copies restent en mémoire dans cet onglet ; seule la clé d'accès est retenue sur l'appareil.

const MAX_SIDE = 2000;          // pixels, côté le plus long d'une page envoyée (précision du surlignage)
const JPEG_QUALITY = 0.85;
const MAX_PAGES_PER_COPY = 10;
const MAX_RUBRIC_PAGES = 6;
const CONCURRENCY = 5;
const KEY_STORAGE = 'ce.accessKey';
const PDFJS = '/vendor/pdfjs'; // pdf.js 3.11.174, hébergé sur le site

import { t, tr, trTo, lang, startI18n } from './i18n.js';
import { refineToInk } from './boxes.js';
import { looksSideways, rotateDataUrl } from './orient.js';
import { startCamera } from './camera.js';
import { PDA_NOTIONS, pdaDefault, cote } from './pda.js';

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
// Accord du nombre : « 1 copie », « 3 copies » (au lieu de « copie(s) »).
const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;
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

// Accueil, une seule fois par appareil : les 3 étapes et les limites à connaître, avec un lien vers le guide.
function maybeWelcome() {
  let seen = false;
  try { seen = localStorage.getItem('ce.welcome') === '1'; } catch { /* ignoré */ }
  if (!seen && $('newkey').hidden && !$('app').hidden) $('welcome').hidden = false;
}
// Le navigateur se souvient qu'un essai y a été pris (sans garder la clé : sur un ordinateur partagé, le collègue
// suivant ne doit pas récupérer les pages d'un autre). Reprendre un essai demande alors un clic de plus.
const TRIAL_TAKEN = 'ce.trialTaken';
async function startTrial(force = false) {
  let taken = false;
  try { taken = localStorage.getItem(TRIAL_TAKEN) === '1'; } catch { /* navigation privée */ }
  if (taken && force !== true) { $('trial-taken').hidden = false; return; }
  $('trial-taken').hidden = true;
  $('trial').disabled = true;
  try {
    const { key } = await api('/api/trial', { method: 'POST', auth: false });
    try { localStorage.setItem(TRIAL_TAKEN, '1'); } catch { /* idem */ }
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

async function filesToPages(files, progress = (text) => banner('info', text)) {
  const out = [];
  const errors = [];
  for (const [k, file] of files.entries()) {
    const of = files.length > 1 ? `Fichier ${k + 1}/${files.length} · ` : '';
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const urls = await pdfToJpegs(file, (i, n) => progress(`${of}Lecture de « ${file.name} » : page ${i}/${n}…`));
        urls.forEach((url, i) => out.push({ id: uid(), url, file: file.name, firstOfFile: i === 0 }));
      } else if (isImage(file)) {
        progress(`${of}Lecture de « ${file.name} »…`);
        // `source` garde la photo d'origine : la correction de la langue l'envoie en pleine résolution.
        out.push({ id: uid(), url: await imageToJpeg(file), file: file.name, firstOfFile: true, source: file });
      } else if (isDocx(file) || isText(file)) {
        progress(`${of}Mise en page de « ${file.name} »…`);
        const urls = await (isDocx(file) ? docxToJpegs(file) : textToJpegs(file));
        urls.forEach((url, i) => out.push({ id: uid(), url, file: file.name, firstOfFile: i === 0 }));
      } else {
        errors.push(`${file.name} (format non pris en charge : enregistrez-le en PDF${ext(file) === 'doc' ? ' ou en .docx' : ''})`);
      }
    } catch (err) {
      errors.push(`${file.name} (${err.message || 'illisible'})`);
    }
  }
  if (out.length) progress('Vérification de l’orientation des pages…');
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
    banner('info', `${bundles().length} copie(s) trouvée(s). Vérifiez que chaque copie correspond à un seul élève (cliquez sur une page pour l’agrandir) avant de corriger.`);
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
  // « Une photo ou un fichier par élève » avec un fichier de plusieurs pages : c'est peut-être toute une classe.
  const multi = mode === 'file' && list.some((b) => b.length > 1);
  $('mode-hint').hidden = !multi;
  if (multi) $('mode-hint').textContent = 'Attention : un fichier contient plusieurs pages ; il sera corrigé comme la copie d’un seul élève. S’il contient plusieurs élèves, choisissez « Trouver chaque copie pour moi ».';
  const nCopies = list.length;
  $('drop-done').hidden = !state.pages.length;
  $('drop-done').textContent = `✓ ${pl(nCopies, 'copie ajoutée', 'copies ajoutées')} (${pl(state.pages.length, 'page', 'pages')}). Vérifiez-les ci-dessous.`;
  if (state.detecting) {
    $('bundles').replaceChildren(h('div', { class: 'analyzing' },
      h('div', { class: 'spinner' }), h('b', { textContent: 'Un instant, nous analysons vos copies…' }),
      h('span', { class: 'muted small', textContent: `L'IA repère où commence chaque copie (${state.detectProgress || ''}). Cette étape est gratuite.` })));
    renderSummary();
    return;
  }
  const ready = !(mode === 'fixed' && !(Number($('per').value) >= 1));
  // Numéros que les copies recevront à la correction (les copies déjà relancées gardent le leur).
  let seq = state.seq || 0;
  const nos = list.map((b) => b[0].no ?? ++seq);
  $('bundles').replaceChildren(...list.map((b, bi) => {
    const st = state.status[b[0].id];
    const tooLong = ready && b.length > MAX_PAGES_PER_COPY;
    const label = st?.state === 'running' ? st.msg || 'Correction en cours…' : st?.state === 'error' ? `⚠ ${st.msg}` : tooLong ? `⚠ ${MAX_PAGES_PER_COPY} pages max : plusieurs élèves ? Utilisez « Nombre fixe de pages par élève » ou ✂` : '';
    return h('div', { class: 'bundle' },
      h('div', { class: 'bundle-head' },
        h('span', {}, `Copie ${nos[bi]}${b[0].detectedName ? ` · ${b[0].detectedName}` : ''} · ${b.length} page${b.length > 1 ? 's' : ''}`),
        h('span', { class: `st ${st?.state === 'error' || tooLong ? 'err' : ''}`, textContent: label }),
        bi > 0 ? h('button', { class: 'btn ghost merge', type: 'button', textContent: 'rattacher à la copie du dessus', disabled: state.running,
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
    h('b', { textContent: String(n) }), ` ${tr(n > 1 ? 'pages' : 'page')}`] : [tr(state.results.length ? '✓ Toutes les copies importées sont corrigées.' : 'Aucune copie importée')]));
  const cost = n * (state.kind === 'content' && $('deep').value === '1' ? 2 : 1);
  $('cost').textContent = n ? (cost > 1 ? `${cost} pages seront décomptées` : '1 page sera décomptée') : '';
  const enough = state.pagesLeft == null || state.pagesLeft >= cost;
  const run = $('run');
  const gridSum = state.grid ? state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0) : null;
  const gridOk = state.kind === 'lang' || gridSum == null || Math.abs(gridSum - Number($('total').value)) < 1e-9;
  // Le nombre de points et les pages par élève ne servent qu'à la correction de copies (champs cachés en mode langue).
  const needGrid = byGrid() && !state.grid; // avec une grille : la grille lue fixe le total
  const needTotal = state.kind === 'content' && !needGrid && !(Number($('total').value) > 0);
  run.disabled = state.running || state.detecting || !n || !grouped || tooLong || !enough || !gridOk || needTotal || needGrid || state.reading
    || (state.kind === 'content' && !(Number($('per-student').value) >= 1));
  run.textContent = state.running ? (state.kind === 'lang' ? 'Analyse en cours…' : 'Correction en cours…')
    : state.detecting ? 'Analyse des copies en cours…'
    : n && state.reading ? 'Lecture de la grille…'
    : n && needGrid ? 'Ajoutez votre grille (section 1)'
    : n && needTotal ? 'Indiquez le nombre de points'
    : n && state.kind === 'content' && !(Number($('per-student').value) >= 1) ? 'Indiquez le nombre de pages par élève'
    : n && !grouped ? 'Indiquez le nombre de pages par élève'
    : !enough ? 'Solde insuffisant : rechargez votre compte'
    : n && !gridOk ? `La grille totalise ${fmt(gridSum)} points au lieu de ${fmt(Number($('total').value))}`
    : n ? `${state.kind === 'lang' ? 'Analyser la langue de' : 'Corriger'} ${pl(list.length, 'copie', 'copies')}` : 'Corriger';
  $('export').disabled = $('end').disabled = state.running || !state.results.length;
  // Pas de gros bouton vert tant qu'il n'y a rien à télécharger.
  $('export').hidden = $('print-all').hidden = !state.results.length;
  $('print-all').disabled = state.running || !state.results.some((r) => r.kind !== 'lang');
  renderCalib();
}

function renderRubric() {
  $('rubric-thumbs').replaceChildren(...state.rubricPages.map((p) => h('div', { class: 'thumb' },
    h('img', { src: p.url, alt: tr('Corrigé') }),
    h('button', { class: 'x', type: 'button', textContent: '×', onclick: () => {
      state.rubricPages = state.rubricPages.filter((x) => x !== p); renderRubric();
    } }))));
  const n = state.rubricPages.length;
  $('rubric-done').hidden = !n;
  $('rubric-done').textContent = byGrid() ? `✓ Grille ajoutée (${pl(n, 'page', 'pages')}). Elle n’est pas facturée.` : `✓ Corrigé ajouté (${pl(n, 'page', 'pages')}). Il n’est pas facturé.`;
}

// ---------- Grille détaillée ----------

const toNumber = (v) => Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
// Les grilles générées contiennent parfois des lettres cyrilliques ou grecques identiques en apparence.
const HOMOGLYPHS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Х': 'X', 'Т': 'T', 'Н': 'H', 'К': 'K', 'М': 'M', 'В': 'B', 'ο': 'o', 'α': 'a' };
const cleanText = (t) => String(t).replace(/[аеорсхуіјѕАЕОРСХТНКМВοα]/g, (c) => HOMOGLYPHS[c]);

function updateGridTotal() {
  if (!state.grid) return;
  const sum = state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0);
  const el = $('grid-total');
  if (byGrid()) { // avec une grille, le total est celui de la grille
    $('total').value = sum > 0 ? String(sum) : '';
    el.textContent = `Total : ${fmt(sum)} points`; el.className = 'small ok';
  } else {
    const total = Number($('total').value);
    el.textContent = `Total : ${fmt(sum)} / ${fmt(total)} points`;
    el.className = `small ${Math.abs(sum - total) < 1e-9 ? 'ok' : 'bad'}`;
  }
  renderSummary();
}

// Chaque critère : son nom, ses points maximum, puis un niveau par ligne (étiquette, points, description).
function renderGrid() {
  $('grid-editor').hidden = !state.grid;
  $('make-grid').textContent = state.reading ? 'Un instant, lecture de la grille…'
    : byGrid() ? (state.grid ? 'Relire ma grille' : 'Lire ma grille')
    : state.grid ? 'Régénérer la grille' : 'Préparer une grille détaillée (gratuit)';
  if (!state.grid) { renderSummary(); return; }
  const row = (c, l) => h('div', { class: 'lvl' },
    h('input', { type: 'text', class: 'lvl-label', value: l.label || '', placeholder: '—', 'aria-label': 'Niveau', title: 'Niveau (A, B, 4…)', oninput: (e) => { l.label = e.target.value.trim(); } }),
    h('input', { type: 'text', inputMode: 'decimal', class: 'num', value: fmt(l.points), 'aria-label': 'Points du niveau', title: 'Points',
      onchange: (e) => { l.points = Math.max(0, Math.min(c.max, toNumber(e.target.value) || 0)); e.target.value = fmt(l.points); } }),
    h('textarea', { rows: 2, value: l.description, 'aria-label': 'Description du niveau', oninput: (e) => { l.description = e.target.value; } }),
    h('button', { class: 'icon-btn', type: 'button', textContent: '×', title: 'Retirer ce niveau', onclick: () => { c.levels = c.levels.filter((x) => x !== l); renderGrid(); } }));
  $('grid-criteria').replaceChildren(...state.grid.map((c, i) => h('div', { class: 'crit' },
    h('div', { class: 'crit-top' },
      h('span', { class: 'crit-no', textContent: String(i + 1) }),
      h('input', { type: 'text', value: c.name, 'aria-label': 'Critère', oninput: (e) => { c.name = e.target.value; } }),
      h('label', { class: 'crit-max' }, 'sur ', h('input', { type: 'text', inputMode: 'decimal', class: 'num', value: fmt(c.max), 'aria-label': 'Points maximum',
        oninput: (e) => { c.max = toNumber(e.target.value); updateGridTotal(); } }), ' pts')),
    h('div', { class: 'lvl lvl-head muted small' }, h('span', { textContent: 'Niveau' }), h('span', { textContent: 'Points' }), h('span', { textContent: 'Description' }), h('span')),
    ...c.levels.map((l) => row(c, l)),
    h('button', { class: 'btn ghost small', type: 'button', textContent: '+ Ajouter un niveau', onclick: () => { c.levels.push({ label: '', points: 0, description: '' }); renderGrid(); } }),
    c.note ? h('div', { class: 'muted small', textContent: `Remarque transmise à l'IA : ${c.note}` }) : null)));
  updateGridTotal();
}

// « Avec une grille » : l'IA recopie la grille de l'enseignant telle quelle (critères, niveaux, points).
// Sinon : elle rédige une grille détaillée à partir des consignes et du corrigé.
async function makeGrid() {
  if (state.grid && !confirm(tr('Remplacer la grille actuelle par une nouvelle ?'))) return;
  const copy = byGrid();
  if (copy && !state.rubricPages.length && !$('rubric').value.trim()) { banner('err', 'Ajoutez d’abord votre grille : glissez-la dans la zone, ou tapez-la dans l’encadré.'); return; }
  const btn = $('make-grid');
  btn.disabled = true;
  state.reading = true;
  btn.textContent = copy ? 'Un instant, lecture de la grille…' : 'Un instant, l’IA prépare la grille…';
  renderSummary();
  try {
    const { grid } = await api('/api/rubric', { method: 'POST', body: {
      rubric: $('rubric').value.trim(), rubricPages: state.rubricPages.map((p) => p.url), copy,
      total: copy ? undefined : Number($('total').value), wholePoints: $('whole').value === '1',
    } });
    state.grid = grid.map((c) => ({ ...c, name: cleanText(c.name), levels: c.levels.map((l) => ({ ...l, label: cleanText(l.label || ''), description: cleanText(l.description) })) }));
    state.gridFromCopy = copy;
    banner('info', copy ? 'Grille lue : vérifiez qu’elle est identique à la vôtre et corrigez au besoin. Elle sera appliquée à toutes les copies.'
      : 'Grille préparée : relisez-la et ajustez au besoin. Elle sera appliquée à toutes les copies.');
    if (copy) setTimeout(() => $('grid-editor').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } catch (err) {
    banner('err', err.message);
  } finally {
    btn.disabled = false;
    state.reading = false;
    renderGrid();
  }
}

// Façon de corriger : points par question (corrigé) ou grille de l'enseignant (critères et niveaux).
const byGrid = () => state.kind === 'content' && state.method === 'grid';
try { state.method = localStorage.getItem('ce.method') === 'grid' ? 'grid' : 'points'; } catch { state.method = 'points'; }
function applyMethod() {
  const g = state.method === 'grid';
  $('m-points').setAttribute('aria-pressed', String(!g));
  $('m-grid').setAttribute('aria-pressed', String(g));
  $('f-total-pts').hidden = g;
  $('grid-tools').classList.toggle('adv', !g);
  $('rubric-drop-pc').textContent = tr(g ? 'Glissez votre grille d’évaluation ici, ou cliquez pour ouvrir le dossier' : 'Glissez votre corrigé ici, ou cliquez pour ouvrir le dossier');
  $('rubric-drop-touch').textContent = tr(g ? 'Choisir la grille (photo ou fichier)' : 'Choisir le corrigé (photo ou fichier)');
  $('rubric-drop-sub').textContent = tr(g ? 'PDF, photo, Word ou texte (.txt) · vierge, sans nom d’élève · non facturé' : 'PDF, photo, Word ou texte (.txt) · facultatif · non facturé');
  $('grid-tools-hint').textContent = tr(g ? 'L’outil recopie votre grille telle quelle : vos critères, vos niveaux, vos points. Vous la vérifiez, puis chaque copie reçoit un niveau par critère.'
    : 'Recommandé pour les travaux de rédaction : l\'IA rédige des niveaux précis pour chaque critère, vous les validez, et la même grille s\'applique à toutes les copies. Les notes deviennent beaucoup plus constantes.');
  $('rubric').placeholder = tr(g ? 'Facultatif : précisez ce que l’outil doit savoir pour appliquer votre grille (attentes de la tâche, réponses attendues, ce qu’il ne faut pas pénaliser…).\n\nVous pouvez aussi taper votre grille ici.'
    : 'Expliquez ou précisez la correction : points par question, réponses acceptées, ce qui vaut des points partiels, ce qu’il ne faut pas pénaliser…\n\nVous pouvez aussi taper tout votre corrigé ici.');
  if (!g && state.gridFromCopy) { state.grid = null; state.gridFromCopy = false; $('total').value = ''; } // la grille lue ne sert qu'en mode grille
  renderGrid();
  renderRubric();
}
function setMethod(m) {
  state.method = m;
  try { localStorage.setItem('ce.method', m); } catch { /* ignoré */ }
  applyMethod();
}

// ---------- Correction ----------

// Coupure passagère : réseau perdu (souvent l'écran du téléphone qui s'éteint), IA surchargée ou limite atteinte.
// La copie n'est pas mise en erreur : on attend que la page soit visible et le réseau revenu, puis on réessaie.
const RETRY_WAITS = [5, 15, 40]; // secondes
const transient = (err) => !err.status || err.status === 429 || err.status >= 500;
const pageReady = () => new Promise((res) => {
  const ok = () => !document.hidden && navigator.onLine !== false;
  if (ok()) return res();
  const check = () => { if (ok()) { document.removeEventListener('visibilitychange', check); window.removeEventListener('online', check); res(); } };
  document.addEventListener('visibilitychange', check); window.addEventListener('online', check);
});
async function withRetry(fn, onWait) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (err) {
      if (state.stopping || !transient(err) || attempt >= RETRY_WAITS.length) throw err;
      onWait(RETRY_WAITS[attempt], !err.status);
      // Attente interrompue si l'enseignant arrête la correction.
      for (let t = 0; t < RETRY_WAITS[attempt] * 2 && !state.stopping; t++) await new Promise((r) => setTimeout(r, 500));
      if (state.stopping) throw err;
      await pageReady();
    }
  }
}

// L'écran reste allumé pendant la correction : un téléphone qui se met en veille coupe les connexions en cours.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* refusé (économie d'énergie) : la reprise automatique prend le relais */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.running) keepAwake(true); });

// only : les copies à corriger (par défaut toutes) ; le mode caméra n'envoie que les copies complètes.
// Calibrer d'abord : quelques copies seulement, que l'enseignant relit et ajuste avant de lancer le reste.
const CALIB_COPIES = 3;

// Clé de l'évaluation en cours : le découpage en questions et le calibrage ne valent que pour la même évaluation.
const examKeyNow = () => JSON.stringify([$('exam').value.trim(), Number($('total').value), $('whole').value === '1',
  $('rubric').value.trim(), state.rubricPages.length, !!state.grid]);

// Calibrage : chaque note changée par l'enseignant devient un exemple (réponse résumée, note proposée, sa note, sa raison).
function calibration(examKey) {
  const out = [];
  for (const r of state.results) {
    if (r.kind === 'lang' || r.examKey !== examKey) continue;
    for (const q of r.questions) {
      if (q.ai != null && q.points !== q.ai) out.push({ question: q.question, max: q.max, answer: q.answer || '', ai: q.ai, teacher: q.points, why: (q.why || '').trim() });
    }
  }
  // Les plus récents d'abord, et ceux qui ont une raison en priorité.
  return out.sort((x, y) => !!y.why - !!x.why).slice(0, 15);
}

function renderCalib() {
  const n = state.kind === 'content' ? calibration(examKeyNow()).length : 0;
  $('calib-info').hidden = !n;
  if (n) $('calib-info').textContent = `🎯 Calibrage : ${n > 1 ? `${n} notes que vous avez ajustées guideront` : 'la note que vous avez ajustée guidera'} la correction des prochaines copies.`;
  const pending = bundles().length;
  $('calib-run').hidden = state.kind !== 'content' || state.running || !!n || pending <= CALIB_COPIES + 1;
  $('calib-run').disabled = $('run').disabled;
}

async function runAll(only, calibrating = false) {
  const list = only || bundles();
  if (!list.length) return;
  state.running = true;
  state.stopping = false;
  $('stop-run').disabled = false;
  $('stop-run').textContent = tr('Arrêter');
  keepAwake(true);
  list.forEach((b) => { state.status[b[0].id] = null; });
  $('done-msg').hidden = true;
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
    // Annotations sur la copie : ✓ vert, encadré rouge et ✗, note en marge à côté de chaque réponse.
    // Mesuré sur 9 vraies copies : 88 cadres justes sur 88. localStorage « ce.annot » = « 0 » les retire (dépannage).
    annotate: (() => { try { return localStorage.getItem('ce.annot') !== '0'; } catch { return true; } })(),
    outLang: $('out-lang').value || lang,
  };
  const hasKey = !!(settings.rubric || settings.rubricPages.length || settings.grid);
  // Même examen que la copie déjà corrigée : on réutilise son découpage en questions (voir plus bas).
  const examKey = examKeyNow();
  // Calibrage : les notes déjà ajustées par l'enseignant pour cette évaluation guident les copies suivantes.
  if (state.kind === 'content') settings.calibration = calibration(examKey);
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
    $('progress-eta').textContent = state.stopping ? 'Arrêt : les copies déjà parties se terminent…' : finished === list.length ? '' : min <= 1 ? 'Moins d’une minute restante' : `Environ ${min} min restantes`;
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
    const waiting = (sec, offline) => {
      state.status[id] = { state: 'running', msg: offline ? `Connexion perdue : nouvel essai dans ${sec} s…` : `IA occupée : nouvel essai dans ${sec} s…` };
      if (offline) banner('info', 'Connexion perdue : la correction reprendra toute seule. Gardez cette page ouverte et l’écran allumé.');
      renderPages();
    };
    try {
      if (state.kind === 'lang') {
        const r = await withRetry(() => analyzeLanguage(b), waiting);
        setBalance(r.pagesLeft);
        const res = { kind: 'lang', id, no: b[0].no, file: b[0].file, exam: settings.exam, group: r.group || settings.group, name: r.name, pageCount: b.length,
          pages: b.map((p, i) => ({ url: p.url, errors: r.pages[i].errors, failed: !!r.pages[i].failed, reread: r.pages[i].reread, sent: r.urls[i], words: r.pages[i].words, text: r.pages[i].text })),
          scoring: langScoring(), pda: pdaScoring(), flags: r.failedPages ? [`${r.failedPages} page(s) n'ont pas pu être analysées (non décomptées).`] : [] };
        langGrade(res);
        state.results.unshift(res);
        reread(res);
      } else {
      const pages = await Promise.all(b.map((p, i) => (masked(i) ? maskTop(p.url) : p.url)));
      const r = await withRetry(() => api('/api/grade', { method: 'POST', body: { ...settings, pages, structure: state.structure?.list } }), waiting);
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
        // `ai` : la note proposée, pour repérer celles que l'enseignant change (calibrage).
        unit: settings.wholePoints ? 1 : 0.5, questions: r.questions.map((q) => ({ ...q, ai: r.illegible ? null : q.points })), examKey, lang: settings.outLang,
        grid: settings.grid && settings.grid.length === r.questions.length ? structuredClone(settings.grid) : null, // niveaux par critère
        comment: r.comment, pageCount: b.length, illegible: !!r.illegible,
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
      state.status[id] = { state: 'error', msg: err.status ? err.message : 'Connexion perdue. Relancez la correction.' };
      if (err.status === 402 || err.status === 401) stop = err.message;
    }
    started.delete(id);
    updateProgress();
    renderPages();
  };
  const worker = async () => { while (next < list.length && !stop && !state.stopping) await one(list[next++]); };
  // Grosse pile en mode approfondi : la 1re copie passe seule, pour que toutes les autres profitent de son découpage
  // (leurs deux corrections partent alors en même temps). En mode rapide, attendre coûte plus que ça ne rapporte
  // (mesuré : 12 copies en 54 s contre 57 s) ; le découpage s'applique dès qu'une copie est finie.
  if (settings.deep && state.kind === 'content' && hasKey && !settings.grid && !state.structure && list.length > CONCURRENCY) await one(list[next++]);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  clearInterval(timer);
  $('progress').hidden = true;
  state.running = false;
  keepAwake(false);
  renderPages();
  if (stop) banner('err', stop);
  else if (state.stopping) banner('info', `Correction arrêtée : ${done} copie(s) corrigée(s). Les ${list.length - done} autres restent dans la liste : relancez quand vous voulez.`);
  else if (failed) banner('err', `${done} copie(s) corrigée(s), ${failed} en erreur : elles restent dans la liste, relancez pour réessayer.`);
  else if (state.kind === 'lang') banner('ok', `${done} copie(s) analysée(s). Vérifiez en priorité les copies marquées ⚠.`);
  else if (calibrating) banner('ok', `${done} copie(s) corrigée(s) pour le calibrage. Relisez-les et changez les notes qui ne vous conviennent pas (la raison est facultative), puis cliquez sur « Corriger » : vos ajustements guideront le reste de la pile.`);
  else if (!hasKey) banner('info', `${done} copie(s) corrigée(s) sans corrigé : les notes ont tendance à être généreuses. Vérifiez-les, ou ajoutez votre corrigé pour des notes plus justes.`);
  else banner('ok', `${pl(done, 'copie corrigée', 'copies corrigées')}. Vérifiez en priorité les copies marquées ⚠.`);
  // Les résultats sont dans l'autre colonne (ou plus bas sur téléphone) : on y emmène l'enseignant, 1re copie ouverte.
  if (done && !stop) {
    const first = state.results.find((r) => list.some((b) => b[0].id === r.id));
    if (first && !state.open.size) { state.open.add(first.id); renderResults(); }
    $('done-msg').hidden = false;
    $('done-msg').textContent = state.kind === 'lang'
      ? `✓ ${pl(done, 'copie analysée', 'copies analysées')}. Ouvrez une copie annotée pour voir les fautes surlignées ; retirez celles qui n'en sont pas, ajoutez celles qui manquent.`
      : `✓ ${pl(done, 'copie corrigée', 'copies corrigées')}. Ouvrez une copie pour voir et modifier sa note. En rose : les questions où des points ont été retirés.`;
    $('done-msg').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
  renderQuestionStats(graded);
  if (!graded.length) return;
  const pct = graded.map((r) => (r.grade / r.total) * 100);
  const avg = pct.reduce((a, b) => a + b, 0) / pct.length;
  const flagged = graded.filter((r) => r.flags.length).length;
  const withRel = graded.filter((r) => r.reliability != null);
  const rel = withRel.length ? pctText(fmt(withRel.reduce((a, r) => a + r.reliability, 0) / withRel.length)) : '—';
  const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'v', textContent: v }), h('div', { class: 'l', textContent: l }));
  // Fiabilité : seulement en correction approfondie (sinon « — » inquiète sans rien dire).
  $('stats').replaceChildren(...[stat(String(graded.length), 'copies'),
    stat(pctText(fmt(avg)), `moyenne (min ${fmt(Math.min(...pct))} – max ${fmt(Math.max(...pct))})`),
    withRel.length ? h('div', { class: 'stat' }, h('div', { class: 'v', textContent: rel }),
      h('div', { class: 'l' }, 'fiabilité moyenne ', infoButton())) : null, stat(String(flagged), 'à vérifier ⚠')].filter(Boolean)); // replaceChildren afficherait « null »
}

// Moyenne de la classe par question : repère les questions mal comprises.
// Par position quand toutes les copies ont le même découpage, sinon par intitulé de question.
function questionAverages(graded) {
  const shape = graded[0]?.questions || [];
  const same = shape.length > 0 && graded.every((r) => r.questions.length === shape.length);
  const rows = new Map();
  for (const r of graded) r.questions.forEach((q, i) => {
    const k = same ? i : `${q.question}/${q.max}`;
    if (!rows.has(k)) rows.set(k, { label: same ? shape[i].question : q.question, max: q.max, sum: 0, n: 0 });
    const row = rows.get(k); row.sum += q.points; row.n++;
  });
  return [...rows.values()].filter((q) => q.max > 0).map((q) => ({ ...q, avg: q.sum / q.n, pct: (q.sum / q.n / q.max) * 100 }));
}

function renderQuestionStats(graded) {
  const list = state.kind === 'content' && graded.length >= 2 ? questionAverages(graded) : [];
  $('qstats').hidden = list.length < 2;
  if (list.length < 2) return;
  const weakest = list.reduce((a, b) => (b.pct < a.pct ? b : a));
  $('qstats').querySelector('summary').replaceChildren(h('b', {}, graded.every((r) => r.grid) ? 'Moyenne par critère' : 'Moyenne par question'),
    h('span', { class: 'muted' }, ` · la plus faible : ${weakest.label} (${pctText(fmt(Math.round(weakest.pct)))})`));
  $('qstats-rows').replaceChildren(...list.map((q) => h('div', { class: 'qrow' },
    h('span', { class: 'ql', title: q.label, textContent: q.label }),
    h('span', { class: 'qbar' }, h('i', { class: q.pct < 60 ? 'lo' : q.pct < 75 ? 'mid' : 'hi', style: `width:${Math.round(q.pct)}%` })),
    h('span', { class: 'qv', textContent: `${fmt(Math.round(q.avg * 10) / 10)} / ${fmt(q.max)} · ${pctText(fmt(Math.round(q.pct)))}` }))));
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
  // Le libellé change (et ne pivote pas : « Voir » à l'envers était illisible).
  const setOpen = (on) => { body.hidden = !on; el.classList.toggle('open', on); el.querySelector('.chev').textContent = tr(on ? 'Fermer ▴' : 'Voir ▾'); };
  const head = h('div', { class: 'card-head', onclick: (e) => {
    if (e.target.closest('input, textarea, select, button:not(.chev)')) return;
    if (state.open.has(r.id)) state.open.delete(r.id); else state.open.add(r.id);
    setOpen(state.open.has(r.id));
  } },
    h('span', { class: 'no', title: r.flags.length ? 'À vérifier' : '', textContent: `${r.flags.length ? '⚠ ' : ''}${r.no ?? ''}` }),
    h('input', { class: 'name', type: 'text', value: r.name, placeholder: r.no ? `✎ Tapez le nom (copie ${r.no})` : '✎ Tapez le nom', 'aria-label': "Nom de l'élève",
      oninput: (e) => { r.name = e.target.value; state.exported = false; } }),
    h('input', { class: 'group', type: 'text', value: r.group, placeholder: 'Groupe', 'aria-label': 'Groupe',
      oninput: (e) => { r.group = e.target.value; state.exported = false; } }),
    ...cells,
    h('button', { class: 'icon-btn chev', type: 'button', textContent: 'Voir ▾', 'aria-label': 'Détails' }));
  el.append(head, body);
  setOpen(state.open.has(r.id));
  return el;
}

// Copie corrigée « comme à la main » : ✓ vert pour une bonne réponse, encadré rouge (et ✗ si aucun point) sinon,
// avec les points et une courte note
// dans une marge ajoutée à droite ; la note en haut de la 1re page ; les critères d'ensemble et le commentaire
// en bas de la dernière. Tout est dessiné ici, dans le navigateur : rien de plus n'est envoyé ni payé.
const RED = '#d6283a', GREEN = '#14873e';
// Numéro de la question tel qu'écrit sur l'examen (« 4.1 », « Q3 », « 2b ») ; sinon son rang.
// L'IA ajoute parfois son propre rang devant (« 1. 4.1 Traité… ») : on garde le dernier numéro de la série.
const qLabel = (q, i) => {
  const num = '\\d{1,2}(?!\\d)(?:[.,]\\d{1,2}(?!\\d))*[a-z]?(?![a-zà-ü])'; // 1 ou 2 chiffres : « 1960 » n'est pas un numéro
  const nums = String(q.question).match(new RegExp(`^\\s*(?:(?:Q|question)\\s*)?(?:${num}[.)]?\\s*)+`, 'i'))?.[0].match(new RegExp(num, 'gi'));
  return nums?.length ? `Q${nums[nums.length - 1].replace(',', '.')}` : `Q${i + 1}`;
};
function wrapText(ctx, text, width) {
  const lines = []; let line = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// forPrint : image réduite et gardée en mémoire comme fichier (blob) — imprimer 150 copies d'un coup reste léger.
async function annotatedPages(r, { forPrint = false } = {}) {
  const out = [];
  const general = r.questions.map((q, i) => ({ q, i })).filter(({ q }) => !q.box || !(q.page >= 1 && q.page <= r.pageUrls.length));
  for (let pi = 0; pi < r.pageUrls.length; pi++) {
    const img = await loadImage(r.pageUrls[pi]);
    const W = img.width, M = Math.round(W * 0.34), pad = Math.round(M * 0.07), u = W / 1000;
    const big = Math.round(26 * u), mid = Math.round(22 * u), small = Math.round(18 * u);
    // Mise en page de la marge d'abord, pour connaître la hauteur nécessaire.
    const probe = document.createElement('canvas').getContext('2d');
    const items = [];
    let y = pad;
    if (pi === 0) { items.push({ kind: 'grade', y }); y += big * 2.6; }
    const here = r.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.box && q.page === pi + 1).sort((a, b) => a.q.box[0] - b.q.box[0]);
    for (const { q, i } of here) {
      y = Math.max(y, q.box[0] * img.height);
      probe.font = `${mid}px sans-serif`;
      const lines = wrapText(probe, q.margin || q.justification, M - 2 * pad);
      items.push({ kind: 'note', q, i, y, lines });
      y += mid * 1.3 + lines.length * mid * 1.2 + mid;
    }
    if (pi === r.pageUrls.length - 1) {
      for (const { q, i } of general) {
        probe.font = `${small}px sans-serif`;
        const lines = wrapText(probe, q.margin || q.justification, M - 2 * pad);
        items.push({ kind: 'general', q, i, y, lines });
        y += mid * 1.3 + lines.length * small * 1.2 + mid * 0.6;
      }
      if (r.comment) {
        probe.font = `italic ${small}px sans-serif`;
        const lines = wrapText(probe, r.comment, M - 2 * pad);
        items.push({ kind: 'comment', y: y + mid * 0.5, lines });
        y += mid + lines.length * small * 1.25;
      }
    }
    const c = document.createElement('canvas');
    c.width = W + M; c.height = Math.max(img.height, Math.ceil(y + pad));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    ctx.strokeStyle = '#e5e5e5'; ctx.lineWidth = Math.max(1, u); ctx.beginPath(); ctx.moveTo(W + 0.5, 0); ctx.lineTo(W + 0.5, c.height); ctx.stroke();
    const x = W + pad;
    for (const it of items) {
      ctx.fillStyle = RED; ctx.strokeStyle = RED; ctx.textBaseline = 'top';
      if (it.kind === 'grade') {
        ctx.font = `bold ${big * 1.6}px sans-serif`;
        ctx.fillText(r.grade == null ? trTo(r.lang || lang, 'Illisible') : `${fmt(r.grade)} / ${fmt(r.total)}`, x, it.y);
        continue;
      }
      if (it.kind === 'comment') {
        ctx.fillStyle = '#222'; ctx.font = `italic ${small}px sans-serif`;
        it.lines.forEach((l, k) => ctx.fillText(l, x, it.y + k * small * 1.25));
        continue;
      }
      const { q, i } = it;
      const head = `${qLabel(q, i)} · ${fmt(q.points)} / ${fmt(q.max)}`;
      if (it.kind === 'note') {
        const [t, l, b, rr] = q.box;
        // Marque au bout de la réponse : ✓ vert (tous les points) ou ✗ rouge (aucun point) ; la réponse encadrée en rouge
        // dès qu'elle perd des points (réponse partielle : encadré seul).
        const sz = Math.min(34 * u, (b - t) * img.height * 0.8), cx = Math.min(rr * W + sz * 0.4, W - sz * 1.2), cy = (t + b) / 2 * img.height;
        let from = [rr * W, t * img.height]; // point de départ du trait vers la marge
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (q.points >= q.max) {
          ctx.strokeStyle = ctx.fillStyle = GREEN;
          ctx.lineWidth = Math.max(2, 3.5 * u);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sz * 0.35, cy + sz * 0.4); ctx.lineTo(cx + sz, cy - sz * 0.5); ctx.stroke();
          from = [cx + sz, cy - sz * 0.5];
        } else {
          ctx.lineWidth = Math.max(2, 2.5 * u);
          ctx.strokeRect(l * W, t * img.height, (rr - l) * W, (b - t) * img.height);
          if (q.points <= 0) {
            const h2 = sz * 0.42, mx = cx + sz * 0.5;
            ctx.lineWidth = Math.max(2, 3.5 * u);
            ctx.beginPath(); ctx.moveTo(mx - h2, cy - h2); ctx.lineTo(mx + h2, cy + h2); ctx.moveTo(mx + h2, cy - h2); ctx.lineTo(mx - h2, cy + h2); ctx.stroke();
          }
        }
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        // Trait de la réponse vers sa note dans la marge.
        ctx.lineWidth = Math.max(1, 1.2 * u); ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(x - pad * 0.4, it.y + mid * 0.6); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.font = `bold ${mid}px sans-serif`;
      ctx.fillText(head, x, it.y);
      ctx.font = `${it.kind === 'note' ? mid : small}px sans-serif`;
      const lh = (it.kind === 'note' ? mid : small) * 1.2;
      it.lines.forEach((l, k) => ctx.fillText(l, x, it.y + mid * 1.3 + k * lh));
    }
    if (!forPrint) { out.push(c.toDataURL('image/jpeg', 0.85)); continue; }
    const k = Math.min(1, 1700 / c.width);
    const lite = document.createElement('canvas');
    lite.width = Math.round(c.width * k); lite.height = Math.round(c.height * k);
    lite.getContext('2d').drawImage(c, 0, 0, lite.width, lite.height);
    out.push(URL.createObjectURL(await new Promise((res) => lite.toBlob(res, 'image/jpeg', 0.82))));
  }
  return out;
}

// Impression en lot, dans l'ordre de la pile : pour chaque élève, sa fiche de résultats et/ou sa copie annotée.
// Fiches seules : plusieurs par feuille, à découper ; avec les copies : chaque élève commence une nouvelle feuille.
const escHtml = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function resultSheet(r) {
  const rows = r.questions.map((q, i) => `<tr><td class="q">${escHtml(qLabel(q, i))}</td><td>${escHtml(q.question)}</td><td class="p">${fmt(q.points)}&nbsp;/&nbsp;${fmt(q.max)}</td><td>${escHtml(q.justification)}</td></tr>`).join('');
  return `<div class="head"><div><b>${escHtml(r.name || trTo(r.lang || lang, 'Nom à compléter'))}</b>${r.group ? ` · ${escHtml(r.group)}` : ''}${r.exam ? `<br><small>${escHtml(r.exam)}</small>` : ''}</div>
    <div class="grade">${r.grade == null ? trTo(r.lang || lang, 'Illisible') : `${fmt(r.grade)} / ${fmt(r.total)}`}</div></div>
    <table><thead><tr><th></th><th>${trTo(r.lang || lang, 'Question')}</th><th>${trTo(r.lang || lang, 'Points')}</th><th>${trTo(r.lang || lang, 'Justification')}</th></tr></thead><tbody>${rows}</tbody></table>
    ${r.comment ? `<p class="comment">${escHtml(r.comment)}</p>` : ''}`;
}
async function printBatch(list, { copies = true, results = false } = {}) {
  const w = window.open('', '_blank');
  if (!w) { alert(tr('Autorisez les fenêtres surgissantes pour imprimer.')); return; }
  const wait = (msg) => { w.document.open(); w.document.write(`<!doctype html><html lang="${pl}"><head><meta charset="utf-8"><title>${escHtml(title)}</title></head><body style="font:15px system-ui;margin:24px">${msg}</body></html>`); w.document.close(); };
  // Titre de la fenêtre = nom du PDF enregistré : dans la langue des copies, avec le nom de l'élève ou de l'évaluation.
  const pl = list[0]?.lang || lang;
  const title = list.length === 1 ? `${list[0].name || trTo(pl, 'Copie')} — ${trTo(pl, 'copie corrigée')}`
    : `${list[0]?.exam ? `${list[0].exam} — ` : ''}${trTo(pl, 'Copies corrigées')}`;
  wait(tr('Préparation de l’impression…'));
  const parts = [];
  for (const [k, r] of list.entries()) {
    if (list.length > 1) wait(tr(`Préparation de l’impression : ${k + 1} / ${list.length}…`));
    if (results) parts.push(`<section class="result${copies ? ' sheet' : ''}">${resultSheet(r)}</section>`);
    if (copies && r.pageUrls) for (const url of await annotatedPages(r, { forPrint: true })) parts.push(`<section class="sheet page"><img src="${url}"></section>`);
  }
  w.document.open();
  w.document.write(`<!doctype html><html lang="${pl}"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>@page{size:letter;margin:8mm}body{margin:0;font:11px/1.35 system-ui,sans-serif;color:#111}
    .sheet{break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}
    .page{height:calc(279.4mm - 16mm);display:flex;align-items:flex-start;justify-content:center}.page img{max-width:100%;max-height:100%;object-fit:contain}
    .result{break-inside:avoid;page-break-inside:avoid;padding:6px 2px 10px;border-bottom:1px dashed #999;margin-bottom:8px}.result.sheet{border:0}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:13px}.grade{font-size:20px;font-weight:800;color:#d6283a;white-space:nowrap}
    table{width:100%;border-collapse:collapse;margin-top:6px}th,td{text-align:left;vertical-align:top;padding:3px 4px;border-top:1px solid #ddd}th{font-size:10px;color:#555}
    td.q{font-weight:700;white-space:nowrap}td.p{white-space:nowrap}.comment{margin:6px 0 0;font-style:italic}
    @media screen{body{margin:16px;max-width:780px}.page{height:auto;border-bottom:1px dashed #bbb;padding-bottom:12px;margin-bottom:12px}}</style></head><body>
    ${parts.join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function card(r) {
  const gradeEl = h('span', { class: 'grade' });
  const updateGrade = () => { gradeEl.replaceChildren(...(r.grade == null ? [tr('Illisible')] : [fmt(r.grade), h('small', {}, ` / ${fmt(r.total)}`)])); };
  updateGrade();

  const body = h('div', { class: 'card-body' },
    r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
    h('table', { class: 'qtable' },
      h('thead', {}, h('tr', {}, h('th', { textContent: r.grid ? 'Critère' : 'Question' }), h('th', { textContent: r.grid ? 'Niveau' : 'Points' }), h('th', { textContent: 'Justification' }))),
      h('tbody', {}, r.questions.map((qq, qi) => {
        const rowClass = () => [qq.points < qq.max ? 'lost' : '', qq.second != null ? 'disputed' : ''].join(' ');
        const tr = h('tr', { class: rowClass() });
        const second = qq.second != null
          ? h('div', { class: 'second', textContent: qq.first != null
            ? `⚖ Corrections : ${fmt(qq.first)} et ${fmt(qq.second)} → moyenne retenue`
            : `⚖ 2e correction : ${fmt(qq.second)} / ${fmt(qq.max)}` }) : null;
        // Note changée : une raison facultative, qui aide le calibrage des copies suivantes.
        const why = h('input', { type: 'text', class: 'why', value: qq.why || '', maxlength: 300, placeholder: 'Pourquoi ? (facultatif, guide les prochaines copies)',
          'aria-label': 'Raison du changement de note', oninput: () => { qq.why = why.value; } });
        const showWhy = () => { why.hidden = qq.ai == null || qq.points === qq.ai; };
        showWhy();
        const input = h('input', { type: 'text', inputMode: 'decimal', class: 'num', value: fmt(qq.points), 'aria-label': 'Points',
          onchange: () => {
            const v = Math.round((toNumber(input.value) || 0) / r.unit) * r.unit;
            qq.points = Math.min(qq.max, Math.max(0, v));
            input.value = fmt(qq.points);
            qq.second = null; // l'enseignant a tranché
            second?.remove();
            tr.className = rowClass();
            showWhy();
            recompute(r); updateGrade(); renderStats(); renderCalib();
            const ok = h('span', { class: 'saved', textContent: '✓ Note modifiée' });
            input.parentElement.querySelector('.saved')?.remove(); input.parentElement.append(ok); setTimeout(() => ok.remove(), 2500);
          } });
        // Avec une grille : on choisit un niveau (A, B…), qui donne ses points ; les points restent modifiables.
        const levels = r.grid?.[qi]?.levels?.length ? [...r.grid[qi].levels].sort((x, y) => y.points - x.points) : null;
        const level = levels ? h('select', { class: 'lvl-pick', 'aria-label': 'Niveau', onchange: (e) => {
          input.value = fmt(Number(e.target.value)); input.dispatchEvent(new Event('change')); } },
        ...levels.map((l) => h('option', { value: String(l.points), textContent: `${l.label || fmt(l.points)}${l.label ? ` · ${fmt(l.points)} pts` : ' pts'}`, selected: l.points === qq.points })),
        levels.some((l) => l.points === qq.points) ? null : h('option', { value: String(qq.points), textContent: `Autre · ${fmt(qq.points)} pts`, selected: true })) : null;
        if (level) input.addEventListener('change', () => { level.value = String(qq.points); });
        tr.append(h('td', { class: 'q', textContent: qq.question }),
          h('td', { class: 'pts' }, level, input, h('span', { class: 'muted', textContent: ` / ${fmt(qq.max)}` }), second),
          h('td', { class: 'just' }, qq.justification, why));
        return tr;
      }))),
    h('label', { class: 'field comment' }, 'Commentaire pour l\'élève',
      h('textarea', { rows: 3, value: r.comment, oninput: (e) => { r.comment = e.target.value; state.exported = false; } })),
    h('div', { class: 'card-foot' },
      h('span', { textContent: copyLabel(r) }),
      h('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap' },
        r.pageUrls ? h('button', { class: 'btn small', type: 'button', textContent: 'Voir la copie corrigée', onclick: async () => openZoom(await annotatedPages(r), copyTitle(r)) }) : null,
        r.pageUrls ? h('button', { class: 'btn small', type: 'button', textContent: 'Imprimer cette copie', title: 'Imprimer la copie corrigée pour l’élève', onclick: () => printBatch([r], { copies: true }) }) : null,
        h('button', { class: 'btn ghost small', type: 'button', style: 'margin-left:1rem', textContent: 'Supprimer', onclick: () => {
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

const langSettings = () => (isPda() ? {
  level: 'primaire', categories: Object.keys(CATS),
  pda: { year: Number($('pda-year').value), notions: PDA_NOTIONS.map((n) => ({ id: n.id, cat: n.cat, label: n.label, state: pdaState(n) })).filter((n) => n.state !== 'ignore'),
    ignored: PDA_NOTIONS.filter((n) => pdaState(n) === 'ignore').map((n) => n.label) },
} : {
  level: $('lang-level').value,
  categories: [...document.querySelectorAll('#lang-cats input:checked')].map((i) => i.value),
});

// Primaire : les fautes qui comptent selon l'année et l'étape (Progression des apprentissages, voir pda.js),
// modifiables notion par notion. Une modification tient jusqu'au changement d'année ou d'étape.
const isPda = () => $('lang-level').value === 'primaire' && $('out-lang').value !== 'en'; // la PDA ne vise que le français
let pdaOver = {};
try { pdaOver = JSON.parse(localStorage.getItem('ce.pda') || '{}') || {}; } catch { /* ignoré */ }
const pdaState = (n) => pdaOver[n.id] || pdaDefault(n, Number($('pda-year').value), Number($('pda-step').value));
const L = (fr, en) => (lang === 'en' ? en : fr); // textes du primaire construits ici (l'interface anglaise les affiche en anglais)
const PDA_STATES = { count: L('Acquise', 'Mastered'), grey: L('En apprentissage', 'Being learned'), ignore: L('Pas encore vue', 'Not yet taught') };
const notionLabel = (x) => (x ? L(x.label, x.en) : '');
const plural = (n, fr, frs, en, ens) => `${n} ${n > 1 ? L(frs, ens) : L(fr, en)}`;
function renderPda() {
  const on = isPda();
  $('pda').hidden = !on;
  $('pda-en-note').hidden = on || lang === 'en' || $('lang-level').value !== 'primaire'; // site français, copies en anglais
  // Exemples à l'image d'une classe du primaire (groupe « 4e B » plutôt que « 541 »).
  // Primaire (avec ou sans la PDA, qui ne vise que les copies en français) : exemples d'une classe du primaire.
  const year = Number($('pda-year').value), prim = state.kind === 'lang' && $('lang-level').value === 'primaire';
  $('exam').placeholder = tr(prim ? 'Ex. : Écriture — Raconte ta fin de semaine' : 'Ex. : Examen — Révolution tranquille');
  $('group').placeholder = !prim ? tr('Ex. : 541') : L(`Ex. : ${year}${year === 1 ? 're' : 'e'} B`, on ? `E.g., Grade ${year}` : 'E.g., Grade 4');
  $('lang-cats-field').hidden = on;
  $('lang-scoring-row').hidden = on; // au primaire, la cote vient du pourcentage de fautes
  if (!on) return;
  const by = (st) => PDA_NOTIONS.filter((x) => pdaState(x) === st).length;
  const counts = (k) => [plural(k('count'), 'acquise', 'acquises', 'mastered', 'mastered'), `${k('grey')} ${L('en apprentissage', 'being learned')}`,
    plural(k('ignore'), 'pas encore vue', 'pas encore vues', 'not yet taught', 'not yet taught')];
  $('pda-sum').textContent = counts(by).join(' · ');
  // Une catégorie par ligne, fermée par défaut : on n'ouvre que celle qu'on veut ajuster.
  $('pda-list').replaceChildren(...Object.entries(CATS).map(([cat, c]) => {
    const list = PDA_NOTIONS.filter((x) => x.cat === cat);
    if (!list.length) return null;
    const n = (st) => list.filter((x) => pdaState(x) === st).length;
    return h('details', { class: 'pda-group', open: pdaOpen.has(cat), ontoggle: (ev) => { if (ev.target.open) pdaOpen.add(cat); else pdaOpen.delete(cat); } },
      h('summary', {}, h('b', { class: `cat ${c.cls}`, textContent: c.label }),
        h('span', { class: 'pda-counts' }, ...counts(n).map((t, i) => h('span', { class: ['n-count', 'n-grey', 'n-ignore'][i], textContent: t })))),
      ...list.map((x) => h('label', { class: `pda-row st-${pdaState(x)}` }, h('span', { textContent: notionLabel(x) }),
        h('select', { onchange: (ev) => { pdaOver[x.id] = ev.target.value; savePda(); renderPda(); } },
          ...Object.entries(PDA_STATES).map(([v, t]) => h('option', { value: v, textContent: t, selected: pdaState(x) === v }))))));
  }).filter(Boolean));
}
const pdaOpen = new Set();
function savePda() { try { localStorage.setItem('ce.pda', JSON.stringify(pdaOver)); } catch { /* ignoré */ } }
const pdaScoring = () => (isPda() ? {
  year: Number($('pda-year').value), once: $('pda-once').value === '1',
  limits: [...document.querySelectorAll('#pda-cotes input')].map((i) => Number(String(i.value).replace(',', '.')) || 0),
} : null);

function langScoring() {
  const num = (id) => Number(String($(id).value).replace(',', '.'));
  const total = num('lang-total'), per = num('lang-per'), max = num('lang-max');
  return total > 0 && per > 0 ? { total, per, max: max > 0 ? max : total } : null;
}

// Note de langue : total − (points par faute × nombre de fautes), plafonné au retrait maximum.
// Les fautes à la lecture incertaine sont montrées « à vérifier » mais ne comptent pas dans la note.
// Primaire : les fautes d'une notion en apprentissage sont grises (montrées, non comptées), et la cote vient du
// pourcentage de fautes comptées sur le nombre de mots ; une même faute répétée peut ne compter qu'une fois.
const counted = (errors) => errors.filter((e) => !e.doubtful && !e.grey);
const repeated = (r, errors) => {
  if (!r.pda?.once) return [];
  const seen = new Set();
  return counted(errors).filter((e) => { const k = `${e.text}→${e.correction}`.toLowerCase().trim(); if (seen.has(k)) return true; seen.add(k); return false; });
};
function langGrade(r) {
  if (r.pda) {
    const errors = r.pages.flatMap((p) => p.errors);
    const dup = repeated(r, errors);
    const count = counted(errors).length - dup.length;
    r.words = r.pages.some((p) => p.words == null) ? null : r.pages.reduce((a, p) => a + p.words, 0);
    r.pct = r.words ? (100 * count) / r.words : null;
    r.cote = r.pct == null ? null : cote(Math.round(r.pct * 10) / 10, r.pda.limits);
    r.grade = null; r.total = null; r.dup = dup;
    return count;
  }
  const count = r.pages.reduce((a, p) => a + counted(p.errors).length, 0);
  if (!r.scoring) { r.grade = null; r.total = null; return count; }
  r.total = r.scoring.total;
  r.grade = Math.max(0, r.scoring.total - Math.min(r.scoring.max, r.scoring.per * count));
  return count;
}

function categoryChips(errors) {
  const grey = errors.filter((e) => e.grey).length; // primaire : notions en apprentissage, à part
  return h('div', { class: 'chips' }, Object.entries(CATS).map(([k, c]) => {
    const n = errors.filter((e) => e.category === k && !e.grey).length;
    return n ? h('span', { class: `cat ${c.cls}`, textContent: `${c.label} ${n}` }) : null;
  }), grey ? h('span', { class: 'cat c-grey', textContent: `${L('En apprentissage', 'Being learned')} ${grey}` }) : null);
}

// Primaire : « 214 mots · 7 fautes comptées · 3,3 % → B ».
const pdaLine = (r, n) => `${r.words == null ? L('mots non comptés', 'words not counted') : plural(r.words, 'mot', 'mots', 'word', 'words')} · ${plural(n, 'faute retenue', 'fautes retenues', 'error counted', 'errors counted')}${r.pct == null ? '' : ` · ${pctText(fmt(Math.round(r.pct * 10) / 10))}`}`;
function langCard(r) {
  const errors = r.pages.flatMap((p) => p.errors);
  const n = r.pda ? langGrade(r) : counted(errors).length;
  const grey = errors.filter((e) => e.grey).length;
  const gradeEl = h('span', { class: 'grade' });
  // Ligne courte (le nom de l'élève doit rester lisible) ; le nombre de mots est dans le détail de la copie.
  gradeEl.replaceChildren(r.pda ? h('span', {}, r.cote || '—', h('small', {}, ` · ${r.pct == null ? '' : `${pctText(fmt(Math.round(r.pct * 10) / 10))} · `}${plural(n, 'faute retenue', 'fautes retenues', 'error', 'errors')}`))
    : r.grade == null ? `${n} faute${n > 1 ? 's' : ''}`
    : h('span', {}, fmt(r.grade), h('small', {}, ` / ${fmt(r.total)} · ${n} faute(s)`)));
  return cardShell(r, [h('span'), gradeEl],
    h('div', { class: 'card-body' },
      r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
      errors.length ? categoryChips(errors) : h('p', { class: 'muted small', style: 'margin:0', textContent: 'Aucune faute relevée.' }),
      r.pda ? h('p', { class: 'small', style: 'margin:0', textContent: pdaLine(r, n) }) : null,
      r.pda && (grey || r.dup?.length) ? h('p', { class: 'muted small', style: 'margin:0', textContent: [grey ? `${plural(grey, 'faute', 'fautes', 'error', 'errors')} ${L('en gris : notion en apprentissage, ne compte pas', 'in grey: being learned, not counted')}` : '', r.dup?.length ? `${plural(r.dup.length, 'faute répétée, retenue', 'fautes répétées, retenues', 'repeated error, counted', 'repeated errors, counted')} ${L('une seule fois', 'once')}` : ''].filter(Boolean).join(' · ') }) : null,
      r.rereading ? h('p', { class: 'muted small', style: 'margin:0', textContent: 'Relecture en cours : d’autres fautes peuvent s’ajouter…' }) : null,
      h('div', { class: 'card-foot' },
        h('span', { textContent: copyLabel(r) }),
        h('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap' },
          h('button', { class: 'btn primary small', type: 'button', textContent: 'Voir la copie annotée', onclick: () => openViewer(r) }),
          h('button', { class: 'btn ghost small', type: 'button', style: 'margin-left:1rem', textContent: 'Supprimer', onclick: () => {
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
  $('viewer-title').textContent = r.pda ? `${copyTitle(r) || 'Élève'} · ${pdaLine(r, count)}${r.cote ? ` → ${r.cote}` : ''}`
    : `${copyTitle(r) || 'Élève'} · ${count} faute(s)${r.grade != null ? ` · ${fmt(r.grade)} / ${fmt(r.total)}` : ''}`;
  let n = 0;
  const numbered = r.pages.map((p) => p.errors.map((e) => ({ e, p, n: ++n })));
  const place = (el, [y0, x0, y1, x1]) => { el.style.cssText = `top:${y0 / 10}%;left:${x0 / 10}%;height:${(y1 - y0) / 10}%;width:${(x1 - x0) / 10}%`; return el; };
  $('viewer-add').textContent = adding ? 'Annuler l’ajout' : '+ Ajouter une faute';
  $('viewer-hint').hidden = adding?.stage !== 'draw';
  $('viewer-pages').replaceChildren(...r.pages.map((p, pi) => {
    const wrap = h('div', { class: `page-wrap ${adding?.stage === 'draw' ? 'adding' : ''}` },
      h('img', { src: p.url, alt: `Page ${pi + 1}`, title: adding ? '' : 'Cliquez pour agrandir ou réduire', draggable: false,
        onclick: () => { if (!adding) $('viewer-pages').classList.toggle('zoom'); } }),
      numbered[pi].filter(({ e }) => e.box).map(({ e, n: k }) => place(h('div', { class: `hl ${CATS[e.category].cls} ${e.grey ? 'grey' : ''} ${focus === e ? 'focus' : ''}`,
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
      const el = h('div', { class: `err ${CATS[e.category].cls} ${e.grey ? 'grey' : ''} ${focus === e ? 'focus' : ''}`, onclick: () => renderViewer(e) },
        h('div', { class: 'err-head' }, h('b', { textContent: `${k}. ${CATS[e.category].label}${e.box ? '' : ' (non localisée)'}${e.doubtful ? ' · à vérifier' : ''}${e.grey ? L(' · notion en apprentissage : ne compte pas', ' · being learned: not counted') : ''}${r.dup?.includes(e) ? L(' · répétée : retenue une seule fois', ' · repeated: counted once') : ''}` }),
          h('button', { class: 'icon-btn', type: 'button', textContent: '×', title: "Ce n'est pas une faute : retirer", onclick: (ev) => {
            ev.stopPropagation();
            p.errors = p.errors.filter((x) => x !== e);
            state.exported = false;
            renderViewer(); renderResults();
          } })),
        h('div', { class: 'fix' }, h('s', { textContent: e.text }), ' → ', h('b', { textContent: e.correction })),
        h('div', { class: 'muted small', textContent: e.explanation }),
        e.notion ? h('div', { class: 'faint small', textContent: `${L('Progression des apprentissages', 'Quebec curriculum')} : ${notionLabel(PDA_NOTIONS.find((x) => x.id === e.notion))}` }) : null);
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
  try { localStorage.setItem('ce.kind', kind); } catch { /* ignoré */ } // une prof du primaire retrouve l'onglet de la langue
  $('kind-content').classList.toggle('active', kind === 'content');
  $('kind-lang').classList.toggle('active', kind === 'lang');
  $('kind-content').setAttribute('aria-selected', String(kind === 'content'));
  $('kind-lang').setAttribute('aria-selected', String(kind === 'lang'));
  document.querySelector('.kind').dataset.active = kind;
  $('content-settings').hidden = kind !== 'content';
  $('lang-settings').hidden = kind !== 'lang';
  renderPda(); // exemples du primaire seulement en correction de la langue
  $('step1-title').textContent = kind === 'lang' ? 'Paramètres de la correction de la langue' : 'Paramètres de l’évaluation';
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
    const pda = langRes.some((r) => r.pda);
    const rows = [['N° copie', 'Fichier', 'Évaluation', 'Groupe', 'Élève', 'Fautes', ...keys.map((k) => CATS[k].label),
      ...(pda ? [L('Mots', 'Words'), L('% de fautes', '% errors'), L('Cote', 'Level')] : ['Note', 'Sur']), 'Détail des fautes']];
    for (const r of [...langRes].sort((x, y) => (x.no ?? 0) - (y.no ?? 0))) {
      const errs = r.pages.flatMap((p) => p.errors);
      const n = langGrade(r);
      const ok = counted(errs).filter((e) => !r.dup?.includes(e));
      rows.push([r.no ?? '', r.file || '', r.exam, r.group, r.name, n, ...keys.map((k) => ok.filter((e) => e.category === k).length),
        ...(pda ? [r.words ?? '', r.pct == null ? '' : num(Math.round(r.pct * 10) / 10), r.cote || '']
          : [r.grade == null ? '' : num(r.grade), r.grade == null ? '' : num(r.total)]),
        errs.map((e) => `${e.text} → ${e.correction} (${e.explanation})${e.doubtful ? ' [à vérifier, non comptée]' : ''}${e.grey ? L(' [notion en apprentissage : ne compte pas]', ' [being learned: not counted]') : ''}${r.dup?.includes(e) ? L(' [répétée : retenue une seule fois]', ' [repeated: counted once]') : ''}`).join(' | ')]);
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
  // Avec une grille : une colonne de points et une colonne de niveau par critère, nommées d'après la grille.
  const grid = perQuestion ? sorted.find((r) => r.grid)?.grid : null;
  const labelled = grid && grid.some((c) => c.levels.some((l) => l.label));
  const levelOf = (r, i) => r.grid?.[i]?.levels.find((l) => l.points === r.questions[i]?.points)?.label || '';
  const numbered = (q, i) => (/^\s*\d/.test(q.question) ? q.question : `${i + 1}. ${q.question}`); // « 1. Hypothèse » est déjà numéroté
  const qHeads = !perQuestion ? [] : grid ? shape.flatMap((q, i) => [`${numbered(q, i)} (/${num(q.max)})`, ...(labelled ? [`${numbered(q, i)} : niveau`] : [])])
    : shape.map((q, i) => `Q${i + 1} (/${num(q.max)})`);
  const rows = [['N° copie', 'Fichier', 'Évaluation', 'Groupe', 'Élève', 'Note', 'Sur', 'Pourcentage', ...qHeads, 'Fiabilité (%)', 'Détail par question', 'Commentaire', 'À vérifier']];
  for (const r of sorted) {
    const ok = r.grade != null;
    rows.push([r.no ?? '', r.file || '', r.exam, r.group, r.name, ok ? num(r.grade) : tr('Illisible'), num(r.total), ok ? num(Math.round((r.grade / r.total) * 1000) / 10) : '',
      ...(perQuestion ? shape.flatMap((_, i) => [ok && r.questions[i] ? num(r.questions[i].points) : '', ...(labelled ? [ok ? levelOf(r, i) : ''] : [])]) : []), r.reliability ?? '',
      r.questions.map((q) => `${q.question}${lang === 'en' ? ':' : ' :'} ${num(q.points)}/${num(q.max)}${q.points < q.max && q.justification ? ` (${q.justification})` : ''}`).join(' | '),
      r.comment, r.flags.join(' ')]);
  }
  downloadCSV(rows, '');
  state.exported = true;
}

// Une seule fenêtre, dans l'appli (et non trois boîtes du navigateur où un « OK » par réflexe effaçait la clé).
function endSession() {
  const has = state.results.length > 0;
  $('end-save').hidden = !has;
  $('end-warn').hidden = !has || state.exported;
  $('end-key').textContent = state.key || '';
  $('end-modal').hidden = false;
}
function finishSession(forget) {
  $('end-modal').hidden = true;
  // Ordinateur partagé : la clé mémorisée permettrait au suivant d'utiliser les pages restantes.
  Object.assign(state, { results: [], pages: [], rubricPages: [], status: {}, open: new Set(), exported: true, seq: 0, structure: null });
  $('mode').value = 'file'; $('per').value = ''; state.modeChosen = false;
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

// Pendant l'import, l'avancement s'affiche dans la zone de dépôt elle-même : sans signe de vie, on a tendance à
// glisser les fichiers une deuxième fois. Un fichier déjà en cours d'import est ignoré.
function dropzone(zone, input, onFiles) {
  const status = h('span', { class: 'import-status', 'aria-live': 'polite' });
  zone.append(status);
  const pending = new Set();
  let running = 0;
  const sig = (f) => `${f.name}|${f.size}|${f.lastModified}`;
  const take = async (list) => {
    const files = list.filter((f) => !pending.has(sig(f)));
    if (!files.length) { if (running) status.textContent = 'Déjà en cours d’importation, patientez…'; return; }
    files.forEach((f) => pending.add(sig(f)));
    running++;
    zone.classList.add('busy');
    status.textContent = files.length > 1 ? `Importation de ${files.length} fichiers…` : 'Importation…';
    try {
      await onFiles(files, (text) => { status.textContent = text; });
    } finally {
      files.forEach((f) => pending.delete(sig(f)));
      if (!--running) { zone.classList.remove('busy'); status.textContent = ''; }
    }
  };
  input.addEventListener('change', () => { take([...input.files]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
  zone.addEventListener('drop', (e) => { e.preventDefault(); take([...e.dataTransfer.files]); });
}

dropzone($('drop'), $('files'), async (files, progress) => {
  const added = await filesToPages(files, progress);
  state.pages.push(...added);
  // Regroupement choisi pour l'enseignant (il peut changer ensuite) : des photos ou fichiers d'une page = un élève
  // chacun ; un fichier de plusieurs pages (PDF du photocopieur) = on trouve où commence chaque copie.
  if (!state.modeChosen) $('mode').value = state.pages.some((p) => !p.firstOfFile) ? 'auto' : 'file';
  applyMode();
  if ($('mode').value === 'auto') { renderPages(); await detectCopies(); return; }
  renderPages();
  // Après la fin de l'import (la zone de dépôt reprend sa taille) : le bouton Corriger vient dans l'écran.
  if (!state.running) setTimeout(() => $('run').scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
});
dropzone($('rubric-drop'), $('rubric-files'), async (files, progress) => {
  const added = await filesToPages(files, progress);
  state.rubricPages.push(...added.map(({ id, url }) => ({ id, url })));
  if (state.rubricPages.length > MAX_RUBRIC_PAGES) {
    state.rubricPages.length = MAX_RUBRIC_PAGES;
    banner('err', `Corrigé limité à ${MAX_RUBRIC_PAGES} pages : les suivantes ont été ignorées.`);
  }
  renderRubric();
  if (byGrid() && !state.grid && added.length) makeGrid(); // la grille déposée est lue tout de suite
});
$('m-points').addEventListener('click', () => setMethod('points'));
$('m-grid').addEventListener('click', () => setMethod('grid'));

$('mode').addEventListener('change', () => {
  state.modeChosen = true;
  applyMode(); renderPages();
  if ($('mode').value === 'auto') detectCopies();
});
$('per').addEventListener('input', () => { applyMode(); renderPages(); });
// « Pages par élève » (obligatoire, section 1) : fixe le regroupement des copies. Le menu « Comment sont vos copies ? »
// reste en affichage avancé pour les cas particuliers (nombre de pages variable : « Trouver chaque copie pour moi »).
function applyPerStudent() {
  const v = Math.round(Number($('per-student').value));
  if (v >= 1) { $('mode').value = v === 1 ? 'file' : 'fixed'; $('per').value = v === 1 ? '' : String(v); state.modeChosen = true; }
  applyMode(); renderPages();
}
$('per-student').addEventListener('input', applyPerStudent);
$('clear-pages').addEventListener('click', () => { state.pages = []; state.status = {}; state.modeChosen = false; $('mode').value = 'file'; renderPages(); });
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
// Arrêter : plus aucune nouvelle copie ne part. Celles déjà envoyées se terminent (leurs pages sont déjà décomptées,
// autant recevoir leur résultat) ; les autres restent dans la liste, sans rien décompter.
$('stop-run').addEventListener('click', () => {
  state.stopping = true;
  $('stop-run').disabled = true;
  $('stop-run').textContent = tr('Arrêt en cours…');
  $('progress-eta').textContent = tr('Arrêt : les copies déjà parties se terminent…');
});
// Impression en lot : toutes les copies corrigées affichées (filtre de recherche compris), dans l'ordre de la pile.
const printable = () => {
  const q = $('search').value.trim().toLowerCase();
  return state.results.filter((r) => r.kind !== 'lang' && (!q || `${r.name} ${r.group} ${r.exam} ${r.file}`.toLowerCase().includes(q)))
    .sort((x, y) => (x.no ?? 0) - (y.no ?? 0));
};
$('print-all').addEventListener('click', () => {
  $('print-count').textContent = tr(`${printable().length} copie(s) corrigée(s)`);
  $('print-opts').hidden = false;
});
$('print-go').addEventListener('click', () => {
  const copies = $('print-copies').checked, results = $('print-results').checked;
  if (!copies && !results) return;
  $('print-opts').hidden = true;
  printBatch(printable(), { copies, results });
});
document.querySelectorAll('[data-close-print]').forEach((b) => b.addEventListener('click', () => { $('print-opts').hidden = true; }));
$('awake-ok').addEventListener('click', () => {
  $('awake').hidden = true;
  try { sessionStorage.setItem('ce.awake', '1'); } catch { /* ignoré */ }
  runAll();
});
$('calib-run').addEventListener('click', () => { if (!state.running) runAll(bundles().slice(0, CALIB_COPIES), true); });

$('run').addEventListener('click', () => {
  // Après une numérisation : dernière confirmation, avec le nombre de pages qui seront décomptées.
  if (camState.review) {
    const copies = bundles().length, pages = state.pages.length;
    const cost = pages * (state.kind === 'content' && $('deep').value === '1' ? 2 : 1);
    if (!confirm(tr(`${copies} copie(s), ${pages} page(s) : ${cost} page(s) seront décomptées. Lancer la correction ?`))) return;
    camState.review = false;
  }
  // Téléphone : le rappel « gardez l'écran allumé » est une ligne sous le bouton (une fenêtre de plus agaçait).
  runAll();
});
$('search').addEventListener('input', renderResults);
$('export').addEventListener('click', exportCSV);
$('end').addEventListener('click', endSession);
$('end-keep').addEventListener('click', () => finishSession(false));
$('end-forget').addEventListener('click', () => finishSession(true));
$('end-export').addEventListener('click', () => { exportCSV(); $('end-warn').hidden = true; });
$('end-print').addEventListener('click', () => { $('end-modal').hidden = true; $('print-all').click(); });
document.querySelectorAll('[data-close-end]').forEach((b) => b.addEventListener('click', () => { $('end-modal').hidden = true; }));

$('trial').addEventListener('click', () => startTrial());
$('trial-anyway').addEventListener('click', () => startTrial(true));
$('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await useKey($('key-input').value); maybeWelcome(); } catch (err) { showGate(err.message); }
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
// La fenêtre de la clé contient l'essentiel de l'accueil : pas de 2e fenêtre juste après.
document.querySelector('[data-close-newkey]').addEventListener('click', () => { $('newkey').hidden = true; try { localStorage.setItem('ce.welcome', '1'); } catch { /* ignoré */ } });
$('welcome-ok').addEventListener('click', () => { $('welcome').hidden = true; try { localStorage.setItem('ce.welcome', '1'); } catch { /* ignoré */ } });
$('newkey-copy').addEventListener('click', () => navigator.clipboard?.writeText($('newkey-value').textContent));

window.addEventListener('beforeunload', (e) => {
  if (state.running || (state.results.length && !state.exported)) e.preventDefault();
});

// Réglages de l'enseignant retenus d'une session à l'autre (dans ce navigateur seulement ; aucune donnée d'élève).
// Le corrigé tapé et le nom de l'évaluation ne sont gardés que jusqu'à la fermeture de l'onglet : assez pour corriger
// plusieurs groupes de suite, sans laisser le corrigé sur un ordinateur partagé. « Terminer la session » les efface aussi.
// Le regroupement des pages n'est pas retenu : il repart toujours d'un choix neutre.
const PREF_IDS = ['total', 'per-student', 'whole', 'deep', 'language', 'lang-level', 'pda-year', 'pda-once', 'pda-a', 'pda-b', 'pda-c', 'pda-d', 'lang-total', 'lang-per', 'lang-max', 'anon', 'anon-h', 'anon-all', 'out-lang'];
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
// Étape selon la date (calendrier scolaire du Québec) : 1re jusqu'à la mi-novembre, 2e jusqu'à février, 3e ensuite.
// Elle n'est pas mémorisée (absente de PREF_IDS) : elle avance d'elle-même avec l'année scolaire.
{ const d = new Date(), m = d.getMonth() + 1; $('pda-step').value = m >= 8 && (m < 11 || (m === 11 && d.getDate() <= 15)) ? '1' : m >= 11 || m <= 2 ? '2' : '3'; }
loadPrefs();
if ($('per-student').value) applyPerStudent();
$('anon-opts').hidden = !anonymous();
for (const id of [...PREF_IDS, ...TAB_IDS]) $(id).addEventListener('change', savePrefs);
['anon', 'anon-h', 'anon-all'].forEach((id) => $(id).addEventListener('change', () => { $('anon-opts').hidden = !anonymous(); renderPages(); }));
document.querySelectorAll('#lang-cats input').forEach((i) => i.addEventListener('change', savePrefs));
['pda-year', 'pda-step'].forEach((id) => $(id).addEventListener('change', () => { pdaOver = {}; savePda(); renderPda(); }));
$('lang-level').addEventListener('change', renderPda);
$('out-lang').addEventListener('change', renderPda);
$('pda-reset').addEventListener('click', () => { pdaOver = {}; savePda(); renderPda(); });
renderPda();

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

applyMethod();
try { if (localStorage.getItem('ce.kind') === 'lang') setKind('lang'); } catch { /* ignoré */ }
startI18n();
const saved = new URLSearchParams(location.search).get('key') || store.get();
if (new URLSearchParams(location.search).has('key')) history.replaceState(null, '', location.pathname);
if (saved) useKey(saved).then(maybeWelcome).catch((err) => { if (err.status === 401) store.del(); showGate(err.message); });
else showGate();
renderPages();
renderResults();

// Lien « J'ai une clé » de l'accueil : le curseur est déjà dans le champ de la clé.
if (location.hash === '#cle' && !$('gate').hidden) $('key-input').focus();
