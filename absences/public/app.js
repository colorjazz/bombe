// Absences Sport-études — application (navigateur). Aucune dépendance.
'use strict';

const PREAVIS_MIN = 7; // jours d'avance demandés aux élèves
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
const navBas = $('#nav-bas');
let moi = null;

// Icônes (traits, 24 × 24)
const ICONES = {
  liste: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  calendrier: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  examen: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16"/><path d="m9 14 2 2 4-4"/>',
  eleves: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gauche: '<path d="m15 5-7 7 7 7"/>',
  droite: '<path d="m9 5 7 7-7 7"/>',
  fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  lieu: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  horloge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  recherche: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  imprimer: '<path d="M7 9V3.5h10V9M7 17H4.5V10a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  corbeille: '<path d="M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13"/>',
  cle: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5"/>',
};
const ico = (nom, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nom]}</svg>`;

// ---------- Outils ----------

async function api(chemin, options = {}) {
  const token = localStorage.getItem('jeton');
  const rep = await fetch('/api/' + chemin, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await rep.json().catch(() => ({ error: 'Le serveur ne répond pas. Réessayez.' }));
  if (rep.status === 401 && chemin !== 'login') { deconnecter(); throw new Error(data.error); }
  if (!rep.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function auj() { return new Date().toLocaleDateString('en-CA'); }

function joursAvant(iso) {
  return Math.round((new Date(iso + 'T12:00') - new Date(auj() + 'T12:00')) / 864e5);
}

function dateFr(iso, options = { weekday: 'short', day: 'numeric', month: 'long' }) {
  if (!iso) return '';
  return new Date(iso + 'T12:00').toLocaleDateString('fr-CA', options).replace('.', '');
}
const dateCourte = (iso) => dateFr(iso, { day: 'numeric', month: 'short' });

function periode(debut, fin) {
  if (debut === fin) return dateFr(debut);
  return `${dateCourte(debut)} au ${dateCourte(fin)}`;
}

// Petit bloc « 27 NOV. » en tête des cartes de tournoi
function blocDate(debut, fin) {
  const d = new Date(debut + 'T12:00');
  const nb = joursAvant(fin) - joursAvant(debut) + 1;
  return `<div class="bloc-date" aria-hidden="true">
    <span class="bd-mois">${d.toLocaleDateString('fr-CA', { month: 'short' }).replace('.', '')}</span>
    <span class="bd-jour">${d.getDate()}</span>
    ${nb > 1 ? `<span class="bd-duree">${nb} j</span>` : ''}
  </div>`;
}

function etat(debut, fin) {
  const d = joursAvant(debut), f = joursAvant(fin);
  if (f < 0) return '<span class="pastille grise">Terminé</span>';
  if (d <= 0) return '<span class="pastille rouge">En cours</span>';
  if (d === 1) return '<span class="pastille orange">Demain</span>';
  return `<span class="pastille ${d <= PREAVIS_MIN ? 'orange' : 'neutre'}">Dans ${d} jours</span>`;
}

function preavisPastille(jours) {
  if (jours < 0) return '<span class="pastille rouge" title="Déclaré après le départ">En retard</span>';
  const cls = jours < 3 ? 'rouge' : jours < PREAVIS_MIN ? 'orange' : 'verte';
  return `<span class="pastille ${cls}" title="Délai entre la déclaration et le départ">${jours} j d'avance</span>`;
}

function meta(...morceaux) {
  return morceaux.filter(Boolean).map((m) => `<span>${m}</span>`).join('');
}

function montrerErreur(form, msg) {
  const p = $('.erreur', form);
  p.textContent = msg || '';
  p.hidden = !msg;
}

let toastMinuterie;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastMinuterie);
  toastMinuterie = setTimeout(() => { t.hidden = true; }, 2600);
}

// Confirmation dans la page (les boîtes du navigateur sont laides et bloquées dans certains cadres)
function demander(texte, bouton = 'Confirmer') {
  const dlg = $('#dlg-confirmer');
  $('#confirmer-texte').textContent = texte;
  $('#confirmer-oui').textContent = bouton;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((ok) => dlg.addEventListener('close', () => ok(dlg.returnValue === 'oui'), { once: true }));
}

function ouvrir(dlg) {
  montrerErreur(dlg, '');
  dlg.showModal();
  $('.feuille-corps', dlg).scrollTop = 0;
}

