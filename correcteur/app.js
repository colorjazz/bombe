// Correcteur Express — tout tourne dans le navigateur, la clé API de l'enseignant
// est envoyée uniquement à OpenAI. Rien n'est conservé : ni sur un serveur, ni dans
// le navigateur. Les données vivent en mémoire le temps de la session.

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const CONCURRENCY = 3;
const MAX_RETRIES = 3;

const $ = (id) => document.getElementById(id);
const el = {
  apiKey: $('api-key'), model: $('model'), keyStatus: $('key-status'),
  form: $('form'), total: $('total'), checkLanguage: $('check-language'), rubric: $('rubric'),
  rubricFile: $('rubric-file'), rubricFileName: $('rubric-file-name'), rubricFileClear: $('rubric-file-clear'),
  dropzone: $('dropzone'), copies: $('copies'), queue: $('queue'), submit: $('submit'), progress: $('progress'),
  table: $('results'), empty: $('empty'), stats: $('stats'), exportBtn: $('export'), endBtn: $('end'),
};

const state = {
  queue: [],        // { id, file, status: 'pending'|'running'|'error', error }
  rubricFile: null, // File
  results: [],      // { id, file, name, group, grade, total, comment, uncertain }
  running: false,
  exported: true,   // false dès qu'il y a des résultats non téléchargés
};

// ---------- Aucune persistance ----------

// Nettoie les données qu'une ancienne version de l'appli aurait pu laisser dans le navigateur.
try { ['ce.apiKey', 'ce.model', 'ce.results'].forEach((k) => localStorage.removeItem(k)); } catch { /* ignoré */ }

function markDirty() { state.exported = false; }

function updateKeyStatus() {
  el.keyStatus.textContent = el.apiKey.value.trim() ? 'Clé API OpenAI ✓' : 'Clé API OpenAI (requise)';
  updateButtons();
}

// ---------- Fichiers ----------

const isSupported = (f) => f.type.startsWith('image/') || f.type === 'application/pdf';

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(file);
  });
}

// Convertit un fichier en bloc de contenu pour l'API (image ou PDF).
async function toContentPart(file) {
  const dataUrl = await readAsDataURL(file);
  if (file.type === 'application/pdf') {
    return { type: 'file', file: { filename: file.name, file_data: dataUrl } };
  }
  return { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } };
}

function addCopies(files) {
  for (const file of files) {
    const item = { id: crypto.randomUUID(), file, status: 'pending', error: '' };
    if (!isSupported(file)) { item.status = 'error'; item.error = 'format non supporté'; }
    else if (file.size > MAX_FILE_BYTES) { item.status = 'error'; item.error = 'fichier trop lourd'; }
    state.queue.push(item);
  }
  renderQueue();
}

// ---------- Appel à l'IA ----------

function buildInstructions(total, checkLanguage, rubric) {
  return [
    "Tu es un enseignant expérimenté et bienveillant mais rigoureux. Tu corriges une copie d'élève.",
    '',
    'Identification :',
    "- Lis le nom et la classe de l'élève sur la copie (généralement en haut de la première page).",
    "- S'ils sont illisibles ou absents, laisse le champ vide et mets \"incertain\" à true. N'invente jamais un nom.",
    '',
    'Notation :',
    `- Barème total : ${total} points. La note doit être comprise entre 0 et ${total}, au demi-point près.`,
    rubric
      ? `- Applique strictement la grille / les consignes de l'enseignant ci-dessous${state.rubricFile ? " ainsi que le corrigé joint" : ''}.`
      : `- Aucune grille fournie${state.rubricFile ? ' hormis le corrigé joint' : ''} : évalue la pertinence, l'exactitude et la rigueur du contenu.`,
    checkLanguage
      ? "- Tiens compte de l'orthographe et de la grammaire, et signale les erreurs récurrentes dans le commentaire."
      : "- Ne pénalise pas l'orthographe ni la grammaire.",
    "- Si la copie est illisible, hors sujet ou inexploitable, mets \"incertain\" à true et explique-le.",
    '',
    'Commentaire : 2 à 4 phrases adressées à l\'élève, précises et constructives, citant des éléments concrets de la copie (réussites, erreurs, piste de progrès).',
    rubric ? `\n--- CONSIGNES DE L'ENSEIGNANT ---\n${rubric}\n--- FIN DES CONSIGNES ---` : '',
  ].join('\n');
}

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'correction',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['nom', 'classe', 'note', 'commentaire', 'incertain'],
      properties: {
        nom: { type: 'string' },
        classe: { type: 'string' },
        note: { type: 'number' },
        commentaire: { type: 'string' },
        incertain: { type: 'boolean' },
      },
    },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOpenAI(body, apiKey) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch {
      if (attempt < MAX_RETRIES) { await sleep(2000 * 2 ** attempt); continue; }
      throw new Error('réseau indisponible');
    }
    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    let message = `erreur ${res.status}`;
    try { message = (await res.json()).error?.message || message; } catch { /* corps non JSON */ }
    if (res.status === 401) message = 'clé API invalide';
    throw new Error(message);
  }
}

