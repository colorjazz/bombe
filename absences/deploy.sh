#!/usr/bin/env bash
# Mise en ligne d'Absences Sport-études sur Cloudflare (gratuit).
# À lancer depuis le dossier « absences » : ./deploy.sh
# Relançable sans risque : les étapes déjà faites sont sautées.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/4 Installation des outils"
command -v node >/dev/null || { echo "Installez d'abord Node.js : https://nodejs.org (version LTS)"; exit 1; }
npm install --no-audit --no-fund

echo "== 2/4 Connexion à Cloudflare (une page s'ouvre dans le navigateur)"
npx wrangler whoami >/dev/null 2>&1 || npx wrangler login

echo "== 3/4 Base de données"
if grep -q 'REMPLACER_PAR_L_ID_DE_VOTRE_BASE' wrangler.toml; then
  out=$(npx wrangler d1 create absences-sport-etudes 2>&1) || true
  id=$(printf '%s' "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -z "$id" ]; then
    id=$(npx wrangler d1 info absences-sport-etudes 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  fi
  [ -n "$id" ] || { echo "Impossible de créer la base :"; echo "$out"; exit 1; }
  sed -i.bak "s/REMPLACER_PAR_L_ID_DE_VOTRE_BASE/$id/" wrangler.toml && rm -f wrangler.toml.bak
  echo "Base créée : $id"
fi

echo "== 4/4 Mise en ligne"
npx wrangler deploy
existing=$(npx wrangler secret list 2>/dev/null || echo "")
ask_secret() {
  if printf '%s' "$existing" | grep -q "\"$1\""; then echo "$1 déjà défini (inchangé)"; return; fi
  echo "$2"
  npx wrangler secret put "$1"
}
ask_secret CODE_ELEVE "Choisissez le code que vous donnerez aux élèves (ex. volley2026) :"
ask_secret CODE_ENSEIGNANT "Choisissez le code réservé aux enseignants (différent du code élève) :"

echo
echo "Terminé ! L'adresse du site est affichée ci-dessus (…workers.dev)."
