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
