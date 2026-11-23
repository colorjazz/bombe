// Absences Sport-études — application (navigateur). Aucune dépendance.
'use strict';

const PREAVIS_MIN = 7; // jours d'avance demandés aux élèves
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
let moi = null;

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

function dateFr(iso, avecJour = true) {
  if (!iso) return '';
  return new Date(iso + 'T12:00').toLocaleDateString('fr-CA', { weekday: avecJour ? 'short' : undefined, day: 'numeric', month: 'long' });
}

function periode(debut, fin) {
  return debut === fin ? dateFr(debut) : `du ${dateFr(debut)} au ${dateFr(fin)}`;
}

// « Dans 3 jours », « En cours », « Terminé »
function etat(debut, fin) {
  const d = joursAvant(debut), f = joursAvant(fin);
  if (f < 0) return '<span class="pastille grise">Terminé</span>';
  if (d <= 0) return '<span class="pastille rouge">En cours</span>';
  if (d === 1) return '<span class="pastille orange">Demain</span>';
  return `<span class="pastille ${d <= PREAVIS_MIN ? 'orange' : 'bleue'}">Dans ${d} jours</span>`;
}

function preavisPastille(jours) {
  if (jours < 0) return '<span class="pastille rouge" title="Déclaré après le départ">Averti en retard</span>';
  const cls = jours < 3 ? 'rouge' : jours < PREAVIS_MIN ? 'orange' : 'verte';
  return `<span class="pastille ${cls}" title="Délai entre la déclaration et le départ">Averti ${jours} j avant</span>`;
}

function montrerErreur(form, msg) {
  const p = $('.erreur', form);
  p.textContent = msg || '';
  p.hidden = !msg;
}

function ouvrir(dlg) {
  montrerErreur(dlg, '');
  dlg.showModal();
}

document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target.matches('[data-fermer]')) d.close(); });
});