document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-fermer]') || e.target === d) d.close(); // clic sur le fond : fermer
  });
});

function deconnecter() {
  api('logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('jeton');
  moi = null;
  demarrer();
}
$('#deconnexion').onclick = () => { $('#menu-compte').hidden = true; deconnecter(); };
$('#qui').onclick = (e) => { e.stopPropagation(); $('#menu-compte').hidden = !$('#menu-compte').hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('#menu-compte')) $('#menu-compte').hidden = true; });

// ---------- Connexion ----------

function ecranConnexion() {
  $('#qui').hidden = true;
  navBas.hidden = true;
  document.body.className = 'page-connexion';
  app.replaceChildren($('#tpl-connexion').content.cloneNode(true));
  const form = $('#form-connexion');
  let role = localStorage.getItem('role') || 'eleve';
  const choisir = (r) => {
    role = r;
    app.querySelectorAll('[data-role]').forEach((b) => b.setAttribute('aria-selected', b.dataset.role === r));
    form.querySelectorAll('.eleve').forEach((el) => { el.hidden = r !== 'eleve'; });
    form.querySelectorAll('.enseignant').forEach((el) => { el.hidden = r !== 'enseignant'; });
  };
  app.querySelectorAll('[data-role]').forEach((b) => { b.onclick = () => choisir(b.dataset.role); });
  choisir(role);
  form.nom.value = localStorage.getItem('nom') || '';
  form.groupe.value = localStorage.getItem('groupe') || '';
  form.onsubmit = async (e) => {
    e.preventDefault();
    montrerErreur(form, '');
    const f = Object.fromEntries(new FormData(form));
    const bouton = $('button[type=submit]', form);
    bouton.disabled = true;
    try {
      const r = await api('login', { method: 'POST', body: { role, ...f } });
      localStorage.setItem('jeton', r.token);
      localStorage.setItem('role', role);
      localStorage.setItem('nom', f.nom);
      if (f.groupe) localStorage.setItem('groupe', f.groupe);
      moi = r.moi;
      afficher();
    } catch (err) { montrerErreur(form, err.message); } finally { bouton.disabled = false; }
  };
}

// ---------- Élève ----------

async function ecranEleve() {
  document.body.className = 'page-eleve';
  navBas.hidden = false;
  navBas.innerHTML = `<button class="principal plein action-bas" id="btn-declarer-bas">${ico('plus')} Déclarer une absence</button>`;
  navBas.classList.add('nav-action');
  $('#btn-declarer-bas').onclick = ouvrirDeclaration;

  const { absences } = await api('mes-absences');
  const taches = absences.flatMap((a) => a.taches);
  const aFaire = taches.filter((t) => !t.fait_at);
  const reprises = taches.filter((t) => t.examen && t.reprise_date && joursAvant(t.reprise_date) >= 0)
    .sort((a, b) => a.reprise_date.localeCompare(b.reprise_date));
  const prochaine = reprises[0];

  app.innerHTML = `
    <div class="entete-page">
      <div>
        <h1>Mes absences</h1>
        <p class="aide">Déclare chaque tournoi au moins ${PREAVIS_MIN} jours avant ton départ.</p>
      </div>
      <button class="principal large-seulement" id="btn-declarer">${ico('plus')} Déclarer une absence</button>
    </div>
    <section class="stats">
      <div class="stat"><span class="stat-nb">${aFaire.length}</span><span class="stat-lib">${aFaire.length > 1 ? 'travaux' : 'travail'} à faire</span></div>
      <div class="stat"><span class="stat-nb">${reprises.length}</span><span class="stat-lib">reprise${reprises.length > 1 ? 's' : ''} d'examen
        ${prochaine ? `<small>Prochaine : ${dateFr(prochaine.reprise_date)}, ${esc(prochaine.matiere || prochaine.enseignant)}</small>` : ''}</span></div>
    </section>
    ${absences.length ? '' : `<div class="vide-grand">${ico('calendrier')}<p>Aucune absence déclarée.</p><p class="aide">Ton prochain tournoi approche ? Déclare-le dès que tu connais les dates.</p></div>`}
    <div id="liste" class="liste-cartes"></div>`;

  const liste = $('#liste');
  for (const a of absences) {
    const carte = document.createElement('article');
    const finis = a.taches.length && a.taches.every((t) => t.fait_at);
    carte.className = 'carte' + (joursAvant(a.fin) < 0 && (finis || !a.taches.length) ? ' passee' : '');
    carte.innerHTML = `
      <div class="carte-tete">
        ${blocDate(a.debut, a.fin)}
        <div class="carte-titre">
          <h3>${esc(a.tournoi)}</h3>
          <p class="meta">${meta(periode(a.debut, a.fin), esc(a.sport), esc(a.lieu))}</p>
          <div class="etat">${etat(a.debut, a.fin)}</div>
        </div>
      </div>
      ${a.note ? `<p class="note">${esc(a.note)}</p>` : ''}
      <div class="carte-section">
        <h4>Travail demandé <span class="compte">${a.taches.filter((t) => t.fait_at).length}/${a.taches.length}</span></h4>
        ${a.taches.length ? `<ul class="taches">${a.taches.map(tacheEleve).join('')}</ul>`
          : '<p class="vide">Rien pour l\'instant. Tes enseignants ajouteront le travail ici.</p>'}
      </div>
      ${a.taches.length ? '' : `<div class="carte-pied"><button class="lien danger" data-annuler>Annuler cette absence</button></div>`}`;
    carte.querySelectorAll('[data-fait]').forEach((b) => {
      b.onclick = async () => {
        b.closest('li').classList.toggle('fait');
        await api(`taches/${b.dataset.fait}/fait`, { method: 'POST' });
        ecranEleve();
      };
    });
    const annuler = $('[data-annuler]', carte);
    if (annuler) annuler.onclick = async () => {
      if (!await demander(`Annuler ton absence pour « ${a.tournoi} » ?`, 'Annuler l\'absence')) return;
      await api('absences/' + a.id, { method: 'DELETE' });
      toast('Absence annulée');
      ecranEleve();
    };
    liste.append(carte);
  }
  $('#btn-declarer').onclick = ouvrirDeclaration;
}

