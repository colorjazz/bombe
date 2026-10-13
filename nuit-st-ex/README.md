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

Les comptes ne fonctionnent que si le jeu est servi par Google Apps Script. Ouvert directement
(fichier ou lien Claude), seul le mode invité est offert.

Le classeur garde trois onglets :

- **Comptes** : pseudo, sel et empreinte du mot de passe. Le mot de passe lui-même n'est jamais stocké.
- **Parties** : la sauvegarde de chaque compte, sa dernière mise à jour et son nombre de morts.
- **Gagnants** : l'ordre d'arrivée, avec la date et l'heure exactes de chaque victoire.
  Une victoire n'est acceptée que si les trois réponses sont bonnes.

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