function deconnecter() {
  api('logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('jeton');
  moi = null;
  demarrer();
}
$('#deconnexion').onclick = deconnecter;

// ---------- Connexion ----------

function ecranConnexion() {
  $('#qui').hidden = true;
  app.replaceChildren($('#tpl-connexion').content.cloneNode(true));
  const form = $('#form-connexion');
  let role = localStorage.getItem('role') || 'eleve';
  const choisir = (r) => {
    role = r;
    app.querySelectorAll('[data-role]').forEach((b) => b.classList.toggle('actif', b.dataset.role === r));
    form.querySelectorAll('.eleve').forEach((el) => { el.hidden = r !== 'eleve'; });
    form.querySelectorAll('.enseignant').forEach((el) => { el.hidden = r !== 'enseignant'; });
    form.nip.required = r === 'eleve';
  };
  app.querySelectorAll('[data-role]').forEach((b) => { b.onclick = () => choisir(b.dataset.role); });
  choisir(role);
  form.nom.value = localStorage.getItem('nom') || '';
  form.groupe.value = localStorage.getItem('groupe') || '';
  form.onsubmit = async (e) => {
    e.preventDefault();
    montrerErreur(form, '');
    const f = Object.fromEntries(new FormData(form));
    try {
      const r = await api('login', { method: 'POST', body: { role, ...f } });
      localStorage.setItem('jeton', r.token);
      localStorage.setItem('role', role);
      localStorage.setItem('nom', f.nom);
      if (f.groupe) localStorage.setItem('groupe', f.groupe);
      moi = r.moi;
      afficher();
    } catch (err) { montrerErreur(form, err.message); }
  };
}

// ---------- Élève ----------

async function ecranEleve() {
  const { absences } = await api('mes-absences');
  const aFaire = absences.flatMap((a) => a.taches).filter((t) => !t.fait_at);
  const reprises = absences.flatMap((a) => a.taches)
    .filter((t) => t.examen && t.reprise_date && joursAvant(t.reprise_date) >= 0)
    .sort((a, b) => a.reprise_date.localeCompare(b.reprise_date));

  app.innerHTML = `
    <section class="entete-eleve">
      <button id="btn-declarer" class="principal gros">＋ Déclarer une absence pour un tournoi</button>
      <p class="aide">Déclare ton absence <strong>au moins ${PREAVIS_MIN} jours avant</strong> ton départ :
        tes enseignants pourront préparer ton travail.</p>
    </section>
    <section class="resume">
      <div class="chiffre"><strong>${aFaire.length}</strong> travail${aFaire.length > 1 ? 'x' : ''} à faire</div>
      <div class="chiffre"><strong>${reprises.length}</strong> reprise${reprises.length > 1 ? 's' : ''} d'examen à venir
        ${reprises[0] ? `<small>Prochaine : ${dateFr(reprises[0].reprise_date)} (${esc(reprises[0].matiere || reprises[0].enseignant)})</small>` : ''}</div>
    </section>
    <h2>Mes absences</h2>
    ${absences.length ? '' : '<p class="vide">Aucune absence déclarée pour l\'instant.</p>'}
    <div id="liste"></div>`;

  const liste = $('#liste');
  for (const a of absences) {
    const carte = document.createElement('article');
    carte.className = 'carte' + (joursAvant(a.fin) < 0 && a.taches.every((t) => t.fait_at) ? ' passee' : '');
    carte.innerHTML = `
      <div class="titre-carte">
        <div>
          <h3>${esc(a.tournoi)}</h3>
          <p class="details">${periode(a.debut, a.fin)}${a.sport ? ' · ' + esc(a.sport) : ''}${a.lieu ? ' · ' + esc(a.lieu) : ''}</p>
        </div>
        ${etat(a.debut, a.fin)}
      </div>
      ${a.note ? `<p class="note">« ${esc(a.note)} »</p>` : ''}
      <h4>Travail demandé par mes enseignants</h4>
      ${a.taches.length ? '' : '<p class="vide">Rien pour l\'instant. Reviens voir avant ton départ.</p>'}
      <ul class="taches">${a.taches.map(tacheEleve).join('')}</ul>
      ${a.taches.length ? '' : '<button class="lien danger" data-annuler>Annuler cette absence</button>'}`;
    carte.querySelectorAll('[data-fait]').forEach((cb) => {
      cb.onchange = async () => { await api(`taches/${cb.dataset.fait}/fait`, { method: 'POST' }); ecranEleve(); };
    });
    const annuler = $('[data-annuler]', carte);
    if (annuler) annuler.onclick = async () => {
      if (!confirm(`Annuler ton absence pour « ${a.tournoi} » ?`)) return;
      await api('absences/' + a.id, { method: 'DELETE' });
      ecranEleve();
    };
    liste.append(carte);
  }
  $('#btn-declarer').onclick = ouvrirDeclaration;
}

function tacheEleve(t) {
  return `<li class="${t.fait_at ? 'fait' : ''}">
    <label class="case-fait"><input type="checkbox" data-fait="${t.id}" ${t.fait_at ? 'checked' : ''}> Terminé</label>
    <div>
      <strong>${esc(t.matiere || 'Cours')}</strong> <span class="details">— ${esc(t.enseignant)}</span>
      ${t.travail ? `<p class="travail">${esc(t.travail)}</p>` : ''}
      ${t.remise ? `<p>📅 À remettre le <strong>${dateFr(t.remise)}</strong></p>` : ''}
      ${t.examen ? `<p class="examen">📝 Examen à reprendre${t.examen_nom ? ' : ' + esc(t.examen_nom) : ''}<br>
        ${t.reprise_date ? `<strong>${dateFr(t.reprise_date)}</strong>` : 'Date à confirmer avec ton enseignant'}${t.reprise_info ? ' · ' + esc(t.reprise_info) : ''}</p>` : ''}
    </div>
  </li>`;
}

async function ouvrirDeclaration() {
  const dlg = $('#dlg-absence');
  const form = $('#form-absence');
  form.reset();
  const { tournois } = await api('tournois');
  form.tournoi_id.innerHTML = '<option value="">— Choisis ton tournoi —</option>'
    + tournois.map((t) => `<option value="${t.id}" data-debut="${t.debut}">${esc(t.nom)} (${periode(t.debut, t.fin)}${t.lieu ? ', ' + esc(t.lieu) : ''})</option>`).join('')
    + '<option value="nouveau">➕ Mon tournoi n\'est pas dans la liste</option>';
  if (!tournois.length) form.tournoi_id.value = 'nouveau';
  const maj = () => {
    const nouveau = form.tournoi_id.value === 'nouveau';
    $('#nouveau-tournoi').hidden = !nouveau;
    ['nom', 'debut'].forEach((n) => { form[n].required = nouveau; });
    const debut = nouveau ? form.debut.value : form.tournoi_id.selectedOptions[0]?.dataset.debut;
    const avert = $('#avert-preavis');
    const j = debut ? joursAvant(debut) : null;
    avert.hidden = j === null || j >= PREAVIS_MIN;
    if (!avert.hidden) avert.textContent = j < 0
      ? 'Ce tournoi a déjà commencé. Déclare-le quand même, puis parle à tes enseignants dès ton retour.'
      : `Attention : ton départ est dans ${j} jour${j > 1 ? 's' : ''}. Préviens aussi tes enseignants en personne.`;
    if (nouveau && form.debut.value && (!form.fin.value || form.fin.value < form.debut.value)) form.fin.value = form.debut.value;
  };
  form.tournoi_id.onchange = maj;
  form.debut.onchange = maj;
  maj();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const corps = { note: f.note };
    if (f.tournoi_id === 'nouveau') corps.nouveau = { nom: f.nom, sport: f.sport, lieu: f.lieu, debut: f.debut, fin: f.fin };
    else corps.tournoi_id = Number(f.tournoi_id);
    try {
      await api('absences', { method: 'POST', body: corps });
      dlg.close();
      ecranEleve();
    } catch (err) { montrerErreur(form, err.message); }
  };
  ouvrir(dlg);
}

