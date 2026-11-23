// Absences Sport-études — serveur (Cloudflare Worker + base D1).
//
// Les élèves déclarent leurs absences pour un tournoi ; les enseignants y ajoutent le travail demandé
// et la date de reprise d'un examen manqué ; la direction gère tout (tournois, absences, élèves, réglages).
// Pas de comptes ni de courriels : trois codes (élève, enseignant, direction) et un NIP choisi par chaque élève.
import SCHEMA from '../schema.sql';

const SESSION_MS = 200 * 24 * 3600 * 1000; // une année scolaire
const DAY_MS = 24 * 3600 * 1000;
const PREAVIS_DEFAUT = 7;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Colonnes ajoutées après la première version : on les ajoute aux bases existantes (erreur ignorée si déjà là).
const MIGRATIONS = [
  "ALTER TABLE tournois ADD COLUMN officiel INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tournois ADD COLUMN note TEXT NOT NULL DEFAULT ''",
];

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  const statements = SCHEMA.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  for (const m of MIGRATIONS) {
    try { await env.DB.prepare(m).run(); } catch { /* colonne déjà présente */ }
  }
  schemaReady = true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env);
      for (const [method, pattern, handler] of ROUTES) {
        if (method !== request.method) continue;
        const m = url.pathname.match(pattern);
        if (m) return json(await handler({ request, env, url, id: m[1] ? Number(m[1]) : null }));
      }
      return json({ error: 'Introuvable' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error('Erreur interne :', err?.message);
      return json({ error: 'Erreur interne, réessayez dans un instant.' }, 500);
    }
  },
};

// ---------- Outils ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function body(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'Requête invalide.'); }
}

