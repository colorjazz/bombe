// Brûle la pile — application de l'enseignant.
// Les copies restent en mémoire dans cet onglet ; seule la clé d'accès est retenue sur l'appareil.

const MAX_SIDE = 2000;          // pixels, côté le plus long d'une page envoyée (précision du surlignage)
const JPEG_QUALITY = 0.85;
const MAX_PAGES_PER_COPY = 30;
const LONG_COPY = 10;            // au-delà, les pages sont réduites avant l'envoi (taille de la requête)
const MAX_RUBRIC_PAGES = 10;
const CONCURRENCY = 5;
const KEY_STORAGE = 'ce.accessKey';
const PDFJS = '/vendor/pdfjs'; // pdf.js 3.11.174, hébergé sur le site

import { t, tr, trTo, lang, startI18n } from './i18n.js';
import { refineToInk } from './boxes.js';
import { looksSideways, rotateDataUrl } from './orient.js';
import { startCamera } from './camera.js';
import { PDA_NOTIONS, PDA_SEC_NOTIONS, notionsFor, pdaDefault, cote } from './pda.js';
import { buildDocx } from './docx.js';

const $ = (id) => document.getElementById(id);
// Orthopédagogie (4e choix de « Vous enseignez au ») : correction de la langue + fiche du scripteur. Déclarée ici :
// setKind, appelée tôt au démarrage, s'en sert.
let ortho = false;
try { ortho = localStorage.getItem('ce.ortho') === '1'; } catch { /* ignoré */ }

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
    headers: { 'X-Lang': $('out-lang').value || lang, ...(state.qc && $('qc').checked ? { 'X-Region': 'qc' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && state.key ? { Authorization: `Bearer ${state.key}` } : {}) },
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
  b.dataset.buy = tr('Acheter');
  renderSummary();
}

async function useKey(key) {
  state.key = key.trim().toUpperCase();
  const data = await api('/api/balance');
  store.set(state.key);
  setBalance(data.pages);
  state.qc = !!data.qc; $('qc-field').hidden = !state.qc; // option offerte seulement si le serveur a la clé Vertex
  $('gate').hidden = true;
  $('app').hidden = false;
  $('buy-open').hidden = $('logout').hidden = $('invite-open').hidden = false;
}

function showGate(msg = '') {
  state.key = null;
  $('gate').hidden = false;
  $('app').hidden = true;
  $('balance').hidden = $('buy-open').hidden = $('logout').hidden = $('invite-open').hidden = true;
  $('gate-msg').textContent = msg;
}

// Accueil, une seule fois par appareil : les 3 étapes et les limites à connaître, avec un lien vers le guide.
function maybeWelcome() {
  let seen = false;
  try { seen = localStorage.getItem('ce.welcome') === '1'; } catch { /* ignoré */ }
  const langFirst = state.kind === 'lang'; // primaire : la fenêtre parle de la correction de la langue, pas d'un corrigé
  $('welcome-lang').hidden = !langFirst; $('welcome-copies').hidden = langFirst;
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
    const { url } = await api('/api/checkout', { method: 'POST', auth: false, body: { pack, key: state.key || undefined, ref: referralCode() || undefined } });
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
  tesseract: '/vendor/tesseract-5.1.1/tesseract.min.js',
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
  // Tableaux (grilles d'évaluation) : bordures et cellules lisibles ; sans elles, l'IA voyait un bloc de texte sans colonnes.
  sheet.querySelectorAll('table').forEach((t) => { t.style.cssText = 'border-collapse:collapse;width:100%;table-layout:fixed;margin:8px 0'; });
  sheet.querySelectorAll('td, th').forEach((c) => { c.style.cssText = 'border:1px solid #555;padding:4px 6px;vertical-align:top;font-size:12px;line-height:1.35;overflow-wrap:anywhere'; });
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

// Commentaires Word déjà présents dans le fichier (d'un correcteur, ou un Word annoté réimporté) : leurs renvois
// (« [CO1.1] ») et leur texte ne font pas partie de la copie de l'élève.
function stripWordComments(root) {
  root.querySelectorAll('a[href^="#comment"], a[id^="comment-ref"]').forEach((a) => (a.closest('sup') || a).remove());
  root.querySelectorAll('[id^="comment-"]').forEach((n) => n.closest('dl, dd, li') ? n.closest('dl, dd, li').remove() : n.remove());
}

// Word : le texte est mis en page en images ; une grande image collée dans le document (grille numérisée, photo)
// devient sa propre page en pleine résolution, au lieu d'être réduite à la largeur d'une page.
async function docxToJpegs(file) {
  await loadLib('mammoth');
  const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  if (!value.trim()) throw new Error('document vide');
  const tmp = document.createElement('div');
  tmp.innerHTML = value;
  stripWordComments(tmp);
  const big = [];
  for (const img of [...tmp.querySelectorAll('img')]) {
    const el = await loadImage(img.src).catch(() => null);
    if (el && Math.max(el.width, el.height) >= 900) { big.push(el); img.replaceWith(document.createTextNode(`[image ${big.length}, page à part]`)); }
  }
  const pages = tmp.textContent.replace(/\[image \d+, page à part\]/g, '').trim().length > 40 || !big.length ? await documentToJpegs(tmp.innerHTML) : [];
  for (const el of big) {
    const c = fitCanvas(el.width, el.height);
    c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    pages.push(canvasToJpeg(c));
  }
  return pages;
}

// Texte d'un document Word, tableaux compris (une ligne par rangée, cellules séparées par « | ») : pour lire une
// grille, le texte exact vaut mieux qu'une image.
async function docxToText(file) {
  await loadLib('mammoth');
  const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const tmp = document.createElement('div');
  tmp.innerHTML = value;
  stripWordComments(tmp);
  const lines = [];
  const walk = (node) => {
    for (const n of node.children) {
      if (n.tagName === 'TABLE') {
        for (const tr of n.querySelectorAll('tr')) lines.push(`| ${[...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ')} |`);
        lines.push('');
      } else if (/^(P|H[1-6]|LI)$/.test(n.tagName)) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) lines.push(n.tagName === 'LI' ? `- ${t}` : t); }
      else walk(n);
    }
  };
  walk(tmp);
  return lines.join('\n').trim();
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

// Raison d'un échec d'import, en mots simples (le détail technique va dans la console).
function fileTrouble(file) {
  if (isHeic(file)) return 'cette photo d’iPhone n’a pas pu être ouverte. Reprenez-la avec le bouton « Prendre les copies en photo », ou envoyez-la de nouveau.';
  if (ext(file) === 'pdf') return 'ce PDF n’a pas pu être ouvert (il est peut-être protégé par un mot de passe ou abîmé). Enregistrez-le de nouveau, puis réessayez.';
  if (file.type.startsWith('image/')) return 'cette photo est abîmée ou incomplète. Reprenez-la.';
  return 'ce fichier n’a pas pu être ouvert. Enregistrez-le en PDF, puis réessayez.';
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
        const docText = isDocx(file) ? await docxToText(file).catch(() => '') : await file.text();
        urls.forEach((url, i) => out.push({ id: uid(), url, file: file.name, firstOfFile: i === 0, ...(i === 0 && docText ? { docText } : {}) }));
      } else {
        errors.push(`${file.name} : ${tr(ext(file) === 'doc' ? 'ce type de fichier n’est pas accepté. Enregistrez-le en PDF ou en Word (.docx).' : 'ce type de fichier n’est pas accepté. Enregistrez-le en PDF.')}`);
      }
    } catch (err) {
      console.warn('Import impossible :', file.name, err);
      errors.push(`${file.name} : ${tr(fileTrouble(file))}`);
    }
  }
  if (out.length) progress('Vérification de l’orientation des pages…');
  const turned = await straighten(out);
  banner(errors.length ? 'err' : turned ? 'info' : '', errors.length ? `${tr(errors.length > 1 ? 'Ces fichiers n’ont pas pu être ajoutés' : 'Ce fichier n’a pas pu être ajouté')} — ${errors.join(' · ')}${out.length ? ` ${tr('Les autres sont prêts.')}` : ''}`
    : turned ? `${pl(turned, 'page photographiée de côté a été redressée', 'pages photographiées de côté ont été redressées')}. Vérifiez les miniatures (bouton ↻ pour pivoter).` : '');
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
// Nom masqué : la ligne « Nom : … » est repérée sur l'appareil (Tesseract, hébergé sur le site : rien n'est envoyé)
// et seule cette ligne est blanchie. Une bande fixe en haut de page cachait aussi le début des réponses sur les
// en-têtes courts, ou laissait passer le nom sur les en-têtes hauts. Nom introuvable (page de travers, pas de champ
// « Nom ») : repli sur la bande du haut, de la hauteur choisie dans les réglages.
const OCR_DIR = '/vendor/tesseract-5.1.1';
let ocrWorker = null;
const ocr = () => (ocrWorker ||= loadLib('tesseract')
  .then(() => window.Tesseract.createWorker('fra', 1, { workerPath: `${OCR_DIR}/worker.min.js`, corePath: OCR_DIR, langPath: OCR_DIR, gzip: false }))
  .catch((err) => { ocrWorker = null; throw err; }));
const NAME_LABEL = /^(nom|name|prénom|prenom)$/i;
const nameLines = new Map(); // url → [{ y0, y1 }] en fractions de la hauteur, ou null
function nameLine(url) {
  if (!nameLines.has(url)) nameLines.set(url, (async () => {
    try {
      const img = await loadImage(url);
      const k = Math.min(1, 1600 / img.width), w = Math.round(img.width * k), hh = Math.round(img.height * k * 0.45);
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      c.getContext('2d').drawImage(img, 0, 0, img.width, hh / k, 0, 0, w, hh);
      const { data } = await (await ocr()).recognize(c);
      const H = img.height * k;
      const hits = data.words.filter((x) => x.confidence >= 55 && NAME_LABEL.test(x.text.normalize('NFC').replace(/[^\p{L}]/gu, '')));
      // Le nom manuscrit déborde du libellé imprimé : la ligne est prise large (1,5 fois sa hauteur de chaque côté).
      return hits.length ? hits.map((x) => { const t = x.bbox.y1 - x.bbox.y0; return { y0: Math.max(0, (x.bbox.y0 - 1.5 * t) / H), y1: Math.min(1, (x.bbox.y1 + 1.5 * t) / H) }; }) : null;
    } catch { return null; }
  })());
  return nameLines.get(url);
}
// Zones masquées d'une page : la ligne du nom, sinon la bande du haut.
const maskZones = async (ref) => (await nameLine(ref)) || [{ y0: 0, y1: maskFrac(), fallback: true }];

// La ligne du nom, découpée sur la photo originale (elle ne quitte pas l'appareil), est montrée dans la fiche pour que
// l'enseignant tape le nom sans ouvrir la copie. Partie gauche de la page, là où s'écrit le nom.
const bands = new Map();
function nameBand(url) {
  if (!bands.has(url)) bands.set(url, (async () => {
    try {
      const img = await loadImage(url);
      const z = (await maskZones(url))[0];
      const y0 = img.height * z.y0, sh = img.height * (z.y1 - z.y0), sw = img.width * 0.7, w = 480;
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.max(1, Math.round((w * sh) / sw));
      c.getContext('2d').drawImage(img, 0, y0, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } catch { return null; }
  })());
  return bands.get(url);
}

// Image envoyée : les zones du nom blanchies. ref = la photo affichée, sur laquelle le nom a été repéré
// (l'image envoyée peut être une version plus grande de la même page).
function maskName(url, ref = url) {
  return Promise.all([maskZones(ref), loadImage(url)]).then(([zones, img]) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.fillStyle = '#fff';
    for (const z of zones) g.fillRect(0, Math.floor(c.height * z.y0), c.width, Math.ceil(c.height * (z.y1 - z.y0)));
    return c.toDataURL('image/jpeg', 0.9);
  });
}

// Page réduite (côté le plus long, qualité JPEG) : pour les travaux longs, la requête reste légère.
async function shrink(url, side, quality) {
  const img = await loadImage(url);
  const k = Math.min(1, side / Math.max(img.width, img.height));
  if (k === 1 && /^data:image\/jpeg/.test(url) && url.length < 400_000) return url;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
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

// Aperçu des zones masquées sur la miniature ; le repérage du nom se fait en arrière-plan, puis l'aperçu se met à jour.
function maskPreview(p) {
  if (p.zonesFor !== p.url) { p.zonesFor = p.url; p.zones = null; const u = p.url; nameLine(u).then((z) => { if (p.url === u) { p.zones = z || false; renderPages(); } }); }
  const zones = p.zones || [{ y0: 0, y1: maskFrac(), fallback: p.zones === false }];
  return zones.map((z) => h('div', { class: `mask-band ${z.fallback ? 'fallback' : ''}`, style: `top:${z.y0 * 100}%;height:${(z.y1 - z.y0) * 100}%`,
    title: z.fallback ? tr('« Nom » non repéré : le haut de la page est masqué. Vérifiez qu’aucune réponse ne s’y trouve.') : tr('Ligne du nom repérée : masquée, non envoyée') }));
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
        pages: await Promise.all(batch.map(async (p) => thumbnail(anonymous() ? await maskName(p.url) : p.url))), // page de début possible : toujours masquée
        previous: before ? await thumbnail(anonymous() ? await maskName(before.url) : before.url) : undefined,
      } });
      batch.forEach((p, j) => { p.autoStart = pages[j].startsNew; p.detectedName = pages[j].name; });
    }
    applyMode();
    if (!simpleContent()) banner('info', `${pl(bundles().length, 'copie trouvée', 'copies trouvées')}. Vérifiez que chaque copie correspond à un seul élève (cliquez sur une page pour l’agrandir) avant de corriger.`);
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
  $('pages-zone').hidden = !state.pages.length || (simpleContent() && !state.showPages);
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
        bi > 0 ? h('button', { class: 'btn ghost merge', type: 'button', textContent: '↑ Même élève', title: 'Même élève que la copie au-dessus : les réunir', disabled: state.running,
          onclick: () => { b[0].startsNew = false; b[0].autoStart = false; renderPages(); } }) : null),
      h('div', { class: 'bundle-pages' }, b.map((p, pi) => [
        pi > 0 ? h('button', { class: 'split', type: 'button', title: 'Séparer : une nouvelle copie commence ici', textContent: '✂', disabled: state.running,
          onclick: () => { p.startsNew = true; p.autoStart = true; renderPages(); } }) : null,
        h('div', { class: 'thumb', title: p.file },
          ...(masked(pi) ? maskPreview(p) : []),
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
    h('b', { textContent: String(n) }), ` ${tr(n > 1 ? 'pages' : 'page')}`] : [ortho && state.kind === 'lang' ? (state.results.length ? '✓ Tous les textes importés sont analysés.' : 'Aucun texte importé') : tr(state.results.length ? '✓ Toutes les copies importées sont corrigées.' : 'Aucune copie importée')]));
  const cost = n * (state.kind === 'content' && $('deep').value === '1' ? 2 : 1);
  $('cost').textContent = n ? (cost > 1 ? `${cost} pages seront décomptées` : '1 page sera décomptée') : '';
  const enough = state.pagesLeft == null || state.pagesLeft >= cost;
  const run = $('run');
  const gridSum = state.grid ? state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0) : null;
  const gridOk = state.kind === 'lang' || gridSum == null || Math.abs(gridSum - Number($('total').value)) < 1e-9;
  // Le nombre de points et les pages par élève ne servent qu'à la correction de copies (champs cachés en mode langue).
  const simple = simpleContent();
  const needGrid = byGrid() && !state.grid; // avec une grille : la grille lue fixe le total
  const needYear = state.kind === 'lang' && isPda() && !$('pda-year').value;
  const needTotal = state.kind === 'content' && !simple && !needGrid && !(Number($('total').value) > 0);
  run.disabled = state.running || state.detecting || !n || !grouped || tooLong || !enough || !gridOk || needTotal || needGrid || needYear || state.reading
    || (state.kind === 'content' && !simple && !(Number($('per-student').value) >= 1));
  run.textContent = state.running ? (state.kind === 'lang' ? 'Analyse en cours…' : 'Correction en cours…')
    : state.detecting ? 'Analyse des copies en cours…'
    : n && state.reading ? 'Lecture de la grille…'
    : n && needGrid ? 'Ajoutez votre grille (section 1)'
    : n && needYear ? (ortho && state.kind === 'lang' ? 'Choisissez l’année des élèves (réglages)' : 'Choisissez l’année de vos élèves (section 1)')
    : n && needTotal ? 'Indiquez le nombre de points'
    : n && state.kind === 'content' && !simple && !(Number($('per-student').value) >= 1) ? 'Indiquez le nombre de pages par élève'
    : n && !grouped ? 'Indiquez le nombre de pages par élève'
    : !enough ? 'Solde insuffisant : rechargez votre compte'
    : n && !gridOk ? `La grille totalise ${fmt(gridSum)} points au lieu de ${fmt(Number($('total').value))}`
    : ortho && state.kind === 'lang' ? (orthoIntent === 'evolution' ? 'Analyser et suivre l’évolution' : n ? `Analyser ${pl(list.length, 'texte', 'textes')}` : 'Analyser')
    : n ? `${state.kind === 'lang' ? 'Analyser la langue de' : 'Corriger'} ${pl(list.length, 'copie', 'copies')}` : 'Corriger';
  renderReady(list, n, cost);
  $('demo-btn').hidden = !!(state.results.length || n || state.running || (ortho && state.kind === 'lang'));
  // Pas de résultats : ni recherche ni « Terminer » ; sur téléphone, la section entière attend la 1re copie corrigée.
  $('app').classList.toggle('no-results', !state.results.length && !state.running);
  $('export').disabled = $('end').disabled = state.running || !state.results.length;
  // Pas de gros bouton vert tant qu'il n'y a rien à télécharger.
  $('export').hidden = $('print-all').hidden = !state.results.length;
  // Correction de la langue : pas d'impression groupée (chaque copie annotée s'imprime depuis sa vue), et un résumé plutôt que des notes.
  if (state.kind === 'lang') $('print-all').hidden = true;
  $('export-fiches').hidden = !state.results.some((r) => r.ortho && r.profile);
  const toDo = state.results.filter((r) => r.ortho && r.evo !== 'prev' && !r.profile && !r.profileBusy).length; // un texte précédent n'a pas besoin de profil
  $('profile-all').hidden = toDo < 2 || orthoIntent === 'evolution'; // un seul élève : son bouton dans la carte suffit ; évolution : le profil s'établit seul
  $('profile-all').textContent = `Établir les ${toDo} profils`;
  $('export').textContent = tr(state.kind === 'lang' ? 'Télécharger le résumé des fautes (Excel)' : 'Télécharger les notes (Excel)');
  $('print-all').disabled = state.running || !state.results.some((r) => r.kind !== 'lang');
  renderCalib();
}

// ---------- Mode simple ----------
// Correction des copies en mode simple : pas de section 1. L'enseignant dépose tout au même endroit (copies, et
// corrigé ou grille), l'appli reconnaît chaque fichier, lit la grille, trouve chaque copie et le barème.
// Le mode avancé garde tous les réglages ; il ne fait que préciser ce que le mode simple a deviné.
const simpleContent = () => state.kind === 'content' && !uiAdv();

