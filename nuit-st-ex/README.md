# La Nuit à St-Ex

Aventure textuelle (parser) dans la Polyvalente Antoine-de-Saint-Exupéry.

- `moteur.js` : moteur du jeu (lieux, locaux, objets, énigmes, pièges, parser, sauvegarde).
- `index.html` : interface. Ouvrir directement dans un navigateur. La partie se sauvegarde dans le navigateur.
- `test.js` : tests du moteur, `node nuit-st-ex/test.js`.

Commandes : NORD, SUD, EST, OUEST, HAUT, BAS (N, S, E, O, H, B), ENTRER <local>, PRENDRE, REGARDER, LIRE,
COMBINER, MANGER, FRAPPER, UTILISER, OUVRIR, ALLUMER, COMPOSER <code>, CARTE, INVENTAIRE (I), AIDE, REJOUER.

## Secrets

Les réponses des trois énigmes ne sont pas dans le code : seules leurs empreintes SHA-256 y figurent.
La phrase de récompense est chiffrée avec une clé tirée de ces réponses et ne s'affiche qu'en gagnant.

Pour tester la partie complète, passer la solution en variable d'environnement :

    SOLUTION="réponse-labo|réponse-armoire|réponse-coffre" node nuit-st-ex/test.js

## Version de l'école (comptes et sauvegarde dans Google Sheets)

L'écran d'accueil propose deux choix :

- **Jouer comme invité** : aucune sauvegarde, on recommence au début à chaque fois.
- **Mon compte** : un pseudo et un mot de passe. La partie est sauvegardée et reprend où on l'a laissée.
  Une mort efface la sauvegarde : on recommence au début.

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
- **Gagnants** : l'ordre d'arrivée, la date et l'heure, le temps de jeu, les morts et une vérification.
  Une victoire n'est acceptée que si les trois réponses sont bonnes. Une victoire en moins de 10 minutes
  de jeu, ou avec moins de 15 sauvegardes, est marquée « À vérifier » et n'apparaît pas dans le palmarès.

Le palmarès (bouton sur l'écran d'accueil) classe les victoires vérifiées du temps le plus court au plus long.

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
