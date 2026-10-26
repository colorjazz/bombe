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
