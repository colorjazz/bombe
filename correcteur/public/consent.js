// Lettre de consentement : les passages surlignés se remplissent sur place, puis la lettre s'imprime, se télécharge
// pour Word (document HTML que Word ouvre) ou se copie. Rien n'est envoyé : tout reste dans la page.
const me = document.currentScript;
const letter = document.getElementById('letter');

// Où les copies sont traitées : la phrase de la lettre suit le réglage choisi dans l'appli.
for (const r of document.querySelectorAll('input[name="mode"]')) {
  r.addEventListener('change', () => {
    for (const li of letter.querySelectorAll('[data-mode]')) li.hidden = li.dataset.mode !== r.value;
  });
}
// Un passage rempli n'est plus surligné (il le reste tant qu'il commence par « [ »).
letter.addEventListener('input', (e) => {
  const f = e.target.closest('.fill');
  if (f) f.classList.toggle('done', !f.textContent.trim().startsWith('['));
});

// La lettre telle qu'affichée, sans les passages masqués.
function clean() {
  const c = letter.cloneNode(true);
  c.querySelectorAll('[hidden]').forEach((n) => n.remove());
  c.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
  return c;
}

document.getElementById('print').addEventListener('click', () => window.print());

document.getElementById('word').addEventListener('click', () => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.35}h3{font-size:12pt;margin:12pt 0 4pt}.cut{color:#888}</style></head>
<body>${clean().innerHTML}</body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }));
  a.download = me.dataset.file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

document.getElementById('copy').addEventListener('click', async (e) => {
  const btn = e.currentTarget, label = btn.textContent;
  const holder = clean();
  holder.style.cssText = 'position:fixed;left:-9999px;width:700px';
  document.body.append(holder);
  const text = holder.innerText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  holder.remove();
  try { await navigator.clipboard.writeText(text); btn.textContent = me.dataset.copied; } catch { btn.textContent = '—'; }
  setTimeout(() => { btn.textContent = label; }, 2500);
});