async function gradeCopy(item, ctx) {
  const content = [
    { type: 'text', text: ctx.instructions },
    ...(ctx.rubricPart ? [{ type: 'text', text: 'Corrigé / grille fourni par l\'enseignant :' }, ctx.rubricPart] : []),
    { type: 'text', text: `Copie de l'élève (fichier « ${item.file.name} ») :` },
    await toContentPart(item.file),
  ];
  const data = await callOpenAI({
    model: ctx.model,
    messages: [{ role: 'user', content }],
    response_format: RESPONSE_FORMAT,
    temperature: 0.2,
    max_tokens: 800,
  }, ctx.apiKey);

  const message = data.choices?.[0]?.message;
  if (message?.refusal) throw new Error('l\'IA a refusé de corriger cette copie');
  const parsed = JSON.parse(message?.content ?? '');
  const grade = Number(parsed.note);
  return {
    id: item.id,
    file: item.file.name,
    name: parsed.nom.trim(),
    group: parsed.classe.trim(),
    grade: Number.isFinite(grade) ? Math.min(ctx.total, Math.max(0, Math.round(grade * 2) / 2)) : null,
    total: ctx.total,
    comment: parsed.commentaire.trim(),
    uncertain: Boolean(parsed.incertain) || !parsed.nom.trim() || !Number.isFinite(grade),
  };
}

async function runCorrection(e) {
  e.preventDefault();
  const apiKey = el.apiKey.value.trim();
  const total = Number(el.total.value);
  const todo = state.queue.filter((q) => q.status === 'pending' || (q.status === 'error' && isSupported(q.file) && q.file.size <= MAX_FILE_BYTES));
  if (!apiKey || !todo.length || !(total > 0)) return;

  state.running = true;
  todo.forEach((q) => { q.status = 'pending'; q.error = ''; });
  renderQueue();

  let ctx;
  try {
    ctx = {
      apiKey, total, model: el.model.value.trim() || 'gpt-4o',
      instructions: buildInstructions(total, el.checkLanguage.checked, el.rubric.value.trim()),
      rubricPart: state.rubricFile ? await toContentPart(state.rubricFile) : null,
    };
  } catch (err) {
    el.progress.textContent = `Corrigé illisible : ${err.message}`;
    state.running = false; renderQueue();
    return;
  }

  let done = 0;
  const report = () => { el.progress.textContent = `Correction : ${done} / ${todo.length}…`; };
  report();

  const worker = async () => {
    while (true) {
      const item = todo.find((q) => q.status === 'pending');
      if (!item) return;
      item.status = 'running'; renderQueue();
      try {
        state.results.unshift(await gradeCopy(item, ctx));
        state.queue = state.queue.filter((q) => q !== item);
        markDirty(); renderResults();
      } catch (err) {
        item.status = 'error';
        item.error = err instanceof SyntaxError ? 'réponse de l\'IA invalide' : err.message;
      }
      done++; report(); renderQueue();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  state.running = false;
  const failed = todo.filter((q) => q.status === 'error').length;
  el.progress.textContent = failed
    ? `${todo.length - failed} copie(s) corrigée(s), ${failed} en erreur (cliquez à nouveau pour réessayer).`
    : `${todo.length} copie(s) corrigée(s).`;
  renderQueue();
}

// ---------- Rendu ----------

function node(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
}

function updateButtons() {
  const pending = state.queue.filter((q) => q.status !== 'running' && isSupported(q.file) && q.file.size <= MAX_FILE_BYTES).length;
  el.submit.disabled = state.running || !pending || !el.apiKey.value.trim();
  el.submit.textContent = state.running ? 'Correction en cours…'
    : !el.apiKey.value.trim() ? 'Renseignez votre clé API pour corriger'
    : `Corriger ${pending} copie(s)`;
  el.exportBtn.disabled = el.endBtn.disabled = !state.results.length || state.running;
}

function renderQueue() {
  el.queue.replaceChildren(...state.queue.map((q) => {
    const label = { pending: '', running: '⏳', error: '' }[q.status];
    return node('li', {},
      node('span', { textContent: q.file.type === 'application/pdf' ? '📄' : '🖼️' }),
      node('span', { className: 'name', textContent: q.file.name, title: q.file.name }),
      q.error ? node('span', { className: 'err', textContent: q.error }) : node('span', { textContent: label }),
      node('button', {
        type: 'button', className: 'icon', textContent: '×', title: 'Retirer', disabled: q.status === 'running',
        onclick: () => { state.queue = state.queue.filter((x) => x !== q); renderQueue(); },
      }),
    );
  }));
  updateButtons();
}

function editable(value, onSave, className = '') {
  const td = node('td', { className, contentEditable: 'plaintext-only', textContent: value ?? '' });
  td.addEventListener('blur', () => { onSave(td.textContent.trim()); markDirty(); renderStats(); });
  td.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); td.blur(); } });
  return td;
}

