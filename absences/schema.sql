-- Absences Sport-études : élèves, personnel (enseignants et direction), tournois, absences, travaux demandés, commentaires.
-- Les dates (debut, fin, remise, reprise_date) sont au format AAAA-MM-JJ ; les heures (created_at…) en millisecondes.

CREATE TABLE IF NOT EXISTS eleves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nom        TEXT NOT NULL,
  nom_cle    TEXT NOT NULL UNIQUE,   -- nom en minuscules sans accents : retrouver l'élève à la connexion
  groupe     TEXT NOT NULL DEFAULT '',
  nip_hash   TEXT,                   -- NIP choisi à la première connexion (haché)
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enseignants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nom        TEXT NOT NULL,
  nom_cle    TEXT NOT NULL UNIQUE,
  matiere    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,          -- 'eleve' | 'enseignant'
  personne   INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournois (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nom        TEXT NOT NULL,
  sport      TEXT NOT NULL DEFAULT '',
  lieu       TEXT NOT NULL DEFAULT '',
  debut      TEXT NOT NULL,
  fin        TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '', -- consignes de la direction (transport, horaire…)
  officiel   INTEGER NOT NULL DEFAULT 0, -- 1 = inscrit par la direction : reste même sans élève
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tournois_fin ON tournois (fin);

-- Une absence = un élève qui part à un tournoi.
CREATE TABLE IF NOT EXISTS absences (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  eleve_id   INTEGER NOT NULL,
  tournoi_id INTEGER NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,       -- sert à calculer le préavis donné aux enseignants
  UNIQUE (eleve_id, tournoi_id)
);
CREATE INDEX IF NOT EXISTS absences_tournoi ON absences (tournoi_id);

-- Travail demandé par un enseignant pour une absence, avec reprise d'examen éventuelle.
CREATE TABLE IF NOT EXISTS taches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  absence_id    INTEGER NOT NULL,
  enseignant_id INTEGER NOT NULL,
  travail       TEXT NOT NULL DEFAULT '',
  remise        TEXT,                -- date de remise du travail
  examen        INTEGER NOT NULL DEFAULT 0,
  examen_nom    TEXT NOT NULL DEFAULT '',
  reprise_date  TEXT,
  reprise_info  TEXT NOT NULL DEFAULT '', -- heure, local…
  fait_at       INTEGER,             -- l'élève a coché « terminé »
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS taches_absence ON taches (absence_id);

-- Commentaires du personnel sur une absence ; visible_eleve = 1 : l'élève le voit aussi.
CREATE TABLE IF NOT EXISTS commentaires (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  absence_id    INTEGER NOT NULL,
  auteur_id     INTEGER NOT NULL,   -- enseignants.id (la direction y figure aussi)
  auteur_role   TEXT NOT NULL,      -- 'enseignant' | 'direction'
  texte         TEXT NOT NULL,
  visible_eleve INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commentaires_absence ON commentaires (absence_id);

-- Réglages de la direction : preavis_min, nom_ecole, code_eleve, code_enseignant.
CREATE TABLE IF NOT EXISTS reglages (
  nom    TEXT PRIMARY KEY,
  valeur TEXT
);
