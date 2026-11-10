# partage/correction

Code de correction commun à la 1.0 (`correcteur/`) et à la 2.0 (`salle-des-profs/`).

| Fichier | Contenu |
|---|---|
| `erreurs.js` | `HttpError` |
| `copies.js` | Prompt de correction (`buildPrompt`), schémas JSON, grilles, calibration, normalisation des notes, comparaison des deux corrections |
| `langue.js` | Catégories et niveaux de la langue, schémas, liste de vérification, prise en compte de la PDA |

Ces fichiers ont été déplacés **tels quels** depuis `correcteur/src/worker.js` (9 novembre 2026). Vérification faite au déplacement : texte source identique pour les 41 fonctions et constantes, mêmes sorties sur des exemples, Worker regroupé sans erreur par esbuild.

**Correctif du 9 novembre (soir) :** `ORTHO_TYPES` (orthopédagogie) a été déplacé ici à son tour. `langSchema` et `langErrors` l'utilisaient, mais l'outil de déplacement ne repérait pas les déclarations précédées de `export`. La correction de la langue avec l'orthopédagogie a été en panne environ 15 minutes en production. Avant chaque déplacement, vérifier qu'aucun nom n'est indéfini dans les modules (analyse de tous les identifiants utilisés, pas seulement des dépendances entre déclarations), et tester avec les options activées (orthopédagogie, PDA, anglais).

**Toute modification ici touche les deux versions.** Le déploiement de la 1.0 doit surveiller ce dossier (Cloudflare, Build watch paths : `correcteur/*` et `partage/*`).

À venir : l'interface de fournisseur d'IA (Gemini API, Vertex AI à Montréal, Azure), avec un mode « Montréal seulement » pour la 2.0.
