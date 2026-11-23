# Absences Sport-études

Application web toute simple pour les écoles sport-études :

- **Élèves** : déclarent leurs absences pour un tournoi (en choisissant un tournoi déjà inscrit par un coéquipier
  ou en en créant un), voient le travail demandé par chaque enseignant, les dates de remise et de reprise d'examen,
  et cochent « Terminé » quand c'est fait.
- **Enseignants** : voient, tournoi par tournoi, quels élèves seront absents (filtre par groupe, recherche, impression),
  avec le préavis donné par l'élève (vert : 7 jours ou plus, orange : moins de 7, rouge : moins de 3 ou en retard).
  Ils demandent du travail ou fixent une reprise d'examen pour un ou plusieurs élèves d'un coup.
  L’onglet « Calendrier » montre, jour par jour, combien d’élèves sont absents (clic sur un jour : qui et pour quel tournoi).
  L'onglet « Reprises d'examen » liste toutes les reprises à venir, toutes matières confondues.

- **Direction** : a accès à tout. Elle inscrit les tournois (avec des consignes vues par tous, par exemple l'heure de l'autobus),
  inscrit des élèves à un tournoi (en les cochant ou en collant la liste d'une équipe, « Prénom Nom, groupe » par ligne),
  modifie ou supprime tournois, absences, élèves et travaux, et commente chaque absence.
  Ses réglages : nom de l'école, préavis demandé (7 jours par défaut), codes élève et enseignant.
- **Commentaires** : enseignants et direction commentent une absence ; chaque commentaire est soit interne
  (personnel seulement), soit visible par l'élève.

Connexion sans courriel ni mot de passe à retenir :
- Élève : prénom et nom, groupe, NIP de 4 chiffres choisi à la première connexion, code de l'école.
  Un enseignant peut effacer un NIP oublié (onglet « Élèves »).
- Enseignant : prénom et nom, matière, code enseignant.
- Direction : prénom et nom, code direction (secret `CODE_DIRECTION`, défini à la mise en ligne).

## Mise en ligne (gratuit, Cloudflare)

Prérequis : [Node.js](https://nodejs.org) (version LTS) et un compte Cloudflare gratuit.

```bash
cd absences
./deploy.sh
```

Le script crée la base de données, met le site en ligne et vous demande de choisir les deux codes
(`CODE_ELEVE`, `CODE_ENSEIGNANT`, `CODE_DIRECTION`). Les tables sont créées automatiquement au premier usage.

## Essai sur votre ordinateur

```bash
cd absences
npm install
printf 'CODE_ELEVE=sport\nCODE_ENSEIGNANT=prof\nCODE_DIRECTION=dir\n' > .dev.vars
npx wrangler dev
```

Puis ouvrez http://localhost:8787.

## Fichiers

- `public/` : l'interface (`index.html`, `app.js`, `style.css`), sans dépendance.
- `src/worker.js` : le serveur (connexion, absences, travaux, reprises).
- `schema.sql` : la base de données.
- `demo/` : version de démonstration en une seule page (données fictives, sans serveur). `node demo/construire.mjs` régénère `demo/demo.html` et `site/index.html`.
- `site/` + `netlify.toml` : la démo prête pour Netlify (dossier publié tel quel, aucune compilation).

## Où sont les données

Toutes les données sont dans une base **Cloudflare D1** (SQLite hébergée), créée par `deploy.sh` dans votre compte Cloudflare :
élèves (nom, groupe, NIP haché), personnel (nom, matière), tournois, absences, travaux, commentaires et réglages.
Aucune donnée ne passe par un autre service.

- **Sauvegarde** : D1 garde automatiquement 30 jours d'historique (Time Travel) ;
  `npx wrangler d1 time-travel restore absences-sport-etudes --timestamp=…` revient à un moment précis.
- **Copie complète** : `npx wrangler d1 export absences-sport-etudes --remote --output=sauvegarde.sql`.
- La démo (`demo/demo.html`) garde ses données fictives dans le navigateur seulement.
