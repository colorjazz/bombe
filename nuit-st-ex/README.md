# La Nuit à St-Ex

Aventure textuelle (parser) à l'École secondaire Antoine-de-Saint-Exupéry.

- `moteur.js` : moteur du jeu (lieux, locaux, objets, énigmes, pièges, rencontres, indices, parser, sauvegarde).
- `index.html` : interface. Ouvrir directement dans un navigateur.
- `test.js` : tests du moteur et du serveur, `node nuit-st-ex/test.js`.

## Comment on joue

On touche les boutons ou on écrit ce qu'on veut faire. Les boutons suivent la situation :
sorties, Prendre, Lire, Composer un code, Combiner, Manger, Allumer, Frapper, Attendre, Lancer, Utiliser la clé.
Les mots soulignés dans les descriptions se touchent aussi (REGARDER ce mot).

- Déplacements : toucher une sortie, ou ALLER <destination> (ex. : ALLER CAFÉTÉRIA). Un lieu déjà visité ?
  ALLER l'y mène tout seul (voyage rapide), ou toucher sa case sur la CARTE. RETOUR remonte le chemin.
- Commandes : ENTRER <local>, PRENDRE (ou PRENDRE TOUT), REGARDER, LIRE, COMBINER, MANGER, FRAPPER, UTILISER,
  OUVRIR, ALLUMER, COMPOSER <code>, ÉCOUTER, ATTENDRE, LANCER, CRIER, CARTE, INVENTAIRE (I), OBJECTIFS,
  INDICE, NOTES, AIDE, REJOUER. Les anciens raccourcis N, S, E, O, HAUT, BAS fonctionnent encore.
- Le parser comprend les fautes de frappe courantes, « je prends… », « pogne », « check », « débarrer ».
- Avec le calepin (bureau de M. Plante) : NOTER <texte>, NOTES, EFFACER NOTES. Les lectures clés
  (tableau, fiche, gravure, mur, post-it) s'y recopient toutes seules ; le nombre de sièges, non.

## Ce que le jeu fait pour rester juste (et difficile)

- **Moments sûrs** : au départ, à chaque serrure ouverte, à l'arme fabriquée et juste avant le coup sur
  le cadenas. Une mort ramène au dernier moment sûr ; le calepin, les pages, les locaux visités et les
  dangers déjà vus restent. Les morts sont comptées (écran de fin, palmarès).
- **Pièges en deux temps** : portes de secours, gymnase 6, avertisseur, vitre, cri. La première fois,
  on voit et on recule ; la deuxième fois, c'est la mort.
- **La poursuite** (après le cadenas) : 10 gestes. Regarder, lire, consulter et les fautes de frappe ne
  comptent pas. Une jauge et un cadre rouge montrent le temps qui reste. Un mauvais code au coffre coûte
  un geste de plus.
- **INDICE** : trois niveaux (où chercher, quoi relier, la méthode), le suivant après 12 gestes.
  Jamais un code, jamais le nombre de sièges. Le nombre d'indices est compté au palmarès.
- **OBJECTIFS** : le journal se remplit à mesure qu'on découvre l'école.
- **Rencontres** : une silhouette à la cafétéria (ATTENDRE ou LANCER un objet inutile), et une autre
  entre toi et la sortie, la clé en main (FRAPPER avec l'arme ou LANCER).
- **Le carnet de R.** : 8 pages cachées dans des locaux, une par grande zone. Elles racontent l'après-midi
  de l'évacuation, et certaines aident.
- Quatre chapitres, des scènes qui reviennent une seule fois, des descriptions qui changent avec ce qui
  s'est passé, et un épilogue après le générique.
- Son facultatif (coupé au départ), synthétisé dans la page : vibration du texto, bip du coffre, cœur
  pendant la poursuite. Vibration du téléphone quand l'appareil le permet.

## Secrets

Les réponses des trois énigmes ne sont pas dans le code : seules leurs empreintes SHA-256 y figurent.
La phrase de récompense est chiffrée avec une clé tirée de ces réponses et ne s'affiche qu'en gagnant.

Pour tester la partie complète, passer la solution en variable d'environnement :

    SOLUTION="réponse-labo|réponse-armoire|réponse-coffre" node nuit-st-ex/test.js

## Version de l'école (comptes et sauvegarde dans Google Sheets)

L'écran d'accueil propose deux choix :

- **Jouer comme invité** : aucune sauvegarde, on recommence au début à chaque fois.
- **Mon compte** : un pseudo et un mot de passe. La partie est sauvegardée et reprend où on l'a laissée.
  Une mort ramène au dernier moment sûr (la mort est comptée).

Les comptes fonctionnent quand le jeu est servi par Google Apps Script, ou par un site web
(Netlify) qui joint ce même déploiement Apps Script : son adresse est dans `URL_SERVEUR`, dans
`index.html`. Si le serveur ne répond pas (fichier ouvert directement, lien Claude), seul le mode
invité est offert.

### Netlify

Réglages du site : *Base directory* vide, *Build command* vide, *Publish directory* `nuit-st-ex`.
Le site appelle le déploiement Apps Script : celui-ci doit avoir la version actuelle de `Code.gs`
(avec `doPost`).

Le classeur garde trois onglets :

- **Comptes** : pseudo, sel et empreinte du mot de passe. Le mot de passe lui-même n'est jamais stocké.
- **Parties** : la sauvegarde de chaque compte, son dernier contact, ses morts, son temps de jeu actif
  (mesuré par le serveur ; une pause de plus de 5 minutes ne compte pas) et son nombre de sauvegardes.
- **Gagnants** : l'ordre d'arrivée, la date et l'heure, le temps de jeu, les morts, une vérification,
  le nombre d'indices et un **code de vérification** de 4 caractères. Le gagnant voit ce code sur son écran
  de fin : M. Plante peut lui demander son pseudo et son code, et les retrouver dans l'onglet.
  Une victoire n'est acceptée que si les trois réponses sont bonnes. Une victoire en moins de 10 minutes
  de jeu, ou avec moins de 15 sauvegardes, est marquée « À vérifier » et n'apparaît pas dans le palmarès.

Le palmarès (bouton sur l'écran d'accueil) classe les victoires vérifiées du temps le plus court au plus long,
avec les morts et les indices.

Après une mise à jour de `Code.gs`, relancer `installer` : les en-têtes des onglets sont mis à jour sans rien effacer.

### Installation (une seule fois)

1. Créer un nouveau Google Sheets (par exemple « La Nuit à St-Ex »).
2. Menu **Extensions → Apps Script**.
3. Remplacer le contenu de `Code.gs` par celui de `apps-script/Code.gs`.
4. Ajouter un fichier HTML (**+ → HTML**) nommé exactement `Index`, et y coller le contenu de `apps-script/Index.html`.
5. Choisir la fonction `installer` dans la liste en haut, cliquer **Exécuter** et accepter les autorisations.
   Les onglets Comptes, Parties et Gagnants apparaissent dans le classeur.
6. **Déployer → Nouveau déploiement**, type **Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
7. Copier l'URL de l'application Web : c'est le lien à donner aux élèves.

Après une modification du jeu : lancer `node nuit-st-ex/construire-apps-script.js`, recoller
`apps-script/Index.html` dans le fichier `Index`, puis **Déployer → Gérer les déploiements → Modifier → Nouvelle version**.