// Résumé « C'est prêt » : ce que l'appli a compris, chaque ligne vérifiable (« Voir »).
function renderReady(list, n, cost) {
  const box = $('ready');
  box.hidden = !simpleContent() || !(n || state.rubricPages.length);
  if (box.hidden) return;
  // ok : true (✓), false (!) ou 'wait' (en cours).
  const line = (ok, title, sub, onSee, seeLabel = 'Voir') => h('div', { class: 'ready-line' }, ok === 'wait' ? h('span', { class: 'wait' }, h('i', { class: 'spinner' })) : h('span', { class: ok ? 'ok' : 'warn', textContent: ok ? '✓' : '!' }),
    h('div', {}, h('b', { textContent: tr(title) }), sub ? h('div', { class: 'muted small', textContent: tr(sub) }) : null),
    onSee ? h('button', { class: 'link', type: 'button', textContent: tr(seeLabel), onclick: onSee }) : null);
  const seeRubric = () => { setUiMode(true); setTimeout(() => ($('grid-editor').hidden ? $('rubric-thumbs') : $('grid-editor')).scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const gridSum = state.grid ? state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0) : 0;
  const key = state.reading ? line(true, 'Lecture de la grille…', `${pl(state.rubricPages.length, 'page', 'pages')}`)
    : state.grid ? line(true, 'Grille lue', `${pl(state.grid.length, 'critère', 'critères')} · ${fmt(gridSum)} points`, seeRubric)
    : state.rubricPages.length ? line(true, 'Corrigé ajouté', Number($('total').value) > 0 ? `${fmt(Number($('total').value))} points` : 'barème lu sur les copies', seeRubric)
    : line(false, 'Sans votre corrigé', 'les notes risquent d’être un peu généreuses. Pour des notes plus justes, ajoutez votre corrigé ou votre grille au même endroit.');
  // Pendant la recherche des copies, pas de nombre (il serait faux) : une ligne « en cours ».
  const copiesLine = state.detecting ? line('wait', 'Je repère où commence chaque copie…', `${pl(n, 'page', 'pages')} · gratuit, quelques secondes`)
    : line(true, `${pl(list.length, 'copie trouvée', 'copies trouvées')}`, `${pl(n, 'page', 'pages')}${cost && state.pagesLeft != null && state.pagesLeft >= cost ? ` · il vous restera ${pl(state.pagesLeft - cost, 'page', 'pages')}` : ''}`,
      () => { state.showPages = !state.showPages; renderPages(); if (state.showPages) $('pages-zone').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  // Noms : masqués par défaut (Loi 25) ; c'est l'enseignant qui choisit de les faire lire par l'IA, en connaissance de cause.
  const setAnon = (on) => { $('anon').checked = on; $('anon').dispatchEvent(new Event('change')); renderSummary(); };
  const names = !n ? null : anonymous()
    ? line(true, 'Noms masqués', 'sur votre appareil, avant l’envoi : vous tapez les noms après la correction', () => {
      if (confirm(tr('Faire lire les noms par l’IA ?\n\nLe nom de chaque élève sera envoyé avec sa copie, et rempli automatiquement dans les résultats. Assurez-vous d’en avoir l’autorisation de votre école (Loi 25).'))) setAnon(false);
    }, 'Lire les noms')
    : line(false, 'Noms lus par l’IA', 'le nom de l’élève est envoyé avec sa copie', () => setAnon(true), 'Masquer');
  box.replaceChildren(...[h('b', { class: 'ready-title', textContent: tr(!n ? (state.results.length ? 'D’autres copies ? Déposez-les ici' : 'Déposez maintenant les copies') : state.detecting ? 'Un instant…' : 'C’est prêt') }), key,
    n ? copiesLine : null, names].filter(Boolean)); // replaceChildren afficherait « null »
}

// Dépôt unique (mode simple) : chaque fichier est classé grille, corrigé ou copie (gratuit), d'après sa 1re page.
async function sortDrop(added) {
  const byFile = [];
  for (const p of added) { const last = byFile.at(-1); if (last && last.name === p.file && !p.firstOfFile) last.pages.push(p); else byFile.push({ name: p.file, pages: [p] }); }
  let types = byFile.map(() => ({ type: 'copie', total: 0 }));
  try { ({ types } = await api('/api/classify', { method: 'POST', body: { files: await Promise.all(byFile.map(async (f) => ({ page: await thumbnail(f.pages[0].url, 640) }))) } })); } catch { /* en cas d'échec : des copies */ }
  const copies = [], keys = [];
  byFile.forEach((f, k) => (['grille', 'corrige'].includes(types[k]?.type) ? keys : copies).push({ ...f, ...types[k] }));
  if (keys.length) {
    state.rubricPages.push(...keys.flatMap((f) => f.pages.map(({ id, url, docText, file }) => ({ id, url, docText, file }))).slice(0, MAX_RUBRIC_PAGES));
    const total = keys.find((f) => f.total > 0)?.total;
    if (total && !(Number($('total').value) > 0)) $('total').value = String(total);
    setMethod(keys.some((f) => f.type === 'grille') ? 'grid' : 'points');
    renderRubric();
    banner('info', keys.map((f) => `« ${f.name} » : ${f.type === 'grille' ? 'grille d’évaluation' : 'corrigé'}`).join(' · ') + ' (pas facturé). Ce n’est pas ça ? Passez en mode avancé.');
    if (byGrid() && !state.grid) makeGrid();
  } else if (byGrid() && !state.grid) setMethod('points'); // pas de grille déposée : correction par points
  return copies.flatMap((f) => f.pages);
}

function renderRubric() {
  $('rubric-thumbs').replaceChildren(...state.rubricPages.map((p) => h('div', { class: 'thumb' },
    h('img', { src: p.url, alt: tr('Corrigé'), title: tr('Agrandir'), style: 'cursor:zoom-in', onclick: () => openZoom(state.rubricPages.map((x) => x.url), tr(byGrid() ? 'Grille' : 'Corrigé')) }),
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
  // Grille vérifiée : repliable (elle reste appliquée), et repliée d'office au lancement de la correction.
  $('grid-fold').textContent = tr(state.gridFolded ? 'Afficher la grille ▾' : 'Replier ▴');
  $('grid-help').hidden = $('grid-criteria').hidden = !!state.gridFolded;
  const row = (c, l) => h('div', { class: 'lvl' },
    h('input', { type: 'text', class: 'lvl-label', value: l.label || '', placeholder: '—', 'aria-label': 'Niveau', title: 'Niveau (A, B, 4…)', oninput: (e) => { l.label = e.target.value.trim(); } }),
    h('input', { type: 'text', class: 'num', value: ptsText(l), 'aria-label': 'Points du niveau', title: 'Points (ou une plage : 18-20)',
      onchange: (e) => {
        const [a, b] = e.target.value.split(/\s*(?:[-–]|à|to)\s*/).map((x) => Math.max(0, Math.min(c.max, toNumber(x) || 0)));
        if (b != null && b > a) { l.min = a; l.points = b; } else { delete l.min; l.points = a; }
        e.target.value = ptsText(l);
      } }),
    h('textarea', { rows: 2, value: l.description, 'aria-label': 'Description du niveau', oninput: (e) => { l.description = e.target.value; } }),
    h('button', { class: 'icon-btn', type: 'button', textContent: '×', title: 'Retirer ce niveau', onclick: () => { c.levels = c.levels.filter((x) => x !== l); renderGrid(); } }));
  $('grid-criteria').replaceChildren(conversionBox(), ...state.grid.map((c, i) => h('div', { class: 'crit' },
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

// Rendu des résultats avec une grille : par lettres (le niveau de chaque critère, et une cote globale) ou par points.
// Les points restent calculés en coulisse (conversion de la grille) : ils donnent la cote globale.
const labelled = (grid) => !!grid?.some((c) => c.levels.some((l) => l.label));
// Par défaut, le rendu suit la grille : une grille écrite en points s'affiche en points, une grille de cotes en lettres.
// Le choix de l'enseignant est retenu pour ce type de grille.
const renderKey = () => `ce.render.${state.gridPoints ? 'p' : 'l'}`;
const renderMode = () => {
  if (!labelled(state.grid)) return 'points';
  let pref = null;
  try { pref = localStorage.getItem(renderKey()); } catch { /* ignoré */ }
  // Au cégep, on attend une note sur 100 : les points par défaut, même avec des niveaux nommés (Excellent, Bien…).
  return pref || (state.gridPoints || $('lang-level').value === 'cegep' ? 'points' : 'letters');
};
const byLetters = (r) => r.render === 'letters' && labelled(r.grid);
// Niveau d'un critère : celui de la grille dont les points sont les plus proches.
// Niveau en plage (« A : 18 à 20 ») : celui qui contient les points.
const inLevel = (l, pts) => (l.min != null ? pts >= l.min - 1e-9 && pts <= l.points + 1e-9 : Math.abs(l.points - pts) < 1e-9);
const ptsText = (l) => (l.min != null ? `${fmt(l.min)}–${fmt(l.points)}` : fmt(l.points));
function levelOf(r, i, points) {
  const lv = r.grid?.[i]?.levels?.filter((l) => l.label) || [];
  const hit = lv.find((l) => inLevel(l, points));
  if (hit) return hit.label;
  return lv.length ? lv.reduce((a, l) => (Math.abs(l.points - points) < Math.abs(a.points - points) ? l : a)).label : fmt(points);
}
// Cote globale : le niveau dont le pourcentage (table de conversion de la grille) est le plus proche du total obtenu.
function globalLetter(r) {
  const pct = (100 * r.grade) / r.total, table = new Map();
  r.grid.forEach((c) => c.levels.forEach((l) => { if (l.label && c.max > 0) (table.get(l.label) || table.set(l.label, []).get(l.label)).push((100 * l.points) / c.max); }));
  let best = null;
  for (const [label, v] of table) { const m = v.reduce((a, x) => a + x, 0) / v.length; if (!best || Math.abs(m - pct) < Math.abs(best.m - pct)) best = { label, m }; }
  return best?.label ?? fmt(r.grade);
}
// Rendu par lettres : les points cités par l'IA dans la justification (« Niveau C retenu (12/20) ») sont retirés.
const noPoints = (t) => String(t || '').replace(/\s*\((?:\d+(?:[.,]\d+)?\s*(?:\/\s*\d+(?:[.,]\d+)?|pts?|points?))\)/gi, '');
const edited = (q) => q.ai != null && q.points !== q.ai; // note changée par l'enseignant
const markText = (r) => (r.grade == null ? null : byLetters(r) ? globalLetter(r) : `${fmt(r.grade)} / ${fmt(r.total)}`);
const qMarkText = (r, q, i) => (byLetters(r) ? levelOf(r, i, q.points) : `${fmt(q.points)} / ${fmt(q.max)}`);

// Conversion des niveaux en points, commune à toute la grille : « Acceptable (C) = 60 % » donne 6 sur un critère de 10 et
// 12 sur un critère de 20. Les grilles d'école ont leur propre table (souvent non linéaire) ; la changer ici évite de
// corriger les points niveau par niveau dans chaque critère. Le pourcentage affiché est déduit des points actuels.
function conversionBox() {
  const labels = [];
  for (const c of state.grid) for (const l of c.levels) if (l.label && !labels.includes(l.label)) labels.push(l.label);
  if (labels.length < 2) return null;
  const pctOf = (label) => {
    const v = state.grid.flatMap((c) => c.levels.filter((l) => l.label === label && c.max > 0).map((l) => (100 * l.points) / c.max)).sort((x, y) => x - y);
    return v.length ? Math.round(v[Math.floor(v.length / 2)] * 10) / 10 : 0;
  };
  const unit = $('whole').value === '1' ? 1 : 0.5;
  const apply = (label, pct) => {
    for (const c of state.grid) for (const l of c.levels) if (l.label === label) {
      const top = Math.min(c.max, Math.max(0, Math.round((c.max * pct) / 100 / unit) * unit));
      if (l.min != null) l.min = Math.min(top, Math.round(((l.min * top) / (l.points || 1)) / unit) * unit); // la plage suit
      l.points = top;
    }
    setTimeout(renderGrid, 0); // après la fin de l'événement : redessiner pendant « change » casse le champ qui perd le focus
  };
  const ex = state.grid.find((c) => c.max > 0);
  const mode = renderMode();
  const pick = (m) => { try { localStorage.setItem(renderKey(), m); } catch { /* ignoré */ } renderGrid(); };
  return h('div', { class: 'conv' },
    h('div', { class: 'render-row' }, h('b', { textContent: 'Résultats affichés' }),
      h('div', { class: 'seg' }, h('button', { type: 'button', textContent: 'Par lettres', 'aria-pressed': String(mode === 'letters'), onclick: () => pick('letters') }),
        h('button', { type: 'button', textContent: 'Par points', 'aria-pressed': String(mode === 'points'), onclick: () => pick('points') }))),
    h('b', { textContent: 'Conversion des niveaux en points (pour tous les critères)' }),
    h('div', { class: 'conv-rows' }, ...labels.map((label) => h('label', { class: 'conv-row' }, h('b', { textContent: label }),
      h('input', { type: 'text', inputMode: 'decimal', class: 'num', value: fmt(pctOf(label)), 'aria-label': `${label} : pourcentage des points du critère`,
        onchange: (e) => apply(label, Math.max(0, Math.min(100, toNumber(e.target.value) || 0))) }), '%'))),
    h('span', { class: 'muted small', textContent: `Entrez la table de votre grille : le pourcentage des points du critère pour chaque niveau.${ex ? ` Ex. : sur ${fmt(ex.max)} points, ${labels[0]} = ${fmt(ex.levels.find((l) => l.label === labels[0])?.points ?? ex.max)}.` : ''}` }));
}

// « Avec une grille » : l'IA recopie la grille de l'enseignant telle quelle (critères, niveaux, points).
// Sinon : elle rédige une grille détaillée à partir des consignes et du corrigé.
// Consignes tapées + texte exact des grilles importées en Word ou en texte.
const rubricText = () => [$('rubric').value.trim(), ...state.rubricPages.filter((p) => p.docText).map((p) => `TEXTE DU FICHIER « ${p.file} » :\n${p.docText}`)].filter(Boolean).join('\n\n');

async function makeGrid() {
  if (state.grid && !confirm(tr('Remplacer la grille actuelle par une nouvelle ?'))) return;
  const copy = byGrid();
  if (copy && !state.rubricPages.length && !$('rubric').value.trim()) { banner('err', 'Ajoutez d’abord votre grille : glissez-la dans la zone, ou tapez-la dans l’encadré.'); return; }
  const btn = $('make-grid');
  btn.disabled = true;
  state.reading = true;
  const n = state.rubricPages.length;
  btn.textContent = copy ? (n > 2 ? `Un instant, lecture de la grille (${n} pages, environ ${n > 5 ? 'une minute' : '30 secondes'})…` : 'Un instant, lecture de la grille…') : 'Un instant, l’IA prépare la grille…';
  $('grid-error').hidden = true;
  renderSummary();
  try {
    const { grid, pointsWritten } = await api('/api/rubric', { method: 'POST', body: {
      rubric: rubricText(), rubricPages: state.rubricPages.map((p) => p.url), copy,
      total: copy ? undefined : Number($('total').value), wholePoints: $('whole').value === '1',
    } });
    state.grid = grid.map((c) => ({ ...c, name: cleanText(c.name), levels: c.levels.map((l) => ({ ...l, label: cleanText(l.label || ''), description: cleanText(l.description) })) }));
    state.gridFromCopy = copy;
    state.gridFolded = false;
    state.gridPoints = pointsWritten !== false;
    banner('info', copy ? 'Grille lue : vérifiez qu’elle est identique à la vôtre et corrigez au besoin. Elle sera appliquée à toutes les copies.'
      : 'Grille préparée : relisez-la et ajustez au besoin. Elle sera appliquée à toutes les copies.');
    if (copy) setTimeout(() => $('grid-editor').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } catch (err) {
    // Sous le bouton, là où l'enseignant regarde (le bandeau général est plus bas, dans la section des copies).
    $('grid-error').textContent = `⚠ ${tr(err.message)}`;
    $('grid-error').hidden = false;
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
  // Textes déposés sans choisir de tâche : groupe s'il y en a plusieurs, sinon un élève (les options du haut suivent).
  if (ortho && state.kind === 'lang' && !orthoIntent) { orthoIntent = bundles().length > 1 ? 'groupe' : 'eleve'; try { localStorage.setItem('ce.orthoIntent', orthoIntent); } catch { /* ignoré */ } orthoTitles(); }
  state.evoBatch = (state.evoBatch || 0) + 1;
  const evoDoc = state.evoDoc; // ancienne fiche importée pour « Suivre l'évolution »
  renderDash();
  if (state.grid && byGrid() && !state.gridFolded) { state.gridFolded = true; renderGrid(); }
  state.stopping = false;
  $('stop-run').disabled = false;
  $('stop-run').textContent = tr('Arrêter');
  keepAwake(true);
  list.forEach((b) => { state.status[b[0].id] = null; });
  $('done-msg').hidden = true; $('adjust').hidden = true;
  if (state.results.some((r) => r.demo)) state.results = state.results.filter((r) => !r.demo); // l'exemple laisse la place aux vraies copies
  banner();
  renderPages();

  const settings = {
    exam: $('exam').value.trim(),
    group: $('group').value.trim(),
    total: Number($('total').value),
    // Mode simple, sans grille ni barème tapé : l'IA prend les points indiqués sur la copie ou le corrigé.
    autoTotal: simpleContent() && !state.grid && !(Number($('total').value) > 0),
    wholePoints: $('whole').value === '1',
    deep: $('deep').value === '1',
    checkLanguage: $('language').checked,
    rubric: state.grid && byGrid() ? $('rubric').value.trim() : rubricText(), // corrigé en Word : son texte exact aide à lire les réponses
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
    $('progress-count').textContent = `Correction : ${finished} / ${pl(list.length, 'copie', 'copies')}`;
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
        const res = { kind: 'lang', id, no: b[0].no, file: b[0].file, exam: settings.exam, group: r.group || settings.group, name: r.name, pageCount: b.length, band: anonymous() ? maskFrac() : 0,
          pages: b.map((p, i) => ({ url: p.url, errors: r.pages[i].errors, failed: !!r.pages[i].failed, reread: r.pages[i].reread, sent: r.urls[i], words: r.pages[i].words, text: r.pages[i].text })),
          scoring: langScoring(), pda: pdaScoring(), ortho: isOrtho(), level: $('lang-level').value, conditions: isOrtho() ? orthoConditions() : [],
          ...(isOrtho() && b[0].evo ? { evo: b[0].evo, evoBatch: state.evoBatch, evoDoc: b[0].evo === 'new' ? evoDoc : null } : {}),
          flags: r.failedPages ? [`${r.failedPages} page(s) n'ont pas pu être analysées (non décomptées).`] : [] };
        langGrade(res);
        state.results.unshift(res);
        reread(res);
      } else {
      const pages = await Promise.all(b.map(async (p, i) => {
        const url = masked(i) ? await maskName(p.url) : p.url;
        return b.length > LONG_COPY ? shrink(url, 1500, 0.72) : url; // travail long : ~250 Ko par page
      }));
      const r = await withRetry(() => api('/api/grade', { method: 'POST', body: { ...settings, pages, structure: state.structure?.list, avoid: openings(examKey) } }), waiting);
      // 1re copie bien corrigée avec un corrigé : ses questions servent de modèle pour les suivantes. Elles sont
      // découpées pareil, et les deux corrections du mode approfondi partent en même temps (deux fois plus rapide).
      // Seulement si les points maximum totalisent le barème : une question oubliée ne se propage pas.
      // Sans corrigé aussi : sinon chaque copie recevait son propre découpage (pas les mêmes points pour une même question).
      const refTotal = settings.total > 0 ? settings.total : r.total;
      if (!state.structure && !settings.grid && !r.illegible && r.questions.length && refTotal > 0
        && Math.abs(r.questions.reduce((x, q) => x + q.max, 0) - refTotal) < 1e-9) {
        state.structure = { key: examKey, list: r.questions.map((q) => ({ name: q.question, max: q.max })) };
      }
      setBalance(r.pagesLeft);
      // Barème trouvé par l'IA sur la 1re copie : les suivantes sont corrigées sur le même total.
      if (settings.autoTotal && !r.illegible && r.total > 0 && !(Number($('total').value) > 0)) { $('total').value = String(r.total); settings.total = r.total; settings.autoTotal = false; }
      state.results.unshift({
        id, no: b[0].no, file: b[0].file, pageUrls: b.map((p) => p.url), band: anonymous() ? maskFrac() : 0, exam: settings.exam, group: r.group || settings.group, name: r.name, reliability: r.reliability, grade: r.grade, total: r.total,
        // `ai` : la note proposée, pour repérer celles que l'enseignant change (calibrage).
        unit: settings.wholePoints ? 1 : 0.5, questions: r.questions.map((q) => ({ ...q, ai: r.illegible ? null : q.points })), examKey, lang: settings.outLang,
        grid: settings.grid && settings.grid.length === r.questions.length ? structuredClone(settings.grid) : null, // niveaux par critère
        render: settings.grid ? renderMode() : 'points',
        comment: r.comment, pageCount: b.length, illegible: !!r.illegible,
        flags: r.flags, noKey: !hasKey, // sans corrigé : une seule mention après la correction, pas un ⚠ sur chaque copie
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
  // Sans corrigé : la 1re copie passe seule ; son découpage et son barème servent ensuite à toutes les autres.
  else if (state.kind === 'content' && !hasKey && !settings.grid && !state.structure && list.length > 1) await one(list[next++]);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  clearInterval(timer);
  $('progress').hidden = true;
  state.running = false;
  foldOpen.s2 = false; // l'ajout se replie : le tableau de bord prend la place
  if (state.evoDoc || $('evo-prev-name').textContent || $('evo-new-name').textContent) { // zones vidées pour l'élève suivant
    state.evoDoc = null; $('evo-prev-name').textContent = $('evo-new-name').textContent = $('evo-doc-name').textContent = '';
  }
  keepAwake(false);
  renderPages();
  if (stop) banner('err', stop);
  else if (state.stopping) banner('info', `Correction arrêtée : ${pl(done, 'copie corrigée', 'copies corrigées')}. Les ${list.length - done} autres restent dans la liste : relancez quand vous voulez.`);
  else if (failed) banner('err', `${pl(done, 'copie corrigée', 'copies corrigées')}, ${failed} en erreur : elles restent dans la liste, relancez pour réessayer.`);
  else if (state.kind === 'lang') banner('ok', `${pl(done, 'copie analysée', 'copies analysées')}.${state.results.some((r) => r.flags?.length) ? ' Vérifiez en priorité les copies marquées ⚠.' : ''}`);
  else if (calibrating) banner('ok', `${pl(done, 'copie corrigée', 'copies corrigées')} pour le calibrage. Relisez-les et changez les notes qui ne vous conviennent pas (la raison est facultative), puis cliquez sur « Corriger » : vos ajustements guideront le reste de la pile.`);
  else if (!hasKey && simpleContent()) banner(); // dit sous les résultats (done-msg)
  else if (!hasKey) banner('info', `${pl(done, 'copie corrigée', 'copies corrigées')} sans votre corrigé : les notes risquent d’être un peu généreuses. Relisez-les, ou ajoutez votre corrigé pour des notes plus justes.`);
  else banner('ok', `${pl(done, 'copie corrigée', 'copies corrigées')}.${state.results.some((r) => r.flags?.length) ? ' Vérifiez en priorité les copies marquées ⚠.' : ''}`);
  // Les résultats sont dans l'autre colonne (ou plus bas sur téléphone) : on y emmène l'enseignant, 1re copie ouverte.
  if (done && !stop) {
    const first = state.results.find((r) => list.some((b) => b[0].id === r.id));
    if (first && !state.open.size) { state.open.add(first.id); renderResults(); }
    $('done-msg').hidden = false;
    $('done-msg').textContent = ortho && state.kind === 'lang'
      ? orthoIntent === 'evolution' ? `✓ ${pl(done, 'texte analysé', 'textes analysés')}. Le suivi s’enchaîne seul (relecture, profil, comparaison) : suivez les étapes dans le tableau de bord.`
        : `✓ ${pl(done, 'texte analysé', 'textes analysés')}. Relisez les erreurs dans ${done > 1 ? 'chaque copie annotée' : 'la copie annotée'} (retirez les fausses, ajoutez les oubliées), puis « ${{ groupe: 'Établir les profils du groupe', pi: 'Établir le bilan pour le PI' }[orthoIntent] || 'Établir le profil'} ».`
      : state.kind === 'lang'
      ? `✓ ${pl(done, 'copie analysée', 'copies analysées')}. Ouvrez une copie annotée pour voir les fautes surlignées ; retirez celles qui n'en sont pas, ajoutez celles qui manquent.`
      : byGrid() && renderMode() === 'letters' ? `✓ ${pl(done, 'copie corrigée', 'copies corrigées')}. Ouvrez une copie pour voir et modifier ses niveaux. En rose : les critères sous le niveau le plus élevé.`
      : byGrid() ? `✓ ${pl(done, 'copie corrigée', 'copies corrigées')}. Ouvrez une copie pour voir et modifier ses niveaux. En rose : les critères où des points ont été retirés.`
      : `✓ ${pl(done, 'copie corrigée', 'copies corrigées')}. Ouvrez une copie pour voir et modifier sa note. En rose : les questions où des points ont été retirés.${hasKey ? '' : ' Sans votre corrigé, les notes risquent d’être un peu généreuses : relisez-les.'}`;
    // Pas d'accord : dire tout de suite qu'on peut corriger l'IA ou changer les réglages (sinon on conclut « ça corrige mal »).
    const toSettings = (e) => { e.preventDefault(); setUiMode(true); $('app').querySelector('.s1').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('adjust').replaceChildren(h('b', { textContent: tr('Pas d’accord ? ') }),
      tr(state.kind === 'lang' ? 'Dans la copie annotée, le × retire une fausse faute et « + Ajouter une faute » en ajoute une. Pour une correction plus ou moins sévère, ou une autre année : '
        : 'Ouvrez une copie et touchez « Modifier les notes » : chaque point se change. Pour tout recorriger autrement (barème, demi-points, sévérité, double correction) : '),
      h('a', { href: '#', textContent: tr('changer les réglages'), onclick: toSettings }), '.');
    $('adjust').hidden = false;
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
  // Rendu par lettres : la répartition des cotes plutôt qu'une moyenne en pourcentage.
  const letters = graded.every(byLetters);
  const spread = () => {
    const n = new Map();
    for (const r of graded) { const g = globalLetter(r); n.set(g, (n.get(g) || 0) + 1); }
    const order = graded[0].grid.flatMap((c) => c.levels.map((l) => l.label)).filter((l, k, a) => l && a.indexOf(l) === k);
    return [...n].sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0])).map(([g, k]) => `${g} : ${k}`).join(' · ');
  };
  // Fiabilité : seulement en correction approfondie (sinon « — » inquiète sans rien dire).
  $('stats').replaceChildren(...[stat(String(graded.length), 'copies'),
    letters ? h('div', { class: 'stat' }, h('div', { class: 'v spread', textContent: spread() }), h('div', { class: 'l', textContent: 'cotes de la classe' })) : stat(pctText(fmt(avg)), `moyenne · de ${pctText(fmt(Math.min(...pct)))} à ${pctText(fmt(Math.max(...pct)))}`),
    withRel.length ? h('div', { class: 'stat' }, h('div', { class: 'v', textContent: rel }),
      h('div', { class: 'l' }, 'fiabilité moyenne ', infoButton())) : null, flagged ? stat(String(flagged), 'à vérifier ⚠') : null].filter(Boolean)); // replaceChildren afficherait « null »
}

// Moyenne de la classe par question : repère les questions mal comprises.
// Par position quand toutes les copies ont le même découpage, sinon par intitulé de question.
function questionAverages(graded) {
  const shape = graded[0]?.questions || [];
  const same = shape.length > 0 && graded.every((r) => r.questions.length === shape.length);
  const rows = new Map();
  for (const r of graded) r.questions.forEach((q, i) => {
    const k = same ? i : `${q.question}/${q.max}`;
    if (!rows.has(k)) rows.set(k, { label: same ? shape[i].question : q.question, max: q.max, sum: 0, n: 0, i });
    const row = rows.get(k); row.sum += q.points; row.n++;
  });
  return [...rows.values()].filter((q) => q.max > 0).map((q) => ({ ...q, avg: q.sum / q.n, pct: (q.sum / q.n / q.max) * 100 }));
}

function renderQuestionStats(graded) {
  const list = state.kind === 'content' && graded.length >= 2 ? questionAverages(graded) : [];
  $('qstats').hidden = list.length < 2;
  if (list.length < 2) return;
  const weakest = list.reduce((a, b) => (b.pct < a.pct ? b : a));
  // Rendu par lettres : le niveau moyen de la classe à chaque critère, sans points ni pourcentage.
  const letters = graded.every(byLetters);
  const value = (q) => (letters ? levelOf(graded[0], q.i, q.avg) : pctText(fmt(Math.round(q.pct))));
  $('qstats').querySelector('summary').replaceChildren(h('b', {}, letters ? 'Niveau moyen par critère' : graded.every((r) => r.grid) ? 'Moyenne par critère' : 'Moyenne par question'),
    h('span', { class: 'muted' }, ` · ${letters ? 'le plus faible' : 'la plus faible'} : ${weakest.label} (${value(weakest)})`));
  $('qstats-rows').replaceChildren(...list.map((q) => h('div', { class: 'qrow' },
    h('span', { class: 'ql', title: q.label, textContent: q.label }),
    h('span', { class: 'qbar' }, h('i', { class: q.pct < 60 ? 'lo' : q.pct < 75 ? 'mid' : 'hi', style: `width:${Math.round(q.pct)}%` })),
    h('span', { class: 'qv', textContent: letters ? value(q) : `${fmt(Math.round(q.avg * 10) / 10)} / ${fmt(q.max)} · ${pctText(fmt(Math.round(q.pct)))}` }))));
}

// Copies affichées dans les résultats (onglet courant, recherche), dans l'ordre de la pile.
function shownResults() {
  const q = $('search').value.trim().toLowerCase();
  return state.results.filter((r) => (r.kind === 'lang') === (state.kind === 'lang'))
    .filter((r) => !q || `${r.name} ${r.group} ${r.exam} ${r.file}`.toLowerCase().includes(q))
    .sort((x, y) => (x.no ?? 0) - (y.no ?? 0));
}

function renderResults() {
  const mine = state.results.filter((r) => (r.kind === 'lang') === (state.kind === 'lang'));
  const shown = shownResults();
  const orth = ortho && state.kind === 'lang';
  $('empty').hidden = !!mine.length || orth; // orthopédagogie : l'accueil du tableau de bord en tient lieu
  document.body.classList.toggle('has-results', !!mine.length); // résultats plus larges sur ordinateur
  $('cards').replaceChildren(...shown.map((r) => (r.kind === 'lang' ? langCard(r) : card(r))));
  renderDash();
  renderStats();
  renderSummary();
}

const copyTitle = (r) => [r.no ? `Copie ${r.no}` : '', r.name].filter(Boolean).join(' · ');
const copyLabel = (r) => [r.no ? `Copie ${r.no}` : '', r.file, r.exam, pl(r.pageCount, 'page', 'pages')].filter(Boolean).join(' · ');

// Agrandissement des pages (miniatures avant correction, ou copie corrigée à côté de sa fiche).
// nav : { list, i } pour passer d'une copie corrigée à l'autre sans fermer (flèches, clavier, glisser du doigt).
let zoomNav = null;
function openZoom(urls, title, nav = null) {
  zoomNav = nav;
  $('zoom-pages').classList.remove('big');
  $('zoom-title').textContent = title;
  $('zoom-pages').replaceChildren(...urls.map((url, i) => h('img', { src: url, alt: `Page ${i + 1}` })));
  $('zoom-pages').scrollTop = 0;
  $('zoom-nav').hidden = !nav;
  if (nav) {
    $('zoom-pos').textContent = tr(`${nav.i + 1} sur ${nav.list.length}`);
    $('zoom-prev').disabled = nav.i === 0;
    $('zoom-next').disabled = nav.i === nav.list.length - 1;
  }
  $('zoom').hidden = false;
  modalOpened('zoom');
}
async function openCorrected(r) {
  const list = shownResults().filter((x) => x.pageUrls && x.kind !== 'lang');
  const i = list.indexOf(r);
  openZoom(await annotatedPages(r), copyTitle(r), list.length > 1 && i >= 0 ? { list, i } : null);
}
let zoomBusy = false;
async function zoomStep(d) {
  const nav = zoomNav;
  if (!nav || zoomBusy || $('zoom').hidden) return;
  const r = nav.list[nav.i + d];
  if (!r) return;
  zoomBusy = true;
  try { openZoom(await annotatedPages(r), copyTitle(r), { list: nav.list, i: nav.i + d }); } finally { zoomBusy = false; }
}

// Champ du nom ; avec le nom masqué, la bande du nom de la photo originale dessous, tant que le nom n'est pas tapé.
function nameCell(r) {
  const first = r.pageUrls?.[0] || r.pages?.[0]?.url;
  const band = r.band && first ? h('button', { type: 'button', class: 'name-band', title: tr('Photo de l’en-tête (restée sur votre appareil) : cliquez pour agrandir'),
    'aria-label': tr('Voir l’en-tête de la copie'), hidden: !!r.name, onclick: () => openZoom([first], copyTitle(r) || tr('Copie')) }) : null;
  // Seulement si la ligne « Nom : » a été trouvée : sinon la bande montrerait une ligne quelconque de la copie.
  if (band) nameLine(first).then((z) => (z ? nameBand(first) : null)).then((src) => { if (src) band.append(h('img', { src, alt: '' })); else band.remove(); });
  const input = h('input', { class: 'name', type: 'text', value: r.name, placeholder: r.no ? `✎ Tapez le nom (copie ${r.no})` : '✎ Tapez le nom', 'aria-label': "Nom de l'élève",
    oninput: (e) => { r.name = e.target.value; state.exported = false; if (band) band.hidden = !!r.name.trim(); } });
  return band ? h('div', { class: 'name-cell' }, input, band) : input;
}

// Fiche d'une copie : une ligne compacte (n°, nom, groupe, note), toujours fermée ; un clic sur la ligne l'ouvre.
function cardShell(r, cells, body) {
  const el = h('article', { class: `card ${r.flags.length ? 'flag' : ''}`, 'data-id': r.id });
  // Le libellé change (et ne pivote pas : « Voir » à l'envers était illisible).
  const setOpen = (on) => { body.hidden = !on; el.classList.toggle('open', on); el.querySelector('.chev').textContent = tr(on ? 'Fermer ▴' : 'Voir ▾'); };
  const head = h('div', { class: 'card-head', onclick: (e) => {
    if (e.target.closest('input, textarea, select, button:not(.chev)')) return;
    if (state.open.has(r.id)) state.open.delete(r.id); else state.open.add(r.id);
    setOpen(state.open.has(r.id));
  } },
    h('span', { class: 'no', title: r.flags.length ? 'À vérifier' : '', textContent: `${r.flags.length ? '⚠ ' : ''}${r.no ?? ''}` }),
    nameCell(r),
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
  // Avec une grille, les critères jugent l'ensemble de la copie : ils sont listés dans l'ordre de la grille, sous la note,
  // plutôt qu'accrochés çà et là sur la page (« Q3 » avant « Q1 »).
  const byCrit = !!r.grid;
  const general = r.questions.map((q, i) => ({ q, i })).filter(({ q }) => byCrit || !q.box || !(q.page >= 1 && q.page <= r.pageUrls.length));
  const generalPage = byCrit ? 0 : r.pageUrls.length - 1;
  for (let pi = 0; pi < r.pageUrls.length; pi++) {
    const img = await loadImage(r.pageUrls[pi]);
    const W = img.width, M = Math.round(W * 0.34), pad = Math.round(M * 0.07), u = W / 1000;
    const big = Math.round(26 * u), mid = Math.round(22 * u), small = Math.round(18 * u);
    // Mise en page de la marge d'abord, pour connaître la hauteur nécessaire.
    const probe = document.createElement('canvas').getContext('2d');
    const items = [];
    let y = pad;
    if (pi === 0) { items.push({ kind: 'grade', y }); y += big * 2.6; }
    const here = byCrit ? [] : r.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.box && q.page === pi + 1).sort((a, b) => a.q.box[0] - b.q.box[0]);
    for (const { q, i } of here) {
      y = Math.max(y, q.box[0] * img.height);
      probe.font = `${mid}px sans-serif`;
      const lines = wrapText(probe, (edited(q) ? trTo(r.lang || lang, 'Note ajustée par l’enseignant.') : q.margin || q.justification), M - 2 * pad);
      items.push({ kind: 'note', q, i, y, lines });
      y += mid * 1.3 + lines.length * mid * 1.2 + mid;
    }
    if (pi === generalPage) {
      for (const { q, i } of general) {
        probe.font = `${small}px sans-serif`;
        const lines = wrapText(probe, (edited(q) ? trTo(r.lang || lang, 'Note ajustée par l’enseignant.') : q.margin || q.justification), M - 2 * pad);
        probe.font = `bold ${mid}px sans-serif`;
        const headLines = wrapText(probe, `${byCrit ? q.question : qLabel(q, i)} · ${qMarkText(r, q, i)}`, M - 2 * pad);
        items.push({ kind: 'general', q, i, y, lines, headLines });
        y += mid * 1.3 * headLines.length + lines.length * small * 1.2 + mid * 0.6;
      }
    }
    if (pi === r.pageUrls.length - 1) {
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
        ctx.fillText(markText(r) ?? trTo(r.lang || lang, 'Illisible'), x, it.y);
        continue;
      }
      if (it.kind === 'comment') {
        ctx.fillStyle = '#222'; ctx.font = `italic ${small}px sans-serif`;
        it.lines.forEach((l, k) => ctx.fillText(l, x, it.y + k * small * 1.25));
        continue;
      }
      const { q, i } = it;
      const head = `${byCrit ? q.question : qLabel(q, i)} · ${qMarkText(r, q, i)}`;
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
      const heads = it.headLines || [head];
      heads.forEach((l, k) => ctx.fillText(l, x, it.y + k * mid * 1.3));
      ctx.font = `${it.kind === 'note' ? mid : small}px sans-serif`;
      const lh = (it.kind === 'note' ? mid : small) * 1.2;
      it.lines.forEach((l, k) => ctx.fillText(l, x, it.y + mid * 1.3 * heads.length + k * lh));
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
  const rows = r.questions.map((q, i) => `<tr><td class="q">${escHtml(r.grid ? String(i + 1) : qLabel(q, i))}</td><td>${escHtml(q.question)}</td><td class="p">${escHtml(qMarkText(r, q, i)).replace(/ \/ /, '&nbsp;/&nbsp;')}</td><td>${escHtml(edited(q) ? trTo(r.lang || lang, 'Note ajustée par l’enseignant.') : byLetters(r) ? noPoints(q.justification) : q.justification)}</td></tr>`).join('');
  return `<div class="head"><div><b>${escHtml(r.name || trTo(r.lang || lang, 'Nom à compléter'))}</b>${r.group ? ` · ${escHtml(r.group)}` : ''}${r.exam ? `<br><small>${escHtml(r.exam)}</small>` : ''}</div>
    <div class="grade">${escHtml(markText(r) ?? trTo(r.lang || lang, 'Illisible'))}</div></div>
    <table><thead><tr><th></th><th>${trTo(r.lang || lang, r.grid ? 'Critère' : 'Question')}</th><th>${trTo(r.lang || lang, byLetters(r) ? 'Niveau' : 'Points')}</th><th>${trTo(r.lang || lang, 'Justification')}</th></tr></thead><tbody>${rows}</tbody></table>
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

// Début des commentaires déjà rédigés pour cette évaluation, sans le nom des élèves : l'IA évite de les répéter.
function openings(examKey, except) {
  return state.results.filter((x) => x !== except && x.kind !== 'lang' && x.examKey === examKey && x.comment).slice(0, 8).map((x) => {
    const names = String(x.name || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    return x.comment.split(/\s+/).filter((w) => !names.includes(w.toLowerCase().replace(/[^\p{L}-]/gu, ''))).slice(0, 9).join(' ');
  });
}

// « Réécrire le commentaire » (gratuit) : refait le commentaire selon les notes et les niveaux validés par l'enseignant.
async function rewrite(r, box, btn) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Un instant…';
  try {
    const letters = byLetters(r);
    const { comment } = await api('/api/comment', { method: 'POST', body: {
      lang: r.lang || lang, letters, letter: letters && r.grade != null ? globalLetter(r) : undefined, grade: r.grade, total: r.total,
      questions: r.questions.map((q, i) => ({ question: q.question, answer: q.answer, justification: letters ? noPoints(q.justification) : q.justification,
        points: q.points, max: q.max, level: letters ? levelOf(r, i, q.points) : undefined })),
      avoid: openings(r.examKey, r), previous: [...(r.versions || []), box.value].filter(Boolean).slice(-5),
      // Prénom seulement (le nom de famille ne sert pas), et l'ordre d'enseignement : le vocabulaire suit l'âge.
      firstName: anonymous() ? undefined : String(r.name || '').trim().split(/\s+/)[0] || undefined, niveau: $('lang-level').value } });
    if (comment) { r.versions = [...(r.versions || []), box.value].filter(Boolean).slice(-5); r.comment = comment; box.value = comment; state.exported = false; }
  } catch (err) { banner('err', err.message); }
  btn.disabled = false; btn.textContent = label;
}

// Mode simple : un seul bouton principal ; le reste dans « Plus d'options ».
function simpleActions(r, commentBox) {
  const opt = (label, onclick, cls = '') => h('button', { class: `btn ghost small ${cls}`, type: 'button', textContent: tr(label), onclick });
  return h('div', { class: 'card-simple' },
    r.pageUrls ? h('button', { class: 'btn primary block', type: 'button', textContent: tr('Voir la copie corrigée'), onclick: () => openCorrected(r) }) : null,
    h('details', { class: 'more' }, h('summary', { textContent: tr('Plus d’options') }),
      h('div', { class: 'more-list' },
        opt(r.showTable ? '▴ Résumé des notes' : '✎ Modifier les notes', () => { r.showTable = !r.showTable; renderResults(); }),
        opt('↻ Réécrire le commentaire', (e) => rewrite(r, commentBox, e.currentTarget)),
        r.pageUrls ? opt('🖨 Imprimer cette copie', () => printBatch([r], { copies: true })) : null,
        opt('Supprimer', () => { if (!confirm(tr(`Supprimer la correction de ${r.name || 'cet élève'} ?`))) return; state.results = state.results.filter((x) => x !== r); renderResults(); }, 'danger'))),
    h('span', { class: 'muted small', textContent: copyLabel(r) }));
}

function card(r) {
  const commentBox = h('textarea', { rows: 6, class: 'comment-box', value: r.comment, oninput: (e) => { r.comment = e.target.value; state.exported = false; } });
  const gradeEl = h('span', { class: 'grade' });
  const updateGrade = () => { gradeEl.replaceChildren(...(r.grade == null ? [tr('Illisible')] : byLetters(r) ? [globalLetter(r)] : [fmt(r.grade), h('small', {}, ` / ${fmt(r.total)}`)])); };
  updateGrade();

  // Mode simple : un résumé des notes ; le tableau complet (modifiable) s'ouvre avec « Modifier les notes ».
  const simple = simpleContent(), compact = simple && !r.showTable;
  // Avec l'explication de chaque question : c'est elle qui montre que la note est raisonnée (et qu'on peut ne pas être d'accord).
  const summary = compact ? h('div', { class: 'qsum' }, r.questions.map((q, i) => h('div', { class: q.points < q.max ? 'lost' : '' },
    h('div', { class: 'qrow' }, h('span', { textContent: q.question }), h('b', { textContent: qMarkText(r, q, i) })),
    q.justification ? h('p', { class: 'qwhy', textContent: q.justification }) : null))) : null;
  const body = h('div', { class: 'card-body' },
    r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
    summary,
    h('table', { class: 'qtable', hidden: compact },
      h('thead', {}, h('tr', {}, h('th', { textContent: r.grid ? 'Critère' : 'Question' }), h('th', { textContent: r.grid ? 'Niveau' : 'Points' }), h('th', { textContent: 'Justification' }))),
      h('tbody', {}, r.questions.map((qq, qi) => {
        const rowClass = () => [qq.points < qq.max ? 'lost' : '', qq.second != null ? 'disputed' : ''].join(' ');
        const row = h('tr', { class: rowClass() });
        const second = qq.second != null
          ? h('div', { class: 'second', textContent: qq.first != null
            ? `⚖ Corrections : ${fmt(qq.first)} et ${fmt(qq.second)} → moyenne retenue`
            : `⚖ 2e correction : ${fmt(qq.second)} / ${fmt(qq.max)}` }) : null;
        // Note changée : une raison facultative, qui aide le calibrage des copies suivantes.
        const why = h('input', { type: 'text', class: 'why', value: qq.why || '', maxlength: 300, placeholder: 'Pourquoi ? (facultatif, guide les prochaines copies)',
          'aria-label': 'Raison du changement de note', oninput: () => { qq.why = why.value; } });
        // Note changée par l'enseignant : sa note d'abord, la justification de l'IA devient « proposition initiale »
        // (sinon « Niveau C retenu » restait affiché à côté d'un B, jusque dans l'export).
        const changed = h('div', { class: 'changed' }), justText = h('span');
        const showWhy = () => {
          const edited = qq.ai != null && qq.points !== qq.ai;
          why.hidden = !edited;
          changed.hidden = !edited;
          if (edited) changed.textContent = `✎ ${tr('Votre choix')} : ${byLetters(r) ? levelOf(r, qi, qq.points) : `${fmt(qq.points)} / ${fmt(qq.max)}`} (${tr('proposé')} : ${byLetters(r) ? levelOf(r, qi, qq.ai) : fmt(qq.ai)})`;
          justText.className = edited ? 'initial' : '';
          justText.textContent = `${edited ? `${tr('Proposition initiale')} : ` : ''}${byLetters(r) ? noPoints(qq.justification) : qq.justification}`;
        };
        const input = h('input', { type: 'text', inputMode: 'decimal', class: 'num', value: fmt(qq.points), 'aria-label': 'Points',
          onchange: () => {
            const v = Math.round((toNumber(input.value) || 0) / r.unit) * r.unit;
            qq.points = Math.min(qq.max, Math.max(0, v));
            input.value = fmt(qq.points);
            qq.second = null; // l'enseignant a tranché
            second?.remove();
            row.className = rowClass();
            showWhy();
            recompute(r); updateGrade(); renderStats(); renderCalib();
            const ok = h('span', { class: 'saved', textContent: '✓ Note modifiée' });
            const cell = row.querySelector('td.pts'); cell?.querySelector('.saved')?.remove(); cell?.append(ok); setTimeout(() => ok.remove(), 2500);
          } });
        // Avec une grille : on choisit un niveau (A, B…), qui donne ses points ; les points restent modifiables.
        const levels = r.grid?.[qi]?.levels?.length ? [...r.grid[qi].levels].sort((x, y) => y.points - x.points) : null;
        const letters = byLetters(r); // rendu par lettres : le niveau seulement, sans points
        const level = levels ? h('select', { class: 'lvl-pick', 'aria-label': 'Niveau', onchange: (e) => {
          input.value = fmt(Number(e.target.value)); input.dispatchEvent(new Event('change')); } },
        ...levels.map((l) => h('option', { value: String(l.points), textContent: letters ? l.label || ptsText(l) : `${l.label || ptsText(l)}${l.label ? ` · ${ptsText(l)} pts` : ' pts'}`, selected: l === levels.find((x) => inLevel(x, qq.points)) })),
        levels.some((l) => inLevel(l, qq.points)) ? null : h('option', { value: String(qq.points), textContent: `Autre · ${fmt(qq.points)} pts`, selected: true })) : null;
        if (level) input.addEventListener('change', () => { level.value = String(levels.find((l) => inLevel(l, qq.points))?.points ?? qq.points); });
        row.append(h('td', { class: 'q', textContent: qq.question }),
          h('td', { class: 'pts' }, level, letters && level ? null : [input, h('span', { class: 'muted', textContent: ` / ${fmt(qq.max)}` })], second),
          h('td', { class: 'just' }, changed, justText, why));
        showWhy();
        return row;
      }))),
    h('label', { class: 'field comment' }, 'Commentaire pour l\'élève',
      commentBox),
    simple ? null : h('button', { class: 'btn ghost small rewrite', type: 'button', textContent: '↻ Réécrire le commentaire', title: 'Selon vos notes et vos niveaux (gratuit)',
      onclick: (e) => rewrite(r, commentBox, e.currentTarget) }),
    simple ? simpleActions(r, commentBox) : h('div', { class: 'card-foot' },
      h('span', { textContent: copyLabel(r) }),
      h('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap' },
        r.pageUrls ? h('button', { class: 'btn small', type: 'button', textContent: 'Voir la copie corrigée', onclick: () => openCorrected(r) }) : null,
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
    return masked(i) ? maskName(url, bundle[i].url) : url;
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
  if (!todo.length) setTimeout(evoTick, 0);
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
      if (!res.rereading) evoTick();
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

const langSettings = () => ({ ...(isOrtho() ? { ortho: true } : {}), ...(isPda() ? {
  level: 'primaire', categories: Object.keys(CATS),
  pda: { level: $('lang-level').value, year: Number($('pda-year').value), notions: notions().map((n) => ({ id: n.id, cat: n.cat, label: n.label, state: pdaState(n) })).filter((n) => n.state !== 'ignore'),
    ignored: notions().filter((n) => pdaState(n) === 'ignore').map((n) => n.label) },
} : {
  level: $('lang-level').value,
  categories: [...document.querySelectorAll('#lang-cats input:checked')].map((i) => i.value),
}) });

// Primaire : les fautes qui comptent selon l'année et l'étape (Progression des apprentissages, voir pda.js),
// modifiables notion par notion. Une modification tient jusqu'au changement d'année ou d'étape.
// Primaire et secondaire : même fonctionnement, chacun avec les notions de sa Progression des apprentissages (pda.js).
const pdaLevel = () => ['primaire', 'secondaire'].includes($('lang-level').value);
const isPda = () => pdaLevel() && $('out-lang').value !== 'en'; // la PDA ne vise que le français
const notions = () => notionsFor($('lang-level').value);
// Années proposées selon le niveau : 1re à 6e année au primaire, 1re à 5e secondaire.
// Tant que l'enseignante n'a pas choisi son année, aucune n'est présélectionnée : une « 4e année » par défaut donnait
// en silence les notions d'une autre année (test d'utilisabilité, enseignante de 3e).
let yearSet = false;
try { yearSet = localStorage.getItem('ce.yearSet') === '1'; } catch { /* ignoré */ }
function fillYears() {
  const sec = $('lang-level').value === 'secondaire', n = sec ? 5 : 6, sel = $('pda-year');
  const want = n + (yearSet ? 0 : 1);
  if (sel.options.length === want && sel.dataset.level === $('lang-level').value) return;
  const keep = yearSet ? Math.min(Number(sel.value) || (sec ? 3 : 4), n) : 0;
  sel.replaceChildren(...(yearSet ? [] : [h('option', { value: '', textContent: tr('— Choisissez l’année —'), selected: true })]),
    ...Array.from({ length: n }, (_, i) => h('option', { value: String(i + 1),
      textContent: tr(`${i + 1}${i ? 'e' : 're'} ${sec ? 'secondaire' : 'année'}`), selected: i + 1 === keep })));
  sel.dataset.level = $('lang-level').value;
}
let pdaOver = {};
try { pdaOver = JSON.parse(localStorage.getItem('ce.pda') || '{}') || {}; } catch { /* ignoré */ }
const pdaState = (n) => pdaOver[n.id] || pdaDefault(n, Number($('pda-year').value), Number($('pda-step').value));
const L = (fr, en) => (lang === 'en' ? en : fr); // textes du primaire construits ici (l'interface anglaise les affiche en anglais)
const PDA_STATES = { count: L('Acquise', 'Mastered'), grey: L('En apprentissage', 'Being learned'), ignore: L('Pas encore vue', 'Not yet taught') };
const notionLabel = (x) => (x ? L(x.label, x.en) : '');
const plural = (n, fr, frs, en, ens) => `${n} ${n > 1 ? L(frs, ens) : L(fr, en)}`;
function renderPda() {
  fillYears();
  const on = isPda();
  $('pda').hidden = !on;
  $('pda-en-note').hidden = on || lang === 'en' || !pdaLevel(); // site français, copies en anglais
  // Exemples à l'image d'une classe du primaire (groupe « 4e B » plutôt que « 541 »).
  // Primaire (avec ou sans la PDA, qui ne vise que les copies en français) : exemples d'une classe du primaire.
  // Exemples à l'image du niveau d'enseignement (« Vous enseignez au »), dans les deux onglets.
  const year = Number($('pda-year').value), lvl = $('lang-level').value, prim = lvl === 'primaire';
  $('exam').placeholder = tr(prim ? 'Ex. : Écriture — Raconte ta fin de semaine' : lvl === 'cegep' ? 'Ex. : Dissertation critique — Philosophie' : 'Ex. : Examen — Révolution tranquille');
  $('group').placeholder = lvl === 'cegep' ? tr('Ex. : Groupe 01') : !prim ? tr('Ex. : 541') : L(`Ex. : ${year}${year === 1 ? 're' : 'e'} B`, on ? `E.g., Grade ${year}` : 'E.g., Grade 4');
  $('lang-cats-field').hidden = on;
  $('lang-scoring-row').hidden = on; // au primaire, la cote vient du pourcentage de fautes
  // Mode simple : l'année en boutons ; l'étape (d'après la date) et le reste se règlent dans « Modifier ».
  const sel = $('pda-year');
  $('pda-years').replaceChildren(...[...sel.options].filter((o) => o.value).map((o) => h('button', { type: 'button', 'aria-pressed': String(sel.value === o.value),
    textContent: o.textContent.replace(/ (année|secondaire|grade)$/i, ''), title: o.textContent,
    onclick: () => { sel.value = o.value; sel.dispatchEvent(new Event('change')); } })));
  $('lang-set-txt').textContent = on
    ? L(`Étape ${$('pda-step').value} (d’après la date) · fautes répétées comptées ${$('pda-once').value === '1' ? 'une fois' : 'chaque fois'}`,
      `Term ${$('pda-step').value} (from today’s date) · repeated errors counted ${$('pda-once').value === '1' ? 'once' : 'each time'}`)
    : tr('Toutes les fautes sont relevées : orthographe, accords, conjugaison, ponctuation, syntaxe, vocabulaire');
  if (!on) return;
  const by = (st) => notions().filter((x) => pdaState(x) === st).length;
  const counts = (k) => [plural(k('count'), 'acquise', 'acquises', 'mastered', 'mastered'), `${k('grey')} ${L('en apprentissage', 'being learned')}`,
    plural(k('ignore'), 'pas encore vue', 'pas encore vues', 'not yet taught', 'not yet taught')];
  $('pda-sum').textContent = $('pda-year').value ? counts(by).join(' · ') : tr('choisissez d’abord l’année');
  // Une catégorie par ligne, fermée par défaut : on n'ouvre que celle qu'on veut ajuster.
  $('pda-list').replaceChildren(...Object.entries(CATS).map(([cat, c]) => {
    const list = notions().filter((x) => x.cat === cat);
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
const greyCount = (r) => r.pages.reduce((a, p) => a + p.errors.filter((e) => e.grey).length, 0);
const pdaLine = (r, n) => `${!r.words ? L('mots non comptés', 'words not counted') : plural(r.words, 'mot', 'mots', 'word', 'words')} · ${plural(n, 'faute retenue', 'fautes retenues', 'error counted', 'errors counted')}${r.pct == null ? '' : ` · ${pctText(fmt(Math.round(r.pct * 10) / 10))}`}`;

// ---------- Orthopédagogie : fiche du scripteur ----------
// Sous-types renvoyés par l'analyse en orthopédagogie (voir ORTHO_TYPES dans le serveur).
const SUBTYPES = {
  phonologique: 'Phonologique (son modifié)', morphologique: 'Morphologique (lettre muette, famille de mots)',
  visuo_orthographique: 'Visuo-orthographique (choix des lettres)', homophone_lexical: 'Homophones lexicaux',
  segmentation: 'Segmentation (mots soudés ou coupés)', majuscule_signes: 'Majuscules et signes',
  homophone_grammatical: 'Homophones grammaticaux', accord_gn: 'Accord dans le GN', accord_attribut: 'Accord de l’attribut',
  accord_sv_simple: 'Accord sujet-verbe simple', accord_sv_complexe: 'Accord sujet-verbe complexe (inversé, éloigné, écran)',
  pp_etre: 'Participe passé avec être', pp_avoir: 'Participe passé avec avoir', pp_seul: 'Participe passé sans auxiliaire',
  morphologie_verbale: 'Morphologie verbale (conjugaison)', homophone_verbal: 'Homophones verbaux (-é, -er, -ait)',
  delimitation: 'Délimitation des phrases', virgule_detachement: 'Virgule de détachement (complément en tête)', virgule: 'Autre virgule',
  ponctuation_autre: 'Autre ponctuation', structure_phrase: 'Structure de la phrase de base', subordination: 'Subordination',
  negation: 'Négation', pronom_preposition: 'Pronoms et prépositions', vocabulaire: 'Vocabulaire',
};
const SUB_CAT = { phonologique: 'orthographe', morphologique: 'orthographe', visuo_orthographique: 'orthographe', homophone_lexical: 'orthographe',
  segmentation: 'orthographe', majuscule_signes: 'orthographe', homophone_grammatical: 'orthographe', accord_gn: 'accord', accord_attribut: 'accord',
  accord_sv_simple: 'accord', accord_sv_complexe: 'accord', pp_etre: 'accord', pp_avoir: 'accord', pp_seul: 'accord', morphologie_verbale: 'conjugaison',
  homophone_verbal: 'conjugaison', delimitation: 'ponctuation', virgule_detachement: 'ponctuation', virgule: 'ponctuation', ponctuation_autre: 'ponctuation',
  structure_phrase: 'syntaxe', subordination: 'syntaxe', negation: 'syntaxe', pronom_preposition: 'syntaxe', vocabulaire: 'vocabulaire' };
// Codes du ministère (S, P, U, G, V) et étiquettes courtes, comme sur les copies (« G-GN », « U-phono »).
const SUB_CODE = { phonologique: 'U-phono', morphologique: 'U-morpho', visuo_orthographique: 'U-visuo', homophone_lexical: 'U-homo', segmentation: 'U-segm',
  majuscule_signes: 'U-maj', homophone_grammatical: 'G-homo', accord_gn: 'G-GN', accord_attribut: 'G-attr', accord_sv_simple: 'G-SV', accord_sv_complexe: 'G-SV+',
  pp_etre: 'G-PP être', pp_avoir: 'G-PP avoir', pp_seul: 'G-PP seul', morphologie_verbale: 'G-conj', homophone_verbal: 'G-é/er', delimitation: 'P-délim',
  virgule_detachement: 'P-vir CP', virgule: 'P-vir', ponctuation_autre: 'P-autre', structure_phrase: 'S-P', subordination: 'S-sub', negation: 'S-nég',
  pronom_preposition: 'S-pron', vocabulaire: 'V' };
const CAT_CODE = { orthographe: 'U', accord: 'G', conjugaison: 'G', ponctuation: 'P', syntaxe: 'S', vocabulaire: 'V' };
const CODE_NAMES = { U: 'U · Orthographe d’usage', G: 'G · Orthographe grammaticale', P: 'P · Ponctuation', S: 'S · Syntaxe', V: 'V · Vocabulaire' };
const subLabel = (k) => `${SUB_CODE[k]} · ${SUBTYPES[k]}`;
// Conditions de rédaction (outils d'aide) : notées dans le profil et prises en compte dans la comparaison.
const CONDITIONS = ['Sans aide', 'WordQ', 'Lexibar', 'Antidote', 'Synthèse vocale', 'Dictée vocale'];
function conditionChips(r, onChange) {
  const on = new Set(r.conditions || []);
  return h('div', { class: 'cond-chips', role: 'group', 'aria-label': 'Conditions de rédaction' }, h('span', { class: 'muted small', textContent: 'Conditions de rédaction :' }),
    ...CONDITIONS.map((c) => h('button', { type: 'button', class: 'cond', 'aria-pressed': String(on.has(c)), textContent: c, onclick: () => {
      if (on.has(c)) on.delete(c); else { on.add(c); if (c === 'Sans aide') CONDITIONS.slice(1).forEach((x) => on.delete(x)); else on.delete('Sans aide'); }
      r.conditions = CONDITIONS.filter((x) => on.has(x)); onChange?.(); renderResults();
    } })));
}
// Indices calculés sur la transcription (indicatifs) : phrases selon la ponctuation de l'élève, longueur moyenne,
// diversité du vocabulaire, subordonnants. Un élève qui fait peu d'erreurs avec des phrases très courtes évite peut-être la difficulté.
function textIndices(r) {
  const text = r.pages.map((p) => p.text || '').join('\n').trim();
  if (!text) return null;
  const tokens = (text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []);
  if (tokens.length < 20) return null;
  const sentences = text.split(/[.!?…]+(?:\s|$)/u).filter((x) => /\p{L}/u.test(x)).length || 1;
  const distinct = new Set(tokens).size;
  const subord = tokens.filter((w) => ['qui', 'que', 'qu', 'dont', 'où', 'quand', 'lorsque', 'lorsqu', 'puisque', 'puisqu', 'si'].includes(w)).length;
  return { words: tokens.length, sentences, avgLen: Math.round((10 * tokens.length) / sentences) / 10, distinct, diversity: Math.round((100 * distinct) / tokens.length), subord };
}

// Tâche choisie à l'arrivée dans l'onglet (« Que voulez-vous faire aujourd'hui ? »), retenue sur l'appareil.
let orthoIntent = '';
try { orthoIntent = localStorage.getItem('ce.orthoIntent') || ''; } catch { /* ignoré */ }
// Onglet Orthopédagogie : en français, au primaire et au secondaire (selon la Progression des apprentissages).
function orthoAvailable() { return lang !== 'en' && $('lang-level').value !== 'cegep'; }
function isOrtho() { return ortho && state.kind === 'lang' && orthoAvailable() && isPda(); }
function renderOrtho() {
  const three = orthoAvailable();
  $('kind-ortho').hidden = !three;
  document.querySelector('.kind').classList.toggle('three', three);
  $('ortho-focus-field').hidden = !(ortho && state.kind === 'lang');
  $('pda-cote-field').hidden = ortho && state.kind === 'lang'; // l'orthopédagogue établit un profil, pas une cote
  const orth = ortho && state.kind === 'lang';
  const evo = orth && orthoIntent === 'evolution';
  $('evo-zones').hidden = !evo;
  $('app').classList.toggle('ortho-evo', evo); // les photos passent par les deux zones (texte précédent, nouveau texte)
  $('drop').hidden = evo;
  $('res-foot-ortho').hidden = !orth; $('res-foot-main').hidden = orth;
  $('app').classList.toggle('ortho', orth);
  arrangeOrtho(orth);
  orthoTitles();
}
// Les sections changent de place en orthopédagogie : ajout et réglages à gauche, tableau de bord et élèves à droite
// (sur téléphone : tableau de bord, ajout, élèves, réglages). Les déplacer garde leurs écouteurs.
function arrangeOrtho(on) {
  const cols = $('ortho-cols'), left = cols.querySelector('.left'), right = cols.querySelector('.right');
  const [s1, s2, s3] = ['.s1', '.s2', '.s3'].map((c) => $('app').querySelector(`section${c}`));
  if (on && s2.parentElement !== left) { left.append(s2, s1); right.append(s3); }
  if (!on && s2.parentElement === left) cols.after(s1, s2, s3);
  cols.hidden = !on;
}
const TASK_TITLES = { groupe: 'Ajouter les textes du groupe', eleve: 'Ajouter le texte de l’élève', evolution: 'Ajouter les deux textes', pi: 'Ajouter le texte de l’élève' };
let camLabel = null;
function orthoTitles() {
  if (!$('step3-title')) return;
  const orth = ortho && state.kind === 'lang';
  $('step3-title').textContent = orth ? (orthoIntent === 'groupe' ? 'Élèves' : 'Textes analysés') : tr('Résultats');
  if (orth) { $('step1-title').textContent = 'Réglages de la séance'; $('step2-title').textContent = TASK_TITLES[orthoIntent] || 'Ajouter des textes'; }
  const cam = [...$('cam-open').childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (cam) { camLabel ??= cam.textContent; cam.textContent = orth ? (orthoIntent === 'groupe' ? ' Prendre les textes en photo' : ' Prendre le texte en photo') : camLabel; }
}
const profileErrors = (r) => r.pages.flatMap((p) => p.errors).filter((e) => !e.doubtful);
// La fiche reflète les erreurs validées : si l'orthopédagogue en retire ou en ajoute, la fiche est marquée à refaire.
const profileSig = (r) => JSON.stringify([profileErrors(r).map((e) => [e.text, e.correction, e.subtype || e.category, !!e.grey]), r.conditions || []]);
const codeOf = (e) => (e.subtype ? SUB_CODE[e.subtype] : CAT_CODE[e.category] || '');
// Erreurs récurrentes : comptées par le code (exactes), avec de vrais exemples tirés de la copie.
function recurrent(r) {
  const groups = new Map();
  for (const e of profileErrors(r)) {
    const k = e.subtype || `cat:${e.category}`;
    if (!groups.has(k)) groups.set(k, { code: codeOf(e), label: `${codeOf(e)} · ${e.subtype ? SUBTYPES[e.subtype] : CATS[e.category]?.label || '—'}`, cat: e.subtype ? SUB_CAT[e.subtype] : e.category, n: 0, grey: 0, ex: [] });
    const g = groups.get(k);
    g.n++; if (e.grey) g.grey++;
    const ex = `« ${e.text} » → « ${e.correction} »`;
    if (g.ex.length < 3 && !g.ex.includes(ex)) g.ex.push(ex);
  }
  return [...groups.values()].sort((a, b) => (b.n - b.grey) - (a.n - a.grey) || b.n - a.n);
}
// Effet de levier : les 2 (ou 3) types qui regroupent le plus d'erreurs, et la part du total qu'ils représentent.
function leverage(r) {
  const rec = recurrent(r).map((g) => ({ ...g, k: g.n - g.grey })).filter((g) => g.k > 0);
  const total = rec.reduce((a, g) => a + g.k, 0);
  // Seulement des types qui reviennent (au moins 2 erreurs) : avec une erreur de chaque, il n'y a pas de levier.
  const rep = rec.filter((g) => g.k >= 2);
  if (total < 4 || !rep.length) return '';
  const pick = rep.slice(0, rep[2] && rep[2].k >= 0.15 * total ? 3 : 2);
  const sum = pick.reduce((a, g) => a + g.k, 0);
  return `Travailler ${pick.map((g) => g.code).join(', ').replace(/, ([^,]*)$/, ' et $1')} toucherait ${sum} erreurs sur ${total} (${Math.round((100 * sum) / total)} %).`;
}
const whoLine = (r) => [r.name || copyLabel(r), r.group, r.exam].filter(Boolean).join(' · ');
const levelText = (r) => (r.pda?.year ? `${r.pda.year}${r.pda.year === 1 ? 're' : 'e'} ${r.level === 'primaire' ? 'année du primaire' : 'secondaire'}` : '');
const PROFILE_NOTE = 'Profil provisoire établi à partir des erreurs validées : à compléter par vos observations.';
const REC_HEAD = ['Type d’erreur', 'Nombre', 'Pour 100 mots', 'Exemples tirés du texte'];
// Contenu du profil, commun à l'écran, au texte copié et au document Word.
function profileSections(r) {
  const p = r.profile, rec = recurrent(r), ix = textIndices(r), lever = leverage(r);
  return [
    p.alert ? { title: 'À examiner en priorité', items: [p.alert], warn: true } : null,
    p.forces.length ? { title: 'Forces observées', items: p.forces } : null,
    { title: 'Erreurs récurrentes', head: REC_HEAD, table: rec.map((g) => [g.label, `${g.n - g.grey}${g.grey ? ` (+${g.grey} en apprentissage)` : ''}`, r.words ? fmt(Math.round((1000 * (g.n - g.grey)) / r.words) / 10) : '', g.ex.join(' ; ')]) },
    lever ? { title: 'Effet de levier', items: [lever] } : null,
    ix ? { title: 'Indices du texte (calculés, indicatifs)', lines: [['Phrases', `${ix.sentences}, selon la ponctuation de l’élève`], ['Longueur moyenne', `${fmt(ix.avgLen)} mots par phrase`],
      ['Mots différents', `${ix.distinct} sur ${ix.words} (${ix.diversity} %)`], ['Subordonnants', `${ix.subord} (qui, que, dont, où, quand, si…)`]] } : null,
    { title: 'Tendances', lines: [['Orthographe d’usage', p.usage], ['Orthographe grammaticale', p.grammar], ['Syntaxe et ponctuation', p.syntax], ['Organisation du texte', p.organisation]].filter(([, v]) => v) },
    p.tools ? { title: 'Outils d’aide', items: [p.tools] } : null,
    p.level ? { title: 'Palier provisoire (syntaxe et orthographe)', items: [`${p.level} / 5 — ${p.levelLabel}${p.levelWhy ? `. ${p.levelWhy}` : ''}`] } : null,
    p.targets.length ? { title: 'Cibles prioritaires', ordered: true, items: p.targets.map((t) => `${t.target}${t.why ? ` — ${t.why}` : ''}`) } : null,
    p.questions.length ? { title: 'Questions pour l’entretien métagraphique', items: p.questions.map((q) => (q.excerpt ? `À propos de « ${q.excerpt} » : ${q.question}` : q.question)) } : null,
    p.activities.length ? { title: 'Pistes d’intervention', items: p.activities } : null,
    p.adaptations.length ? { title: 'Mesures d’adaptation à envisager', items: p.adaptations } : null,
    p.pi ? { title: 'Bilan pour le plan d’intervention', items: [p.pi, ...(p.smart ? [`Objectif SMART suggéré : ${p.smart}`] : [])], pi: true } : null,
    ...progressSections(r),
  ].filter(Boolean).sort((a, b) => (orthoIntent === 'pi' ? (b.pi ? 1 : 0) - (a.pi ? 1 : 0) : 0));
}
const piText = (r) => [r.profile.pi, r.profile.smart ? `Objectif : ${r.profile.smart}` : ''].filter(Boolean).join('\n');
const profileHead = (r) => [levelText(r), r.words ? `${r.words} mots` : '', `${profileErrors(r).filter((e) => !e.grey).length} erreurs retenues`, r.conditions?.length ? `conditions : ${r.conditions.join(', ')}` : ''].filter(Boolean).join(' · ');
function profileText(r) {
  const out = [`PROFIL DU SCRIPTEUR (provisoire) — ${whoLine(r)}`, profileHead(r), ''];
  for (const sec of profileSections(r)) {
    out.push(sec.title.toUpperCase());
    if (sec.items) out.push(...sec.items.map((t, i) => (sec.ordered ? `${i + 1}. ${t}` : `- ${t}`)));
    if (sec.lines) out.push(...sec.lines.map(([k, v]) => `${k} : ${v}`));
    if (sec.table) out.push(...(sec.table.length ? sec.table.map((row) => `- ${row[0]} : ${row.slice(1).map((c, i) => (c ? `${sec.head[i + 1].toLowerCase()} ${c}` : '')).filter(Boolean).join(' ; ')}`) : ['- Aucune erreur retenue.']));
    out.push('');
  }
  out.push(PROFILE_NOTE);
  return out.join('\n');
}
function profileView(r) {
  return h('div', { class: 'prof-body' }, h('p', { class: 'muted small', style: 'margin:0', textContent: profileHead(r) }),
    ...profileSections(r).map((sec) => h('div', { class: `prof-sec${sec.warn ? ' warn' : ''}` }, h('h4', { textContent: sec.title }),
      sec.items ? h(sec.ordered ? 'ol' : 'ul', {}, sec.items.map((t) => h('li', { textContent: t }))) : null,
      sec.lines ? h('dl', {}, sec.lines.flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })])) : null,
      sec.table ? (sec.table.length ? h('div', { class: 'prof-scroll' }, h('table', { class: `prof-table${sec.head.length === 3 ? ' cmp' : ''}` }, h('thead', {}, h('tr', {}, sec.head.map((t) => h('th', { textContent: t })))),
        h('tbody', {}, sec.table.map((row) => h('tr', {}, row.map((c, i) => h(i ? 'td' : 'th', { textContent: c }))))))) : h('p', { class: 'small', textContent: 'Aucune erreur retenue.' })) : null,
      sec.pi && r.profile?.pi ? h('button', { class: 'btn small', type: 'button', style: 'margin-top:.3rem', textContent: 'Copier le bilan', onclick: (ev) => copyFrom(ev.currentTarget, piText(r)) }) : null)),
    h('p', { class: 'faint small', style: 'margin:0', textContent: PROFILE_NOTE }));
}
// File d'attente : 3 fiches à la fois (une classe entière ne part pas d'un coup).
const profileQueue = [];
let profileActive = 0;
function queueProfile(r) {
  if (r.profileBusy || !r.ortho) return;
  r.profileBusy = true; r.profileErr = '';
  profileQueue.push(r); pumpProfiles(); renderResults();
}
function pumpProfiles() {
  while (profileActive < 3 && profileQueue.length) {
    const r = profileQueue.shift();
    profileActive++;
    const sig = profileSig(r);
    api('/api/profil', { method: 'POST', body: { level: r.level, year: r.pda?.year, words: r.words, text: r.pages.map((p) => p.text || '').join('\n\n'),
      focus: $('ortho-focus').value, conditions: r.conditions || [], indices: textIndices(r) || {}, errors: profileErrors(r).map(({ text, correction, category, subtype, explanation, grey }) => ({ text, correction, category, subtype, explanation, grey })) } })
      .then((p) => { r.profile = p; r.profileSig = sig; })
      .catch((e) => { r.profileErr = e.message || 'Le profil n’a pas pu être établi.'; })
      .finally(() => { r.profileBusy = false; profileActive--; renderResults(); pumpProfiles(); evoTick(); });
  }
}
// Type d'erreur modifiable en un clic dans la copie annotée (orthopédagogie). Changer de type peut changer la catégorie
// (ex. une « orthographe » qui est en fait un accord dans le GN) : le surlignage suit.
function subtypeSelect(r, e) {
  const sel = h('select', { class: 'sub-pick', title: 'Type d’erreur', onclick: (ev) => ev.stopPropagation(), onchange: (ev) => {
    const v = ev.target.value;
    if (v) { e.subtype = v; e.category = SUB_CAT[v]; } else delete e.subtype;
    state.exported = false; renderViewer(e); renderResults();
  } }, h('option', { value: '', textContent: `${CAT_CODE[e.category] || ''} · ${CATS[e.category]?.label || ''} (type à préciser)` }),
  ...Object.entries(CODE_NAMES).map(([c, name]) => h('optgroup', { label: name }, Object.keys(SUBTYPES).filter((k) => SUB_CODE[k].startsWith(c)).map((k) => h('option', { value: k, textContent: subLabel(k), selected: e.subtype === k })))));
  return sel;
}
function orthoConditions() { return CONDITIONS.filter((c) => document.querySelector(`#ortho-conds [data-cond="${c}"]`)?.getAttribute('aria-pressed') === 'true'); }
function profileBlock(r) {
  if (r.profileBusy) return h('p', { class: 'muted small prof-wait', textContent: 'Profil du scripteur en préparation…' });
  if (!r.profile) {
    // Établi à la demande : l'orthopédagogue relit d'abord les erreurs (fausses fautes retirées, oublis ajoutés).
    return h('div', { class: 'prof-cta' }, r.profileErr ? h('p', { class: 'small', style: 'margin:0;color:var(--danger,#b91c1c)', textContent: r.profileErr }) : null,
      conditionChips(r),
      h('button', { class: 'btn primary', type: 'button', disabled: !!r.rereading, textContent: r.rereading ? 'Relecture en cours…' : orthoIntent === 'pi' ? 'Établir le profil et le bilan pour le PI' : 'Établir le profil du scripteur', onclick: () => queueProfile(r) }),
      h('span', { class: 'muted small', textContent: 'Relisez d’abord les erreurs dans la copie annotée : le profil part des erreurs que vous avez validées. Gratuit.' }));
  }
  const stale = r.profileSig !== profileSig(r);
  const first = r.profile.targets[0]?.target;
  return h('details', { class: 'profile', open: !!r.profileOpen, ontoggle: (ev) => { r.profileOpen = ev.target.open; } },
    h('summary', {}, h('b', { textContent: 'Profil du scripteur' }), h('span', { class: 'muted small', textContent: ` · ${[r.profile.level ? `palier ${r.profile.level}/5` : '', first ? `cible : ${first}` : '', r.progress ? 'évolution suivie' : ''].filter(Boolean).join(' · ')}` })),
    stale ? h('div', { class: 'prof-stale small' }, 'Vous avez modifié les erreurs depuis ce profil. ',
      h('button', { class: 'btn small', type: 'button', textContent: 'Refaire le profil', onclick: () => queueProfile(r) })) : null,
    conditionChips(r),
    profileView(r),
    r.progressBusy ? h('p', { class: 'muted small prof-wait', textContent: 'Comparaison en cours…' }) : null,
    r.progressErr ? h('p', { class: 'small', style: 'margin:.3rem 0 0;color:var(--danger,#b91c1c)', textContent: r.progressErr }) : null,
    h('div', { class: 'prof-actions' },
      h('button', { class: 'btn small primary', type: 'button', textContent: 'Copier le profil', onclick: (ev) => copyFrom(ev.currentTarget, profileText(r)) }),
      h('button', { class: 'btn small', type: 'button', textContent: 'Word', title: 'Télécharger ce profil en Word', onclick: () => downloadFiches([r]) }),
      h('button', { class: 'btn small', type: 'button', disabled: !!r.progressBusy, textContent: r.progress ? 'Refaire la comparaison' : 'Suivre l’évolution', onclick: () => openProgress(r) }),
      stale ? null : h('button', { class: 'btn small ghost', type: 'button', textContent: 'Refaire', onclick: () => queueProfile(r) })));
}

// ---------- Progression : comparer avec une évaluation précédente du même élève ----------
// Deux sources : un autre texte de l'élève analysé dans cette séance (comparaison chiffrée, par 100 mots), ou un document
// de l'orthopédagogue (ancienne fiche, rapport, profil) en Word, PDF ou texte collé, lu dans le navigateur.
const per100 = (n, words) => (words ? `${fmt(Math.round((1000 * n) / words) / 10)} / 100 mots` : '');
function progressSections(r) {
  const g = r.progress;
  if (!g) return [];
  const rows = g.table?.map(([label, a, b]) => [label, a, b]) || [];
  return [
    { title: `Évolution depuis : ${g.from}`, items: [g.summary, ...(g.caution ? [`Prudence : ${g.caution}`] : [])].filter(Boolean) },
    rows.length ? { title: 'Avant / maintenant', head: ['Type d’erreur', 'Avant', 'Maintenant'], table: rows } : null,
    g.progress.length ? { title: 'Progrès', items: g.progress } : null,
    g.persistent.length ? { title: 'Difficultés persistantes', items: g.persistent } : null,
    g.fresh.length ? { title: 'Nouvelles difficultés', items: g.fresh } : null,
    g.targets.length ? { title: 'Cibles ajustées', ordered: true, items: g.targets.map((t) => `${t.target}${t.why ? ` — ${t.why}` : ''}`) } : null,
  ].filter(Boolean);
}
// Tableau chiffré entre deux copies de la séance : nombre d'erreurs par type, et taux par 100 mots quand on les connaît.
function compareTable(prev, cur) {
  const a = recurrent(prev), b = recurrent(cur);
  const labels = [...new Set([...b, ...a].map((x) => x.label))];
  const cell = (list, r, label) => { const g = list.find((x) => x.label === label); const n = g ? g.n - g.grey : 0; return `${n}${per100(n, r.words) ? ` (${per100(n, r.words)})` : ''}`; };
  return [['Type d’erreur', 'Avant', 'Maintenant'], ...labels.map((l) => [l, cell(a, prev, l), cell(b, cur, l)])];
}
let progressFor = null;
function openProgress(r) {
  progressFor = r;
  const others = state.results.filter((x) => x !== r && x.ortho);
  $('progress-title').textContent = `Suivre l’évolution — ${r.name || copyLabel(r)}`;
  $('progress-copy').replaceChildren(h('option', { value: '', textContent: others.length ? '— Choisir un autre texte de cet élève —' : '(aucun autre texte analysé dans cette séance)' }),
    ...others.map((x) => h('option', { value: x.id, textContent: whoLine(x) })));
  $('progress-copy').disabled = !others.length;
  $('progress-text').value = ''; $('progress-file').value = ''; $('progress-file-name').textContent = '';
  $('progress-err').textContent = '';
  $('progression').hidden = false;
}
async function pdfToText(file) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    out.push(c.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
  }
  return out.join('\n').replace(/[ \t]+\n/g, '\n').trim();
}
$('progress-file').addEventListener('change', async () => {
  const f = $('progress-file').files[0];
  if (!f) return;
  $('progress-file-name').textContent = `Lecture de ${f.name}…`;
  try {
    const text = /\.docx$/i.test(f.name) ? await docxToText(f) : /\.pdf$/i.test(f.name) ? await pdfToText(f) : await f.text();
    if (!text.trim()) throw new Error('Aucun texte trouvé dans ce fichier (PDF numérisé ?). Copiez-collez plutôt le texte, ou analysez l’ancien texte dans la séance.');
    $('progress-text').value = text.slice(0, 12000);
    $('progress-file-name').textContent = `${f.name} : texte importé (vous pouvez le relire et retirer les renseignements personnels).`;
  } catch (e) { $('progress-file-name').textContent = ''; $('progress-err').textContent = e.message; }
});
$('progress-close').addEventListener('click', () => { $('progression').hidden = true; });
function runProgress(r, prevRes, docText, docName) {
  // Le nom de l'élève, s'il est connu, est retiré du document avant l'envoi.
  let doc = String(docText || '').trim();
  for (const part of String(r.name || '').split(/\s+/).filter((w) => w.length > 1)) doc = doc.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'l’élève');
  const errs = (x) => profileErrors(x).map(({ text, correction, category, subtype, grey }) => ({ text, correction, category, subtype, grey }));
  const from = prevRes ? `${prevRes.exam || 'texte précédent'}${prevRes.exam ? '' : ` (${copyLabel(prevRes)})`}` : (docName || 'évaluation précédente');
  const table = prevRes ? compareTable(prevRes, r).slice(1) : null;
  r.progressBusy = true; r.progressErr = ''; r.profileOpen = true; renderResults();
  api('/api/progression', { method: 'POST', body: {
    level: r.level, year: r.pda?.year,
    current: { words: r.words, conditions: r.conditions || [], errors: errs(r), profile: { usage: r.profile.usage, grammar: r.profile.grammar, syntax: r.profile.syntax, targets: r.profile.targets } },
    previous: prevRes ? { label: from, words: prevRes.words, conditions: prevRes.conditions || [], errors: errs(prevRes) } : { label: from, text: doc },
  } })
    .then((g) => { r.progress = { ...g, from, table, prevId: prevRes?.id || null }; })
    .catch((e) => { r.progressErr = e.message || 'La comparaison n’a pas pu être faite.'; })
    .finally(() => { r.progressBusy = false; renderResults(); });
}
$('progress-run').addEventListener('click', () => {
  const r = progressFor;
  if (!r) return;
  const prevRes = state.results.find((x) => x.id === $('progress-copy').value);
  const doc = $('progress-text').value.trim();
  if (!prevRes && !doc) { $('progress-err').textContent = 'Choisissez un autre texte de l’élève, ou importez une évaluation précédente.'; return; }
  $('progression').hidden = true;
  runProgress(r, prevRes, doc, $('progress-file').files[0]?.name);
});
// Document Word : une fiche par page, modifiable. Fabriqué dans le navigateur (voir docx.js).
function downloadFiches(list) {
  const blocks = [];
  list.forEach((r, i) => {
    if (i) blocks.push({ pagebreak: true });
    blocks.push({ title: 'Profil du scripteur' }, { p: whoLine(r), bold: true }, { p: `${profileHead(r)} · ${new Date().toLocaleDateString('fr-CA')}`, muted: true }, { p: PROFILE_NOTE, muted: true });
    for (const sec of profileSections(r)) {
      blocks.push({ h: sec.title });
      if (sec.items) blocks.push(...sec.items.map((t, i) => ({ bullet: t, ...(sec.ordered ? { mark: `${i + 1}.` } : {}) })));
      if (sec.lines) blocks.push(...sec.lines.map(([k, v]) => ({ bullet: `${k} : ${v}` })));
      if (sec.table) blocks.push(sec.table.length ? { table: [sec.head, ...sec.table], widths: sec.head.length === 4 ? [3000, 1100, 1300, 4680] : [3600, 3240, 3240] } : { p: 'Aucune erreur retenue.' });
    }
    blocks.push({ h: 'Mes observations' }, { p: ' ' });
  });
  const url = URL.createObjectURL(buildDocx(blocks));
  const base = list.length === 1 ? (list[0].name || copyLabel(list[0])) : [$('exam').value, $('group').value].filter(Boolean).join('_') || 'classe';
  const a = h('a', { href: url, download: `profils-scripteur_${base.replace(/[^\p{L}\p{N}_-]+/gu, '-')}_${new Date().toISOString().slice(0, 10)}.docx` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.exported = true;
}

// ---------- Orthopédagogie : accueil (« Que voulez-vous faire ? ») et tableau de bord ----------
// Tout est calculé ici, à partir des erreurs validées : pas d'appel à l'IA, rien n'est conservé.
const INTENTS = {
  groupe: { ico: '👥', title: 'Dresser le profil d’un groupe', sub: 'Déposez les textes du groupe : vue d’ensemble U, G, P, S, V, sous-groupes de besoins, un profil par élève.',
    steps: ['Choisissez l’année des élèves, ce que vous voulez observer et les conditions de rédaction.', 'Déposez les textes du groupe (photos, PDF, Word), puis « Analyser ».', 'Relisez les erreurs, puis « Établir les profils » : le tableau du groupe et les sous-groupes de besoins se remplissent.'] },
  eleve: { ico: '👤', title: 'Établir le profil d’un élève', sub: 'Un texte de l’élève : erreurs classées par type, forces, cibles, questions d’entretien métagraphique.',
    steps: ['Choisissez l’année de l’élève et ses conditions de rédaction.', 'Déposez son texte, puis « Analyser ».', 'Relisez les erreurs dans la copie annotée, puis « Établir le profil du scripteur ».'] },
  evolution: { ico: '📈', title: 'Suivre l’évolution d’un élève', sub: 'Un texte récent et un texte (ou votre fiche) d’avant : ce qui progresse, ce qui persiste, les cibles à ajuster.',
    steps: ['Choisissez l’année de l’élève et ses conditions de rédaction.', 'Déposez son texte précédent (ou importez votre ancienne fiche) et son nouveau texte, puis « Analyser et suivre l’évolution ».', 'Le profil et l’évolution s’établissent après la relecture : avant / maintenant pour 100 mots, progrès, cibles ajustées.'] },
  pi: { ico: '📝', title: 'Préparer un bilan pour le PI', sub: 'Le profil de l’élève et un paragraphe prêt à copier dans le plan d’intervention, avec un objectif SMART suggéré.',
    steps: ['Choisissez l’année de l’élève et ses conditions de rédaction.', 'Déposez son texte, puis « Analyser ».', 'Relisez les erreurs, puis « Établir le profil et le bilan » : « Copier le bilan » le met dans votre presse-papiers.'] },
};
let showIntents = false;
function setIntent(k) {
  if (orthoIntent !== k) $('done-msg').hidden = true; // le message parlait de l'autre tâche
  orthoIntent = k; showIntents = false; foldOpen = { s1: false, s2: k === 'evolution' };
  try { localStorage.setItem('ce.orthoIntent', k); } catch { /* ignoré */ }
  renderOrtho(); renderSummary(); renderDash();
}
const CODE_PISTES = { 'G-GN': 'justification orale des accords (flèches d’accord, donneur et receveur)', 'G-attr': 'justification orale des accords (flèches d’accord)',
  'G-SV': 'repérage du sujet et du donneur d’accord', 'G-SV+': 'repérage du sujet éloigné ou inversé (encadrer « c’est… qui »)', 'G-PP être': 'justification des accords du participe passé',
  'G-PP avoir': 'justification des accords du participe passé', 'G-PP seul': 'justification des accords du participe passé', 'G-homo': 'remplacement par un mot témoin (avait / a, était / est)',
  'G-é/er': 'remplacement par un mot témoin (vendre / vendu)', 'G-conj': 'analyse du radical et de la terminaison', 'P-délim': 'lecture du texte à voix haute pour placer la ponctuation',
  'P-vir CP': 'repérer le complément de phrase placé en tête', 'P-vir': 'lecture à voix haute pour les pauses', 'U-phono': 'conscience phonologique (segmentation en syllabes et en sons)',
  'U-morpho': 'familles de mots et morphèmes', 'U-visuo': 'chantier orthographique et mémorisation des mots', 'U-homo': 'sens des homophones en contexte', 'U-segm': 'phrase dictée du jour',
  'S-P': 'combinaison de phrases et phrase de base', 'S-sub': 'combinaison de phrases (subordonnées)', 'S-nég': 'manipulation de la négation', V: 'banque de mots et synonymes' };
const CRITS = ['U', 'G', 'P', 'S', 'V'];
const CRIT_NAMES = { U: 'orthographe d’usage', G: 'orthographe grammaticale', P: 'ponctuation', S: 'syntaxe', V: 'vocabulaire' };
const HEAT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
const heat = (v) => (v > 0 ? HEAT[Math.min(5, Math.floor(v / 1.4))] : null);
function dashRow(r) {
  const errs = profileErrors(r).filter((e) => !e.grey);
  const by = Object.fromEntries(CRITS.map((c) => [c, errs.filter((e) => codeOf(e)[0] === c).length]));
  const top = recurrent(r).find((g) => g.n - g.grey > 0);
  // Évolution : avec un autre texte de la séance, total pour 100 mots avant et maintenant.
  let trend = r.progress ? 'suivie' : '';
  if (r.progress?.prevId) {
    const prev = state.results.find((x) => x.id === r.progress.prevId);
    const rate = (x) => (x?.words ? (100 * profileErrors(x).filter((e) => !e.grey).length) / x.words : null);
    const a = rate(prev), b = rate(r);
    if (a != null && b != null) trend = b < a * 0.9 ? '↗ moins d’erreurs' : b > a * 1.1 ? '↘ plus d’erreurs' : '= stable';
  }
  return { r, by, total: errs.length, top, trend };
}
function openStudent(r) {
  state.open.add(r.id); r.profileOpen = !!r.profile; renderResults();
  setTimeout(() => document.querySelector(`.card[data-id="${r.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}
function intentsView() {
  const k = orthoIntent;
  // Tâche choisie, rien d'analysé : seulement sa marche à suivre (« Changer de tâche » est dans la barre du haut).
  if (k && !showIntents) return h('div', { class: 'dash-next' }, h('b', { textContent: `${INTENTS[k].ico} ${INTENTS[k].title} : la marche à suivre` }), h('ol', {}, INTENTS[k].steps.map((t) => h('li', { textContent: t }))));
  return h('div', { class: 'dash-hello' },
    h('h3', { textContent: 'Que voulez-vous faire aujourd’hui ?' }),
    h('p', { class: 'muted small', textContent: 'Choisissez une tâche : l’onglet se règle pour vous. Vous pourrez toujours faire le reste ensuite.' }),
    h('div', { class: 'intents' }, Object.entries(INTENTS).map(([id, it]) => h('button', { type: 'button', class: `intent${k === id ? ' on' : ''}`, 'aria-pressed': String(k === id), onclick: () => setIntent(id) },
      h('span', { class: 'ico', textContent: it.ico }), h('span', {}, h('b', { textContent: it.title }), h('span', { textContent: it.sub }))))),
    k ? h('div', { class: 'dash-next' }, h('b', { textContent: `${INTENTS[k].ico} ${INTENTS[k].title} : la marche à suivre` }), h('ol', {}, INTENTS[k].steps.map((t) => h('li', { textContent: t })))) : null);
}
function renderDash() {
  const el = $('ortho-dash');
  const orth = ortho && state.kind === 'lang';
  const mine = state.results.filter((r) => r.ortho);
  $('ortho-students').hidden = true; // le titre de la section le dit déjà
  $('app').querySelector('section.s3').hidden = orth && !mine.length; // rien à lister avant le premier texte
  if (!orth) return;
  renderBar(mine);
  renderFolds(mine);
  if (mine.length && mine.every((r) => r.evo === 'prev' || r.profile)) $('done-msg').hidden = true; // tout est établi : le rappel ne sert plus
  // Suivre l'évolution : un élève, deux textes. Pas de vue de groupe : le suivi pas à pas et l'avant / maintenant.
  const curEvo = orthoIntent === 'evolution' && !showIntents ? mine.filter((r) => r.evo === 'new').sort((a, b) => (b.evoBatch || 0) - (a.evoBatch || 0))[0] : null;
  // Nouveau suivi lancé : on n'affiche pas le précédent, terminé, pendant l'analyse des nouveaux textes.
  if (orthoIntent === 'evolution' && !showIntents && state.running && curEvo?.evoBatch !== state.evoBatch) {
    el.replaceChildren(h('div', { class: 'dash-card' }, h('h4', { textContent: 'Suivi en cours' }),
      h('ol', { class: 'evo-steps' }, ['Analyse des textes', 'Relecture des textes (gratuite)', 'Profil du nouveau texte', 'Comparaison'].map((t, i) =>
        h('li', { class: `evo-step ${i ? 'wait' : 'run'}` }, h('span', { class: 'dot', textContent: i ? '·' : '…' }), h('span', { textContent: t })))),
      h('p', { class: 'muted small', style: 'margin:.4rem 0 0', textContent: 'Tout s’enchaîne seul, en 1 à 3 minutes environ. Gardez l’écran allumé et restez sur cette page.' })));
    return;
  }
  if (curEvo) {
    el.replaceChildren(evoView(curEvo, mine.find((r) => r.evo === 'prev' && r.evoBatch === curEvo.evoBatch) || null));
    return;
  }
  if (orthoIntent === 'pi' && !showIntents && mine.some((r) => r.evo !== 'prev')) { el.replaceChildren(piView(mine.filter((r) => r.evo !== 'prev'))); return; }
  if (!mine.length || showIntents) {
    el.replaceChildren(intentsView());
    return;
  }
  const previous = mine.filter((r) => r.evo === 'prev').length;
  const group = mine.filter((r) => r.evo !== 'prev'); // un texte précédent (suivi de l'évolution) n'est pas un élève de plus
  const rows = [...group].sort((a, b) => (a.no ?? 0) - (b.no ?? 0)).map(dashRow);
  const done = group.filter((r) => r.profile).length;
  const rates = rows.filter((x) => x.r.words).map((x) => (100 * x.total) / x.r.words).sort((a, b) => a - b);
  const median = rates.length ? (rates.length % 2 ? rates[(rates.length - 1) / 2] : (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2) : null;
  const alerts = group.filter((r) => r.profile?.alert);
  const year = levelText(mine[0]);
  const tile = (big, small, warn) => h('div', { class: `kpi${warn ? ' warn' : ''}` }, h('b', { textContent: big }), h('span', { textContent: small }));
  // Vue d'ensemble : U, G, P, S, V pour 100 mots (case plus foncée = plus d'erreurs).
  const cell = (x, c) => {
    const n = x.by[c], v = x.r.words ? (100 * n) / x.r.words : null, bg = v != null ? heat(v) : null;
    const dark = bg && HEAT.indexOf(bg) >= 3;
    return h('td', { class: 'hcell' }, h('div', { class: dark ? 'dark' : '', style: `background:${bg || '#f3f4f8'}`,
      title: `${x.r.name || copyLabel(x.r)} · ${c} (${CRIT_NAMES[c]}) : ${n} erreur${n > 1 ? 's' : ''}${x.r.words ? ` sur ${x.r.words} mots` : ''}`,
      textContent: n ? (v != null ? fmt(Math.round(v * 10) / 10) : String(n)) : '—' }));
  };
  const table = h('div', { class: 'dash-scroll' }, h('table', { class: 'ov' },
    h('thead', {}, h('tr', {}, h('th', { textContent: 'Élève' }), ...CRITS.map((c) => h('th', { class: 'c', title: CRIT_NAMES[c], textContent: c })),
      h('th', { textContent: 'Palier' }), h('th', { class: 'hide-m', textContent: 'Type le plus fréquent' }), h('th', { class: 'hide-m', textContent: 'Conditions' }), h('th', { class: 'hide-m', textContent: 'Évolution' }))),
    h('tbody', {}, rows.map((x) => h('tr', { onclick: () => openStudent(x.r), title: 'Ouvrir le profil, la copie annotée et l’évolution' },
      h('td', { class: 'nm' }, h('b', { textContent: x.r.name || `Copie ${x.r.no ?? ''}` }), h('small', { textContent: x.top ? x.top.label : 'aucune erreur' })),
      ...CRITS.map((c) => cell(x, c)),
      h('td', { class: 'pal' }, x.r.profile?.level ? `${x.r.profile.level}/5` : h('button', { class: 'todo', type: 'button', disabled: !!x.r.rereading || !!x.r.profileBusy, textContent: x.r.profileBusy ? '…' : 'Établir',
        onclick: (ev) => { ev.stopPropagation(); queueProfile(x.r); } })),
      h('td', { class: 'hide-m tgt' }, x.top ? h('span', {}, h('span', { class: 'code', textContent: x.top.code }), ` ${x.top.label.split(' · ')[1] || ''}`) : '—',
        x.r.profile?.alert ? h('span', { class: 'warn-txt', textContent: ' ⚠ à examiner' }) : null),
      h('td', { class: 'hide-m small', textContent: x.r.conditions?.join(', ') || '—' }),
      h('td', { class: `hide-m small${x.trend.startsWith('↗') ? ' up' : ''}`, textContent: x.trend || '—' }))))));
  const legend = h('div', { class: 'legend' }, h('span', { textContent: 'Erreurs pour 100 mots : 0' }), h('span', { class: 'ramp' }, HEAT.map((c) => h('i', { style: `background:${c}` }))),
    h('span', { textContent: '7 et +' }), h('span', { class: 'badge', textContent: 'U usage · G grammaire · P ponctuation · S syntaxe · V vocabulaire' }));
  // Sous-groupes de besoins : élèves dont le type d'erreur le plus fréquent (au moins 2 erreurs) est le même.
  const groups = new Map();
  for (const x of rows) {
    if (!x.top || x.top.n - x.top.grey < 2) continue;
    if (!groups.has(x.top.code)) groups.set(x.top.code, { label: x.top.label, list: [] });
    groups.get(x.top.code).list.push(x.r);
  }
  const chip = (r) => h('button', { type: 'button', class: 'who', textContent: r.name || `Copie ${r.no ?? ''}`, onclick: () => openStudent(r) });
  const subgroups = [
    ...(alerts.length ? [h('div', { class: 'grp warn' }, h('div', { class: 't' }, h('span', { textContent: '⚠ À examiner en priorité' }), h('em', { textContent: pl(alerts.length, 'élève', 'élèves') })),
      h('div', { class: 'whos' }, alerts.map(chip)), h('div', { class: 'act', textContent: alerts.map((r) => r.profile.alert).join(' ') }))] : []),
    ...[...groups.entries()].sort((a, b) => b[1].list.length - a[1].list.length).map(([code, g]) => h('div', { class: 'grp' },
      h('div', { class: 't' }, h('span', {}, h('span', { class: 'code', textContent: code }), ` ${g.label.split(' · ')[1] || ''}`), h('em', { textContent: pl(g.list.length, 'élève', 'élèves') })),
      h('div', { class: 'whos' }, g.list.map(chip)), CODE_PISTES[code] ? h('div', { class: 'act', textContent: `Piste : ${CODE_PISTES[code]}.` }) : null)),
  ];
  // Types d'erreurs les plus fréquents du groupe (une seule série : une seule couleur).
  const tally = new Map();
  for (const r of group) for (const g of recurrent(r)) { const k = g.n - g.grey; if (k) tally.set(g.label, (tally.get(g.label) || 0) + k); }
  const bars = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...bars.map(([, n]) => n));
  const barsEl = bars.length ? h('div', { class: 'bars' }, bars.map(([label, n]) => h('div', { class: 'brow', title: `${label} : ${n} erreur${n > 1 ? 's' : ''}` },
    h('span', { class: 'lab' }, h('span', { class: 'code', textContent: label.split(' · ')[0] }), ` ${label.split(' · ')[1] || ''}`),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(100 * n) / max}%` }), h('span', { class: 'val', style: `left:${(100 * n) / max}%`, textContent: String(n) }))))) : h('p', { class: 'muted small', textContent: 'Aucune erreur retenue.' });
  el.replaceChildren(...[
    h('div', { class: 'dash-head' }, h('div', {}, h('h3', { textContent: `Vue d’ensemble${year ? ` · ${year.replace(/^(\d+\w+) /, '$1 ')}` : ''}` }),
      h('p', { class: 'muted small', textContent: `${pl(group.length, 'élève', 'élèves')}${previous ? ` (+ ${pl(previous, 'texte précédent', 'textes précédents')}, pour l’évolution)` : ''}${$('ortho-focus').value.trim() ? ` · observer : ${$('ortho-focus').value.trim()}` : ''} · aucun texte conservé` })),
      h('div', { class: 'dash-btns' }, h('button', { class: 'btn small', type: 'button', textContent: 'Suivre l’évolution d’un élève', onclick: () => setIntent('evolution') }))),
    h('div', { class: 'kpis' }, tile(String(group.length), pl(group.length, 'élève', 'élèves').replace(/^\d+ /, '')), tile(`${done} / ${group.length}`, 'profils établis'),
      tile(median != null ? fmt(Math.round(median * 10) / 10) : '—', 'erreurs pour 100 mots (médiane)'), tile(String(alerts.length), alerts.length > 1 ? 'élèves à examiner en priorité' : 'élève à examiner en priorité', alerts.length > 0)),
    h('div', { class: 'dash-card' }, h('h4', { textContent: 'Vue d’ensemble du groupe' }), table, legend, h('p', { class: 'muted small', style: 'margin:.4rem 0 0', textContent: 'Touchez un élève pour ouvrir son profil, sa copie annotée et son évolution.' })),
    group.length > 1 ? h('div', { class: 'dash-two' },
      h('div', { class: 'dash-card' }, h('h4', { textContent: 'Sous-groupes de besoins suggérés' }), subgroups.length ? subgroups : h('p', { class: 'muted small', textContent: 'Pas encore de type d’erreur commun à plusieurs élèves (au moins 2 erreurs chacun).' })),
      h('div', { class: 'dash-card' }, h('h4', { textContent: 'Types d’erreurs les plus fréquents du groupe' }), barsEl, h('p', { class: 'muted small', style: 'margin:.4rem 0 0', textContent: 'Nombre d’erreurs, tous les textes de la séance.' }))) : null].filter(Boolean));
}


// Vue « Suivre l'évolution » : les étapes en direct, l'avant / maintenant (calculé dès l'analyse), puis la comparaison.
function evoView(cur, prev) {
  const who = (r) => r.name || `Copie ${r.no ?? ''}`;
  const rr = cur.rereading || prev?.rereading;
  const state1 = (ok, run, err) => (ok ? 'ok' : run ? 'run' : err ? 'err' : 'wait');
  const sProfile = state1(cur.profile, cur.profileBusy, cur.profileErr);
  const sCompare = state1(cur.progress, cur.progressBusy, cur.progressErr);
  const step = (label, st, extra) => h('li', { class: `evo-step ${st}` }, h('span', { class: 'dot', textContent: { ok: '✓', run: '…', err: '!', wait: '·' }[st] }), h('span', {}, label, extra || null));
  const retry = (fn) => h('button', { class: 'btn small', type: 'button', style: 'margin-left:.5rem', textContent: 'Réessayer', onclick: fn });
  const docName = cur.evoDoc?.name;
  const steps = h('ol', { class: 'evo-steps' },
    step(`Analyse des textes${prev ? ` : ${who(prev)} (précédent) et ${who(cur)} (nouveau)` : ''}`, 'ok'),
    step('Relecture des textes (gratuite)', rr ? 'run' : 'ok'),
    step('Profil du nouveau texte', rr ? 'wait' : sProfile, sProfile === 'err' ? retry(() => { cur.profileErr = ''; queueProfile(cur); }) : null),
    step(`Comparaison avec ${prev ? 'le texte précédent' : docName ? `votre fiche « ${docName} »` : 'l’évaluation précédente'}`, cur.profile ? sCompare : 'wait',
      sCompare === 'err' ? retry(() => runProgress(cur, prev, prev ? '' : cur.evoDoc?.text, prev ? '' : docName)) : null));
  const busy = rr || cur.profileBusy || cur.progressBusy;
  // Avant / maintenant, par critère, pour 100 mots (seulement avec un texte précédent analysé).
  const rate = (r, c) => { if (!r?.words) return null; const errs = profileErrors(r).filter((e) => !e.grey && (!c || codeOf(e)[0] === c)); return (100 * errs.length) / r.words; };
  const fmtR = (v) => (v == null ? '—' : fmt(Math.round(v * 10) / 10));
  const trend = (a, b) => (a == null || b == null ? '' : b < a * 0.9 ? '↗ moins d’erreurs' : b > a * 1.1 ? '↘ plus d’erreurs' : '= stable');
  const cmp = prev ? h('div', { class: 'dash-card' }, h('h4', { textContent: 'Avant / maintenant (erreurs pour 100 mots)' }),
    h('div', { class: 'dash-scroll' }, h('table', { class: 'ov evo-cmp' },
      h('thead', {}, h('tr', {}, ['Critère', 'Avant', 'Maintenant', 'Évolution'].map((t) => h('th', { textContent: t })))),
      h('tbody', {}, [...CRITS.map((c) => [`${c} · ${{ U: 'usage', G: 'grammaire', P: 'ponctuation', S: 'syntaxe', V: 'vocabulaire' }[c]}`, rate(prev, c), rate(cur, c)]), ['Total', rate(prev), rate(cur)]].map(([label, a, b]) => {
        const t = trend(a, b);
        return h('tr', { class: label === 'Total' ? 'tot' : '' }, h('td', { textContent: label }), h('td', { textContent: fmtR(a) }), h('td', { textContent: fmtR(b) }),
          h('td', { class: t.startsWith('↗') ? 'up' : t.startsWith('↘') ? 'down' : '', textContent: (a === 0 && b === 0) ? '—' : t || '—' }));
      })))),
    h('p', { class: 'muted small', style: 'margin:.4rem 0 0', textContent: `Avant : ${who(prev)}, ${prev.words ? `${prev.words} mots` : 'mots non comptés'}. Maintenant : ${who(cur)}, ${cur.words ? `${cur.words} mots` : 'mots non comptés'}. ${rr ? 'Les chiffres peuvent changer pendant la relecture.' : 'Vous avez retiré ou ajouté des erreurs ? Les chiffres suivent.'}` }))
    : null;
  const g = cur.progress;
  const list = (title, items) => (items?.length ? h('div', { class: 'prof-sec' }, h('h4', { textContent: title }), h('ul', {}, items.map((t) => h('li', { textContent: t })))) : null);
  const result = g ? h('div', { class: 'dash-card' }, h('h4', { textContent: `Évolution depuis : ${g.from}` }),
    h('p', { style: 'margin:0 0 .5rem', textContent: g.summary }),
    list('Progrès', g.progress), list('Difficultés persistantes', g.persistent), list('Nouvelles difficultés', g.fresh),
    g.targets.length ? h('div', { class: 'prof-sec' }, h('h4', { textContent: 'Cibles ajustées' }), h('ol', {}, g.targets.map((t) => h('li', { textContent: `${t.target}${t.why ? ` — ${t.why}` : ''}` })))) : null,
    g.caution ? h('p', { class: 'muted small', textContent: `Prudence : ${g.caution}` }) : null,
    h('div', { class: 'prof-actions' }, h('button', { class: 'btn small primary', type: 'button', textContent: 'Ouvrir le profil complet', onclick: () => openStudent(cur) }),
      h('button', { class: 'btn small', type: 'button', textContent: 'Copier le profil et l’évolution', onclick: (ev) => copyFrom(ev.currentTarget, profileText(cur)) }),
      h('button', { class: 'btn small', type: 'button', textContent: 'Word', onclick: () => downloadFiches([cur]) }))) : null;
  return h('div', { class: 'ortho-dash' },
    h('div', { class: 'dash-head' }, h('div', {}, h('h3', { textContent: `Suivi de l’évolution${levelText(cur) ? ` · ${levelText(cur)}` : ''}` }),
      h('p', { class: 'muted small', textContent: prev ? `Texte précédent : ${copyLabel(prev)} · Nouveau texte : ${copyLabel(cur)}` : docName ? `Évaluation précédente : votre fiche « ${docName} » · Nouveau texte : ${copyLabel(cur)}` : 'Aucun texte précédent : déposez-le pour comparer.' })),
      h('div', { class: 'dash-btns' }, h('button', { class: 'btn small', type: 'button', textContent: '← Tableau du groupe', onclick: () => setIntent('groupe') }))),
    h('div', { class: 'dash-card' }, h('h4', { textContent: g ? 'Suivi terminé' : 'Suivi en cours' }), steps,
      busy ? h('p', { class: 'muted small', style: 'margin:.4rem 0 0', textContent: 'Tout s’enchaîne seul, en 1 à 3 minutes environ. Gardez l’écran allumé et restez sur cette page.' }) : null),
    cmp, result);
}


// ---------- Barre du tableau de bord : la tâche en cours et ses options, toujours en haut ----------
function renderBar(mine) {
  const it = INTENTS[orthoIntent];
  const group = mine.filter((r) => r.evo !== 'prev');
  const missing = group.filter((r) => !r.profile && !r.profileBusy && !r.rereading);
  const ready = group.filter((r) => r.profile);
  const btn = (label, cls, fn, dis) => h('button', { class: `btn small ${cls || ''}`, type: 'button', disabled: !!dis, textContent: label, onclick: fn });
  const many = (n, one, plural) => (n > 1 ? `${plural} (${n})` : one);
  const a = [];
  const pick = showIntents || !it;
  if (!pick) {
    if (orthoIntent === 'groupe' && missing.length) a.push(btn(`Établir les profils du groupe (${missing.length})`, 'primary', () => missing.forEach(queueProfile)));
    if (orthoIntent === 'eleve' && missing.length) a.push(btn(many(missing.length, 'Établir le profil', 'Établir les profils'), 'primary', () => missing.forEach(queueProfile)));
    if (orthoIntent === 'pi' && missing.length) a.push(btn(many(missing.length, 'Établir le bilan pour le PI', 'Établir les bilans pour le PI'), 'primary', () => missing.forEach(queueProfile)));
    if (orthoIntent === 'pi' && ready.length) a.push(btn(many(ready.length, 'Imprimer le bilan pour le PI', 'Imprimer les bilans pour le PI'), ready.length && !missing.length ? 'primary' : '', () => printPi(ready)), btn('Bilan pour le PI (Word)', '', () => downloadPi(ready)));
    if (orthoIntent === 'groupe' && ready.length) a.push(btn('Télécharger les profils du groupe (Word)', '', () => $('export-fiches').click()));
    if (orthoIntent === 'eleve' && ready.length) a.push(btn(many(ready.length, 'Télécharger le profil (Word)', 'Télécharger les profils (Word)'), '', () => $('export-fiches').click()));
    if (orthoIntent === 'evolution') {
      const cur = mine.filter((r) => r.evo === 'new' && r.progress).sort((x, y) => (y.evoBatch || 0) - (x.evoBatch || 0))[0];
      if (cur) a.push(btn('Télécharger le suivi de l’évolution (Word)', 'primary', () => downloadFiches([cur])));
    }
    if (mine.length) a.push(btn('Exporter les erreurs (Excel)', '', () => $('export').click(), state.running));
    if (mine.length) a.push(btn('Terminer la séance', 'ghost', () => $('end').click(), state.running));
  }
  const change = pick ? (it && mine.length ? btn('← Retour au tableau de bord', '', () => { showIntents = false; renderDash(); }) : null)
    : btn('Changer de tâche', 'ghost', () => { showIntents = true; renderDash(); });
  $('ortho-bar').replaceChildren(...[h('div', { class: 'bar-task' }, h('span', { class: 'muted small', textContent: 'Tâche :' }), h('b', { textContent: it && !pick ? `${it.ico} ${it.title}` : 'à choisir' }), change),
    a.length ? h('div', { class: 'bar-actions' }, a) : null].filter(Boolean));
}

// Une fois les textes analysés, l'ajout et les réglages se replient en une ligne (le tableau de bord prend la place).
let foldOpen = { s1: false, s2: false };
function renderFolds(mine) {
  const s1 = $('app').querySelector('section.s1'), s2 = $('app').querySelector('section.s2');
  const yearOk = !!$('pda-year').value;
  const done = mine.length > 0 && !state.running && !state.pages.length;
  s2.classList.toggle('folded', done && !foldOpen.s2);
  s1.classList.toggle('folded', mine.length > 0 && yearOk && !foldOpen.s1);
  const line = (sec, text, label, key) => {
    let f = sec.querySelector(':scope > .fold-line');
    if (!f) { f = h('div', { class: 'fold-line' }); sec.querySelector(':scope > .band, :scope > .step-head').after(f); }
    f.replaceChildren(h('span', { class: 'muted small', textContent: text }), h('button', { class: 'btn small', type: 'button', textContent: label, onclick: () => { foldOpen[key] = true; renderDash(); } }));
  };
  const n = mine.filter((r) => r.evo !== 'prev').length;
  line(s2, orthoIntent === 'evolution' ? 'Le suivi est lancé.' : `${pl(n, 'texte analysé', 'textes analysés')}.`,
    orthoIntent === 'evolution' ? '+ Suivre un autre élève' : orthoIntent === 'groupe' ? '+ Ajouter d’autres textes' : '+ Ajouter un autre texte', 's2');
  const conds = orthoConditions();
  line(s1, [levelText({ pda: { year: Number($('pda-year').value) }, level: $('lang-level').value }), conds.length ? conds.join(', ') : 'conditions non précisées',
    $('ortho-focus').value.trim() ? `observer : ${$('ortho-focus').value.trim()}` : ''].filter(Boolean).join(' · '), 'Modifier', 's1');
}

// ---------- Bilan pour le PI : un document court, dans l'ordre d'un plan d'intervention ----------
function piSections(r) {
  const p = r.profile, rec = recurrent(r).filter((g) => g.n - g.grey > 0).slice(0, 3), lever = leverage(r);
  const per = (g) => (r.words ? `, ${fmt(Math.round((1000 * (g.n - g.grey)) / r.words) / 10)} pour 100 mots` : '');
  return [
    p.forces.length ? { title: 'Forces', items: p.forces } : null,
    p.targets.length ? { title: 'Besoins prioritaires', ordered: true, items: p.targets.map((t) => `${t.target}${t.why ? ` — ${t.why}` : ''}`) } : null,
    rec.length ? { title: 'Données (erreurs validées)', items: [...rec.map((g) => `${g.label} : ${pl(g.n - g.grey, 'erreur', 'erreurs')}${per(g)}`), ...(lever ? [lever] : [])] } : null,
    p.smart ? { title: 'Objectif SMART suggéré', items: [p.smart] } : null,
    p.activities.length ? { title: 'Moyens (pistes d’intervention)', items: p.activities } : null,
    p.adaptations.length ? { title: 'Mesures d’adaptation à envisager', items: p.adaptations } : null,
    p.pi ? { title: 'Bilan', items: [p.pi] } : null,
  ].filter(Boolean);
}
const PI_NOTE = 'Bilan provisoire préparé à partir des erreurs validées d’une production : à valider et à compléter par l’orthopédagogue.';
const piHead = (r) => [levelText(r), r.words ? `${r.words} mots` : '', r.conditions?.length ? `conditions : ${r.conditions.join(', ')}` : '', new Date().toLocaleDateString('fr-CA')].filter(Boolean).join(' · ');
function piFullText(r) {
  const out = [`BILAN POUR LE PLAN D’INTERVENTION — ${whoLine(r)}`, piHead(r), ''];
  for (const sec of piSections(r)) { out.push(sec.title.toUpperCase(), ...sec.items.map((t, i) => (sec.ordered ? `${i + 1}. ${t}` : `- ${t}`)), ''); }
  out.push(PI_NOTE);
  return out.join('\n');
}
function downloadPi(list) {
  const blocks = [];
  list.forEach((r, i) => {
    if (i) blocks.push({ pagebreak: true });
    blocks.push({ title: 'Bilan pour le plan d’intervention' }, { p: whoLine(r), bold: true }, { p: piHead(r), muted: true }, { p: PI_NOTE, muted: true });
    for (const sec of piSections(r)) { blocks.push({ h: sec.title }, ...sec.items.map((t, k) => ({ bullet: t, ...(sec.ordered ? { mark: `${k + 1}.` } : {}) }))); }
    blocks.push({ h: 'Décision de l’équipe' }, { p: ' ' });
  });
  const url = URL.createObjectURL(buildDocx(blocks));
  const base = list.length === 1 ? (list[0].name || copyLabel(list[0])) : 'eleves';
  const a = h('a', { href: url, download: `bilan-PI_${base.replace(/[^\p{L}\p{N}_-]+/gu, '-')}_${new Date().toISOString().slice(0, 10)}.docx` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.exported = true;
}
function printPi(list) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const w = window.open('', '_blank');
  if (!w) { banner('err', 'La fenêtre d’impression a été bloquée : autorisez les fenêtres pour ce site, ou utilisez « Bilan pour le PI (Word) ».'); return; }
  const body = list.map((r, i) => `<section class="sheet"${i ? ' style="break-before:page"' : ''}><h1>Bilan pour le plan d’intervention</h1><p class="who">${esc(whoLine(r))}</p><p class="meta">${esc(piHead(r))}</p><p class="note">${esc(PI_NOTE)}</p>
    ${piSections(r).map((sec) => `<h2>${esc(sec.title)}</h2><${sec.ordered ? 'ol' : 'ul'}>${sec.items.map((t) => `<li>${esc(t)}</li>`).join('')}</${sec.ordered ? 'ol' : 'ul'}>`).join('')}
    <h2>Décision de l’équipe</h2><div class="blank"></div></section>`).join('');
  w.document.write(`<!doctype html><html lang="fr-CA"><head><meta charset="utf-8"><title>Bilan pour le PI</title><style>
    body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:28px;max-width:760px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;color:#1f3a8a;margin:18px 0 4px}
    .who{font-weight:700;margin:0}.meta,.note{color:#555;font-size:12px;margin:2px 0}ul,ol{margin:0;padding-left:20px}.blank{border:1px solid #bbb;border-radius:6px;height:90px}
    @media print{body{margin:0}}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
  state.exported = true;
}
function piView(list) {
  return h('div', { class: 'ortho-dash' }, list.map((r) => {
    const head = h('div', { class: 'dash-head' }, h('div', {}, h('h3', { textContent: `Bilan pour le PI · ${r.name || `Copie ${r.no ?? ''}`}` }), h('p', { class: 'muted small', textContent: piHead(r) })));
    if (!r.profile) {
      return h('div', { class: 'dash-card' }, head, h('p', { class: 'small', style: 'margin:.5rem 0', textContent: r.rereading ? 'Relecture du texte en cours…' : r.profileBusy ? 'Bilan en préparation…'
        : 'Relisez d’abord les erreurs dans la copie annotée (retirez les fausses, ajoutez les oubliées), puis établissez le bilan.' }),
      r.profileErr ? h('p', { class: 'small', style: 'color:var(--danger,#b91c1c)', textContent: r.profileErr }) : null,
      h('div', { class: 'prof-actions' }, h('button', { class: 'btn small', type: 'button', textContent: 'Voir la copie annotée', onclick: () => openViewer(r) }),
        h('button', { class: 'btn small primary', type: 'button', disabled: !!r.rereading || !!r.profileBusy, textContent: 'Établir le bilan pour le PI', onclick: () => queueProfile(r) })));
    }
    return h('div', { class: 'dash-card' }, head,
      r.profileSig !== profileSig(r) ? h('div', { class: 'prof-stale small' }, 'Vous avez modifié les erreurs depuis ce bilan. ', h('button', { class: 'btn small', type: 'button', textContent: 'Refaire le bilan', onclick: () => queueProfile(r) })) : null,
      ...piSections(r).map((sec) => h('div', { class: 'prof-sec' }, h('h4', { textContent: sec.title }), h(sec.ordered ? 'ol' : 'ul', {}, sec.items.map((t) => h('li', { textContent: t }))))),
      h('p', { class: 'faint small', style: 'margin:.4rem 0 0', textContent: PI_NOTE }),
      h('div', { class: 'prof-actions' }, h('button', { class: 'btn small primary', type: 'button', textContent: 'Imprimer le bilan', onclick: () => printPi([r]) }),
        h('button', { class: 'btn small', type: 'button', textContent: 'Copier le bilan', onclick: (ev) => copyFrom(ev.currentTarget, piFullText(r)) }),
        h('button', { class: 'btn small', type: 'button', textContent: 'Word', onclick: () => downloadPi([r]) }),
        h('button', { class: 'btn small ghost', type: 'button', textContent: 'Profil complet', onclick: () => openStudent(r) })));
  }));
}

// ---------- Suivre l'évolution d'un élève : deux zones de dépôt, puis tout s'enchaîne ----------
// Texte précédent (analysé comme les autres) ou ancienne fiche (lue dans le navigateur) + nouveau texte. Après la
// relecture : le profil du nouveau texte, puis la comparaison. Chaque étape reste visible et modifiable.
state.evoDoc = null;
function evoZone(zoneId, inputId, nameId, tag) {
  dropzone($(zoneId), $(inputId), async (files, progress) => {
    const added = await filesToPages(files, progress);
    if (!added.length) return;
    state.pages = state.pages.filter((p) => p.evo !== tag); // une seule copie par zone : la dernière déposée
    added.forEach((p, i) => { p.evo = tag; p.firstOfFile = i === 0; });
    state.pages.push(...added);
    state.pages.sort((a, b) => (a.evo === 'prev' ? 0 : a.evo === 'new' ? 1 : 2) - (b.evo === 'prev' ? 0 : b.evo === 'new' ? 1 : 2));
    $('mode').value = 'file'; state.modeChosen = true; applyMode();
    $(nameId).textContent = `✓ ${files.map((f) => f.name).join(', ')}`;
    renderPages();
  });
}
evoZone('evo-prev', 'evo-prev-files', 'evo-prev-name', 'prev');
evoZone('evo-new', 'evo-new-files', 'evo-new-name', 'new');
$('evo-doc').addEventListener('change', async () => {
  const f = $('evo-doc').files[0];
  if (!f) return;
  try {
    const text = /\.docx$/i.test(f.name) ? await docxToText(f) : /\.pdf$/i.test(f.name) ? await pdfToText(f) : await f.text();
    if (!text.trim()) throw new Error('Aucun texte trouvé dans ce fichier (PDF numérisé ?).');
    state.evoDoc = { name: f.name, text: text.slice(0, 12000) };
    state.pages = state.pages.filter((p) => p.evo !== 'prev'); $('evo-prev-name').textContent = '';
    $('evo-doc-name').textContent = `✓ Ancienne fiche : ${f.name} (le nom de l’élève, s’il est connu, sera retiré avant l’envoi)`;
    renderPages();
  } catch (e) { $('evo-doc-name').textContent = e.message; }
  $('evo-doc').value = '';
});
// Appelée quand une relecture ou un profil se termine : fait avancer l'enchaînement.
function evoTick() {
  const cur = state.results.find((r) => r.ortho && r.evo === 'new' && !r.evoDone);
  if (!cur || cur.rereading) return;
  const prev = state.results.find((r) => r.ortho && r.evo === 'prev' && r.evoBatch === cur.evoBatch);
  if (prev?.rereading) return;
  if (!prev && !cur.evoDoc) { cur.evoDone = true; return; }
  if (!cur.profile) { if (!cur.profileBusy && !cur.profileErr) queueProfile(cur); return; }
  cur.evoDone = true;
  runProgress(cur, prev || null, prev ? '' : cur.evoDoc.text, prev ? '' : cur.evoDoc.name);
}
$('profile-all').addEventListener('click', () => state.results.filter((r) => r.ortho && r.evo !== 'prev' && !r.profile && !r.profileBusy && !r.rereading).forEach(queueProfile));
$('export-fiches').addEventListener('click', async () => {
  const btn = $('export-fiches');
  const mine = state.results.filter((r) => r.ortho);
  mine.filter((r) => r.evo !== 'prev' && !r.profile && !r.profileBusy && !r.rereading).forEach(queueProfile);
  if (mine.some((r) => r.profileBusy || r.rereading)) {
    btn.disabled = true; btn.textContent = 'Préparation des profils…';
    await new Promise((res) => { const t = setInterval(() => { if (!mine.some((r) => r.profileBusy || r.rereading)) { clearInterval(t); res(); } }, 500); });
    btn.disabled = false; btn.textContent = 'Télécharger les profils (Word)';
  }
  const ready = mine.filter((r) => r.profile);
  if (!ready.length) { banner('err', 'Aucun profil n’a pu être établi. Réessayez.'); return; }
  downloadFiches([...ready].sort((x, y) => (x.no ?? 0) - (y.no ?? 0)));
});

function langCard(r) {
  const errors = r.pages.flatMap((p) => p.errors);
  const n = r.pda ? langGrade(r) : counted(errors).length;
  const grey = errors.filter((e) => e.grey).length;
  const gradeEl = h('span', { class: 'grade' });
  // Ligne courte (le nom de l'élève doit rester lisible) ; le nombre de mots est dans le détail de la copie.
  const detail = r.pda ? `${r.pct == null ? '' : `${pctText(fmt(Math.round(r.pct * 10) / 10))} · `}${plural(n, 'faute retenue', 'fautes retenues', 'error', 'errors')}`
    : r.grade == null ? '' : `${n} faute(s)`;
  gradeEl.replaceChildren(r.ortho ? h('span', {}, r.profile?.level ? `Palier ${r.profile.level}/5` : `${n}`, h('small', {}, r.profile?.level ? ` · ${n} erreur${n > 1 ? 's' : ''}` : ` erreur${n > 1 ? 's' : ''}`))
    : r.pda ? h('span', {}, r.cote || '—', h('small', {}, ` · ${detail}`))
    : r.grade == null ? `${n} faute${n > 1 ? 's' : ''}`
    : h('span', {}, fmt(r.grade), h('small', {}, ` / ${fmt(r.total)} · ${detail}`)));
  // Sur téléphone, le détail passe sous le nom (sinon « Rosalie Gagné » devenait « Rosa »).
  return cardShell(r, [h('span', { class: 'detail', textContent: detail }), gradeEl],
    h('div', { class: 'card-body' },
      r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
      errors.length ? categoryChips(errors) : h('p', { class: 'muted small', style: 'margin:0', textContent: 'Aucune faute relevée.' }),
      r.pda ? h('p', { class: 'small', style: 'margin:0', textContent: pdaLine(r, n) }) : null,
      r.pda && (grey || r.dup?.length) ? h('p', { class: 'muted small', style: 'margin:0', textContent: [grey ? `${plural(grey, 'faute', 'fautes', 'error', 'errors')} ${L('en gris : notion en apprentissage, ne compte pas', 'in grey: being learned, not counted')}` : '', r.dup?.length ? `${plural(r.dup.length, 'faute répétée, retenue', 'fautes répétées, retenues', 'repeated error, counted', 'repeated errors, counted')} ${L('une seule fois', 'once')}` : ''].filter(Boolean).join(' · ') }) : null,
      r.rereading ? h('p', { class: 'muted small', style: 'margin:0', textContent: 'Relecture en cours : d’autres fautes peuvent s’ajouter…' }) : null,
      r.ortho ? profileBlock(r) : null,
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
// Dernière faute retirée de la copie ouverte : « Annuler » la remet à sa place.
let removed = null;
// « Retour » du téléphone ou du navigateur : ferme la copie ouverte au lieu de quitter l'appli (et de perdre les résultats).
function modalOpened(id) { if (history.state?.modal !== id) history.pushState({ modal: id }, ''); }
function modalClose(id) {
  if (history.state?.modal === id) { history.back(); return; } // repasse par popstate, qui ferme
  $(id).hidden = true; if (id === 'viewer') viewing = null;
}
window.addEventListener('popstate', () => {
  for (const id of ['zoom', 'viewer']) if (!$(id).hidden) { $(id).hidden = true; if (id === 'viewer') viewing = null; }
});

function openViewer(r) {
  modalOpened('viewer');
  viewing = r;
  adding = null;
  removed = null;
  $('viewer-pages').classList.remove('zoom');
  $('viewer').hidden = false;
  renderViewer();
}

function renderViewer(focus) {
  const r = viewing;
  const count = langGrade(r);
  $('viewer-title').textContent = r.pda ? `${copyTitle(r) || 'Élève'} · ${pdaLine(r, count)}${r.cote && !r.ortho ? ` → ${r.cote}` : ''}`
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
    removed?.r === r ? h('div', { class: 'undo-bar' }, h('span', { textContent: `${tr('Faute retirée')} : « ${removed.e.text} »` }),
      h('button', { class: 'btn small', type: 'button', textContent: tr('↶ Remettre'), onclick: () => {
        const { p, e, at } = removed;
        p.errors.splice(Math.min(at, p.errors.length), 0, e);
        removed = null; state.exported = false;
        renderViewer(e); renderResults();
      } })) : null,
    adding?.stage === 'form' ? addErrorForm() : null,
    items.length ? categoryChips(items.map((i) => i.e)) : h('p', { class: 'muted', textContent: 'Aucune faute relevée.' }),
    ...items.map(({ e, p, n: k }) => {
      const el = h('div', { class: `err ${CATS[e.category].cls} ${e.grey ? 'grey' : ''} ${focus === e ? 'focus' : ''}`, onclick: () => renderViewer(e) },
        h('div', { class: 'err-head' }, h('b', { textContent: `${k}. ${r.ortho ? '' : CATS[e.category].label}${e.box ? '' : ' (non localisée)'}${e.doubtful ? ' · à vérifier' : ''}${e.grey ? L(' · notion en apprentissage : ne compte pas', ' · being learned: not counted') : ''}${r.dup?.includes(e) ? L(' · répétée : retenue une seule fois', ' · repeated: counted once') : ''}` }), r.ortho ? subtypeSelect(r, e) : null,
          h('button', { class: 'icon-btn', type: 'button', textContent: '×', title: "Ce n'est pas une faute : retirer", onclick: (ev) => {
            ev.stopPropagation();
            removed = { r, p, e, at: p.errors.indexOf(e) };
            p.errors = p.errors.filter((x) => x !== e);
            state.exported = false;
            renderViewer(); renderResults();
          } })),
        h('div', { class: 'fix' }, h('s', { textContent: e.text }), ' → ', h('b', { textContent: e.correction })),
        h('div', { class: 'muted small', textContent: e.explanation }),
        e.notion ? h('div', { class: 'faint small', textContent: `${L('Progression des apprentissages', 'Quebec curriculum')} : ${notionLabel([...PDA_NOTIONS, ...PDA_SEC_NOTIONS].find((x) => x.id === e.notion))}` }) : null);
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
  // Orthopédagogie : le type d'erreur (pour la fiche du scripteur), limité à ceux de la catégorie choisie.
  const sub = h('select', {});
  const fillSub = () => sub.replaceChildren(h('option', { value: '', textContent: '— Type (facultatif) —' }),
    ...Object.keys(SUBTYPES).filter((k) => SUB_CAT[k] === cat.value).map((k) => h('option', { value: k, textContent: subLabel(k) })));
  fillSub(); cat.addEventListener('change', fillSub);
  const save = async () => {
    if (!text.value.trim() || !fix.value.trim()) { text.focus(); return; }
    const { page, box } = adding;
    // Le cadre tracé à la main est resserré sur l'encre du mot (on garde le tracé si l'encre n'est pas trouvée).
    let snapped = box;
    try { snapped = refineToInk(await pageData(page.url), box); } catch { /* tracé gardé */ }
    const e = { text: text.value.trim(), correction: fix.value.trim(), category: cat.value, explanation: why.value.trim(), box: snapped, manual: true, ...(sub.value ? { subtype: sub.value } : {}) };
    page.errors.push(e);
    adding = null;
    state.exported = false;
    renderViewer(e); renderResults();
  };
  setTimeout(() => text.focus(), 0);
  return h('div', { class: 'err add-form' },
    h('b', { textContent: 'Nouvelle faute' }),
    field('Mot ou passage écrit', text), field('Correction', fix), field('Catégorie', cat), viewing?.ortho ? field('Type d’erreur', sub) : null, field('Explication (facultatif)', why),
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
      // Primaire : une faute « en apprentissage » est imprimée en gris, avec « ne compte pas », comme à l'écran.
      const color = e.grey ? '#9ca3af' : CATS[e.category].color;
      list.push(`<li${e.grey ? ' style="color:#6b7280"' : ''}><b style="color:${color}">${k}. ${esc(tr(CATS[e.category].label))}${e.grey ? ` · ${esc(L('en apprentissage, ne compte pas', 'being learned, not counted'))}` : ''}</b> — <s>${esc(e.text)}</s> → <b>${esc(e.correction)}</b><br><small>${esc(e.explanation)}</small></li>`);
      if (!e.box) continue;
      const [y0, x0, y1, x1] = e.box.map((v) => v / 1000);
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.setLineDash(e.grey ? [8, 6] : []);
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
    <h1>${esc(copyTitle(r) || tr('Élève'))}${r.group ? ` · ${esc(r.group)}` : ''} — ${r.pda ? `${esc(pdaLine(r, langGrade(r)))}${r.cote ? ` → ${r.cote}` : ''}${greyCount(r) ? ` (+${greyCount(r)} ${esc(L('en apprentissage', 'being learned'))})` : ''}` : tr(`${n} faute(s)`)}${r.grade != null ? ` · ${fmt(r.grade)} / ${fmt(r.total)}` : ''}</h1>
    ${sheets.join('')}
    <script>window.onload=()=>{
      // Chaque page de copie tient sur une feuille : on réduit l'image tant que la feuille déborde (lettre, marges de 10 mm).
      const max=(279.4-20)*96/25.4-4;
      document.querySelectorAll('.sheet').forEach((s,i)=>{const im=s.querySelector('img');const extra=i===0?document.querySelector('h1').offsetHeight:0;
        while(s.offsetHeight+extra>max&&im.offsetHeight>250)im.style.maxHeight=(im.offsetHeight-15)+'px';});
      window.print();}<\/script></body></html>`);
  w.document.close();
}

// Trois onglets : copies, langue, orthopédagogie. L'orthopédagogie est la correction de la langue avec, en plus,
// les erreurs classées par type et la fiche du scripteur (state.kind reste « lang » ; « ortho » dit l'onglet).
function setKind(kind) {
  if (state.running) return;
  if (kind === 'ortho' && !orthoAvailable()) kind = 'lang';
  const tab = kind;
  ortho = tab === 'ortho';
  kind = ortho ? 'lang' : tab;
  state.kind = kind;
  try { localStorage.setItem('ce.kind', kind); localStorage.setItem('ce.ortho', ortho ? '1' : '0'); } catch { /* ignoré */ } // une prof du primaire retrouve son onglet
  for (const [id, t] of [['kind-content', 'content'], ['kind-lang', 'lang'], ['kind-ortho', 'ortho']]) {
    $(id).classList.toggle('active', tab === t);
    $(id).setAttribute('aria-selected', String(tab === t));
  }
  document.querySelector('.kind').dataset.active = tab;
  $('app').dataset.kind = kind; // mode simple : la correction des copies n'a plus de section 1
  setUiMode(uiAdv()); // titre et numéro des étapes
  $('content-settings').hidden = kind !== 'content';
  $('lang-settings').hidden = kind !== 'lang';
  renderPda(); // exemples du primaire seulement en correction de la langue
  renderOrtho();
  $('empty-text').textContent = ortho ? 'Les textes analysés apparaîtront ici, avec les erreurs classées par type, puis le profil du scripteur.'
    : kind === 'lang' ? 'Les copies analysées apparaîtront ici, avec les fautes surlignées.'
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
  const levelOf = (r, i, pts = r.questions[i]?.points) => r.grid?.[i]?.levels.find((l) => inLevel(l, pts))?.label || '';
  const numbered = (q, i) => (/^\s*\d/.test(q.question) ? q.question : `${i + 1}. ${q.question}`); // « 1. Hypothèse » est déjà numéroté
  const qHeads = !perQuestion ? [] : grid ? shape.flatMap((q, i) => [`${numbered(q, i)} (/${num(q.max)})`, ...(labelled ? [`${numbered(q, i)} : niveau`] : [])])
    : shape.map((q, i) => `Q${i + 1} (/${num(q.max)})`);
  // Rendu par lettres (grille) : la cote globale et le niveau de chaque critère, sans points.
  if (grid && labelled && sorted.every((r) => r.illegible || byLetters(r))) {
    const rowsL = [['N° copie', 'Fichier', 'Évaluation', 'Groupe', 'Élève', 'Cote', ...shape.map((q, i) => numbered(q, i)), 'Détail par critère', 'Commentaire', 'À vérifier']];
    for (const r of sorted) {
      const ok = r.grade != null;
      rowsL.push([r.no ?? '', r.file || '', r.exam, r.group, r.name, ok ? globalLetter(r) : tr('Illisible'),
        ...shape.map((_, i) => (ok && r.questions[i] ? levelOf(r, i, r.questions[i].points) : '')),
        r.questions.map((q, i) => `${q.question}${lang === 'en' ? ':' : ' :'} ${levelOf(r, i, q.points)}${edited(q) ? ` (${tr('modifié par l’enseignant')} ; ${tr('proposé')} : ${levelOf(r, i, q.ai)})` : q.justification ? ` (${noPoints(q.justification)})` : ''}`).join(' | '),
        r.comment, r.flags.join(' ')]);
    }
    downloadCSV(rowsL, '');
    state.exported = true;
    return;
  }
  const rows = [['N° copie', 'Fichier', 'Évaluation', 'Groupe', 'Élève', 'Note', 'Sur', 'Pourcentage', ...qHeads, 'Fiabilité (%)', 'Détail par question', 'Commentaire', 'À vérifier']];
  for (const r of sorted) {
    const ok = r.grade != null;
    rows.push([r.no ?? '', r.file || '', r.exam, r.group, r.name, ok ? num(r.grade) : tr('Illisible'), num(r.total), ok ? num(Math.round((r.grade / r.total) * 1000) / 10) : '',
      ...(perQuestion ? shape.flatMap((_, i) => [ok && r.questions[i] ? num(r.questions[i].points) : '', ...(labelled ? [ok ? levelOf(r, i) : ''] : [])]) : []), r.reliability ?? '',
      r.questions.map((q) => `${q.question}${lang === 'en' ? ':' : ' :'} ${num(q.points)}/${num(q.max)}${edited(q) ? ` (${tr('modifié par l’enseignant')} ; ${tr('proposé')} : ${num(q.ai)})` : q.points < q.max && q.justification ? ` (${q.justification})` : ''}`).join(' | '),
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

// L'enseignant photographie chaque feuille avec le gros bouton ; les cadres aux coins montrent la feuille trouvée,
// et seule la feuille est gardée. À la fin, l'appli trouve où commence chaque copie (comme pour un PDF du photocopieur),
// sauf si un nombre de pages par élève est réglé (mode avancé).
const camState = { session: null, shots: [] };

function camCount() {
  const n = camState.shots.length;
  $('cam-count').textContent = n ? tr(pl(n, 'page photographiée', 'pages photographiées')) : '';
  const last = camState.shots.at(-1);
  $('cam-last').hidden = $('cam-undo').hidden = !last;
  if (last) $('cam-last').src = last.url;
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
  applyMode();
  camCount();
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
  camState.shots = [];
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
  if (!n) { renderPages(); return; }
  // Plusieurs feuilles : l'appli trouve où commence chaque copie (un nombre de pages par élève réglé passe avant).
  const fixed = $('mode').value === 'fixed' && Number($('per').value) >= 1;
  if (!fixed && state.pages.length > 1) $('mode').value = 'auto';
  applyMode();
  if ($('mode').value === 'auto') detectCopies(); else renderPages();
  if (!simpleContent()) banner('info', `${pl(n, 'page photographiée', 'pages photographiées')}. Vérifiez les miniatures (photo floue, page de trop), puis lancez la correction.`);
  setTimeout(() => (simpleContent() ? $('ready') : $('pages-zone')).scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

if (navigator.mediaDevices?.getUserMedia) $('cam-open').hidden = $('cam-hint').hidden = false;
// Téléphone : la caméra de l'appli (toute la pile à la suite, sans quitter la page) passe avant la zone de dépôt,
// qui sert aux photos déjà prises et aux fichiers. La caméra du téléphone, elle, ne prend qu'une photo à la fois.
const touchCam = !!navigator.mediaDevices?.getUserMedia && matchMedia('(pointer: coarse)').matches;
if (touchCam) { $('drop').before($('cam-open')); $('cam-open').classList.add('primary', 'big', 'block', 'cam-main'); $('drop').classList.add('drop-small'); }
$('cam-open').addEventListener('click', openCamera);
$('cam-done').addEventListener('click', () => closeCamera());
window.addEventListener('popstate', () => closeCamera(true));
$('cam-shoot').addEventListener('click', () => camState.session?.capture());
$('cam-last').addEventListener('click', () => openZoom([camState.shots.at(-1).url], tr('Dernière photo')));
// « Reprendre » : la dernière photo est retirée, l'enseignant la refait.
$('cam-undo').addEventListener('click', () => {
  const p = camState.shots.pop();
  if (p) removePage(p);
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
  let added = await filesToPages(files, progress);
  // Une seule photo ajoutée au téléphone (souvent prise avec la caméra du téléphone) : la caméra de l'appli fait toute la pile.
  if (touchCam && files.length === 1 && files[0].type.startsWith('image/') && state.pages.length < 2 && !state.camTipShown) {
    state.camTipShown = true;
    setTimeout(() => banner('info', 'Toute une classe à photographier ? Touchez « Prendre les copies en photo » : vous photographiez les pages à la suite, sans quitter l’appli. Vous pouvez aussi choisir plusieurs photos d’un coup dans votre galerie.'), 0);
  }
  if (simpleContent() && added.length) { progress(tr('Un instant : je regarde ce que vous avez déposé…')); added = await sortDrop(added); progress(''); }
  state.pages.push(...added);
  // Regroupement choisi pour l'enseignant (il peut changer ensuite) : des photos ou fichiers d'une page = un élève
  // chacun ; un fichier de plusieurs pages (PDF du photocopieur) = on trouve où commence chaque copie.
  // Mode simple : plusieurs documents (PDF ou Word de plusieurs pages, remis par chaque élève) = un fichier par élève ;
  // des photos d'une page chacune = des pages à regrouper (l'IA trouve où commence chaque copie).
  const docs = [...new Set(state.pages.map((p) => p.file))];
  const multi = docs.filter((f) => state.pages.filter((p) => p.file === f).length > 1 || /\.docx$/i.test(f));
  if (!state.modeChosen) {
    $('mode').value = simpleContent()
      ? (docs.length > 1 && multi.length === docs.length) || (docs.length === 1 && /\.docx$/i.test(docs[0])) ? 'file' : docs.length === 1 && !multi.length ? 'file' : 'auto'
      : !state.pages.some((p) => !p.firstOfFile) ? 'file' : 'auto';
  }
  applyMode();
  if ($('mode').value === 'auto') { renderPages(); await detectCopies(); return; }
  renderPages();
  // Après la fin de l'import (la zone de dépôt reprend sa taille) : le bouton Corriger vient dans l'écran.
  if (!state.running) setTimeout(() => $('run').scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
});
dropzone($('rubric-drop'), $('rubric-files'), async (files, progress) => {
  const added = await filesToPages(files, progress);
  state.rubricPages.push(...added.map(({ id, url, docText, file }) => ({ id, url, docText, file })));
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
$('clear-pages').addEventListener('click', () => { if (!confirm(tr('Retirer toutes les pages ?'))) return; state.pages = []; state.status = {}; state.modeChosen = false; $('mode').value = 'file'; renderPages(); });
$('total').addEventListener('input', () => { renderSummary(); updateGridTotal(); });
$('make-grid').addEventListener('click', makeGrid);
$('kind-content').addEventListener('click', () => setKind('content'));
$('kind-lang').addEventListener('click', () => setKind('lang'));
$('kind-ortho').addEventListener('click', () => setKind('ortho'));
$('viewer-print').addEventListener('click', printViewer);
$('viewer-add').addEventListener('click', () => { adding = adding ? null : { stage: 'draw' }; renderViewer(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (adding && !$('viewer').hidden) { adding = null; renderViewer(); return; }
  if (!$('cam').hidden) { closeCamera(); return; }
  for (const id of ['zoom', 'viewer', 'rel-help', 'buy', 'invite']) {
    if (!$(id).hidden) { if (id === 'zoom' || id === 'viewer') modalClose(id); else $(id).hidden = true; return; }
  }
});
$('zoom-close').addEventListener('click', () => modalClose('zoom'));
$('zoom-pages').addEventListener('click', (e) => { if (e.target.tagName === 'IMG') $('zoom-pages').classList.toggle('big'); });
$('zoom-prev').addEventListener('click', () => zoomStep(-1));
$('zoom-next').addEventListener('click', () => zoomStep(1));
document.addEventListener('keydown', (e) => { if (zoomNav && !$('zoom').hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) zoomStep(e.key === 'ArrowLeft' ? -1 : 1); });
{ // Glisser du doigt vers la gauche : copie suivante ; vers la droite : précédente (pas pendant un zoom à deux doigts).
  let x0 = null, y0 = 0;
  $('zoom-pages').addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
  $('zoom-pages').addEventListener('touchend', (e) => {
    if (x0 == null || !zoomNav) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && (window.visualViewport?.scale ?? 1) <= 1.05) zoomStep(dx < 0 ? 1 : -1);
  }, { passive: true });
}
document.querySelectorAll('[data-close-viewer]').forEach((b) => b.addEventListener('click', () => modalClose('viewer')));
$('grid-remove').addEventListener('click', () => { state.grid = null; state.gridFolded = false; renderGrid(); });
$('grid-fold').addEventListener('click', () => { state.gridFolded = !state.gridFolded; renderGrid(); });
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
  $('print-count').textContent = tr(pl(printable().length, 'copie corrigée', 'copies corrigées'));
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

// ---------- Exemple corrigé ----------
// Pour qui n'a pas ses copies sous la main : 3 copies fictives déjà corrigées (aucune IA, aucune page décomptée),
// affichées comme de vrais résultats, dans l'onglet en cours (copies d'histoire ou textes de 3e année).
async function loadDemo() {
  const d = await (await fetch('exemple/demo.json')).json();
  const ex = L(' (exemple)', ' (example)');
  if (state.kind === 'lang') {
    for (const c of [...d.lang].reverse()) {
      const url = `exemple/${c.img}`;
      const res = { kind: 'lang', id: uid(), file: 'exemple', exam: '', group: '', name: c.name + ex, pageCount: 1, band: 0, demo: true,
        pages: [{ url, errors: c.errors.map((e) => ({ ...e, grey: false })), failed: false, reread: false, sent: url, words: c.words, text: '' }],
        scoring: langScoring(), pda: pdaScoring(), flags: [] };
      langGrade(res);
      state.results.unshift(res);
    }
  } else {
    for (const c of [...d.content].reverse()) {
      const grade = c.questions.reduce((a, q) => a + q.points, 0);
      state.results.unshift({ id: uid(), file: 'exemple', pageUrls: [`exemple/${c.img}`], band: 0, exam: '', group: c.group, name: c.name + ex, reliability: null,
        grade, total: c.total, unit: 0.5, questions: c.questions.map((q) => ({ ...q, ai: q.points })), examKey: 'exemple', lang, grid: null, render: 'points',
        comment: c.comment, pageCount: 1, illegible: false, flags: [], noKey: false, demo: true });
    }
  }
  state.open.add(state.results[0].id);
  renderResults();
  banner('ok', tr(state.kind === 'lang' ? 'Voici 3 textes d’exemple corrigés (rien n’a été décompté). Touchez « Voir la copie annotée » : les fautes sont surlignées sur l’écriture de l’élève. À votre tour : déposez les textes de vos élèves.'
    : 'Voici 3 copies d’exemple corrigées avec leur corrigé (rien n’a été décompté). Touchez « Voir la copie corrigée » pour voir les annotations. À votre tour : déposez vos copies.'));
  setTimeout(() => $('cards').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}
$('demo-btn').addEventListener('click', () => loadDemo().catch((e) => banner('err', e.message)));
$('newkey-demo').addEventListener('click', () => { $('newkey').hidden = true; try { localStorage.setItem('ce.welcome', '1'); } catch { /* ignoré */ } loadDemo().catch((e) => banner('err', e.message)); });

// ---------- Parrainage ----------
// Code reçu par un lien d'invitation (gardé 60 jours par lang.js) : bonus du filleul à son premier achat.
function referralCode() {
  try {
    const r = JSON.parse(localStorage.getItem('ce.ref') || 'null');
    return r && Date.now() - r.at < 60 * 86400000 ? r.code : '';
  } catch { return ''; }
}
new MutationObserver(() => { if (!$('buy').hidden) $('buy-ref').hidden = !referralCode(); }).observe($('buy'), { attributes: true, attributeFilter: ['hidden'] });
// Message écrit à la première personne, sans émoji : le prof l'envoie tel quel, ou l'ajuste.
const inviteText = (link) => L(`Salut,

Je voulais te parler d'un outil que j'utilise pour corriger mes copies : Brûle la pile. Tu photographies les copies, même écrites à la main, et il propose une note, un commentaire pour l'élève et surligne les fautes de français. C'est toi qui relis et qui décides de la note. Ça me fait gagner beaucoup de temps.

Tu peux l'essayer gratuitement avec 30 pages. Si tu prends un forfait en passant par mon lien, tu reçois 100 pages de plus :
${link}

Dis-moi ce que tu en penses !`, `Hi,

I wanted to tell you about a tool I use to mark my papers: Burn the Pile. You take photos of the papers, even handwritten ones, and it suggests a mark, a comment for the student and highlights spelling and grammar errors. You review everything and decide on the mark. It saves me a lot of time.

You can try it for free with 30 pages. If you buy a pack through my link, you get 100 extra pages:
${link}

Let me know what you think!`);
$('invite-open').addEventListener('click', async () => {
  $('invite').hidden = false;
  $('invite-stats').textContent = '';
  try {
    const r = await api('/api/referral');
    $('invite-link').value = r.link;
    if (!$('invite-text').dataset.edited) $('invite-text').value = inviteText(r.link);
    $('invite-stats').textContent = [
      r.count ? L(`Merci ! ${r.count} collègue${r.count > 1 ? 's' : ''} parrainé${r.count > 1 ? 's' : ''} : ${r.pages} pages gagnées.`, `Thank you! ${r.count} colleague${r.count > 1 ? 's' : ''} referred: ${r.pages} pages earned.`) : '',
      r.pending ? L(`En attente : ${r.pending} collègue${r.pending > 1 ? 's' : ''} (vos 200 pages arrivent dès ${r.pending > 1 ? 'qu’ils auront' : 'qu’il aura'} corrigé 30 pages).`, `Pending: ${r.pending} colleague${r.pending > 1 ? 's' : ''} (your 200 pages arrive once they have marked 30 pages).`) : '',
      !r.count && !r.pending ? L('Personne encore : votre premier parrainage vous donnera 200 pages.', 'No one yet: your first referral earns you 200 pages.') : '',
      r.left < r.reward.max ? L(`Encore ${r.left} parrainage${r.left > 1 ? 's' : ''} possible${r.left > 1 ? 's' : ''}.`, `${r.left} referral${r.left > 1 ? 's' : ''} left.`) : '',
    ].filter(Boolean).join(' ');
  } catch (err) { $('invite-stats').textContent = err.message; }
});
$('invite-text').addEventListener('input', () => { $('invite-text').dataset.edited = '1'; });
const copyFrom = async (btn, text) => {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = tr('✓ Copié'); } catch { btn.textContent = '—'; }
  setTimeout(() => { btn.textContent = label; }, 2200);
};
$('invite-copy').addEventListener('click', (e) => copyFrom(e.currentTarget, $('invite-text').value));
$('invite-copy-link').addEventListener('click', (e) => copyFrom(e.currentTarget, $('invite-link').value));
document.querySelectorAll('[data-close-invite]').forEach((b) => b.addEventListener('click', () => { $('invite').hidden = true; }));
document.querySelectorAll('[data-open-buy]').forEach((b) => b.addEventListener('click', () => { $('buy').hidden = false; }));
document.querySelectorAll('[data-close-buy]').forEach((b) => b.addEventListener('click', () => { $('buy').hidden = true; }));
document.querySelectorAll('[data-pack]').forEach((b) => b.addEventListener('click', () => buy(b.dataset.pack)));
document.querySelectorAll('[data-close-rel]').forEach((b) => b.addEventListener('click', () => { $('rel-help').hidden = true; }));
// La fenêtre de la clé contient l'essentiel de l'accueil : pas de 2e fenêtre juste après.
document.querySelector('[data-close-newkey]').addEventListener('click', () => { $('newkey').hidden = true; try { localStorage.setItem('ce.welcome', '1'); } catch { /* ignoré */ } });
$('welcome-demo').addEventListener('click', () => { $('welcome').hidden = true; try { localStorage.setItem('ce.welcome', '1'); } catch { /* ignoré */ } loadDemo().catch((e) => banner('err', e.message)); });
$('welcome-ok').addEventListener('click', () => { $('welcome').hidden = true; try { localStorage.setItem('ce.welcome', '1'); } catch { /* ignoré */ } });
$('newkey-copy').addEventListener('click', () => navigator.clipboard?.writeText($('newkey-value').textContent));

window.addEventListener('beforeunload', (e) => {
  if (state.running || (state.results.length && !state.exported)) e.preventDefault();
});

// Réglages de l'enseignant retenus d'une session à l'autre (dans ce navigateur seulement ; aucune donnée d'élève).
// Le corrigé tapé et le nom de l'évaluation ne sont gardés que jusqu'à la fermeture de l'onglet : assez pour corriger
// plusieurs groupes de suite, sans laisser le corrigé sur un ordinateur partagé. « Terminer la session » les efface aussi.
// Le regroupement des pages n'est pas retenu : il repart toujours d'un choix neutre.
const PREF_IDS = ['total', 'per-student', 'whole', 'deep', 'language', 'lang-level', 'pda-year', 'pda-once', 'pda-a', 'pda-b', 'pda-c', 'pda-d', 'lang-total', 'lang-per', 'lang-max', 'anon', 'anon-h', 'anon-all', 'out-lang', 'qc'];
const TAB_IDS = ['exam', 'rubric'];
function savePrefs() {
  const prefs = Object.fromEntries(PREF_IDS.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]));
  prefs.cats = [...document.querySelectorAll('#lang-cats input')].filter((i) => i.checked).map((i) => i.value);
  prefs.anonV = 2;
  try { localStorage.setItem('ce.prefs', JSON.stringify(prefs)); } catch { /* navigation privée */ }
  try { sessionStorage.setItem('ce.tab', JSON.stringify(Object.fromEntries(TAB_IDS.map((id) => [id, $(id).value])))); } catch { /* ignoré */ }
}
function loadPrefs() {
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem('ce.prefs') || 'null'); } catch { /* ignoré */ }
  try { const tab = JSON.parse(sessionStorage.getItem('ce.tab') || 'null'); if (tab) TAB_IDS.forEach((id) => { if (tab[id]) $(id).value = tab[id]; }); } catch { /* ignoré */ }
  if (!prefs) return;
  // Masquage du nom activé par défaut (guide du ministère : aucun renseignement personnel envoyé à une IA) :
  // appliqué une fois aussi à qui l'avait laissé décoché avant ; un choix fait ensuite est respecté.
  if (prefs.anonV !== 2) delete prefs.anon;
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
$('consent-link').href = lang === 'en' ? 'consent.html' : 'consentement.html';
for (const id of [...PREF_IDS, ...TAB_IDS]) $(id).addEventListener('change', savePrefs);
['anon', 'anon-h', 'anon-all'].forEach((id) => $(id).addEventListener('change', () => { $('anon-opts').hidden = !anonymous(); renderPages(); }));
document.querySelectorAll('#lang-cats input').forEach((i) => i.addEventListener('change', savePrefs));
['pda-year', 'pda-step'].forEach((id) => $(id).addEventListener('change', () => { pdaOver = {}; savePda(); renderPda(); renderSummary(); }));
$('pda-year').addEventListener('change', () => {
  if (!$('pda-year').value || yearSet) return;
  yearSet = true; try { localStorage.setItem('ce.yearSet', '1'); } catch { /* ignoré */ }
  const v = $('pda-year').value; fillYears(); $('pda-year').value = v; savePrefs(); renderPda();
});
$('lang-level').addEventListener('change', renderPda);
$('out-lang').addEventListener('change', renderPda);
$('pda-reset').addEventListener('click', () => { pdaOver = {}; savePda(); renderPda(); });
renderPda();

// Affichage simple (par défaut) ou avancé : le mode simple cache les réglages fins (classe « adv »), qui restent appliqués.
// Si l'un d'eux n'a pas sa valeur par défaut, une ligne le signale : rien ne change en douce (ex. double correction facturée).
// L'année (boutons du mode simple), l'étape (d'après la date) et le nom de l'évaluation ne sont pas des réglages « cachés ».
function advControls() { return [...document.querySelectorAll('.adv input, .adv select')].filter((el) => !['pda-year', 'pda-step', 'exam'].includes(el.id) && !el.closest('#pda-list')); } // notions : leur défaut dépend de l'année
function isDefault(el) { return (el.id === 'out-lang' ? el.value === lang
  : el.type === 'checkbox' ? el.checked === el.defaultChecked
  : el.tagName === 'SELECT' ? el.value === ([...el.options].find((o) => o.defaultSelected) || el.options[0])?.value
  : el.value === el.defaultValue); }
function setUiMode(adv) {
  $('app').classList.toggle('ui-simple', !adv);
  $('app').dataset.kind = state.kind;
  const simple = !adv && state.kind === 'content';
  $('step2-no').textContent = simple ? '1' : '2';
  $('step3-no').textContent = simple ? '2' : '3';
  $('step1-title').textContent = tr(state.kind === 'lang' ? (adv ? 'Paramètres de la correction de la langue' : 'Vos élèves') : 'Paramètres de l’évaluation');
  $('step2-title').textContent = tr(simple ? 'Copies, corrigé ou grille' : state.kind === 'lang' ? 'Les copies' : 'Insérer les copies');
  orthoTitles(); // orthopédagogie : un tableau de bord plutôt que trois étapes, des titres selon la tâche
  $('ui-simple').setAttribute('aria-pressed', String(!adv));
  $('ui-adv').setAttribute('aria-pressed', String(adv));
  $('adv-note').hidden = adv || advControls().every(isDefault);
  try { localStorage.setItem('ce.ui', adv ? 'adv' : 'simple'); } catch { /* ignoré */ }
  renderPages(); // le mode simple cache les pages et la section 1 de la correction des copies
}
function uiAdv() { return !$('app').classList.contains('ui-simple'); } // déclarée (hissée) : appelée avant cette ligne au démarrage
$('ui-simple').addEventListener('click', () => setUiMode(false));
$('ui-adv').addEventListener('click', () => setUiMode(true));
$('adv-show').addEventListener('click', (e) => { e.preventDefault(); setUiMode(true); });
// Téléphone : Guide, achat, changement de clé et langue dans un menu ; le solde reste visible (et mène à l'achat).
$('top-menu').addEventListener('click', () => { const open = document.querySelector('.top-actions').classList.toggle('open'); $('top-menu').setAttribute('aria-expanded', String(open)); });
$('balance').addEventListener('click', () => { if (!$('buy-open').hidden) $('buy-open').click(); });
$('lang-to-adv').addEventListener('click', (e) => { e.preventDefault(); setUiMode(true); $('lang-settings').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('to-adv').addEventListener('click', (e) => { e.preventDefault(); setUiMode(true); $('app').querySelector('.s1').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
advControls().forEach((el) => el.addEventListener('change', () => setUiMode(uiAdv())));
let savedUi = null;
try { savedUi = localStorage.getItem('ce.ui'); } catch { /* ignoré */ }
setUiMode(savedUi === 'adv');

// ---------- Démarrage ----------

applyMethod();
try { if (localStorage.getItem('ce.kind') === 'lang') setKind(ortho ? 'ortho' : 'lang'); } catch { /* ignoré */ }

// Niveau d'enseignement (« Vous enseignez au ») : choisi sur l'accueil (app.html?niveau=…) ou ici, retenu sur l'appareil.
// Il règle le niveau de la correction de la langue ; au primaire, l'appli s'ouvre sur la correction de la langue.
function setNiveau(n, fromChoice) {
  if (!['primaire', 'secondaire', 'cegep'].includes(n)) return;
  try { localStorage.setItem('ce.niveau', n); } catch { /* ignoré */ }
  document.querySelectorAll('.lvl-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.niveau === n)));
  $('lang-level').value = n;
  if (ortho && !orthoAvailable()) setKind('lang'); // pas d'orthopédagogie au cégep (la Progression ne s'y applique pas)
  if (fromChoice && n === 'primaire' && state.kind === 'content') setKind('lang');
  renderOrtho();
  savePrefs(); renderPda(); renderSummary();
}
document.querySelectorAll('.lvl-seg button').forEach((b) => b.addEventListener('click', () => setNiveau(b.dataset.niveau, true)));
try { $('ortho-focus').value = localStorage.getItem('ce.orthoFocus') || ''; } catch { /* ignoré */ }
// Conditions de rédaction de la séance : cochées d'avance sur chaque texte analysé, modifiables élève par élève.
{
  const btns = [...document.querySelectorAll('#ortho-conds [data-cond]')];
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('ce.orthoConds') || '[]'); } catch { /* ignoré */ }
  const paint = (on) => btns.forEach((b) => b.setAttribute('aria-pressed', String(on.includes(b.dataset.cond))));
  paint(saved);
  btns.forEach((b) => b.addEventListener('click', () => {
    let on = orthoConditions();
    const c = b.dataset.cond;
    on = on.includes(c) ? on.filter((x) => x !== c) : c === 'Sans aide' ? ['Sans aide'] : [...on.filter((x) => x !== 'Sans aide'), c];
    paint(on);
    try { localStorage.setItem('ce.orthoConds', JSON.stringify(on)); } catch { /* ignoré */ }
  }));
}
$('ortho-focus').addEventListener('input', () => { try { localStorage.setItem('ce.orthoFocus', $('ortho-focus').value); } catch { /* ignoré */ } });
{
  const asked = new URLSearchParams(location.search).get('niveau');
  let known = null;
  try { known = localStorage.getItem('ce.niveau'); } catch { /* ignoré */ }
  // Arrivée depuis l'accueil avec un niveau (?niveau=…) : réglages de ce niveau, même si l'accueil l'a déjà mémorisé.
  // Lien de l'orthopédagogie (/orthopedagogie → app.html?niveau=ortho) : l'onglet Orthopédagogie, au niveau déjà connu.
  if (asked === 'ortho') { setNiveau(['primaire', 'secondaire'].includes(known) ? known : 'secondaire', false); setKind('ortho'); }
  else if (asked) setNiveau(asked, true);
  else setNiveau(known || $('lang-level').value, false);
  if (asked) { const q = new URLSearchParams(location.search); q.delete('niveau'); history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash); } // la clé (?key=) reste
}
startI18n();
const saved = new URLSearchParams(location.search).get('key') || store.get();
if (new URLSearchParams(location.search).has('key')) history.replaceState(null, '', location.pathname);
if (saved) useKey(saved).then(maybeWelcome).catch((err) => { if (err.status === 401) store.del(); showGate(err.message); });
else showGate();
renderPages();
renderResults();

// Lien « J'ai une clé » de l'accueil : le curseur est déjà dans le champ de la clé.
if (location.hash === '#cle' && !$('gate').hidden) $('key-input').focus();
// Arrivée depuis les tarifs de l'accueil (app.html#acheter-session) : la fenêtre d'achat s'ouvre et part vers le paiement.
{ const m = location.hash.match(/^#acheter(?:-(decouverte|session|annee))?$/); if (m) { $('buy').hidden = false; history.replaceState(null, '', location.pathname + location.search); if (m[1]) buy(m[1]); } }