function tacheEleve(t) {
  const retard = !t.fait_at && t.remise && joursAvant(t.remise) < 0;
  return `<li class="${t.fait_at ? 'fait' : ''}">
    <button class="coche" data-fait="${t.id}" aria-pressed="${!!t.fait_at}" aria-label="${t.fait_at ? 'Marquer comme non terminé' : 'Marquer comme terminé'}">${ico('coche')}</button>
    <div class="tache-corps">
      <p class="tache-tete"><strong>${esc(t.matiere || 'Cours')}</strong><span class="details">${esc(t.enseignant)}</span></p>
      ${t.travail ? `<p class="travail">${esc(t.travail)}</p>` : ''}
      ${t.remise ? `<p class="echeance ${retard ? 'retard' : ''}">${ico('horloge')} À remettre ${retard ? 'depuis le' : 'le'} <strong>${dateFr(t.remise)}</strong></p>` : ''}
      ${t.examen ? `<div class="reprise">${ico('examen')}<div>
        <strong>Reprise d'examen${t.examen_nom ? ' · ' + esc(t.examen_nom) : ''}</strong>
        <span>${t.reprise_date ? dateFr(t.reprise_date) : 'Date à confirmer avec ton enseignant'}${t.reprise_info ? ' · ' + esc(t.reprise_info) : ''}</span>
      </div></div>` : ''}
    </div>
  </li>`;
}