// ---------- Enseignant ----------

const vue = { onglet: 'tournois', groupe: '', recherche: '', passes: false, mois: auj().slice(0, 7), jour: null };

async function ecranEnseignant() {
  const [tab, liste] = await Promise.all([api('tableau' + (vue.passes || vue.onglet === 'calendrier' ? '?passes=1' : '')), vue.onglet === 'eleves' ? api('eleves') : null]);
  const groupes = [...new Set(tab.tournois.flatMap((t) => t.eleves.map((e) => e.groupe)).filter(Boolean))].sort();
  const enCours = tab.tournois.filter((t) => joursAvant(t.debut) <= 0 && joursAvant(t.fin) >= 0);
  const nbAbsentsAuj = new Set(enCours.flatMap((t) => t.eleves.map((e) => e.eleve_id))).size;

  app.innerHTML = `
    <nav class="onglets">
      <button data-onglet="tournois">🏆 Tournois et absents</button>
      <button data-onglet="calendrier">📅 Calendrier</button>
      <button data-onglet="reprises">📝 Reprises d'examen (${tab.reprises.length})</button>
      <button data-onglet="eleves">👥 Élèves</button>
    </nav>
    <section class="resume">
      <div class="chiffre"><strong>${nbAbsentsAuj}</strong> élève${nbAbsentsAuj > 1 ? 's' : ''} absent${nbAbsentsAuj > 1 ? 's' : ''} aujourd'hui</div>
      <div class="chiffre"><strong>${tab.tournois.filter((t) => joursAvant(t.debut) > 0 && joursAvant(t.debut) <= 14).length}</strong> tournoi(s) dans les 14 prochains jours</div>
    </section>
    <div id="contenu"></div>`;
  app.querySelectorAll('[data-onglet]').forEach((b) => {
    b.classList.toggle('actif', b.dataset.onglet === vue.onglet);
    b.onclick = () => { vue.onglet = b.dataset.onglet; ecranEnseignant(); };
  });
  const contenu = $('#contenu');
  if (vue.onglet === 'tournois') ongletTournois(contenu, tab.tournois, groupes);
  else if (vue.onglet === 'calendrier') ongletCalendrier(contenu, tab.tournois, groupes);
  else if (vue.onglet === 'reprises') ongletReprises(contenu, tab.reprises);
  else ongletEleves(contenu, liste.eleves);
}