function texte(v, max = 200) {
  return String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function texteLong(v, max = 4000) {
  return String(v ?? '').trim().slice(0, max);
}

function date(v, champ, obligatoire = true) {
  const s = String(v ?? '').trim();
  if (!s && !obligatoire) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new HttpError(400, `Date invalide : ${champ}.`);
  return s;
}

// « Émile Côté » et « emile  cote » désignent la même personne.
function cle(nom) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function aujourdhui(decalageJours = 0) {
  const d = new Date(Date.now() + decalageJours * DAY_MS);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function egal(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function nomValide(nom) {
  if (cle(nom).length < 3 || !nom.includes(' ')) throw new HttpError(400, 'Prénom et nom, s’il vous plaît.');
}

// Réglages modifiables par la direction ; les codes élève et enseignant remplacent ceux de Cloudflare s'ils sont définis.
async function lireReglages(env) {
  const { results } = await env.DB.prepare('SELECT nom, valeur FROM reglages').all();
  const r = Object.fromEntries(results.map((x) => [x.nom, x.valeur]));
  return {
    preavis_min: Number(r.preavis_min) || PREAVIS_DEFAUT,
    nom_ecole: r.nom_ecole || '',
    code_eleve: r.code_eleve || env.CODE_ELEVE || '',
    code_enseignant: r.code_enseignant || env.CODE_ENSEIGNANT || '',
  };
}
const reglagesPublics = (r) => ({ preavis_min: r.preavis_min, nom_ecole: r.nom_ecole });

// roleVoulu : 'eleve', 'enseignant' (la direction y a aussi droit) ou 'direction'.
async function session(request, env, roleVoulu) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Connectez-vous.');
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).first();
  if (!s || Date.now() - s.created_at > SESSION_MS) throw new HttpError(401, 'Session expirée : reconnectez-vous.');
  const permis = !roleVoulu || s.role === roleVoulu || (roleVoulu === 'enseignant' && s.role === 'direction');
  if (!permis) {
    throw new HttpError(403, { eleve: 'Action réservée aux élèves.', enseignant: 'Action réservée au personnel.', direction: 'Action réservée à la direction.' }[roleVoulu]);
  }
  const table = s.role === 'eleve' ? 'eleves' : 'enseignants';
  const personne = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(s.personne).first();
  if (!personne) throw new HttpError(401, 'Compte introuvable : reconnectez-vous.');
  return { role: s.role, ...personne };
}

function profil(role, p) {
  return { role, id: p.id, nom: p.nom, groupe: p.groupe ?? undefined, matiere: p.matiere ?? undefined };
}

// ---------- Connexion ----------

async function login({ request, env }) {
  const b = await body(request);
  const role = ['enseignant', 'direction'].includes(b.role) ? b.role : 'eleve';
  const reg = await lireReglages(env);
  const code = { eleve: reg.code_eleve, enseignant: reg.code_enseignant, direction: env.CODE_DIRECTION }[role];
  if (!code) throw new HttpError(503, "L'application n'est pas encore configurée (code manquant).");
  if (!egal(texte(b.code).toLowerCase(), String(code).trim().toLowerCase())) {
    throw new HttpError(403, { eleve: "Code de l'école incorrect. Demande-le à ton enseignant.", enseignant: 'Code enseignant incorrect.', direction: 'Code direction incorrect.' }[role]);
  }
  const nom = texte(b.nom, 80);
  nomValide(nom);
  const nomCle = cle(nom);
  const now = Date.now();
  let personne;

  if (role === 'eleve') {
    const nip = String(b.nip ?? '').trim();
    if (!/^\d{4}$/.test(nip)) throw new HttpError(400, 'Le NIP doit avoir 4 chiffres.');
    personne = await env.DB.prepare('SELECT * FROM eleves WHERE nom_cle = ?').bind(nomCle).first();
    if (!personne) {
      const groupe = texte(b.groupe, 30);
      if (!groupe) throw new HttpError(400, 'Indique ton groupe.');
      personne = await env.DB.prepare('INSERT INTO eleves (nom, nom_cle, groupe, created_at) VALUES (?, ?, ?, ?) RETURNING *')
        .bind(nom, nomCle, groupe, now).first();
    }
    const hash = await sha256(`${personne.id}:${nip}`);
    if (!personne.nip_hash) {
      // Première connexion (ou NIP effacé) : ce NIP devient celui de l'élève.
      await env.DB.prepare('UPDATE eleves SET nip_hash = ? WHERE id = ?').bind(hash, personne.id).run();
    } else if (!egal(hash, personne.nip_hash)) {
      throw new HttpError(403, 'NIP incorrect. Si tu l’as oublié, demande à un enseignant de l’effacer.');
    }
    const groupe = texte(b.groupe, 30);
    if (groupe && groupe !== personne.groupe) {
      await env.DB.prepare('UPDATE eleves SET groupe = ? WHERE id = ?').bind(groupe, personne.id).run();
      personne.groupe = groupe;
    }
  } else {
    personne = await env.DB.prepare('SELECT * FROM enseignants WHERE nom_cle = ?').bind(nomCle).first();
    const matiere = role === 'enseignant' ? texte(b.matiere, 60) : '';
    if (!personne) {
      personne = await env.DB.prepare('INSERT INTO enseignants (nom, nom_cle, matiere, created_at) VALUES (?, ?, ?, ?) RETURNING *')
        .bind(nom, nomCle, matiere, now).first();
    } else if (matiere && matiere !== personne.matiere) {
      await env.DB.prepare('UPDATE enseignants SET matiere = ? WHERE id = ?').bind(matiere, personne.id).run();
      personne.matiere = matiere;
    }
  }

  const token = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE created_at < ?').bind(now - SESSION_MS),
    env.DB.prepare('INSERT INTO sessions (token, role, personne, created_at) VALUES (?, ?, ?, ?)').bind(token, role, personne.id, now),
  ]);
  return { token, moi: profil(role, personne), reglages: reglagesPublics(reg) };
}

async function moi({ request, env }) {
  const p = await session(request, env);
  return { moi: profil(p.role, p), reglages: reglagesPublics(await lireReglages(env)) };
}

async function logout({ request, env }) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return { ok: true };
}

// ---------- Tournois ----------

