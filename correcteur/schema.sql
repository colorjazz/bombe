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
