# Mesure du rappel de la correction de la langue

Combien de vraies fautes l'appli trouve-t-elle (rappel), et combien de ses signalements sont de vraies fautes
(précision) ? Par catégorie, par type de faute et par lecture (1re lecture, puis avec la relecture). Complète
`tools/surlignages`, qui mesure la justesse des cadres.

## Fichiers

| Fichier | Rôle |
|---|---|
| `copies.mjs` | Copies générées de secondaire et leurs fautes : 6 faciles (55 fautes), 4 difficiles (84 fautes, longues, chargées) |
| `gen.mjs` | Copies en écriture manuscrite (polices Google) avec la position de chaque mot ; `--difficile` : mots irréguliers, photo floue, bruitée, mal éclairée |
| `reelles.mjs` | Vérité de terrain de vraies photos : `photoN.txt`, texte de l'élève tel qu'écrit, fautes marquées |
| `mesure.mjs` | Fait passer les copies dans la vraie chaîne (`src/worker.js` : `/api/language` puis `/api/language-reread`), dans Node, base D1 en mémoire ; garde les réponses brutes de Gemini et les jetons |
| `score.mjs` | Rappel, précision, fautes écartées par le filtre (PDA, catégories) ou jamais vues, cadres justes, coût par page |

Une faute s'écrit `[écrit|correction|catégorie|type]`. Type `option` : faute discutable (style, répétition, faute que
l'enseignante n'a pas relevée) ; elle n'entre pas dans le rappel et la signaler n'est pas une fausse faute.

## Utilisation

Clé Gemini dans `correcteur/.dev.vars` (`AI_API_KEY=…`, jamais dans le dépôt). Playwright pour `gen.mjs`.

    node gen.mjs <dossier> [--difficile]
    node reelles.mjs <dossier> [année]                       # vraies photos : photoN.jpg + photoN.txt
    node mesure.mjs <dossier> --essais 3 [--modele …] [--reflexion low|medium|high] [--cote 2000] [--var CLE=valeur] [--nom essai]
    node score.mjs <dossier> [runs-essai.json …] [--detail] [--paires] [--union a.json+b.json]

Les réglages sont ceux de l'appli par défaut : secondaire selon la Progression des apprentissages, étape 3, toutes les
catégories. `--paires` : deux 1res lectures indépendantes de la même page, réunies.

Dans une session infonuagique, lancer `mesure.mjs` avec `NODE_USE_ENV_PROXY=1`. Le proxy y coupe toute requête qui ne
répond rien en 30 s : les appels passent en flux (`streamGenerateContent`, résumés de réflexion), puis sont remis sous la
forme de `generateContent` (`--sans-flux` pour l'appel tel quel). Sans cela, les appels les plus longs échouaient et les
résultats en étaient faussés.

**Les vraies copies (photos, textes, réponses) restent hors du dépôt : élèves réels.**

## Résultats du 15 novembre 2026

Trois vraies copies de secondaire (dont celle où une enseignante a relevé des fautes oubliées par l'appli), 49 fautes
relevées par l'enseignante (corrections en vert sur la copie, plus celles qu'elle a signalées), 3 ou 4 lectures par
copie. Écart d'un essai à l'autre : environ ± 3 points.

| Essai | Rappel 1re lecture → avec relecture | Précision (avec relecture) | Coût par page (¢ CA) |
|---|---|---|---|
| Situation de départ (gemini-3.7-flash, réflexion par défaut) | 61 % → 69 % | 98 % | 4,65 |
| Réflexion « medium » | 62 % → 69 % | 100 % | 5,0 |
| Photo réduite à 2000 px | 65 % → 71 % | 97 % | 4,9 |
| **Image lue en « ultra high » (`mediaResolution`)** | **67 % → 72 %** | **97 %** | **5,7** |
| Consignes plus précises (féminin, homophones, virgules, finales) | 61 % → 71 % | 100 % | 5,3 |
| Consignes + ultra high | 64 % → 71 % | 98 % | 5,5 |
| Transcrire, puis lire l'image avec la transcription | 67 % → 71 % | 98 % | 7,1 |
| Deux temps : transcrire, corriger le texte seul, localiser | 65 % → 70 % | 95 % | 7,9 |
| Deux 1res lectures réunies (au lieu de la relecture) | 66 % | 91 % | 5,1 |
| gemini-3.1-pro-preview | 82 % → 84 % | 80 % | 11,9 |
| gemini-3.1-pro-preview + règle de style | 71 % → 84 % | 86 % | 16,2 |
| 1re lecture Flash, relecture Pro | 59 % → 74 % | 89 % | 6,7 |

Constats :

- Le filtre (PDA, catégories) n'écarte aucune vraie faute : toutes les fautes manquées sont des fautes que l'IA n'a pas vues.
- La relecture apporte 5 à 10 points, surtout en ponctuation et en conjugaison. Deux lectures réunies font moins bien.
- Ce qui reste manqué avec Flash : virgule après un complément de phrase en tête (≈ 40 % trouvées), phrases mal construites
  (≈ 30 %), et deux participes dont la finale est mal formée (« devenu si obsédé ») : toutes les lectures, tous modèles
  confondus, y lisent « devenue si obsédée ». Recopier d'abord le texte « tel qu'écrit » n'y change rien.
- L'image en « ultra high » : orthographe 84 % → 93 % dans les deux essais qui l'utilisent. Retenu (`LANG_MEDIA_RES`).
- Gemini 3.1 Pro trouve beaucoup plus de fautes de syntaxe et de ponctuation, mais invente des fautes (temps de verbe
  changés, « a fréquenté » → « a fréquentée »), varie d'un essai à l'autre et coûte 2,5 à 3,5 fois plus : non retenu.
- Google répond à `gemini-3.7-flash` avec `gemini-3.8-flash` (champ `modelVersion`) : les deux sont le même modèle aujourd'hui.
- Copies générées : 100 % (faciles) et ≈ 95 % (difficiles) de rappel. Elles servent à vérifier les cadres et à repérer
  une régression, pas à mesurer la difficulté des vraies écritures.