// Tournois en cours ou à venir : les élèves en choisissent un au lieu d'en retaper le nom.
async function tournois({ request, env }) {
  await session(request, env);
  const { results } = await env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM absences a WHERE a.tournoi_id = t.id) AS nb
     FROM tournois t WHERE t.fin >= ? ORDER BY t.debut, t.nom`).bind(aujourdhui()).all();
  return { tournois: results };
}

function champsTournoi(n) {
  const nom = texte(n.nom, 120);
  if (!nom) throw new HttpError(400, 'Indiquez le nom du tournoi.');
  const debut = date(n.debut, 'premier jour');
  const fin = date(n.fin || n.debut, 'dernier jour');
  if (fin < debut) throw new HttpError(400, 'Le dernier jour est avant le premier jour.');
  return { nom, sport: texte(n.sport, 60), lieu: texte(n.lieu, 120), debut, fin, note: texteLong(n.note, 1000) };
}

async function creerTournoi({ request, env }) {
  await session(request, env, 'direction');
  const t = champsTournoi(await body(request));
  const r = await env.DB.prepare(
    'INSERT INTO tournois (nom, sport, lieu, debut, fin, note, officiel, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?) RETURNING id')
    .bind(t.nom, t.sport, t.lieu, t.debut, t.fin, t.note, Date.now()).first();
  return { ok: true, id: r.id };
}

async function modifierTournoi({ request, env, id }) {
  await session(request, env, 'direction');
  const t = champsTournoi(await body(request));
  const r = await env.DB.prepare('UPDATE tournois SET nom = ?, sport = ?, lieu = ?, debut = ?, fin = ?, note = ?, officiel = 1 WHERE id = ?')
    .bind(t.nom, t.sport, t.lieu, t.debut, t.fin, t.note, id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Tournoi introuvable.');
  return { ok: true };
}

async function supprimerTournoi({ request, env, id }) {
  await session(request, env, 'direction');
  const dans = 'SELECT id FROM absences WHERE tournoi_id = ?';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM taches WHERE absence_id IN (${dans})`).bind(id),
    env.DB.prepare(`DELETE FROM commentaires WHERE absence_id IN (${dans})`).bind(id),
    env.DB.prepare('DELETE FROM absences WHERE tournoi_id = ?').bind(id),
    env.DB.prepare('DELETE FROM tournois WHERE id = ?').bind(id),
  ]);
  return { ok: true };
}

// ---------- Absences ----------

