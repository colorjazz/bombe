// Construit demo/demo.html : l'application en une seule page, avec le faux serveur (aucune mise en ligne nécessaire).
// Usage : node demo/construire.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const ici = new URL('.', import.meta.url);
const lire = (f) => readFileSync(new URL(f, ici), 'utf8');
const bandeau = `<div class="demo-bandeau">
  <strong>Démonstration</strong> — données fictives, gardées seulement dans votre navigateur.
  Code élève : <code>sport</code> · code enseignant : <code>prof</code>.
  <span class="demo-acces">Essayer :
    <button data-demo="eleve">Léa (élève, NIP 1234)</button>
    <button data-demo="enseignant">M. Gagnon (enseignant)</button>
    <button data-demo="reset">Remettre les données d'origine</button></span>
</div>`;
const raccourcis = `<script>
document.querySelectorAll('[data-demo]').forEach((b) => b.onclick = async () => {
  if (b.dataset.demo === 'reset') { reinitialiserDemo(); localStorage.removeItem('jeton'); return location.reload(); }
  const corps = b.dataset.demo === 'eleve'
    ? { role: 'eleve', nom: 'Léa Tremblay', groupe: '3-02', nip: '1234', code: 'sport' }
    : { role: 'enseignant', nom: 'Marc Gagnon', matiere: 'Mathématiques', code: 'prof' };
  const r = await (await fetch('/api/login', { method: 'POST', headers: {}, body: JSON.stringify(corps) })).json();
  localStorage.setItem('jeton', r.token); localStorage.setItem('role', corps.role); location.reload();
});
</script>`;
const css = lire('../public/style.css') + `
.demo-bandeau { background: #fef3c7; color: #78350f; padding: 8px 16px; font-size: .9rem; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
.demo-bandeau code { background: #fff; padding: 1px 6px; border-radius: 4px; }
.demo-acces { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.demo-bandeau button { background: #fff; border: 1px solid #f59e0b; padding: 6px 10px; font-size: .85rem; min-height: 36px; }
button[onclick="print()"] { display: none; }`;
let html = lire('../public/index.html')
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace('<body>', '<body>\n' + bandeau)
  .replace('<script src="app.js"></script>', `<script>\n${lire('faux-serveur.js')}\n</script>\n<script>\n${lire('../public/app.js')}\n</script>\n${raccourcis}`)
  .replace('<title>Absences Sport-études</title>', '<title>Absences Sport-études</title>\n  <meta name="color-scheme" content="light">');
writeFileSync(new URL('demo.html', ici), html);
console.log('demo/demo.html :', html.length, 'caractères');