async function ouvrirDeclaration() {
  const dlg = $('#dlg-absence');
  const form = $('#form-absence');
  form.reset();
  const { tournois } = await api('tournois');
  form.tournoi_id.innerHTML = '<option value="">Choisis ton tournoi</option>'
    + tournois.map((t) => `<option value="${t.id}" data-debut="${t.debut}">${esc(t.nom)} · ${periode(t.debut, t.fin)}${t.lieu ? ', ' + esc(t.lieu) : ''}</option>`).join('')
    + '<option value="nouveau">Mon tournoi n\'est pas dans la liste</option>';
  if (!tournois.length) form.tournoi_id.value = 'nouveau';
  const maj = () => {
    const nouveau = form.tournoi_id.value === 'nouveau';
    $('#nouveau-tournoi').hidden = !nouveau;
    const debut = nouveau ? form.debut.value : form.tournoi_id.selectedOptions[0]?.dataset.debut;
    const avert = $('#avert-preavis');
    const j = debut ? joursAvant(debut) : null;
    avert.hidden = j === null || j >= PREAVIS_MIN;
    if (!avert.hidden) avert.textContent = j < 0
      ? 'Ce tournoi a déjà commencé. Déclare-le quand même et parle à tes enseignants dès ton retour.'
      : `Ton départ est dans ${j} jour${j > 1 ? 's' : ''} : préviens aussi tes enseignants en personne.`;
    if (nouveau && form.debut.value && (!form.fin.value || form.fin.value < form.debut.value)) form.fin.value = form.debut.value;
  };
  form.tournoi_id.onchange = maj;
  form.debut.onchange = maj;
  maj();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.tournoi_id) return montrerErreur(form, 'Choisis ton tournoi dans la liste.');
    const corps = { note: f.note };
    if (f.tournoi_id === 'nouveau') corps.nouveau = { nom: f.nom, sport: f.sport, lieu: f.lieu, debut: f.debut, fin: f.fin };
    else corps.tournoi_id = Number(f.tournoi_id);
    try {
      await api('absences', { method: 'POST', body: corps });
      dlg.close();
      toast('Absence déclarée. Tes enseignants la voient.');
      ecranEleve();
    } catch (err) { montrerErreur(form, err.message); }
  };
  ouvrir(dlg);
}

// ---------- Enseignant ----------

const ONGLETS = [
  ['tournois', 'liste', 'Tournois'],
  ['calendrier', 'calendrier', 'Calendrier'],
  ['reprises', 'examen', 'Reprises'],
  ['eleves', 'eleves', 'Élèves'],
];
const vue = { onglet: 'tournois', groupe: '', recherche: '', passes: false, mois: auj().slice(0, 7), jour: null };

async function ecranEnseignant() {
  document.body.className = 'page-enseignant';
  const [tab, liste] = await Promise.all([
    api('tableau' + (vue.passes || vue.onglet === 'calendrier' ? '?passes=1' : '')),
    vue.onglet === 'eleves' ? api('eleves') : null,
  ]);
  const groupes = [...new Set(tab.tournois.flatMap((t) => t.eleves.map((e) => e.groupe)).filter(Boolean))].sort();

  navBas.classList.remove('nav-action');
  navBas.hidden = false;
  navBas.innerHTML = ONGLETS.map(([id, icone, lib]) => `
    <button data-onglet="${id}" ${id === vue.onglet ? 'aria-current="page"' : ''}>
      ${ico(icone)}<span>${lib}${id === 'reprises' && tab.reprises.length ? ` <b class="badge">${tab.reprises.length}</b>` : ''}</span>
    </button>`).join('');
  navBas.querySelectorAll('[data-onglet]').forEach((b) => {
    b.onclick = () => { vue.onglet = b.dataset.onglet; window.scrollTo(0, 0); ecranEnseignant(); };
  });

  app.innerHTML = '<div id="contenu"></div>';
  const contenu = $('#contenu');
  if (vue.onglet === 'tournois') ongletTournois(contenu, tab.tournois, groupes);
  else if (vue.onglet === 'calendrier') ongletCalendrier(contenu, tab.tournois, groupes);
  else if (vue.onglet === 'reprises') ongletReprises(contenu, tab.reprises);
  else ongletEleves(contenu, liste.eleves);
}

