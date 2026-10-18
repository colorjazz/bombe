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
  kind: 'content', // 'content' : correction de copies · 'lang' : correction de la langue
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
  const per = Math.round(Number($('per').value));
  state.pages.forEach((p, i) => {
    // Tant que le regroupement n'est pas choisi (ou le nombre de pages pas saisi), on affiche un fichier par copie.
    p.startsNew = mode === 'auto' ? (p.autoStart ?? p.firstOfFile)
      : mode === 'fixed' && per >= 1 ? i % per === 0 : p.firstOfFile;
  });
  if (state.pages[0]) state.pages[0].startsNew = true;
}

// ---------- Détection automatique des copies ----------

function thumbnail(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
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
        pages: await Promise.all(batch.map((p) => thumbnail(p.url))),
        previous: before ? await thumbnail(before.url) : undefined,
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
  $('bundles').replaceChildren(...list.map((b, bi) => {
    const st = state.status[b[0].id];
    const tooLong = ready && b.length > MAX_PAGES_PER_COPY;
    const label = st?.state === 'running' ? '⏳ correction…' : st?.state === 'error' ? `⚠ ${st.msg}` : tooLong ? `⚠ ${MAX_PAGES_PER_COPY} pages max : plusieurs élèves ? Utilisez « Nombre fixe de pages par élève » ou ✂` : '';
    return h('div', { class: 'bundle' },
      h('div', { class: 'bundle-head' },
        h('span', {}, `Copie ${bi + 1}${b[0].detectedName ? ` · ${b[0].detectedName}` : ''} · ${b.length} page${b.length > 1 ? 's' : ''}`),
        h('span', { class: `st ${st?.state === 'error' || tooLong ? 'err' : ''}`, textContent: label }),
        bi > 0 ? h('button', { class: 'btn ghost merge', type: 'button', textContent: 'fusionner avec la précédente', disabled: state.running,
          onclick: () => { b[0].startsNew = false; b[0].autoStart = false; renderPages(); } }) : null),
      h('div', { class: 'bundle-pages' }, b.map((p, pi) => [
        pi > 0 ? h('button', { class: 'split', type: 'button', title: 'Séparer : une nouvelle copie commence ici', textContent: '✂', disabled: state.running,
          onclick: () => { p.startsNew = true; p.autoStart = true; renderPages(); } }) : null,
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
  const mode = $('mode').value;
  const grouped = mode && !(mode === 'fixed' && !(Number($('per').value) >= 1));
  $('summary').innerHTML = n ? `<b>${list.length}</b> copie(s) · <b>${n}</b> page(s)` : 'Aucune copie importée';
  const cost = n * (state.kind === 'content' && $('deep').value === '1' ? 2 : 1);
  $('cost').textContent = n ? `${cost} page(s) seront décomptées` : '';
  const enough = state.pagesLeft == null || state.pagesLeft >= cost;
  const run = $('run');
  const gridSum = state.grid ? state.grid.reduce((a, c) => a + (Number(c.max) || 0), 0) : null;
  const gridOk = state.kind === 'lang' || gridSum == null || Math.abs(gridSum - Number($('total').value)) < 1e-9;
  run.disabled = state.running || state.detecting || !n || !grouped || tooLong || !enough || !gridOk || !(Number($('total').value) > 0);
  run.textContent = state.running ? 'Correction en cours…'
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

const parseLevels = (text) => text.split('\n').map((line) => line.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)?\s*[:–-]\s*(.+)$/i))
  .filter(Boolean).map((m) => ({ points: Number(m[1].replace(',', '.')), description: m[2].trim() }));
const levelsText = (levels) => levels.map((l) => `${fmt(l.points)} : ${l.description}`).join('\n');

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
  $('make-grid').textContent = state.grid ? '✨ Régénérer la grille' : '✨ Préparer une grille détaillée (gratuit)';
  if (!state.grid) { renderSummary(); return; }
  $('grid-criteria').replaceChildren(...state.grid.map((c) => h('div', { class: 'crit' },
    h('div', { class: 'crit-top' },
      h('input', { type: 'text', value: c.name, 'aria-label': 'Critère', oninput: (e) => { c.name = e.target.value; } }),
      h('input', { type: 'number', min: 0, step: 0.5, value: c.max, 'aria-label': 'Points maximum', title: 'Points maximum',
        oninput: (e) => { c.max = Number(e.target.value); updateGridTotal(); } })),
    h('textarea', { rows: Math.max(3, c.levels.length), value: levelsText(c.levels),
      oninput: (e) => { c.levels = parseLevels(e.target.value); } }))));
  updateGridTotal();
}

async function makeGrid() {
  if (state.grid && !confirm('Remplacer la grille actuelle par une nouvelle ?')) return;
  const btn = $('make-grid');
  btn.disabled = true;
  btn.textContent = '⏳ Un instant, l’IA prépare la grille…';
  try {
    const { grid } = await api('/api/rubric', { method: 'POST', body: {
      rubric: $('rubric').value.trim(), rubricPages: state.rubricPages.map((p) => p.url),
      total: Number($('total').value), wholePoints: $('whole').value === '1',
    } });
    state.grid = grid;
    banner('info', 'Grille préparée : relisez-la et ajustez au besoin. Elle sera appliquée à toutes les copies.');
  } catch (err) {
    banner('err', err.message);
  } finally {
    btn.disabled = false;
    renderGrid();
  }
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
    deep: $('deep').value === '1',
    checkLanguage: $('language').checked,
    rubric: $('rubric').value.trim(),
    rubricPages: state.rubricPages.map((p) => p.url),
    grid: state.grid || undefined,
  };

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

  const worker = async () => {
    while (next < list.length && !stop) {
      const b = list[next++];
      const id = b[0].id;
      started.set(id, Date.now());
      state.status[id] = { state: 'running' };
      renderPages();
      try {
        if (state.kind === 'lang') {
          const r = await api('/api/language', { method: 'POST', body: { pages: b.map((p) => p.url), ...langSettings() } });
          setBalance(r.pagesLeft);
          const res = { kind: 'lang', id, exam: settings.exam, group: r.group || settings.group, name: r.name, pageCount: b.length,
            pages: b.map((p, i) => ({ url: p.url, errors: r.pages[i].errors, failed: !!r.pages[i].failed })),
            scoring: langScoring(), flags: r.failedPages ? [`${r.failedPages} page(s) n'ont pas pu être analysées (non décomptées).`] : [] };
          langGrade(res);
          state.results.unshift(res);
        } else {
        const r = await api('/api/grade', { method: 'POST', body: { ...settings, pages: b.map((p) => p.url) } });
        setBalance(r.pagesLeft);
        state.results.unshift({
          id, exam: settings.exam, group: r.group || settings.group, name: r.name, reliability: r.reliability, grade: r.grade, total: r.total,
          unit: settings.wholePoints ? 1 : 0.5, questions: r.questions, comment: r.comment, flags: r.flags, pageCount: b.length,
        });
        if (r.flags.length || r.questions.some((q) => q.second != null)) state.open.add(id);
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
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  clearInterval(timer);
  $('progress').hidden = true;
  state.running = false;
  renderPages();
  if (stop) banner('err', stop);
  else if (failed) banner('err', `${done} copie(s) corrigée(s), ${failed} en erreur : elles restent dans la liste, relancez pour réessayer.`);
  else banner('ok', `${done} copie(s) corrigée(s). Vérifiez en priorité les copies marquées ⚠.`);
}

// ---------- Résultats ----------

function showRelHelp() { $('rel-help').hidden = false; }
const infoButton = () => h('button', { type: 'button', class: 'info', textContent: 'ⓘ', 'aria-label': 'Que veut dire la fiabilité ?', onclick: showRelHelp });

function recompute(r) {
  r.grade = Math.min(r.total, r.questions.reduce((a, q) => a + q.points, 0));
  state.exported = false;
}

function renderStats() {
  const graded = state.results.filter((r) => r.grade != null && r.total > 0);
  $('stats').hidden = !graded.length;
  if (!graded.length) return;
  const pct = graded.map((r) => (r.grade / r.total) * 100);
  const avg = pct.reduce((a, b) => a + b, 0) / pct.length;
  const flagged = graded.filter((r) => r.flags.length).length;
  const withRel = graded.filter((r) => r.reliability != null);
  const rel = withRel.length ? `${fmt(withRel.reduce((a, r) => a + r.reliability, 0) / withRel.length)} %` : '—';
  const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'v', textContent: v }), h('div', { class: 'l', textContent: l }));
  $('stats').replaceChildren(stat(String(graded.length), 'copies'),
    stat(`${fmt(avg)} %`, `moyenne (min ${fmt(Math.min(...pct))} – max ${fmt(Math.max(...pct))})`),
    h('div', { class: 'stat' }, h('div', { class: 'v', textContent: rel }),
      h('div', { class: 'l' }, 'fiabilité moyenne ', infoButton())), stat(String(flagged), 'à vérifier ⚠'));
}

function renderResults() {
  const q = $('search').value.trim().toLowerCase();
  const shown = state.results.filter((r) => !q || `${r.name} ${r.group} ${r.exam}`.toLowerCase().includes(q));
  $('empty').hidden = !!state.results.length;
  $('cards').replaceChildren(...shown.map((r) => (r.kind === 'lang' ? langCard(r) : card(r))));
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
        const rowClass = () => [qq.points < qq.max ? 'lost' : '', qq.second != null ? 'disputed' : ''].join(' ');
        const tr = h('tr', { class: rowClass() });
        const second = qq.second != null
          ? h('div', { class: 'second', textContent: qq.first != null
            ? `⚖ Corrections : ${fmt(qq.first)} et ${fmt(qq.second)} → moyenne retenue`
            : `⚖ 2e correction : ${fmt(qq.second)} / ${fmt(qq.max)}` }) : null;
        const input = h('input', { type: 'number', min: 0, max: qq.max, step: r.unit, value: qq.points,
          onchange: () => {
            const v = Math.round((Number(input.value) || 0) / r.unit) * r.unit;
            qq.points = Math.min(qq.max, Math.max(0, v));
            input.value = qq.points;
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
      h('span', { textContent: [r.exam, `${r.pageCount} page(s)`].filter(Boolean).join(' · ') }),
      h('button', { class: 'btn ghost small', type: 'button', textContent: 'Supprimer', onclick: () => {
        if (!confirm(`Supprimer la correction de ${r.name || 'cet élève'} ?`)) return;
        state.results = state.results.filter((x) => x !== r); renderResults();
      } })));
  body.hidden = !open;

  const el = h('article', { class: `card ${r.flags.length ? 'flag' : ''} ${open ? 'open' : ''}` },
    h('div', { class: 'card-head' },
      h('input', { class: 'name', type: 'text', value: r.name, placeholder: '⚠ Nom à compléter', 'aria-label': "Nom de l'élève",
        oninput: (e) => { r.name = e.target.value; state.exported = false; } }),
      h('input', { class: 'group', type: 'text', value: r.group, placeholder: 'Groupe', 'aria-label': 'Groupe',
        oninput: (e) => { r.group = e.target.value; state.exported = false; } }),
      r.reliability == null ? h('span') : h('button', {
        type: 'button', class: `rel ${r.reliability >= 90 ? 'hi' : r.reliability >= 80 ? 'mid' : 'lo'}`,
        title: 'Fiabilité de la correction : cliquez pour en savoir plus', onclick: showRelHelp,
        textContent: `${r.reliability} % ⓘ` }),
      gradeEl,
      h('button', { class: 'icon-btn chev', type: 'button', textContent: '▾', 'aria-label': 'Détails', onclick: () => {
        if (state.open.has(r.id)) state.open.delete(r.id); else state.open.add(r.id);
        body.hidden = !state.open.has(r.id);
        el.classList.toggle('open', !body.hidden);
      } })),
    body);
  return el;
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
function langGrade(r) {
  const count = r.pages.reduce((a, p) => a + p.errors.length, 0);
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
  const gradeEl = h('span', { class: 'grade' });
  gradeEl.replaceChildren(r.grade == null ? `${errors.length} faute${errors.length > 1 ? 's' : ''}`
    : h('span', {}, fmt(r.grade), h('small', {}, ` / ${fmt(r.total)} · ${errors.length} faute(s)`)));
  return h('article', { class: `card open ${r.flags.length ? 'flag' : ''}` },
    h('div', { class: 'card-head' },
      h('input', { class: 'name', type: 'text', value: r.name, placeholder: '⚠ Nom à compléter', 'aria-label': "Nom de l'élève",
        oninput: (e) => { r.name = e.target.value; state.exported = false; } }),
      h('input', { class: 'group', type: 'text', value: r.group, placeholder: 'Groupe', 'aria-label': 'Groupe',
        oninput: (e) => { r.group = e.target.value; state.exported = false; } }),
      h('span'), gradeEl, h('span')),
    h('div', { class: 'card-body' },
      r.flags.length ? h('div', { class: 'flags' }, r.flags.map((f) => h('div', { textContent: `⚠ ${f}` }))) : null,
      errors.length ? categoryChips(errors) : h('p', { class: 'muted small', style: 'margin:0', textContent: 'Aucune faute relevée.' }),
      h('div', { class: 'card-foot' },
        h('span', { textContent: [r.exam, `${r.pageCount} page(s)`].filter(Boolean).join(' · ') }),
        h('div', { style: 'display:flex;gap:.4rem' },
          h('button', { class: 'btn primary small', type: 'button', textContent: '👁 Voir la copie annotée', onclick: () => openViewer(r) }),
          h('button', { class: 'btn ghost small', type: 'button', textContent: 'Supprimer', onclick: () => {
            if (!confirm(`Supprimer l'analyse de ${r.name || 'cet élève'} ?`)) return;
            state.results = state.results.filter((x) => x !== r); renderResults();
          } })))));
}

// Visionneuse : la copie avec les fautes surlignées, et la liste des fautes (supprimables si l'IA s'est trompée).
let viewing = null;
function openViewer(r) {
  viewing = r;
  $('viewer').hidden = false;
  renderViewer();
}

function renderViewer(focus) {
  const r = viewing;
  const count = langGrade(r);
  $('viewer-title').textContent = `${r.name || 'Élève'} · ${count} faute(s)${r.grade != null ? ` · ${fmt(r.grade)} / ${fmt(r.total)}` : ''}`;
  let n = 0;
  const numbered = r.pages.map((p) => p.errors.map((e) => ({ e, p, n: ++n })));
  $('viewer-pages').replaceChildren(...r.pages.map((p, pi) => h('div', { class: 'page-wrap' },
    h('img', { src: p.url, alt: `Page ${pi + 1}` }),
    numbered[pi].filter(({ e }) => e.box).map(({ e, n: k }) => {
      const [y0, x0, y1, x1] = e.box;
      const el = h('div', { class: `hl ${CATS[e.category].cls} ${focus === e ? 'focus' : ''}`, title: `${e.text} → ${e.correction}\n${e.explanation}`,
        onclick: () => renderViewer(e) }, h('span', { textContent: String(k) }));
      el.style.cssText = `top:${y0 / 10}%;left:${x0 / 10}%;height:${(y1 - y0) / 10}%;width:${(x1 - x0) / 10}%`;
      return el;
    }))));
  const items = numbered.flat();
  $('viewer-list').replaceChildren(
    items.length ? categoryChips(items.map((i) => i.e)) : h('p', { class: 'muted', textContent: 'Aucune faute relevée.' }),
    ...items.map(({ e, p, n: k }) => {
      const el = h('div', { class: `err ${CATS[e.category].cls} ${focus === e ? 'focus' : ''}`, onclick: () => renderViewer(e) },
        h('div', { class: 'err-head' }, h('b', { textContent: `${k}. ${CATS[e.category].label}${e.box ? '' : ' (non localisée)'}` }),
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
    }));
}

// Impression : chaque page avec ses surlignages dessinés, puis la liste des corrections. « Enregistrer en PDF » depuis l'impression.
async function printViewer() {
  const r = viewing;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let n = 0;
  const pages = [];
  const list = [];
  for (const p of r.pages) {
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = p.url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    for (const e of p.errors) {
      const k = ++n;
      list.push(`<li><b style="color:${CATS[e.category].color}">${k}. ${esc(CATS[e.category].label)}</b> — <s>${esc(e.text)}</s> → <b>${esc(e.correction)}</b><br><small>${esc(e.explanation)}</small></li>`);
      if (!e.box) continue;
      const [y0, x0, y1, x1] = e.box.map((v) => v / 1000);
      ctx.strokeStyle = ctx.fillStyle = CATS[e.category].color;
      ctx.lineWidth = Math.max(2, c.width / 500);
      ctx.globalAlpha = 0.22; ctx.fillRect(x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height);
      ctx.globalAlpha = 1; ctx.strokeRect(x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height);
      ctx.font = `bold ${Math.round(c.width / 55)}px sans-serif`;
      ctx.fillText(String(k), x0 * c.width, y0 * c.height - 4);
    }
    pages.push(`<img src="${c.toDataURL('image/jpeg', 0.85)}">`);
  }
  const w = window.open('', '_blank');
  if (!w) { alert('Autorisez les fenêtres surgissantes pour imprimer.'); return; }
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(r.name || 'Copie')} — correction de la langue</title>
    <style>body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#111}img{width:100%;page-break-after:always;margin-bottom:16px}
    h1{font-size:18px}li{margin:.35rem 0}</style></head><body>
    <h1>${esc(r.name || 'Élève')}${r.group ? ` · ${esc(r.group)}` : ''} — ${n} faute(s)${r.grade != null ? ` · ${fmt(r.grade)} / ${fmt(r.total)}` : ''}</h1>
    ${pages.join('')}<h1>Corrections</h1><ol style="list-style:none;padding:0">${list.join('')}</ol>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function setKind(kind) {
  if (state.running) return;
  state.kind = kind;
  $('kind-content').classList.toggle('active', kind === 'content');
  $('kind-lang').classList.toggle('active', kind === 'lang');
  $('content-settings').hidden = kind !== 'content';
  $('lang-settings').hidden = kind !== 'lang';
  $('step1-title').textContent = kind === 'lang' ? 'Correction de la langue' : 'Évaluation et copies';
  renderSummary();
}

// ---------- Export ----------

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // empêche Excel d'interpréter une formule
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCSV(rows, suffix) {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const name = [$('exam').value, $('group').value].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'corrections';
  const a = h('a', { href: url, download: `${name}${suffix}_${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV() {
  const num = (n) => String(n).replace('.', ',');
  const lang = state.results.filter((r) => r.kind === 'lang');
  if (lang.length) {
    const keys = Object.keys(CATS);
    const rows = [['Évaluation', 'Groupe', 'Élève', 'Fautes', ...keys.map((k) => CATS[k].label), 'Note', 'Sur', 'Détail des fautes']];
    for (const r of [...lang].reverse()) {
      const errs = r.pages.flatMap((p) => p.errors);
      rows.push([r.exam, r.group, r.name, errs.length, ...keys.map((k) => errs.filter((e) => e.category === k).length),
        r.grade == null ? '' : num(r.grade), r.grade == null ? '' : num(r.total),
        errs.map((e) => `${e.text} → ${e.correction} (${e.explanation})`).join(' | ')]);
    }
    downloadCSV(rows, '_langue');
  }
  const content = state.results.filter((r) => r.kind !== 'lang');
  if (!content.length) { state.exported = true; return; }
  const rows = [['Évaluation', 'Groupe', 'Élève', 'Note', 'Sur', 'Pourcentage', 'Fiabilité (%)', 'Détail par question', 'Commentaire', 'À vérifier']];
  for (const r of [...content].reverse()) {
    rows.push([r.exam, r.group, r.name, num(r.grade), num(r.total), num(Math.round((r.grade / r.total) * 1000) / 10), r.reliability ?? '',
      r.questions.map((q) => `${q.question} : ${num(q.points)}/${num(q.max)}${q.points < q.max && q.justification ? ` (${q.justification})` : ''}`).join(' | '),
      r.comment, r.flags.join(' ')]);
  }
  downloadCSV(rows, '');
  state.exported = true;
}

function endSession() {
  if (!confirm('Télécharger la grille puis tout effacer (copies, corrigé, résultats) ?')) return;
  exportCSV();
  Object.assign(state, { results: [], pages: [], rubricPages: [], status: {}, open: new Set(), exported: true });
  $('mode').value = ''; $('per').value = '';
  ['exam', 'group', 'rubric', 'search'].forEach((id) => { $(id).value = ''; });
  state.grid = null;
  renderRubric(); renderGrid(); renderPages(); renderResults();
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
document.querySelectorAll('[data-close-viewer]').forEach((b) => b.addEventListener('click', () => { $('viewer').hidden = true; viewing = null; }));
$('grid-remove').addEventListener('click', () => { state.grid = null; renderGrid(); });
$('deep').addEventListener('change', renderSummary);
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
document.querySelectorAll('[data-close-rel]').forEach((b) => b.addEventListener('click', () => { $('rel-help').hidden = true; }));
document.querySelector('[data-close-newkey]').addEventListener('click', () => { $('newkey').hidden = true; });
$('newkey-copy').addEventListener('click', () => navigator.clipboard?.writeText($('newkey-value').textContent));

window.addEventListener('beforeunload', (e) => {
  if (state.running || (state.results.length && !state.exported)) e.preventDefault();
});

// ---------- Démarrage ----------

const saved = new URLSearchParams(location.search).get('key') || store.get();
if (new URLSearchParams(location.search).has('key')) history.replaceState(null, '', location.pathname);
if (saved) useKey(saved).catch((err) => { if (err.status === 401) store.del(); showGate(err.message); });
else showGate();
renderPages();
renderResults();
