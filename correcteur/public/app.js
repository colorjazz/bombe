// Correcteur Express — application de l'enseignant.
// Les copies restent en mémoire dans cet onglet ; seule la clé d'accès est retenue sur l'appareil.

const MAX_SIDE = 1600;          // pixels, côté le plus long d'une page envoyée
const JPEG_QUALITY = 0.82;
const MAX_PAGES_PER_COPY = 10;
const MAX_RUBRIC_PAGES = 6;
const CONCURRENCY = 3;
const KEY_STORAGE = 'ce.accessKey';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

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
  exported: true,
};

// ---------- Petits utilitaires ----------

const uid = () => crypto.randomUUID();
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-CA', { maximumFractionDigits: 2 }));

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
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && state.key ? { Authorization: `Bearer ${state.key}` } : {}) },
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
    if (state.results.length && !state.exported && !confirm('Vos résultats non téléchargés seront perdus en quittant la page. Continuer vers le paiement ?')) return;
    state.exported = true;
    location.href = url;
  } catch (err) {
    $('buy-msg').textContent = err.message;
  }
}

// ---------- Préparation des pages (redimensionnement, PDF → images) ----------

function canvasToJpeg(canvas) { return canvas.toDataURL('image/jpeg', JPEG_QUALITY); }

function fitCanvas(w, h) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  return c;
}

async function imageToJpeg(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const c = fitCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return canvasToJpeg(c);
}

let pdfjsPromise;
function loadPdfJs() {
  pdfjsPromise ||= new Promise((resolve, reject) => {
    const s = h('script', { src: `${PDFJS}/pdf.min.js` });
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfjsPromise = null; reject(new Error('Lecteur PDF indisponible (connexion ?)')); };
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
      } else if (file.type.startsWith('image/')) {
        out.push({ id: uid(), url: await imageToJpeg(file), file: file.name, firstOfFile: true });
      } else {
        errors.push(`${file.name} (format non pris en charge)`);
      }
    } catch (err) {
      errors.push(`${file.name} (${err.message || 'illisible'})`);
    }
  }
  banner(errors.length ? 'err' : '', errors.length ? `Fichiers ignorés : ${errors.join(', ')}` : '');
  return out;
}

// ---------- Regroupement des pages en copies ----------

