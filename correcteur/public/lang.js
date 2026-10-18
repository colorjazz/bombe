// Langue du site (FR | EN) : choix mémorisé, sinon langue du navigateur.
// Chargé en premier sur chaque page. Les pages statiques existent en deux fichiers
// (<html data-lang="fr" data-alt="index-en.html">) ; l'appli traduit sur place (i18n.js).
(function () {
  var KEY = 'ce.lang';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* navigation privée */ }
  var langs = navigator.languages || [navigator.language || ''];
  var browser = langs.some(function (l) { return /^fr/i.test(l); }) ? 'fr' : 'en';
  var lang = saved === 'fr' || saved === 'en' ? saved : browser;
  window.CE_LANG = lang;

  var html = document.documentElement;
  if (html.dataset.alt && html.dataset.lang && html.dataset.lang !== lang) {
    location.replace(html.dataset.alt + location.search + location.hash);
    return;
  }
  if (!html.dataset.lang) html.lang = lang === 'en' ? 'en-CA' : 'fr-CA';

  // Sélecteur FR | EN : <a data-set-lang="en" href="index-en.html"> ou bouton sans lien (recharge la page).
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-set-lang]');
    if (!el) return;
    try { localStorage.setItem(KEY, el.dataset.setLang); } catch (err) { /* ignoré */ }
    if (!el.getAttribute('href')) { e.preventDefault(); location.reload(); }
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-set-lang]').forEach(function (el) {
      el.classList.toggle('on', el.dataset.setLang === lang);
      el.setAttribute('aria-current', el.dataset.setLang === lang ? 'true' : 'false');
    });
  });
})();