const fmt = (n) => (n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

function renderStats() {
  const grades = state.results.filter((r) => r.grade != null);
  if (!grades.length) { el.stats.textContent = ''; return; }
  const on20 = grades.map((r) => (r.grade / r.total) * 20);
  const avg = on20.reduce((a, b) => a + b, 0) / on20.length;
  const flagged = state.results.filter((r) => r.uncertain).length;
  el.stats.textContent = `${state.results.length} copie(s) · moyenne ${fmt(avg)}/20 · min ${fmt(Math.min(...on20))} · max ${fmt(Math.max(...on20))}`
    + (flagged ? ` · ${flagged} à vérifier` : '');
}

function renderResults() {
  const tbody = el.table.tBodies[0];
  tbody.replaceChildren(...state.results.map((r) => {
    const nameCell = editable(r.name, (v) => { r.name = v; });
    nameCell.title = r.file;
    const gradeCell = editable(r.grade == null ? '' : String(r.grade).replace('.', ','), (v) => {
      const n = Number(v.replace(',', '.'));
      r.grade = v === '' || !Number.isFinite(n) ? null : Math.min(r.total, Math.max(0, n));
      gradeCell.textContent = r.grade == null ? '' : String(r.grade).replace('.', ',');
    }, 'grade');
    const tr = node('tr', { className: r.uncertain ? 'flag' : '' },
      nameCell,
      editable(r.group, (v) => { r.group = v; }),
      gradeCell,
      editable(r.comment, (v) => { r.comment = v; }, 'comment'),
      node('td', {}, node('button', {
        type: 'button', className: 'icon', textContent: '×', title: 'Supprimer',
        onclick: () => { state.results = state.results.filter((x) => x !== r); markDirty(); renderResults(); },
      })),
    );
    gradeCell.dataset.total = r.total;
    gradeCell.title = `sur ${r.total}`;
    return tr;
  }));
  el.table.hidden = !state.results.length;
  el.empty.hidden = !!state.results.length;
  renderStats();
  updateButtons();
}

// ---------- Export CSV (compatible Excel FR : « ; », BOM UTF-8, protection contre l'injection de formules) ----------

function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCSV() {
  const header = ['Élève', 'Classe', 'Note', 'Sur', 'Commentaire', 'À vérifier', 'Fichier'];
  const rows = state.results.map((r) => [
    r.name, r.group, r.grade == null ? '' : String(r.grade).replace('.', ','), r.total, r.comment, r.uncertain ? 'oui' : '', r.file,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = node('a', { href: url, download: `corrections_${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  state.exported = true;
}

// ---------- Événements ----------

el.apiKey.addEventListener('input', updateKeyStatus);
el.model.addEventListener('change', updateKeyStatus);
el.form.addEventListener('submit', runCorrection);
el.copies.addEventListener('change', () => { addCopies(el.copies.files); el.copies.value = ''; });

['dragenter', 'dragover'].forEach((t) => el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => el.dropzone.addEventListener(t, () => el.dropzone.classList.remove('over')));
el.dropzone.addEventListener('drop', (e) => { e.preventDefault(); addCopies(e.dataTransfer.files); });

el.rubricFile.addEventListener('change', () => {
  const f = el.rubricFile.files[0];
  el.rubricFile.value = '';
  if (!f) return;
  if (!isSupported(f) || f.size > MAX_FILE_BYTES) { el.rubricFileName.textContent = 'Fichier non supporté ou trop lourd'; return; }
  state.rubricFile = f;
  el.rubricFileName.textContent = f.name;
  el.rubricFileClear.hidden = false;
});
el.rubricFileClear.addEventListener('click', () => {
  state.rubricFile = null; el.rubricFileName.textContent = ''; el.rubricFileClear.hidden = true;
});

el.exportBtn.addEventListener('click', exportCSV);
// Fin de session : téléchargement de la grille, puis effacement de tout.
el.endBtn.addEventListener('click', () => {
  if (!confirm('Télécharger la grille puis tout effacer (résultats, copies, corrigé, clé API) ?')) return;
  exportCSV();
  state.results = []; state.queue = []; state.rubricFile = null; state.exported = true;
  el.apiKey.value = ''; el.rubric.value = ''; el.rubricFileName.textContent = ''; el.rubricFileClear.hidden = true;
  el.progress.textContent = 'Session terminée : la grille est téléchargée et tout a été effacé.';
  updateKeyStatus(); renderQueue(); renderResults();
});

// Rien n'est sauvegardé : on prévient avant de fermer l'onglet si la grille n'a pas été téléchargée.
window.addEventListener('beforeunload', (e) => {
  if (state.results.length && !state.exported) e.preventDefault();
});

el.apiKey.closest('details').open = true;
updateKeyStatus();
renderQueue();
renderResults();