async function declarer({ request, env }) {
  const eleve = await session(request, env, 'eleve');
  const b = await body(request);
  let tournoiId = Number(b.tournoi_id) || null;
  if (tournoiId) {
    const t = await env.DB.prepare('SELECT id FROM tournois WHERE id = ?').bind(tournoiId).first();
    if (!t) throw new HttpError(404, 'Tournoi introuvable.');
  } else {
    const n = champsTournoi({ ...(b.nouveau || {}), note: '' });
    if (n.fin < aujourdhui(-60)) throw new HttpError(400, 'Ce tournoi est terminé depuis longtemps.');
    // Même tournoi déjà déclaré par un coéquipier : on le réutilise pour regrouper les élèves.
    const existant = await env.DB.prepare('SELECT id, nom FROM tournois WHERE debut = ?').bind(n.debut).all();
    const pareil = existant.results.find((t) => cle(t.nom) === cle(n.nom));
    tournoiId = pareil ? pareil.id : (await env.DB.prepare(
      'INSERT INTO tournois (nom, sport, lieu, debut, fin, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(n.nom, n.sport, n.lieu, n.debut, n.fin, Date.now()).first()).id;
  }
  const deja = await env.DB.prepare('SELECT id FROM absences WHERE eleve_id = ? AND tournoi_id = ?').bind(eleve.id, tournoiId).first();
  if (deja) throw new HttpError(409, 'Tu as déjà déclaré ce tournoi.');
  await env.DB.prepare('INSERT INTO absences (eleve_id, tournoi_id, note, created_at) VALUES (?, ?, ?, ?)')
    .bind(eleve.id, tournoiId, texteLong(b.note, 1000), Date.now()).run();
  return { ok: true };
}

// La direction inscrit un ou plusieurs élèves (existants ou nouveaux) à un tournoi.
async function inscrire({ request, env }) {
  await session(request, env, 'direction');
  const b = await body(request);
  const tournoiId = Number(b.tournoi_id);
  if (!await env.DB.prepare('SELECT id FROM tournois WHERE id = ?').bind(tournoiId).first()) throw new HttpError(404, 'Tournoi introuvable.');
  const ids = new Set((Array.isArray(b.eleve_ids) ? b.eleve_ids : []).map(Number).filter(Boolean));
  for (const n of (Array.isArray(b.nouveaux) ? b.nouveaux : []).slice(0, 50)) {
    ids.add((await trouverOuCreerEleve(env, n)).id);
  }
  if (!ids.size) throw new HttpError(400, 'Choisissez au moins un élève.');
  const now = Date.now();
  await env.DB.batch([...ids].map((eid) => env.DB.prepare(
    'INSERT OR IGNORE INTO absences (eleve_id, tournoi_id, note, created_at) VALUES (?, ?, ?, ?)')
    .bind(eid, tournoiId, texteLong(b.note, 1000), now)));
  return { ok: true, nb: ids.size };
}

async function trouverOuCreerEleve(env, n) {
  const nom = texte(n.nom, 80);
  nomValide(nom);
  const existant = await env.DB.prepare('SELECT * FROM eleves WHERE nom_cle = ?').bind(cle(nom)).first();
  if (existant) return existant;
  const groupe = texte(n.groupe, 30);
  if (!groupe) throw new HttpError(400, `Indiquez le groupe de ${nom}.`);
  return env.DB.prepare('INSERT INTO eleves (nom, nom_cle, groupe, created_at) VALUES (?, ?, ?, ?) RETURNING *')
    .bind(nom, cle(nom), groupe, Date.now()).first();
}

async function modifierAbsence({ request, env, id }) {
  await session(request, env, 'direction');
  const b = await body(request);
  const r = await env.DB.prepare('UPDATE absences SET note = ? WHERE id = ?').bind(texteLong(b.note, 1000), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Absence introuvable.');
  return { ok: true };
}

async function supprimerAbsence({ request, env, id }) {
  const p = await session(request, env);
  const a = await env.DB.prepare('SELECT * FROM absences WHERE id = ?').bind(id).first();
  if (!a) throw new HttpError(404, 'Absence introuvable.');
  if (p.role === 'eleve' && a.eleve_id !== p.id) throw new HttpError(403, 'Ce n’est pas ton absence.');
  if (p.role === 'enseignant') throw new HttpError(403, 'Seuls l’élève et la direction peuvent retirer une absence.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM taches WHERE absence_id = ?').bind(id),
    env.DB.prepare('DELETE FROM commentaires WHERE absence_id = ?').bind(id),
    env.DB.prepare('DELETE FROM absences WHERE id = ?').bind(id),
    // Un tournoi déclaré par des élèves disparaît quand il n'a plus personne ; ceux de la direction restent.
    env.DB.prepare('DELETE FROM tournois WHERE id = ? AND officiel = 0 AND NOT EXISTS (SELECT 1 FROM absences WHERE tournoi_id = ?)').bind(a.tournoi_id, a.tournoi_id),
  ]);
  return { ok: true };
}

const SELECT_TACHES = `SELECT ta.*, e.nom AS enseignant, e.matiere FROM taches ta
  JOIN enseignants e ON e.id = ta.enseignant_id`;
const SELECT_COMMENTAIRES = `SELECT c.*, e.nom AS auteur FROM commentaires c JOIN enseignants e ON e.id = c.auteur_id`;

// Vue de l'élève : ses absences, avec le travail, les reprises d'examen et les messages qui lui sont destinés.
async function mesAbsences({ request, env }) {
  const eleve = await session(request, env, 'eleve');
  const { results: absences } = await env.DB.prepare(
    `SELECT a.id, a.note, a.created_at, t.id AS tournoi_id, t.nom AS tournoi, t.sport, t.lieu, t.debut, t.fin, t.note AS tournoi_note
     FROM absences a JOIN tournois t ON t.id = a.tournoi_id
     WHERE a.eleve_id = ? ORDER BY t.debut DESC`).bind(eleve.id).all();
  const mesIds = 'SELECT id FROM absences WHERE eleve_id = ?';
  const { results: taches } = await env.DB.prepare(`${SELECT_TACHES} WHERE ta.absence_id IN (${mesIds}) ORDER BY ta.created_at`).bind(eleve.id).all();
  const { results: comms } = await env.DB.prepare(
    `${SELECT_COMMENTAIRES} WHERE c.visible_eleve = 1 AND c.absence_id IN (${mesIds}) ORDER BY c.created_at`).bind(eleve.id).all();
  for (const a of absences) {
    a.taches = taches.filter((t) => t.absence_id === a.id);
    a.commentaires = comms.filter((c) => c.absence_id === a.id);
  }
  return { absences };
}

async function cocherTache({ request, env, id }) {
  const eleve = await session(request, env, 'eleve');
  const t = await env.DB.prepare(
    'SELECT ta.id, ta.fait_at FROM taches ta JOIN absences a ON a.id = ta.absence_id WHERE ta.id = ? AND a.eleve_id = ?')
    .bind(id, eleve.id).first();
  if (!t) throw new HttpError(404, 'Travail introuvable.');
  await env.DB.prepare('UPDATE taches SET fait_at = ? WHERE id = ?').bind(t.fait_at ? null : Date.now(), id).run();
  return { ok: true };
}

// Vue du personnel : chaque tournoi avec ses élèves absents, le travail demandé et les commentaires.
// La direction voit aussi les tournois sans élève (ceux qu'elle a inscrits d'avance).
async function tableau({ request, env, url }) {
  const p = await session(request, env, 'enseignant');
  const passes = url.searchParams.get('passes') === '1';
  const depuis = passes ? aujourdhui(-365) : aujourdhui(-14);
  const { results: listeT } = await env.DB.prepare(
    `SELECT * FROM tournois WHERE fin >= ? ORDER BY debut ${passes ? 'DESC' : 'ASC'}, nom`).bind(depuis).all();
  const { results: rangees } = await env.DB.prepare(
    `SELECT a.id AS absence_id, a.tournoi_id, a.note, a.created_at, el.id AS eleve_id, el.nom AS eleve, el.groupe, t.debut
     FROM absences a JOIN eleves el ON el.id = a.eleve_id JOIN tournois t ON t.id = a.tournoi_id
     WHERE t.fin >= ? ORDER BY el.groupe, el.nom`).bind(depuis).all();
  const dansPeriode = 'SELECT a.id FROM absences a JOIN tournois t ON t.id = a.tournoi_id WHERE t.fin >= ?';
  const { results: taches } = await env.DB.prepare(`${SELECT_TACHES} WHERE ta.absence_id IN (${dansPeriode}) ORDER BY ta.created_at`).bind(depuis).all();
  const { results: comms } = await env.DB.prepare(`${SELECT_COMMENTAIRES} WHERE c.absence_id IN (${dansPeriode}) ORDER BY c.created_at`).bind(depuis).all();

  const tournoisOut = listeT.map((t) => ({
    id: t.id, nom: t.nom, sport: t.sport, lieu: t.lieu, debut: t.debut, fin: t.fin, note: t.note || '', officiel: !!t.officiel,
    eleves: rangees.filter((r) => r.tournoi_id === t.id).map((r) => ({
      absence_id: r.absence_id, eleve_id: r.eleve_id, nom: r.eleve, groupe: r.groupe, note: r.note,
      declare_le: r.created_at,
      preavis: Math.floor((Date.parse(r.debut + 'T00:00:00-05:00') - r.created_at) / DAY_MS),
      taches: taches.filter((x) => x.absence_id === r.absence_id),
      commentaires: comms.filter((x) => x.absence_id === r.absence_id),
    })),
  })).filter((t) => p.role === 'direction' || t.eleves.length);

  // Reprises d'examen à venir, toutes matières, pour planifier les locaux.
  const { results: reprises } = await env.DB.prepare(
    `SELECT ta.id, ta.examen_nom, ta.reprise_date, ta.reprise_info, en.nom AS enseignant, en.matiere,
            el.nom AS eleve, el.groupe, t.nom AS tournoi
     FROM taches ta JOIN enseignants en ON en.id = ta.enseignant_id JOIN absences a ON a.id = ta.absence_id
     JOIN eleves el ON el.id = a.eleve_id JOIN tournois t ON t.id = a.tournoi_id
     WHERE ta.examen = 1 AND ta.reprise_date >= ? ORDER BY ta.reprise_date, el.nom`).bind(aujourdhui()).all();
  return { tournois: tournoisOut, reprises };
}

// ---------- Travail demandé ----------

async function ajouterTache({ request, env }) {
  const prof = await session(request, env, 'enseignant');
  const b = await body(request);
  const ids = [...new Set((Array.isArray(b.absence_ids) ? b.absence_ids : []).map(Number).filter(Boolean))].slice(0, 200);
  if (!ids.length) throw new HttpError(400, 'Choisissez au moins un élève.');
  const travail = texteLong(b.travail);
  const examen = b.examen ? 1 : 0;
  if (!travail && !examen) throw new HttpError(400, 'Décrivez le travail à faire ou cochez « Examen à reprendre ».');
  const remise = date(b.remise, 'date de remise', false);
  const repriseDate = examen ? date(b.reprise_date, 'date de reprise de l’examen', false) : null;
  const now = Date.now();
  const valides = (await env.DB.prepare(`SELECT id FROM absences WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all())
    .results.map((r) => r.id);
  if (!valides.length) throw new HttpError(404, 'Absence introuvable.');
  await env.DB.batch(valides.map((aid) => env.DB.prepare(
    `INSERT INTO taches (absence_id, enseignant_id, travail, remise, examen, examen_nom, reprise_date, reprise_info, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(aid, prof.id, travail, remise, examen, examen ? texte(b.examen_nom, 120) : '', repriseDate,
      examen ? texte(b.reprise_info, 200) : '', now)));
  return { ok: true, nb: valides.length };
}

async function supprimerTache({ request, env, id }) {
  const p = await session(request, env, 'enseignant');
  const t = await env.DB.prepare('SELECT enseignant_id FROM taches WHERE id = ?').bind(id).first();
  if (!t) throw new HttpError(404, 'Travail introuvable.');
  if (p.role !== 'direction' && t.enseignant_id !== p.id) throw new HttpError(403, 'Seul l’enseignant qui a demandé ce travail peut le retirer.');
  await env.DB.prepare('DELETE FROM taches WHERE id = ?').bind(id).run();
  return { ok: true };
}

// ---------- Commentaires (personnel et direction) ----------

async function commenter({ request, env, id }) {
  const p = await session(request, env, 'enseignant');
  const b = await body(request);
  const t = texteLong(b.texte, 2000);
  if (!t) throw new HttpError(400, 'Le commentaire est vide.');
  if (!await env.DB.prepare('SELECT id FROM absences WHERE id = ?').bind(id).first()) throw new HttpError(404, 'Absence introuvable.');
  await env.DB.prepare('INSERT INTO commentaires (absence_id, auteur_id, auteur_role, texte, visible_eleve, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, p.id, p.role, t, b.visible_eleve ? 1 : 0, Date.now()).run();
  return { ok: true };
}

async function supprimerCommentaire({ request, env, id }) {
  const p = await session(request, env, 'enseignant');
  const c = await env.DB.prepare('SELECT auteur_id FROM commentaires WHERE id = ?').bind(id).first();
  if (!c) throw new HttpError(404, 'Commentaire introuvable.');
  if (p.role !== 'direction' && c.auteur_id !== p.id) throw new HttpError(403, 'Seul l’auteur peut retirer ce commentaire.');
  await env.DB.prepare('DELETE FROM commentaires WHERE id = ?').bind(id).run();
  return { ok: true };
}

// ---------- Élèves ----------

async function eleves({ request, env }) {
  await session(request, env, 'enseignant');
  const { results } = await env.DB.prepare(
    `SELECT el.id, el.nom, el.groupe, (el.nip_hash IS NOT NULL) AS a_nip,
            (SELECT COUNT(*) FROM absences a WHERE a.eleve_id = el.id) AS nb
     FROM eleves el ORDER BY el.groupe, el.nom`).all();
  return { eleves: results };
}

async function creerEleve({ request, env }) {
  await session(request, env, 'direction');
  const b = await body(request);
  const nom = texte(b.nom, 80);
  nomValide(nom);
  if (await env.DB.prepare('SELECT id FROM eleves WHERE nom_cle = ?').bind(cle(nom)).first()) throw new HttpError(409, `${nom} est déjà inscrit.`);
  const e = await trouverOuCreerEleve(env, b);
  return { ok: true, id: e.id };
}

async function modifierEleve({ request, env, id }) {
  await session(request, env, 'direction');
  const b = await body(request);
  const nom = texte(b.nom, 80);
  nomValide(nom);
  const autre = await env.DB.prepare('SELECT id FROM eleves WHERE nom_cle = ? AND id != ?').bind(cle(nom), id).first();
  if (autre) throw new HttpError(409, `Un autre élève s'appelle déjà ${nom}.`);
  const r = await env.DB.prepare('UPDATE eleves SET nom = ?, nom_cle = ?, groupe = ? WHERE id = ?').bind(nom, cle(nom), texte(b.groupe, 30), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Élève introuvable.');
  return { ok: true };
}

async function supprimerEleve({ request, env, id }) {
  await session(request, env, 'direction');
  const ses = 'SELECT id FROM absences WHERE eleve_id = ?';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM taches WHERE absence_id IN (${ses})`).bind(id),
    env.DB.prepare(`DELETE FROM commentaires WHERE absence_id IN (${ses})`).bind(id),
    env.DB.prepare('DELETE FROM absences WHERE eleve_id = ?').bind(id),
    env.DB.prepare("DELETE FROM sessions WHERE role = 'eleve' AND personne = ?").bind(id),
    env.DB.prepare('DELETE FROM eleves WHERE id = ?').bind(id),
  ]);
  return { ok: true };
}

async function effacerNip({ request, env, id }) {
  await session(request, env, 'enseignant');
  await env.DB.batch([
    env.DB.prepare('UPDATE eleves SET nip_hash = NULL WHERE id = ?').bind(id),
    env.DB.prepare("DELETE FROM sessions WHERE role = 'eleve' AND personne = ?").bind(id),
  ]);
  return { ok: true };
}

// ---------- Réglages (direction) ----------

async function getReglages({ request, env }) {
  await session(request, env, 'direction');
  return { reglages: await lireReglages(env) };
}

async function putReglages({ request, env }) {
  await session(request, env, 'direction');
  const b = await body(request);
  const preavis = Math.round(Number(b.preavis_min));
  if (!(preavis >= 0 && preavis <= 60)) throw new HttpError(400, 'Le préavis doit être entre 0 et 60 jours.');
  const codeE = texte(b.code_eleve, 40), codeP = texte(b.code_enseignant, 40);
  if (codeE.length < 4 || codeP.length < 4) throw new HttpError(400, 'Chaque code doit avoir au moins 4 caractères.');
  if (codeE.toLowerCase() === codeP.toLowerCase()) throw new HttpError(400, 'Le code élève et le code enseignant doivent être différents.');
  const valeurs = { preavis_min: String(preavis), nom_ecole: texte(b.nom_ecole, 120), code_eleve: codeE, code_enseignant: codeP };
  await env.DB.batch(Object.entries(valeurs).map(([n, v]) =>
    env.DB.prepare('INSERT INTO reglages (nom, valeur) VALUES (?, ?) ON CONFLICT(nom) DO UPDATE SET valeur = excluded.valeur').bind(n, v)));
  return { ok: true };
}

const ROUTES = [
  ['POST', /^\/api\/login$/, login],
  ['POST', /^\/api\/logout$/, logout],
  ['GET', /^\/api\/moi$/, moi],
  ['GET', /^\/api\/tournois$/, tournois],
  ['POST', /^\/api\/tournois$/, creerTournoi],
  ['PUT', /^\/api\/tournois\/(\d+)$/, modifierTournoi],
  ['DELETE', /^\/api\/tournois\/(\d+)$/, supprimerTournoi],
  ['POST', /^\/api\/absences$/, declarer],
  ['POST', /^\/api\/inscriptions$/, inscrire],
  ['PUT', /^\/api\/absences\/(\d+)$/, modifierAbsence],
  ['DELETE', /^\/api\/absences\/(\d+)$/, supprimerAbsence],
  ['POST', /^\/api\/absences\/(\d+)\/commentaires$/, commenter],
  ['DELETE', /^\/api\/commentaires\/(\d+)$/, supprimerCommentaire],
  ['GET', /^\/api\/mes-absences$/, mesAbsences],
  ['POST', /^\/api\/taches\/(\d+)\/fait$/, cocherTache],
  ['GET', /^\/api\/tableau$/, tableau],
  ['POST', /^\/api\/taches$/, ajouterTache],
  ['DELETE', /^\/api\/taches\/(\d+)$/, supprimerTache],
  ['GET', /^\/api\/eleves$/, eleves],
  ['POST', /^\/api\/eleves$/, creerEleve],
  ['PUT', /^\/api\/eleves\/(\d+)$/, modifierEleve],
  ['DELETE', /^\/api\/eleves\/(\d+)$/, supprimerEleve],
  ['POST', /^\/api\/eleves\/(\d+)\/effacer-nip$/, effacerNip],
  ['GET', /^\/api\/reglages$/, getReglages],
  ['PUT', /^\/api\/reglages$/, putReglages],
];
