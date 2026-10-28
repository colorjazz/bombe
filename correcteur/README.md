# Brûle la pile / Burn the Pile

Correction de copies par IA pour enseignants, payée à la page. Site bilingue (FR / EN).

- `public/` : site (accueil `index.html`, appli `app.html`, remerciement `merci.html`, pages légales).
- `src/worker.js` : serveur Cloudflare Worker (clé de l'IA Gemini, solde de pages, paiements Stripe, double correction).
- Bilinguisme : `public/lang.js` (détection et choix FR | EN), `public/i18n.js` (traduction de l'appli),
  pages d'accueil générées par `tools/build_home.py`, pages légales en deux fichiers (`confidentialite`/`privacy`, `conditions`/`terms`).
- `schema.sql` : base D1. Seules données conservées : clés d'accès, solde, courriel de paiement, empreinte IP des essais (24 h).

## Mise en ligne

Prérequis : [Node.js](https://nodejs.org) (version LTS), un compte Cloudflare (gratuit), un compte Stripe, une clé API Gemini (Google AI Studio, facturation activée).

Depuis le dossier `correcteur` :

```bash
./deploy.sh
```

Le script installe les outils, vous connecte à Cloudflare, crée la base, demande vos clés Gemini et Stripe,
puis met le site en ligne. Il peut être relancé sans risque, par exemple après une modification du code.

### Sans rien installer (depuis le navigateur)

1. Cloudflare → Stockage et bases de données → D1 → créer `correcteur-express`, puis exécuter `schema.sql` dans la Console.
   Inscrire l'identifiant de la base dans `wrangler.toml` (`database_id`).
2. Workers & Pages → Create application → Import a repository (Workers, pas Pages) → `colorjazz/bombe`.
   Build command : vide · Deploy command : `npx wrangler deploy` · Path : `/correcteur` · API token : Create new token.
3. Settings → Build → Production branch : la branche qui contient ce dossier.
4. Settings → Variables and Secrets : `AI_API_KEY` (clé Gemini), `STRIPE_SECRET_KEY`, `IP_SALT` (type Secret).
5. Stripe → Développeurs → Webhooks → Ajouter une destination : URL `https://VOTRE-DOMAINE/api/stripe-webhook`,
   événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`.
   Copier la clé de signature (`whsec_…`) dans le secret `STRIPE_WEBHOOK_SECRET`. Les pages sont alors créditées
   même si le client ferme l'onglet avant la page de remerciement.

Ensuite, dans Cloudflare, rattachez votre nom de domaine au Worker (Workers → correcteur-express → Domaines).

### Traitement à Montréal (Vertex AI), facultatif

Par défaut, les copies vont à l'API Gemini (gemini-3.7-flash pour la langue), sans garantie de pays. Pour offrir aux enseignants le traitement à Montréal (gemini-3.5-flash, surlignages un peu moins précis : 75 % de cadres exacts contre 84 % sur 9 vraies copies) :

1. Google Cloud (projet avec facturation active), Cloud Shell :
   ```
   gcloud services enable aiplatform.googleapis.com
   gcloud iam service-accounts create brulelapile --display-name="Brûle la pile"
   gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT --member="serviceAccount:brulelapile@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" --role="roles/aiplatform.user"
   gcloud iam service-accounts keys create cle.json --iam-account=brulelapile@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com
   cat cle.json
   ```
2. Cloudflare → Settings → Variables and Secrets : secret `VERTEX_SA_KEY` = tout le contenu de `cle.json`
   (puis supprimer `cle.json` dans Cloud Shell : `rm cle.json`).
3. Page admin → Vue d'ensemble → Fournisseur d'IA → « Vérifier » : Vertex AI à Montréal doit afficher ✓ deux fois.
4. L'appli propose alors, dans ses réglages avancés, « Traiter les copies au Québec (Montréal) », décochée par défaut.
   Cochée, chaque requête part avec l'en-tête `X-Region: qc` et passe par Vertex AI, sans jamais de repli ailleurs.
   (Variable `AI_PROVIDER` = `vertex` : tout le site passe par Montréal, même sans l'option.)

Variables facultatives : `VERTEX_LOCATION` (défaut `northamerica-northeast1`, Montréal), `VERTEX_MODEL`
(défaut `gemini-3.5-flash`, le seul modèle Gemini 3 offert à Montréal le 28 octobre 2026), `VERTEX_PROJECT`
(défaut : celui de la clé).

À compléter avant la pub : courriel de contact (`CONTACT@VOTRE-DOMAINE.CA` dans `public/*.html`),
textes marqués « À COMPLÉTER » dans `confidentialite.html` et `conditions.html`.

## Développement local

```bash
npm install
printf 'AI_API_KEY=AIza...\nSTRIPE_SECRET_KEY=sk_test_...\nIP_SALT=dev\n' > .dev.vars
npm run db:init:local
npm run dev            # http://localhost:8787
```

## Réglages (`wrangler.toml`)

- `AI_MODEL` : modèle utilisé (défaut `gemini-3.5-flash`).
- `AI_FALLBACK_MODEL` : modèle de secours si `AI_MODEL` est retiré (défaut `gemini-3.6-flash`, modèle stable nommé plutôt qu'un alias « -latest »).
- `LANG_MODEL` : modèle de la correction de la langue, de la 2e correction (si `SECOND_MODEL` est absent) et du redressement des photos (défaut `gemini-3.7-flash`).
- `SECOND_MODEL` (facultatif) : modèle de la 2e correction en mode approfondi (défaut : `LANG_MODEL`, pour une contre-vérification réellement indépendante).
- Nettoyage horaire (`[triggers]` dans `wrangler.toml`) : empreintes d'IP de plus de 24 h et clés d'essai de plus de 90 jours.
- `public/vendor/` : pdf.js, mammoth, heic2any et html2canvas hébergés sur le site (les réseaux scolaires filtrent souvent les CDN).
- `AI_BASE_URL` : adresse de l'API (compatible OpenAI) ; permet de changer de fournisseur.
- `TRIAL_PAGES` : pages offertes à l'essai (défaut 30).
- Packs et prix (en $ CA) : constante `PACKS` dans `src/worker.js` (et textes dans `public/index.html`, `public/app.html`).