function applyMode() {
  const mode = $('mode').value;
  const per = Math.max(1, Math.min(MAX_PAGES_PER_COPY, Number($('per').value) || 1));
  state.pages.forEach((p, i) => { p.startsNew = mode === 'file' ? p.firstOfFile : i % per === 0; });
  if (state.pages[0]) state.pages[0].startsNew = true;
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
  $('per').hidden = $('mode').value !== 'fixed';
  $('bundles').replaceChildren(...list.map((b, bi) => {
    const st = state.status[b[0].id];
    const tooLong = b.length > MAX_PAGES_PER_COPY;
    const label = st?.state === 'running' ? '⏳ correction…' : st?.state === 'error' ? `⚠ ${st.msg}` : tooLong ? `⚠ ${MAX_PAGES_PER_COPY} pages max` : '';
    return h('div', { class: 'bundle' },
      h('div', { class: 'bundle-head' },
        h('span', {}, `Copie ${bi + 1} · ${b.length} page${b.length > 1 ? 's' : ''}`),
        h('span', { class: `st ${st?.state === 'error' || tooLong ? 'err' : ''}`, textContent: label }),
        bi > 0 ? h('button', { class: 'btn ghost merge', type: 'button', textContent: 'fusionner avec la précédente', disabled: state.running,
          onclick: () => { b[0].startsNew = false; renderPages(); } }) : null),
      h('div', { class: 'bundle-pages' }, b.map((p, pi) => [
        pi > 0 ? h('button', { class: 'split', type: 'button', title: 'Séparer : une nouvelle copie commence ici', textContent: '✂', disabled: state.running,
          onclick: () => { p.startsNew = true; renderPages(); } }) : null,
        h('div', { class: 'thumb', title: p.file },
          h('img', { src: p.url, alt: `Page ${pi + 1}` }),
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
  $('summary').innerHTML = n ? `<b>${list.length}</b> copie(s) · <b>${n}</b> page(s)` : 'Aucune copie importée';
  $('cost').textContent = n ? `${n} page(s) seront décomptées` : '';
  const enough = state.pagesLeft == null || state.pagesLeft >= n;
  const run = $('run');
  run.disabled = state.running || !n || tooLong || !enough || !(Number($('total').value) > 0);
  run.textContent = state.running ? 'Correction en cours…'
    : !enough ? 'Solde insuffisant : rechargez votre compte'
    : n ? `Corriger ${list.length} copie(s)` : 'Corriger';
  $('export').disabled = $('end').disabled = state.running || !state.results.length;
}

function renderRubric() {
  $('rubric-thumbs').replaceChildren(...state.rubricPages.map((p) => h('div', { class: 'thumb' },
    h('img', { src: p.url, alt: 'Corrigé' }),
    h('button', { class: 'x', type: 'button', textContent: '×', onclick: () => {
      state.rubricPages = state.rubricPages.filter((x) => x !== p); renderRubric();
    } }))));
}

// ---------- Correction ----------

async function runAll() {
  const list = bundles();
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
    checkLanguage: $('language').checked,
    rubric: $('rubric').value.trim(),
    rubricPages: state.rubricPages.map((p) => p.url),
  };

  let next = 0, done = 0, failed = 0, stop = '';
  const worker = async () => {
    while (next < list.length && !stop) {
      const b = list[next++];
      const id = b[0].id;
      state.status[id] = { state: 'running' };
      renderPages();
      try {
        const r = await api('/api/grade', { method: 'POST', body: { ...settings, pages: b.map((p) => p.url) } });
        setBalance(r.pagesLeft);
        state.results.unshift({
          id, exam: settings.exam, group: settings.group, name: r.name, grade: r.grade, total: r.total,
          unit: settings.wholePoints ? 1 : 0.5, questions: r.questions, comment: r.comment, flags: r.flags, pageCount: b.length,
        });
        if (r.flags.length) state.open.add(id);
        state.exported = false;
        state.pages = state.pages.filter((p) => !b.includes(p));
        if (state.pages[0]) state.pages[0].startsNew = true;
        delete state.status[id];
        done++;
        renderResults();
      } catch (err) {
        failed++;
        state.status[id] = { state: 'error', msg: err.message };
        if (err.status === 402 || err.status === 401) stop = err.message;
      }
      renderPages();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  state.running = false;
  renderPages();
  if (stop) banner('err', stop);
  else if (failed) banner('err', `${done} copie(s) corrigée(s), ${failed} en erreur : elles restent dans la liste, relancez pour réessayer.`);
  else banner('ok', `${done} copie(s) corrigée(s). Vérifiez en priorité les copies marquées ⚠.`);
}

// ---------- Résultats ----------

function recompute(r) {
  r.grade = Math.min(r.total, r.questions.reduce((a, q) => a + q.points, 0));
  state.exported = false;
}

function renderStats() {
  const graded = state.results;
  $('stats').hidden = !graded.length;
  if (!graded.length) return;
  const pct = graded.map((r) => (r.grade / r.total) * 100);
  const avg = pct.reduce((a, b) => a + b, 0) / pct.length;
  const flagged = graded.filter((r) => r.flags.length).length;
  const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'v', textContent: v }), h('div', { class: 'l', textContent: l }));
  $('stats').replaceChildren(stat(String(graded.length), 'copies'), stat(`${fmt(avg)} %`, 'moyenne'),
    stat(`${fmt(Math.min(...pct))} – ${fmt(Math.max(...pct))} %`, 'min – max'), stat(String(flagged), 'à vérifier ⚠'));
}

function renderResults() {
  const q = $('search').value.trim().toLowerCase();
  const shown = state.results.filter((r) => !q || `${r.name} ${r.group} ${r.exam}`.toLowerCase().includes(q));
  $('empty').hidden = !!state.results.length;
  $('cards').replaceChildren(...shown.map(card));
  renderStats();
  renderSummary();
}

function card(r) {
  const open = state.open.has(r.id);
  const gradeEl = h('span', { class: 'grade' });
  const updateGrade = () => { gradeEl.replaceChildren(fmt(r.grade), h('small', {}, ` / ${fmt(r.total)}`)); };
  updateGrade();

  const body = h('div', { class: 'card-body' },
    r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
    h('table', { class: 'qtable' },
      h('thead', {}, h('tr', {}, h('th', { textContent: 'Question' }), h('th', { textContent: 'Points' }), h('th', { textContent: 'Justification' }))),
      h('tbody', {}, r.questions.map((qq) => {
        const tr = h('tr', { class: qq.points < qq.max ? 'lost' : '' });
        const input = h('input', { type: 'number', min: 0, max: qq.max, step: r.unit, value: qq.points,
          onchange: () => {
            const v = Math.round((Number(input.value) || 0) / r.unit) * r.unit;
            qq.points = Math.min(qq.max, Math.max(0, v));
            input.value = qq.points;
            tr.className = qq.points < qq.max ? 'lost' : '';
            recompute(r); updateGrade(); renderStats();
          } });
        tr.append(h('td', { class: 'q', textContent: qq.question }),
          h('td', { class: 'pts' }, input, h('span', { class: 'muted', textContent: ` / ${fmt(qq.max)}` })),
          h('td', { class: 'just', textContent: qq.justification }));
        return tr;
      }))),
    h('label', { class: 'field comment' }, 'Commentaire pour l\'élève',
      h('textarea', { rows: 3, value: r.comment, oninput: (e) => { r.comment = e.target.value; state.exported = false; } })),
    h('div', { class: 'card-foot' },
      h('span', { textContent: [r.exam, r.group, `${r.pageCount} page(s)`].filter(Boolean).join(' · ') }),
      h('button', { class: 'btn ghost small', type: 'button', textContent: 'Supprimer', onclick: () => {
        if (!confirm(`Supprimer la correction de ${r.name || 'cet élève'} ?`)) return;
        state.results = state.results.filter((x) => x !== r); renderResults();
      } })));
  body.hidden = !open;

  const el = h('article', { class: `card ${r.flags.length ? 'flag' : ''} ${open ? 'open' : ''}` },
    h('div', { class: 'card-head' },
      h('input', { class: 'name', type: 'text', value: r.name, placeholder: '⚠ Nom à compléter', 'aria-label': "Nom de l'élève",
        oninput: (e) => { r.name = e.target.value; state.exported = false; } }),
      r.flags.length ? h('span', { title: r.flags.join('\n'), textContent: '⚠' }) : h('span'),
      gradeEl,
      h('button', { class: 'icon-btn chev', type: 'button', textContent: '▾', 'aria-label': 'Détails', onclick: () => {
        if (state.open.has(r.id)) state.open.delete(r.id); else state.open.add(r.id);
        body.hidden = !state.open.has(r.id);
        el.classList.toggle('open', !body.hidden);
      } })),
    body);
  return el;
}

// ---------- Export ----------

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // empêche Excel d'interpréter une formule
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCSV() {
  const num = (n) => String(n).replace('.', ',');
  const rows = [['Évaluation', 'Groupe', 'Élève', 'Note', 'Sur', 'Pourcentage', 'Détail par question', 'Commentaire', 'À vérifier']];
  for (const r of [...state.results].reverse()) {
    rows.push([r.exam, r.group, r.name, num(r.grade), num(r.total), num(Math.round((r.grade / r.total) * 1000) / 10),
      r.questions.map((q) => `${q.question} : ${num(q.points)}/${num(q.max)}${q.points < q.max && q.justification ? ` (${q.justification})` : ''}`).join(' | '),
      r.comment, r.flags.join(' ')]);
  }
  const csv = '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const name = [$('exam').value, $('group').value].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'corrections';
  const a = h('a', { href: url, download: `${name}_${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.exported = true;
}

function endSession() {
  if (!confirm('Télécharger la grille puis tout effacer (copies, corrigé, résultats) ?')) return;
  exportCSV();
  Object.assign(state, { results: [], pages: [], rubricPages: [], status: {}, open: new Set(), exported: true });
  ['exam', 'group', 'rubric', 'search'].forEach((id) => { $(id).value = ''; });
  renderRubric(); renderPages(); renderResults();
  banner('ok', 'Session terminée : la grille est téléchargée et tout a été effacé.');
}

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

$('mode').addEventListener('change', () => { applyMode(); renderPages(); });
$('per').addEventListener('change', () => { applyMode(); renderPages(); });
$('clear-pages').addEventListener('click', () => { state.pages = []; state.status = {}; renderPages(); });
$('total').addEventListener('input', renderSummary);
$('run').addEventListener('click', runAll);
$('search').addEventListener('input', renderResults);
$('export').addEventListener('click', exportCSV);
$('end').addEventListener('click', endSession);

$('trial').addEventListener('click', startTrial);
$('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await useKey($('key-input').value); } catch (err) { showGate(err.message); }
});
$('logout').addEventListener('click', () => {
  if (state.results.length && !state.exported && !confirm('Des résultats ne sont pas téléchargés. Continuer ?')) return;
  store.del(); location.reload();
});
$('buy-open').addEventListener('click', () => { $('buy').hidden = false; });
document.querySelectorAll('[data-open-buy]').forEach((b) => b.addEventListener('click', () => { $('buy').hidden = false; }));
document.querySelectorAll('[data-close-buy]').forEach((b) => b.addEventListener('click', () => { $('buy').hidden = true; }));
document.querySelectorAll('[data-pack]').forEach((b) => b.addEventListener('click', () => buy(b.dataset.pack)));
document.querySelector('[data-close-newkey]').addEventListener('click', () => { $('newkey').hidden = true; });
$('newkey-copy').addEventListener('click', () => navigator.clipboard?.writeText($('newkey-value').textContent));

window.addEventListener('beforeunload', (e) => {
  if (state.results.length && !state.exported) e.preventDefault();
});

// ---------- Démarrage ----------

const saved = new URLSearchParams(location.search).get('key') || store.get();
if (new URLSearchParams(location.search).has('key')) history.replaceState(null, '', location.pathname);
if (saved) useKey(saved).catch((err) => { if (err.status === 401) store.del(); showGate(err.message); });
else showGate();
renderPages();
renderResults();