function ongletTournois(contenu, tournois, groupes) {
  contenu.innerHTML = `
    <div class="filtres">
      <input type="search" id="recherche" placeholder="Chercher un élève ou un tournoi" value="${esc(vue.recherche)}">
      <select id="filtre-groupe"><option value="">Tous les groupes</option>
        ${groupes.map((g) => `<option ${g === vue.groupe ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <label class="case"><input type="checkbox" id="passes" ${vue.passes ? 'checked' : ''}> Voir les tournois passés</label>
      <button class="secondaire" onclick="print()">🖨️ Imprimer</button>
    </div>
    <div id="tournois"></div>`;
  $('#recherche').oninput = (e) => { vue.recherche = e.target.value; dessiner(); };
  $('#filtre-groupe').onchange = (e) => { vue.groupe = e.target.value; dessiner(); };
  $('#passes').onchange = (e) => { vue.passes = e.target.checked; ecranEnseignant(); };

  function dessiner() {
    const zone = $('#tournois');
    zone.replaceChildren();
    const q = vue.recherche.trim().toLowerCase();
    let n = 0;
    for (const t of tournois) {
      const eleves = t.eleves.filter((e) => (!vue.groupe || e.groupe === vue.groupe)
        && (!q || e.nom.toLowerCase().includes(q) || t.nom.toLowerCase().includes(q) || (t.sport || '').toLowerCase().includes(q)));
      if (!eleves.length) continue;
      n++;
      const carte = document.createElement('article');
      carte.className = 'carte' + (joursAvant(t.fin) < 0 ? ' passee' : '');
      carte.innerHTML = `
        <div class="titre-carte">
          <div>
            <h3>${esc(t.nom)}</h3>
            <p class="details">${periode(t.debut, t.fin)}${t.sport ? ' · ' + esc(t.sport) : ''}${t.lieu ? ' · ' + esc(t.lieu) : ''}
              · <strong>${eleves.length} élève${eleves.length > 1 ? 's' : ''}</strong></p>
          </div>
          ${etat(t.debut, t.fin)}
        </div>
        <table class="eleves">
          <thead><tr><th>Élève</th><th>Groupe</th><th>Déclaré</th><th>Travail demandé</th></tr></thead>
          <tbody>${eleves.map((e) => `
            <tr>
              <td data-titre="Élève"><strong>${esc(e.nom)}</strong>${e.note ? `<div class="note">« ${esc(e.note)} »</div>` : ''}</td>
              <td data-titre="Groupe">${esc(e.groupe)}</td>
              <td data-titre="Déclaré">${preavisPastille(e.preavis)}</td>
              <td data-titre="Travail">${e.taches.length ? `<ul class="mini">${e.taches.map((ta) => tacheProf(ta)).join('')}</ul>` : '<span class="vide">Aucun</span>'}</td>
            </tr>`).join('')}</tbody>
        </table>
        <button class="principal" data-ajouter>＋ Demander du travail / une reprise d'examen</button>`;
      $('[data-ajouter]', carte).onclick = () => ouvrirTache(t, eleves);
      carte.querySelectorAll('[data-retirer]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('Retirer ce travail ? L\'élève ne le verra plus.')) return;
          await api('taches/' + b.dataset.retirer, { method: 'DELETE' });
          ecranEnseignant();
        };
      });
      zone.append(carte);
    }
    if (!n) zone.innerHTML = '<p class="vide">Aucune absence déclarée' + (q || vue.groupe ? ' pour ce filtre.' : ' pour les tournois à venir.') + '</p>';
  }
  dessiner();
}

function tacheProf(t) {
  const mien = t.enseignant_id === moi.id;
  return `<li>
    <strong>${esc(t.matiere || t.enseignant)}</strong>${t.fait_at ? ' <span class="pastille verte">Terminé</span>' : ''}
    ${mien ? `<button class="lien danger" data-retirer="${t.id}" title="Retirer">✕</button>` : ''}
    ${t.travail ? `<div>${esc(t.travail)}</div>` : ''}
    ${t.remise ? `<div class="details">À remettre le ${dateFr(t.remise)}</div>` : ''}
    ${t.examen ? `<div class="examen">📝 Reprise${t.examen_nom ? ' « ' + esc(t.examen_nom) + ' »' : ''} : ${t.reprise_date ? dateFr(t.reprise_date) : 'date à fixer'}${t.reprise_info ? ', ' + esc(t.reprise_info) : ''}</div>` : ''}
  </li>`;
}

