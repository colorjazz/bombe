// Construit demo/demo.html : l'application en une seule page, avec le faux serveur (aucune mise en ligne nécessaire).
// Usage : node demo/construire.mjs  (écrit aussi site/index.html, la page publiée par Netlify)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ici = new URL('.', import.meta.url);
const lire = (f) => readFileSync(new URL(f, ici), 'utf8');
const bandeau = `<div class="demo-bandeau">
  <span class="demo-etiquette">Démo</span>
  <span class="demo-texte">Données fictives, gardées dans ce navigateur. Codes : élève <code>sport</code>, enseignant <code>prof</code>, direction <code>dir</code>.</span>
  <span class="demo-acces">
    <button data-demo="eleve">Élève</button>
    <button data-demo="enseignant">Enseignant</button>
    <button data-demo="direction">Direction</button>
    <button data-demo="reset" class="demo-reset">Réinitialiser</button>
  </span>
</div>`;
const raccourcis = `<script>
document.querySelectorAll('[data-demo]').forEach((b) => b.onclick = async () => {
  if (b.dataset.demo === 'reset') { reinitialiserDemo(); localStorage.removeItem('jeton'); return location.reload(); }
  const corps = b.dataset.demo === 'eleve'
    ? { role: 'eleve', nom: 'Léa Tremblay', groupe: '3-02', nip: '1234', code: 'sport' }
    : b.dataset.demo === 'direction' ? { role: 'direction', nom: 'Sophie Martin', code: 'dir' }
    : { role: 'enseignant', nom: 'Marc Gagnon', matiere: 'Mathématiques', code: 'prof' };
  const r = await (await fetch('/api/login', { method: 'POST', headers: {}, body: JSON.stringify(corps) })).json();
  localStorage.setItem('jeton', r.token); localStorage.setItem('role', corps.role); location.reload();
});
</script>`;
const css = lire('../public/style.css') + `
.demo-bandeau { background: #fff; border-bottom: 1px solid #e4e4e0; padding: 6px 12px; font-size: .85rem; display: flex; align-items: center; gap: 10px; color: #646b7a; }
.demo-etiquette { background: #14213d; color: #fff; font-weight: 700; font-size: .72rem; padding: 3px 8px; border-radius: 6px; letter-spacing: .02em; flex: none; }
.demo-texte { flex: 1; }
.demo-bandeau code { background: #f3f3f1; padding: 1px 5px; border-radius: 4px; color: #1c2333; }
.demo-acces { display: flex; gap: 6px; flex: none; }
.demo-bandeau button { min-height: 34px; padding: 0 10px; font-size: .82rem; font-weight: 600; border: 1px solid #d3d3cd; background: #fff; border-radius: 8px; color: #1c2333; }
.demo-bandeau .demo-reset { border: 0; color: #646b7a; font-weight: 500; }
.page-enseignant .demo-bandeau { grid-column: 1 / -1; }
@media (max-width: 700px) { .demo-texte { display: none; } .demo-acces { flex: 1; justify-content: flex-end; } }
@media (min-width: 901px) { body.page-enseignant { grid-template-rows: auto auto 1fr; grid-template-areas: 'demo demo' 'barre barre' 'nav main'; } .demo-bandeau { grid-area: demo; } }`;
let html = lire('../public/index.html')
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace('<body>', '<body>\n' + bandeau)
  .replace('<script src="app.js"></script>', `<script>\n${lire('faux-serveur.js')}\n</script>\n<script>\n${lire('../public/app.js')}\n</script>\n${raccourcis}`)
  .replace('<title>Transmission · Antoine Saint-Exupéry</title>', '<title>Transmission · Antoine Saint-Exupéry</title>\n  <meta name="color-scheme" content="light">');
writeFileSync(new URL('demo.html', ici), html);
// Copie pour Netlify (dossier « site », publié tel quel)
mkdirSync(new URL('../site/', ici), { recursive: true });
writeFileSync(new URL('../site/index.html', ici), html);
console.log('demo/demo.html et site/index.html :', html.length, 'caractères');