function filtreGroupe(groupes) {
  return `<select id="filtre-groupe" aria-label="Groupe"><option value="">Tous les groupes</option>
    ${groupes.map((g) => `<option ${g === vue.groupe ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`;
}

function ongletTournois(contenu, tournois, groupes) {
  const enCours = tournois.filter((t) => joursAvant(t.debut) <= 0 && joursAvant(t.fin) >= 0);
  const absentsAuj = new Set(enCours.flatMap((t) => t.eleves.map((e) => e.eleve_id))).size;
  const prochains = tournois.filter((t) => joursAvant(t.debut) > 0 && joursAvant(t.debut) <= 14);
  const sansTravail = tournois.filter((t) => joursAvant(t.fin) >= 0)
    .flatMap((t) => t.eleves).filter((e) => !e.taches.some((ta) => ta.enseignant_id === moi.id)).length;

  contenu.innerHTML = `
    <div class="entete-page">
      <h1>Tournois et absents</h1>
      <button class="secondaire large-seulement" id="imprimer">${ico('imprimer')} Imprimer</button>
    </div>
    <section class="stats">
      <div class="stat"><span class="stat-nb">${absentsAuj}</span><span class="stat-lib">absent${absentsAuj > 1 ? 's' : ''} aujourd'hui</span></div>
      <div class="stat"><span class="stat-nb">${prochains.length}</span><span class="stat-lib">tournoi${prochains.length > 1 ? 's' : ''} d'ici 14 jours</span></div>
      <div class="stat"><span class="stat-nb">${sansTravail}</span><span class="stat-lib">élève${sansTravail > 1 ? 's' : ''} sans votre travail</span></div>
    </section>
    <div class="filtres collant">
      <label class="recherche">${ico('recherche')}<input type="search" id="recherche" placeholder="Élève ou tournoi" value="${esc(vue.recherche)}" aria-label="Rechercher"></label>
      ${filtreGroupe(groupes)}
      <button class="puce" id="passes" aria-pressed="${vue.passes}">Passés</button>
    </div>
    <div id="tournois" class="liste-cartes"></div>`;
  $('#recherche').oninput = (e) => { vue.recherche = e.target.value; dessiner(); };
  $('#filtre-groupe').onchange = (e) => { vue.groupe = e.target.value; dessiner(); };
  $('#passes').onclick = () => { vue.passes = !vue.passes; ecranEnseignant(); };
  $('#imprimer').onclick = () => window.print();

  function dessiner() {
    const zone = $('#tournois');
    zone.replaceChildren();
    const q = vue.recherche.trim().toLowerCase();
    let n = 0;
    const ordre = [...tournois].sort((a, b) => (joursAvant(a.fin) < 0) - (joursAvant(b.fin) < 0)
      || (joursAvant(a.fin) < 0 ? b.debut.localeCompare(a.debut) : a.debut.localeCompare(b.debut)));
    for (const t of ordre) {
      const eleves = t.eleves.filter((e) => (!vue.groupe || e.groupe === vue.groupe)
        && (!q || e.nom.toLowerCase().includes(q) || t.nom.toLowerCase().includes(q) || (t.sport || '').toLowerCase().includes(q)));
      if (!eleves.length) continue;
      n++;
      const carte = document.createElement('article');
      carte.className = 'carte' + (joursAvant(t.fin) < 0 ? ' passee' : '');
      carte.innerHTML = `
        <div class="carte-tete">
          ${blocDate(t.debut, t.fin)}
          <div class="carte-titre">
            <h3>${esc(t.nom)}</h3>
            <p class="meta">${meta(periode(t.debut, t.fin), esc(t.sport), esc(t.lieu))}</p>
            <div class="etat">${etat(t.debut, t.fin)}<span class="details">${eleves.length} élève${eleves.length > 1 ? 's' : ''}</span></div>
          </div>
        </div>
        <ul class="rangees">${eleves.map((e) => `
          <li>
            <div class="rangee-tete">
              <span class="avatar petit">${initiales(e.nom)}</span>
              <div class="rangee-nom"><strong>${esc(e.nom)}</strong><span class="details">${esc(e.groupe)}</span></div>
              ${preavisPastille(e.preavis)}
            </div>
            ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
            ${e.taches.length ? `<ul class="mini">${e.taches.map(tacheProf).join('')}</ul>` : ''}
          </li>`).join('')}
        </ul>
        <div class="carte-pied">
          <button class="principal" data-ajouter>${ico('plus')} Travail ou reprise d'examen</button>
        </div>`;
      $('[data-ajouter]', carte).onclick = () => ouvrirTache(t, eleves);
      carte.querySelectorAll('[data-retirer]').forEach((b) => {
        b.onclick = async () => {
          if (!await demander('Retirer ce travail ? L\'élève ne le verra plus.', 'Retirer')) return;
          await api('taches/' + b.dataset.retirer, { method: 'DELETE' });
          toast('Travail retiré');
          ecranEnseignant();
        };
      });
      zone.append(carte);
    }
    if (!n) zone.innerHTML = `<div class="vide-grand">${ico('liste')}<p>${q || vue.groupe ? 'Aucun résultat pour ce filtre.' : 'Aucune absence déclarée pour les tournois à venir.'}</p></div>`;
  }
  dessiner();
}

function initiales(nom) {
  return esc(nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase());
}

function tacheProf(t) {
  const mien = t.enseignant_id === moi.id;
  return `<li class="${mien ? 'mien' : ''}">
    <div class="mini-tete">
      <strong>${esc(t.matiere || t.enseignant)}</strong>
      ${t.fait_at ? '<span class="pastille verte">Terminé</span>' : ''}
      ${mien ? `<button class="icone-btn petit" data-retirer="${t.id}" aria-label="Retirer ce travail">${ico('corbeille')}</button>` : ''}
    </div>
    ${t.travail ? `<p>${esc(t.travail)}</p>` : ''}
    ${t.remise ? `<p class="details">À remettre le ${dateFr(t.remise)}</p>` : ''}
    ${t.examen ? `<p class="reprise-ligne">${ico('examen')} Reprise${t.examen_nom ? ' · ' + esc(t.examen_nom) : ''} : ${t.reprise_date ? dateFr(t.reprise_date) : 'date à fixer'}${t.reprise_info ? ', ' + esc(t.reprise_info) : ''}</p>` : ''}
  </li>`;
}

function ouvrirTache(t, eleves) {
  const dlg = $('#dlg-tache');
  const form = $('#form-tache');
  form.reset();
  $('#tache-tournoi').textContent = `${t.nom} · ${periode(t.debut, t.fin)}`;
  $('#tache-eleves').innerHTML = eleves.map((e) =>
    `<label class="case"><input type="checkbox" name="absence" value="${e.absence_id}" checked><span>${esc(e.nom)}</span><span class="details">${esc(e.groupe)}</span></label>`).join('');
  const tous = $('#tache-tous');
  const majTous = () => {
    const cases = [...form.querySelectorAll('[name=absence]')];
    tous.textContent = cases.every((c) => c.checked) ? 'Tout décocher' : 'Tout cocher';
  };
  tous.onclick = () => {
    const cases = [...form.querySelectorAll('[name=absence]')];
    const cocher = !cases.every((c) => c.checked);
    cases.forEach((c) => { c.checked = cocher; });
    majTous();
  };
  form.querySelectorAll('[name=absence]').forEach((c) => { c.onchange = majTous; });
  majTous();
  const bloc = $('#bloc-examen');
  bloc.hidden = true;
  form.examen.onchange = () => { bloc.hidden = !form.examen.checked; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const ids = [...form.querySelectorAll('[name=absence]:checked')].map((c) => Number(c.value));
    try {
      const r = await api('taches', { method: 'POST', body: { ...f, examen: form.examen.checked, absence_ids: ids } });
      dlg.close();
      toast(`Envoyé à ${r.nb} élève${r.nb > 1 ? 's' : ''}`);
      ecranEnseignant();
    } catch (err) { montrerErreur(form, err.message); }
  };
  ouvrir(dlg);
}

// Calendrier du mois : nombre d'élèves absents chaque jour ; un toucher sur un jour montre qui et pour quel tournoi.
function ongletCalendrier(contenu, tournois, groupes) {
  const [an, mo] = vue.mois.split('-').map(Number);
  const iso = (d) => d.toLocaleDateString('en-CA');
  const premier = new Date(an, mo - 1, 1, 12);
  const nbJours = new Date(an, mo, 0).getDate();
  const decalage = (premier.getDay() + 6) % 7; // semaine commençant le lundi
  const parJour = {};
  for (let j = 1; j <= nbJours; j++) parJour[iso(new Date(an, mo - 1, j, 12))] = [];
  for (const t of tournois) {
    for (const e of t.eleves) {
      if (vue.groupe && e.groupe !== vue.groupe) continue;
      for (const jour in parJour) if (jour >= t.debut && jour <= t.fin) parJour[jour].push({ ...e, tournoi: t });
    }
  }
  const compte = (l) => new Set(l.map((e) => e.eleve_id)).size;
  const max = Math.max(1, ...Object.values(parJour).map(compte));
  const total = compte(Object.values(parJour).flat());
  const pic = Object.entries(parJour).reduce((m, [j, l]) => (compte(l) > m.n ? { j, n: compte(l) } : m), { j: null, n: 0 });
  const titre = premier.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  if (!vue.jour || !parJour[vue.jour]) vue.jour = parJour[auj()] ? auj() : null;

  let cases = '<span class="cal-vide"></span>'.repeat(decalage);
  for (const [jour, liste] of Object.entries(parJour)) {
    const d = new Date(jour + 'T12:00');
    const n = compte(liste);
    const niveau = n ? Math.min(4, Math.ceil((n / max) * 4)) : 0;
    const cls = ['cal-jour', `n${niveau}`, d.getDay() % 6 === 0 ? 'fds' : '', jour === auj() ? 'auj' : '', jour === vue.jour ? 'choisi' : ''].join(' ');
    cases += `<button class="${cls}" data-jour="${jour}" aria-label="${dateFr(jour)} : ${n} absent${n > 1 ? 's' : ''}">
      <span class="cal-num">${d.getDate()}</span>${n ? `<span class="cal-nb">${n}</span>` : ''}
    </button>`;
  }

  contenu.innerHTML = `
    <div class="entete-page cal-entete-page">
      <h1 class="cal-titre">${titre}</h1>
      <div class="cal-nav">
        <button class="icone-btn" id="mois-prec" aria-label="Mois précédent">${ico('gauche')}</button>
        <button class="secondaire petit" id="mois-auj">Aujourd'hui</button>
        <button class="icone-btn" id="mois-suiv" aria-label="Mois suivant">${ico('droite')}</button>
      </div>
    </div>
    <div class="filtres">
      ${filtreGroupe(groupes)}
      <p class="aide cal-resume">${total} élève${total > 1 ? 's' : ''} absent${total > 1 ? 's' : ''} ce mois-ci${pic.n ? ` · pointe le ${dateFr(pic.j, { day: 'numeric', month: 'long' })} (${pic.n})` : ''}</p>
    </div>
    <section class="carte calendrier-carte">
      <div class="calendrier">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => `<span class="cal-entete"><span class="court">${j}</span><span class="long">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][i]}</span></span>`).join('')}
        ${cases}
      </div>
      <div class="legende" aria-hidden="true"><span>Moins</span><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span>Plus d'absents</span></div>
    </section>
    <section id="detail-jour"></section>`;

  const redessiner = () => ongletCalendrier(contenu, tournois, groupes);
  const changerMois = (delta) => {
    vue.mois = iso(new Date(an, mo - 1 + delta, 1, 12)).slice(0, 7);
    vue.jour = null;
    redessiner();
  };
  $('#mois-prec').onclick = () => changerMois(-1);
  $('#mois-suiv').onclick = () => changerMois(1);
  $('#mois-auj').onclick = () => { vue.mois = auj().slice(0, 7); vue.jour = auj(); redessiner(); };
  $('#filtre-groupe').onchange = (e) => { vue.groupe = e.target.value; redessiner(); };
  contenu.querySelectorAll('[data-jour]').forEach((b) => {
    b.onclick = () => {
      vue.jour = b.dataset.jour;
      redessiner();
      if (matchMedia('(max-width: 700px)').matches) $('#detail-jour').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  const detail = $('#detail-jour');
  if (!vue.jour) { detail.innerHTML = '<p class="aide centre">Touchez un jour pour voir les élèves absents.</p>'; return; }
  const liste = parJour[vue.jour];
  const parTournoi = new Map();
  for (const e of liste) {
    if (!parTournoi.has(e.tournoi.id)) parTournoi.set(e.tournoi.id, { t: e.tournoi, eleves: [] });
    parTournoi.get(e.tournoi.id).eleves.push(e);
  }
  const n = compte(liste);
  detail.innerHTML = `
    <h2 class="detail-titre">${dateFr(vue.jour, { weekday: 'long', day: 'numeric', month: 'long' })}
      <span class="details">${n ? `${n} absent${n > 1 ? 's' : ''}` : 'aucun absent'}</span></h2>
    ${[...parTournoi.values()].map(({ t, eleves }) => `
      <article class="carte">
        <div class="carte-tete compacte">
          <div class="carte-titre">
            <h3>${esc(t.nom)}</h3>
            <p class="meta">${meta(periode(t.debut, t.fin), esc(t.sport), esc(t.lieu))}</p>
          </div>
        </div>
        <ul class="rangees">${eleves.map((e) => `<li><div class="rangee-tete">
          <span class="avatar petit">${initiales(e.nom)}</span>
          <div class="rangee-nom"><strong>${esc(e.nom)}</strong><span class="details">${esc(e.groupe)}</span></div>
        </div></li>`).join('')}</ul>
      </article>`).join('')}`;
}

function ongletReprises(contenu, reprises) {
  // Regroupées par date : c'est ainsi qu'on réserve un local
  const parDate = new Map();
  for (const r of reprises) {
    if (!parDate.has(r.reprise_date)) parDate.set(r.reprise_date, []);
    parDate.get(r.reprise_date).push(r);
  }
  contenu.innerHTML = `
    <div class="entete-page"><h1>Reprises d'examen</h1></div>
    <p class="aide">Toutes les reprises à venir, toutes matières confondues.</p>
    ${reprises.length ? [...parDate].map(([date, liste]) => `
      <section class="jour-reprises">
        <h2 class="jour-titre">${blocDate(date, date)}<span>${dateFr(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span></h2>
        <ul class="carte rangees">${liste.map((r) => `<li>
          <div class="rangee-tete">
            <span class="avatar petit">${initiales(r.eleve)}</span>
            <div class="rangee-nom"><strong>${esc(r.eleve)}</strong><span class="details">${esc(r.groupe)} · ${esc(r.tournoi)}</span></div>
          </div>
          <p class="reprise-ligne">${ico('examen')} <span><strong>${esc(r.matiere || r.enseignant)}</strong>${r.examen_nom ? ' · ' + esc(r.examen_nom) : ''}
            ${r.reprise_info ? `<span class="details"> · ${esc(r.reprise_info)}</span>` : ''}<span class="details"> · ${esc(r.enseignant)}</span></span></p>
        </li>`).join('')}</ul>
      </section>`).join('') : `<div class="vide-grand">${ico('examen')}<p>Aucune reprise d'examen prévue.</p></div>`}`;
}

function ongletEleves(contenu, eleves) {
  contenu.innerHTML = `
    <div class="entete-page"><h1>Élèves</h1></div>
    <div class="filtres">
      <label class="recherche">${ico('recherche')}<input type="search" id="recherche-eleve" placeholder="Rechercher un élève" aria-label="Rechercher un élève"></label>
    </div>
    <p class="aide">Un élève a oublié son NIP ? Effacez-le : il en choisira un nouveau à sa prochaine connexion.</p>
    <ul class="carte rangees" id="liste-eleves"></ul>`;
  const dessiner = (q = '') => {
    const l = eleves.filter((e) => !q || e.nom.toLowerCase().includes(q.toLowerCase()) || e.groupe.includes(q));
    $('#liste-eleves').innerHTML = l.length ? l.map((e) => `<li><div class="rangee-tete">
      <span class="avatar petit">${initiales(e.nom)}</span>
      <div class="rangee-nom"><strong>${esc(e.nom)}</strong><span class="details">${esc(e.groupe)} · ${e.nb} absence${e.nb > 1 ? 's' : ''}</span></div>
      <button class="secondaire petit" data-nip="${e.id}" data-nom="${esc(e.nom)}">${ico('cle')} Effacer le NIP</button>
    </div></li>`).join('') : '<li class="vide">Aucun élève.</li>';
    contenu.querySelectorAll('[data-nip]').forEach((b) => {
      b.onclick = async () => {
        if (!await demander(`Effacer le NIP de ${b.dataset.nom} ?`, 'Effacer')) return;
        await api(`eleves/${b.dataset.nip}/effacer-nip`, { method: 'POST' });
        toast(`NIP de ${b.dataset.nom} effacé`);
        b.disabled = true;
      };
    });
  };
  $('#recherche-eleve').oninput = (e) => dessiner(e.target.value.trim());
  dessiner();
}

// ---------- Démarrage ----------

function afficher() {
  $('#qui').hidden = false;
  $('#qui-initiales').innerHTML = initiales(moi.nom);
  $('#qui-nom').textContent = moi.nom;
  $('#qui-detail').textContent = moi.role === 'eleve' ? `Groupe ${moi.groupe || ''}` : (moi.matiere || 'Enseignant');
  $('#menu-nom').textContent = moi.nom;
  (moi.role === 'eleve' ? ecranEleve() : ecranEnseignant()).catch((err) => {
    app.innerHTML = `<p class="erreur">${esc(err.message)}</p>`;
  });
}

async function demarrer() {
  if (!localStorage.getItem('jeton')) return ecranConnexion();
  try {
    moi = (await api('moi')).moi;
    afficher();
  } catch { ecranConnexion(); }
}

demarrer();
