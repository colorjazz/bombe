# Correcteur Express

Correction de copies par IA pour enseignants, payée à la page.

- `public/` : site (accueil `index.html`, appli `app.html`, remerciement `merci.html`, pages légales).
- `src/worker.js` : serveur Cloudflare Worker (clé OpenAI, solde de pages, paiements Stripe, double correction).
- `schema.sql` : base D1. Seules données conservées : clés d'accès, solde, courriel de paiement, empreinte IP des essais (24 h).

## Mise en ligne

Prérequis : [Node.js](https://nodejs.org) (version LTS), un compte Cloudflare (gratuit), un compte Stripe, une clé API OpenAI.

Depuis le dossier `correcteur` :

```bash
./deploy.sh
```

Le script installe les outils, vous connecte à Cloudflare, crée la base, demande vos clés OpenAI et Stripe,
puis met le site en ligne. Il peut être relancé sans risque, par exemple après une modification du code.

### Sans rien installer (depuis le navigateur)

1. Cloudflare → Stockage et bases de données → D1 → créer `correcteur-express`, puis exécuter `schema.sql` dans la Console.
   Inscrire l'identifiant de la base dans `wrangler.toml` (`database_id`).
2. Workers & Pages → Create application → Import a repository (Workers, pas Pages) → `colorjazz/bombe`.
   Build command : vide · Deploy command : `npx wrangler deploy` · Path : `/correcteur` · API token : Create new token.
3. Settings → Build → Production branch : la branche qui contient ce dossier.
4. Settings → Variables and Secrets : `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `IP_SALT` (type Secret).

Ensuite, dans Cloudflare, rattachez votre nom de domaine au Worker (Workers → correcteur-express → Domaines).

À compléter avant la pub : courriel de contact (`CONTACT@VOTRE-DOMAINE.CA` dans `public/*.html`),
textes marqués « À COMPLÉTER » dans `confidentialite.html` et `conditions.html`.

## Développement local

```bash
npm install
printf 'OPENAI_API_KEY=sk-...\nSTRIPE_SECRET_KEY=sk_test_...\nIP_SALT=dev\n' > .dev.vars
npm run db:init:local
npm run dev            # http://localhost:8787
```

## Réglages (`wrangler.toml`)

- `OPENAI_MODEL` : modèle utilisé (défaut `gpt-4o`).
- `TRIAL_PAGES` : pages offertes à l'essai (défaut 30).
- Packs et prix (en $ CA) : constante `PACKS` dans `src/worker.js` (et textes dans `public/index.html`, `public/app.html`).
