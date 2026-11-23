// Démonstration : remplace le serveur par des données fictives gardées dans le navigateur (localStorage).
// Mêmes routes que src/worker.js, pour montrer l'application sans la mettre en ligne.
(() => {
  const CLE = 'absences-demo-v1';
  const JOUR = 864e5;
  const iso = (dec) => new Date(Date.now() + dec * JOUR).toLocaleDateString('en-CA');
  const cle = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function donneesInitiales() {
    const noms = [['Léa Tremblay', '3-02'], ['Noah Côté', '3-01'], ['Emma Gagnon', '3-02'], ['William Roy', '4-01'],
      ['Florence Bouchard', '4-01'], ['Thomas Gauthier', '3-01'], ['Alice Morin', '4-02'], ['Jacob Lavoie', '4-02'],
      ['Zoé Fortin', '3-02'], ['Liam Pelletier', '4-01'], ['Rosalie Bélanger', '3-01'], ['Nathan Lévesque', '4-02']];
    const d = { n: 100, eleves: [], enseignants: [], tournois: [], absences: [], taches: [], sessions: {} };
    noms.forEach(([nom, groupe], i) => d.eleves.push({ id: i + 1, nom, nom_cle: cle(nom), groupe, nip: i === 0 ? '1234' : null }));
    d.enseignants.push({ id: 1, nom: 'Marc Gagnon', nom_cle: cle('Marc Gagnon'), matiere: 'Mathématiques' },
      { id: 2, nom: 'Julie Roy', nom_cle: cle('Julie Roy'), matiere: 'Français' });
    const T = [
      ['Coupe Québec de volleyball', 'Volleyball', 'Sherbrooke', 4, 6, [1, 2, 3, 9, 11]],
      ['Omnium de tennis junior', 'Tennis', 'Gatineau', 17, 17, [1, 7]],
      ['Championnat provincial de natation', 'Natation', 'Montréal', 10, 12, [4, 5, 10]],
      ['Tournoi de hockey Pee-Wee', 'Hockey', 'Québec', -2, 0, [6, 8, 12]],
      ['Classique de soccer d\'hiver', 'Soccer', 'Laval', 24, 26, [2, 6, 8, 11]],
      ['Invitation de gymnastique', 'Gymnastique', 'Trois-Rivières', -12, -11, [7, 9]],
    ];
    T.forEach(([nom, sport, lieu, a, b, el], i) => {
      d.tournois.push({ id: i + 1, nom, sport, lieu, debut: iso(a), fin: iso(b) });
      el.forEach((e, k) => d.absences.push({ id: d.n++, eleve_id: e, tournoi_id: i + 1, note: e === 1 && i === 0 ? 'Je pars jeudi midi.' : '',
        created_at: Date.now() + (a - [12, 9, 5, 2, 1, 15][(e + k) % 6]) * JOUR }));
    });
    const abs = (t, e) => d.absences.find((x) => x.tournoi_id === t && x.eleve_id === e).id;
    const tache = (a, ens, o) => d.taches.push({ id: d.n++, absence_id: a, enseignant_id: ens, travail: '', remise: null, examen: 0,
      examen_nom: '', reprise_date: null, reprise_info: '', fait_at: null, created_at: Date.now(), ...o });
    [1, 2, 3, 9, 11].forEach((e) => {
      tache(abs(1, e), 1, { travail: 'Exercices p. 112 à 115 (fonctions affines).', remise: iso(9), examen: 1, examen_nom: 'Examen de l\'étape 2', reprise_date: iso(10), reprise_info: '8 h 15, local B-204' });
      tache(abs(1, e), 2, { travail: 'Lire le chapitre 5 du roman et répondre aux questions 1 à 8.', remise: iso(8), fait_at: e === 3 ? Date.now() : null });
    });
    [6, 8, 12].forEach((e) => tache(abs(4, e), 2, { travail: 'Rédiger le plan du texte argumentatif.', remise: iso(3) }));
    return d;
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(CLE)); } catch { db = null; }
  if (!db) db = donneesInitiales();
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(db)); } catch { /* navigateur sans stockage */ } };
  window.reinitialiserDemo = () => { db = donneesInitiales(); sauver(); };

  class E extends Error { constructor(s, m) { super(m); this.s = s; } }
  const auj = () => iso(0);
  const ens = (id) => db.enseignants.find((e) => e.id === id);
  const avecProf = (t) => ({ ...t, enseignant: ens(t.enseignant_id).nom, matiere: ens(t.enseignant_id).matiere });
  const tournoi = (id) => db.tournois.find((t) => t.id === id);

  function qui(h, role) {
    const s = db.sessions[(h.Authorization || '').replace('Bearer ', '')];
    if (!s) throw new E(401, 'Connectez-vous.');
    if (role && s.role !== role) throw new E(403, 'Action réservée.');
    const p = (s.role === 'eleve' ? db.eleves : db.enseignants).find((x) => x.id === s.id);
    return { role: s.role, ...p };
  }
  const profil = (p) => ({ role: p.role, id: p.id, nom: p.nom, groupe: p.groupe, matiere: p.matiere });

  const routes = {
    'POST login': (h, b) => {
      const role = b.role === 'enseignant' ? 'enseignant' : 'eleve';
      if ((b.code || '').trim().toLowerCase() !== (role === 'eleve' ? 'sport' : 'prof')) throw new E(403, role === 'eleve' ? 'Code de l\'école incorrect (démo : sport).' : 'Code enseignant incorrect (démo : prof).');
      const nom = (b.nom || '').trim().replace(/\s+/g, ' ');
      if (!nom.includes(' ')) throw new E(400, 'Prénom et nom, s’il vous plaît.');
      let p;
      if (role === 'eleve') {
        if (!/^\d{4}$/.test(b.nip || '')) throw new E(400, 'Le NIP doit avoir 4 chiffres.');
        p = db.eleves.find((e) => e.nom_cle === cle(nom));
        if (!p) { if (!b.groupe) throw new E(400, 'Indique ton groupe.'); p = { id: db.n++, nom, nom_cle: cle(nom), groupe: b.groupe.trim(), nip: null }; db.eleves.push(p); }
        if (!p.nip) p.nip = b.nip; else if (p.nip !== b.nip) throw new E(403, 'NIP incorrect.');
        if (b.groupe) p.groupe = b.groupe.trim();
      } else {
        p = db.enseignants.find((e) => e.nom_cle === cle(nom));
        if (!p) { p = { id: db.n++, nom, nom_cle: cle(nom), matiere: (b.matiere || '').trim() }; db.enseignants.push(p); }
        else if (b.matiere) p.matiere = b.matiere.trim();
      }
      const token = 'demo' + Math.random().toString(36).slice(2);
      db.sessions[token] = { role, id: p.id };
      return { token, moi: profil({ role, ...p }) };
    },
    'POST logout': () => ({ ok: true }),
    'GET moi': (h) => ({ moi: profil(qui(h)) }),
    'GET tournois': (h) => { qui(h); return { tournois: db.tournois.filter((t) => t.fin >= auj()).sort((a, b) => a.debut.localeCompare(b.debut))
      .map((t) => ({ ...t, nb: db.absences.filter((a) => a.tournoi_id === t.id).length })) }; },
    'POST absences': (h, b) => {
      const el = qui(h, 'eleve');
      let tid = Number(b.tournoi_id) || null;
      if (!tid) {
        const n = b.nouveau || {};
        if (!n.nom) throw new E(400, 'Indique le nom du tournoi.');
        if (!n.debut) throw new E(400, 'Date invalide : premier jour d’absence.');
        const fin = n.fin && n.fin >= n.debut ? n.fin : n.debut;
        const pareil = db.tournois.find((t) => t.debut === n.debut && cle(t.nom) === cle(n.nom));
        tid = pareil ? pareil.id : db.n++;
        if (!pareil) db.tournois.push({ id: tid, nom: n.nom.trim(), sport: (n.sport || '').trim(), lieu: (n.lieu || '').trim(), debut: n.debut, fin });
      }
      if (db.absences.some((a) => a.eleve_id === el.id && a.tournoi_id === tid)) throw new E(409, 'Tu as déjà déclaré ce tournoi.');
      db.absences.push({ id: db.n++, eleve_id: el.id, tournoi_id: tid, note: (b.note || '').trim(), created_at: Date.now() });
      return { ok: true };
    },
    'DELETE absences': (h, b, id) => {
      qui(h);
      const a = db.absences.find((x) => x.id === id);
      db.absences = db.absences.filter((x) => x.id !== id);
      db.taches = db.taches.filter((t) => t.absence_id !== id);
      if (a && !db.absences.some((x) => x.tournoi_id === a.tournoi_id)) db.tournois = db.tournois.filter((t) => t.id !== a.tournoi_id);
      return { ok: true };
    },
    'GET mes-absences': (h) => {
      const el = qui(h, 'eleve');
      return { absences: db.absences.filter((a) => a.eleve_id === el.id).map((a) => {
        const t = tournoi(a.tournoi_id);
        return { id: a.id, note: a.note, created_at: a.created_at, tournoi_id: t.id, tournoi: t.nom, sport: t.sport, lieu: t.lieu, debut: t.debut, fin: t.fin,
          taches: db.taches.filter((x) => x.absence_id === a.id).map(avecProf) };
      }).sort((a, b) => b.debut.localeCompare(a.debut)) };
    },
    'POST taches-fait': (h, b, id) => { qui(h, 'eleve'); const t = db.taches.find((x) => x.id === id); t.fait_at = t.fait_at ? null : Date.now(); return { ok: true }; },
    'GET tableau': (h, b, id, q) => {
      qui(h, 'enseignant');
      const depuis = iso(q.get('passes') === '1' ? -365 : -14);
      const tournois = db.tournois.filter((t) => t.fin >= depuis).sort((a, b) => a.debut.localeCompare(b.debut)).map((t) => ({
        ...t,
        eleves: db.absences.filter((a) => a.tournoi_id === t.id).map((a) => {
          const e = db.eleves.find((x) => x.id === a.eleve_id);
          return { absence_id: a.id, eleve_id: e.id, nom: e.nom, groupe: e.groupe, note: a.note, declare_le: a.created_at,
            preavis: Math.floor((Date.parse(t.debut + 'T00:00:00') - a.created_at) / JOUR),
            taches: db.taches.filter((x) => x.absence_id === a.id).map(avecProf) };
        }).sort((x, y) => (x.groupe + x.nom).localeCompare(y.groupe + y.nom)),
      })).filter((t) => t.eleves.length);
      const reprises = db.taches.filter((t) => t.examen && t.reprise_date >= auj()).map((t) => {
        const a = db.absences.find((x) => x.id === t.absence_id), e = db.eleves.find((x) => x.id === a.eleve_id);
        return { ...avecProf(t), eleve: e.nom, groupe: e.groupe, tournoi: tournoi(a.tournoi_id).nom };
      }).sort((x, y) => x.reprise_date.localeCompare(y.reprise_date));
      return { tournois, reprises };
    },
    'POST taches': (h, b) => {
      const p = qui(h, 'enseignant');
      const ids = (b.absence_ids || []).map(Number);
      if (!ids.length) throw new E(400, 'Choisissez au moins un élève.');
      if (!(b.travail || '').trim() && !b.examen) throw new E(400, 'Décrivez le travail à faire ou cochez « Examen à reprendre ».');
      ids.forEach((aid) => db.taches.push({ id: db.n++, absence_id: aid, enseignant_id: p.id, travail: (b.travail || '').trim(), remise: b.remise || null,
        examen: b.examen ? 1 : 0, examen_nom: b.examen ? b.examen_nom || '' : '', reprise_date: b.examen ? b.reprise_date || null : null,
        reprise_info: b.examen ? b.reprise_info || '' : '', fait_at: null, created_at: Date.now() }));
      return { ok: true, nb: ids.length };
    },
    'DELETE taches': (h, b, id) => { qui(h, 'enseignant'); db.taches = db.taches.filter((t) => t.id !== id); return { ok: true }; },
    'GET eleves': (h) => { qui(h, 'enseignant'); return { eleves: db.eleves.map((e) => ({ ...e, nb: db.absences.filter((a) => a.eleve_id === e.id).length }))
      .sort((a, b) => (a.groupe + a.nom).localeCompare(b.groupe + b.nom)) }; },
    'POST eleves-nip': (h, b, id) => { qui(h, 'enseignant'); db.eleves.find((e) => e.id === id).nip = null; return { ok: true }; },
  };

  window.fetch = async (url, opt = {}) => {
    const u = new URL(url, 'http://demo');
    const parts = u.pathname.replace('/api/', '').split('/');
    let nom = parts[0], id = null;
    if (parts[1]) { id = Number(parts[1]); if (parts[2] === 'fait') nom = 'taches-fait'; if (parts[2] === 'effacer-nip') nom = 'eleves-nip'; }
    const route = routes[`${opt.method || 'GET'} ${nom}`];
    let status = 200, data;
    try {
      if (!route) throw new E(404, 'Introuvable');
      data = route(opt.headers || {}, opt.body ? JSON.parse(opt.body) : {}, id, u.searchParams);
      sauver();
    } catch (err) { status = err.s || 500; data = { error: err.message }; }
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };

  // Le cadre des artefacts refuse confirm() : la démo répond « oui » à chaque confirmation.
  window.confirm = () => true;
})();
