#!/usr/bin/env bash
# Mise en ligne de Correcteur Express sur Cloudflare.
# À lancer depuis le dossier « correcteur » : ./deploy.sh
# Relançable sans risque : les étapes déjà faites sont sautées.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/5 Installation des outils"
command -v node >/dev/null || { echo "Installez d'abord Node.js : https://nodejs.org (version LTS)"; exit 1; }
npm install --no-audit --no-fund

echo "== 2/5 Connexion à Cloudflare (une page s'ouvre dans le navigateur)"
npx wrangler whoami >/dev/null 2>&1 || npx wrangler login

echo "== 3/5 Base de données"
if grep -q 'REMPLACER_PAR_L_ID_DE_VOTRE_BASE' wrangler.toml; then
  out=$(npx wrangler d1 create correcteur-express 2>&1) || true
  id=$(printf '%s' "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -z "$id" ]; then
    # La base existe peut-être déjà : on récupère son identifiant.
    id=$(npx wrangler d1 info correcteur-express 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  fi
  [ -n "$id" ] || { echo "Impossible de créer la base :"; echo "$out"; exit 1; }
  sed -i.bak "s/REMPLACER_PAR_L_ID_DE_VOTRE_BASE/$id/" wrangler.toml && rm -f wrangler.toml.bak
  echo "Base créée : $id"
fi
npx wrangler d1 execute correcteur-express --remote --file=schema.sql --yes

echo "== 4/5 Clés secrètes"
existing=$(npx wrangler secret list 2>/dev/null || echo "")
ask_secret() {
  if printf '%s' "$existing" | grep -q "\"$1\""; then echo "$1 déjà défini (inchangé)"; return; fi
  echo "$2"
  npx wrangler secret put "$1"
}
ask_secret AI_API_KEY "Collez votre clé API Gemini (AIza...) :"
ask_secret STRIPE_SECRET_KEY "Collez votre clé secrète Stripe (sk_test_... pour tester, sk_live_... pour vendre) :"
if ! printf '%s' "$existing" | grep -q '"IP_SALT"'; then
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | npx wrangler secret put IP_SALT
fi

echo "== 5/5 Mise en ligne"
npx wrangler deploy

echo
echo "Terminé ! L'adresse du site est affichée ci-dessus (…workers.dev)."
echo "Pour votre propre nom de domaine : tableau de bord Cloudflare → Workers → correcteur-express → Domaines."
