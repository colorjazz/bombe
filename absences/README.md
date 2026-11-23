# Absences Sport-études

Application web toute simple pour les écoles sport-études :

- **Élèves** : déclarent leurs absences pour un tournoi (en choisissant un tournoi déjà inscrit par un coéquipier
  ou en en créant un), voient le travail demandé par chaque enseignant, les dates de remise et de reprise d'examen,
  et cochent « Terminé » quand c'est fait.
- **Enseignants** : voient, tournoi par tournoi, quels élèves seront absents (filtre par groupe, recherche, impression),
  avec le préavis donné par l'élève (vert : 7 jours ou plus, orange : moins de 7, rouge : moins de 3 ou en retard).
  Ils demandent du travail ou fixent une reprise d'examen pour un ou plusieurs élèves d'un coup.
  L'onglet « Reprises d'examen » liste toutes les reprises à venir, toutes matières confondues.

Connexion sans courriel ni mot de passe à retenir :
- Élève : prénom et nom, groupe, NIP de 4 chiffres choisi à la première connexion, code de l'école.
  Un enseignant peut effacer un NIP oublié (onglet « Élèves »).
- Enseignant : prénom et nom, matière, code enseignant.

## Mise en ligne (gratuit, Cloudflare)

Prérequis : [Node.js](https://nodejs.org) (version LTS) et un compte Cloudflare gratuit.

```bash
cd absences
./deploy.sh
```

Le script crée la base de données, met le site en ligne et vous demande de choisir les deux codes
(`CODE_ELEVE`, `CODE_ENSEIGNANT`). Les tables sont créées automatiquement au premier usage.

## Essai sur votre ordinateur

```bash
cd absences
npm install
printf 'CODE_ELEVE=sport\nCODE_ENSEIGNANT=prof\n' > .dev.vars
npx wrangler dev
```

Puis ouvrez http://localhost:8787.

## Fichiers

- `public/` : l'interface (`index.html`, `app.js`, `style.css`), sans dépendance.
- `src/worker.js` : le serveur (connexion, absences, travaux, reprises).
- `schema.sql` : la base de données.