function ouvrirTache(t, eleves) {
  const dlg = $('#dlg-tache');
  const form = $('#form-tache');
  form.reset();
  $('#tache-tournoi').textContent = t.nom;
  $('#tache-eleves').innerHTML = eleves.map((e) =>
    `<label class="case"><input type="checkbox" name="absence" value="${e.absence_id}" checked> ${esc(e.nom)} <span class="details">${esc(e.groupe)}</span></label>`).join('');
  const bloc = $('#bloc-examen');
  bloc.hidden = true;
  form.examen.onchange = () => { bloc.hidden = !form.examen.checked; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const ids = [...form.querySelectorAll('[name=absence]:checked')].map((c) => Number(c.value));
    try {
      await api('taches', { method: 'POST', body: { ...f, examen: form.examen.checked, absence_ids: ids } });
      dlg.close();
      ecranEnseignant();
    } catch (err) { montrerErreur(form, err.message); }
  };
  ouvrir(dlg);
}

// Calendrier du mois : nombre d'élèves absents chaque jour ; un clic sur un jour montre qui et pour quel tournoi.
function ongletCalendrier(contenu, tournois, groupes) {
  const [an, mo] = vue.mois.split('-').map(Number);
  const iso = (d) => d.toLocaleDateString('en-CA');
  const premier = new Date(an, mo - 1, 1, 12);
  const nbJours = new Date(an, mo, 0).getDate();
  const decalage = (premier.getDay() + 6) % 7; // semaine commençant le lundi
  // Absences de chaque jour du mois
  const parJour = {};
  for (let j = 1; j <= nbJours; j++) parJour[iso(new Date(an, mo - 1, j, 12))] = [];
  for (const t of tournois) {
    for (const e of t.eleves) {
      if (vue.groupe && e.groupe !== vue.groupe) continue;
      for (const jour in parJour) if (jour >= t.debut && jour <= t.fin) parJour[jour].push({ ...e, tournoi: t });
    }
  }
  const max = Math.max(1, ...Object.values(parJour).map((l) => l.length));
  const total = new Set(Object.values(parJour).flat().map((e) => e.eleve_id)).size;
  const titre = premier.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  if (vue.jour && !parJour[vue.jour]) vue.jour = null;

  let cases = '<div class="cal-vide"></div>'.repeat(decalage);
  for (const [jour, liste] of Object.entries(parJour)) {
    const d = new Date(jour + 'T12:00');
    const fds = d.getDay() === 0 || d.getDay() === 6;
    const n = new Set(liste.map((e) => e.eleve_id)).size;
    const intens = n ? 0.15 + 0.75 * (n / max) : 0;
    cases += `<button class="cal-jour${fds ? ' fds' : ''}${jour === auj() ? ' auj' : ''}${jour === vue.jour ? ' choisi' : ''}"
      data-jour="${jour}" style="${n ? `background: rgba(29,78,216,${intens.toFixed(2)}); color: ${intens > 0.5 ? '#fff' : 'inherit'}` : ''}"
      title="${n} élève${n > 1 ? 's' : ''} absent${n > 1 ? 's' : ''}">
      <span class="cal-num">${d.getDate()}</span>
      ${n ? `<span class="cal-nb">${n}</span><span class="cal-lib">absent${n > 1 ? 's' : ''}</span>` : ''}
    </button>`;
  }

  contenu.innerHTML = `
    <div class="filtres">
      <button class="secondaire" id="mois-prec" aria-label="Mois précédent">◀</button>
      <h2 class="cal-titre">${titre}</h2>
      <button class="secondaire" id="mois-suiv" aria-label="Mois suivant">▶</button>
      <button class="secondaire" id="mois-auj">Aujourd'hui</button>
      <select id="filtre-groupe"><option value="">Tous les groupes</option>
        ${groupes.map((g) => `<option ${g === vue.groupe ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
    </div>
    <p class="aide">${total} élève${total > 1 ? 's' : ''} absent${total > 1 ? 's' : ''} au moins un jour ce mois-ci.
      Plus la case est foncée, plus il y a d'absents. Cliquez sur un jour pour voir qui.</p>
    <article class="carte">
      <div class="calendrier">
        ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((j) => `<div class="cal-entete">${j}</div>`).join('')}
        ${cases}
      </div>
    </article>
    <div id="detail-jour"></div>`;

  const changerMois = (delta) => {
    const d = new Date(an, mo - 1 + delta, 1, 12);
    vue.mois = iso(d).slice(0, 7);
    vue.jour = null;
    ongletCalendrier(contenu, tournois, groupes);
  };
  $('#mois-prec').onclick = () => changerMois(-1);
  $('#mois-suiv').onclick = () => changerMois(1);
  $('#mois-auj').onclick = () => { vue.mois = auj().slice(0, 7); vue.jour = auj(); ongletCalendrier(contenu, tournois, groupes); };
  $('#filtre-groupe').onchange = (e) => { vue.groupe = e.target.value; ongletCalendrier(contenu, tournois, groupes); };
  contenu.querySelectorAll('[data-jour]').forEach((b) => {
    b.onclick = () => { vue.jour = b.dataset.jour; ongletCalendrier(contenu, tournois, groupes); };
  });

  if (vue.jour) {
    const liste = parJour[vue.jour];
    const groupesT = new Map();
    for (const e of liste) {
      if (!groupesT.has(e.tournoi.id)) groupesT.set(e.tournoi.id, { t: e.tournoi, eleves: [] });
      groupesT.get(e.tournoi.id).eleves.push(e);
    }
    $('#detail-jour').innerHTML = `
      <article class="carte">
        <h3>${dateFr(vue.jour)} : ${liste.length ? `${new Set(liste.map((e) => e.eleve_id)).size} élève(s) absent(s)` : 'aucun absent'}</h3>
        ${[...groupesT.values()].map(({ t, eleves }) => `
          <h4>${esc(t.nom)} <span class="details">${t.sport ? esc(t.sport) + ' · ' : ''}${t.lieu ? esc(t.lieu) + ' · ' : ''}${periode(t.debut, t.fin)}</span></h4>
          <ul class="mini">${eleves.map((e) => `<li><strong>${esc(e.nom)}</strong> <span class="details">${esc(e.groupe)}</span></li>`).join('')}</ul>`).join('')}
      </article>`;
  }
}

function ongletReprises(contenu, reprises) {
  contenu.innerHTML = reprises.length ? `
    <article class="carte">
      <table class="eleves">
        <thead><tr><th>Date</th><th>Élève</th><th>Matière</th><th>Examen</th><th>Heure / local</th><th>Tournoi</th></tr></thead>
        <tbody>${reprises.map((r) => `<tr>
          <td data-titre="Date"><strong>${dateFr(r.reprise_date)}</strong></td>
          <td data-titre="Élève">${esc(r.eleve)} <span class="details">${esc(r.groupe)}</span></td>
          <td data-titre="Matière">${esc(r.matiere || '')} <span class="details">${esc(r.enseignant)}</span></td>
          <td data-titre="Examen">${esc(r.examen_nom)}</td>
          <td data-titre="Heure / local">${esc(r.reprise_info)}</td>
          <td data-titre="Tournoi">${esc(r.tournoi)}</td></tr>`).join('')}</tbody>
      </table>
    </article>` : '<p class="vide">Aucune reprise d\'examen prévue.</p>';
}

function ongletEleves(contenu, eleves) {
  contenu.innerHTML = `
    <p class="aide">Un élève a oublié son NIP ? Effacez-le : il en choisira un nouveau à sa prochaine connexion.</p>
    <article class="carte">
      <table class="eleves">
        <thead><tr><th>Élève</th><th>Groupe</th><th>Absences</th><th></th></tr></thead>
        <tbody>${eleves.map((e) => `<tr>
          <td data-titre="Élève">${esc(e.nom)}</td><td data-titre="Groupe">${esc(e.groupe)}</td><td data-titre="Absences">${e.nb}</td>
          <td><button class="lien" data-nip="${e.id}" data-nom="${esc(e.nom)}">Effacer le NIP</button></td></tr>`).join('')}</tbody>
      </table>
    </article>`;
  contenu.querySelectorAll('[data-nip]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(`Effacer le NIP de ${b.dataset.nom} ?`)) return;
      await api(`eleves/${b.dataset.nip}/effacer-nip`, { method: 'POST' });
      b.replaceWith('NIP effacé ✔');
    };
  });
}

// ---------- Démarrage ----------

function afficher() {
  $('#qui').hidden = false;
  $('#qui-nom').textContent = moi.nom + (moi.role === 'eleve' ? (moi.groupe ? ' · ' + moi.groupe : '') : (moi.matiere ? ' · ' + moi.matiere : ''));
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
