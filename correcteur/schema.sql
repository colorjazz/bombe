-- Seules données conservées : les clés d'accès et leur solde de pages (aucune copie, aucune note).
CREATE TABLE IF NOT EXISTS access_keys (
  key        TEXT PRIMARY KEY,
  pages      INTEGER NOT NULL DEFAULT 0,
  email      TEXT,
  is_trial   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Évite de créditer deux fois le même paiement Stripe.
CREATE TABLE IF NOT EXISTS payments (
  session_id TEXT PRIMARY KEY,
  key        TEXT NOT NULL,
  pages      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Essais gratuits récents par adresse IP (hachée), effacés après 24 h. Sert à plafonner les abus.
CREATE TABLE IF NOT EXISTS trials (
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trials_ip ON trials (ip_hash, created_at);

-- Idées proposées par les visiteurs (« Proposez une fonctionnalité »). Le courriel est facultatif ;
-- l'empreinte de connexion limite les envois et est effacée après 24 h.
CREATE TABLE IF NOT EXISTS ideas (
  text       TEXT NOT NULL,
  email      TEXT,
  lang       TEXT,
  ip_hash    TEXT,
  created_at INTEGER NOT NULL
);

-- Clés offertes par le fondateur (page admin.html) : à qui (note facultative) et combien de pages.
CREATE TABLE IF NOT EXISTS gifts (
  key        TEXT PRIMARY KEY,
  pages      INTEGER NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);

-- Journal d'utilisation (statistiques du fondateur) : clé, pages (négatif = remboursement), type, heure. Gardé 12 mois.
CREATE TABLE IF NOT EXISTS usage (
  key        TEXT NOT NULL,
  pages      INTEGER NOT NULL,
  kind       TEXT NOT NULL,      -- 'copies' | 'langue'
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_time ON usage (created_at);
CREATE INDEX IF NOT EXISTS usage_key ON usage (key, created_at);

-- Détail des ventes : montant payé en cents (après code promo) et achat fait avec une clé d'essai.
CREATE TABLE IF NOT EXISTS sales (
  session_id TEXT PRIMARY KEY,
  amount     INTEGER,
  from_trial INTEGER NOT NULL DEFAULT 0
);

-- Réglages du fondateur (ex. revenue_since : début du compteur de revenus après une remise à zéro).
CREATE TABLE IF NOT EXISTS settings (
  name  TEXT PRIMARY KEY,
  value TEXT
);

-- Jetons consommés par chaque appel à l'IA (modèle, entrée, sortie avec la réflexion) : vrai coût de l'IA. Gardé 90 jours.
CREATE TABLE IF NOT EXISTS ai_calls (
  model      TEXT NOT NULL,
  tin        INTEGER NOT NULL,
  tout       INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_calls_time ON ai_calls (created_at);

-- Parrainage : un code par clé (le lien ne montre jamais la clé) et une ligne par achat parrainé.
CREATE TABLE IF NOT EXISTS referral_codes (
  code       TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS referrals (
  session_id     TEXT PRIMARY KEY,
  code           TEXT NOT NULL,
  referrer_key   TEXT NOT NULL,
  referee_key    TEXT NOT NULL,
  referrer_pages INTEGER NOT NULL,
  referee_pages  INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  referrer_paid  INTEGER NOT NULL DEFAULT 0,  -- 1 quand le filleul a corrigé ses 30 premières pages
  paid_at        INTEGER
);
CREATE INDEX IF NOT EXISTS referrals_referee ON referrals (referee_key, referrer_paid);
