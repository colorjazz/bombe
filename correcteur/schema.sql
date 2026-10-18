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

-- Un essai gratuit par adresse IP (hachée) et par période.
CREATE TABLE IF NOT EXISTS trials (
  ip_hash    TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
