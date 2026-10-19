# Mesure de la précision des surlignages

Copies manuscrites générées dont on connaît la position exacte de chaque mot (vérité terrain), pour mesurer
le pourcentage de surlignages qui tombent sur le bon mot, avant et après le recalage de `public/boxes.js`.

Prérequis : site local (`npm run dev`, clé Gemini dans `.dev.vars`), Playwright, et une clé d'accès locale
(`CE-TESTS-AAAAA-BBBBB` dans `score.mjs`, à créer dans la base locale).

    node gen.mjs <dossier>                  # 4 pages + truth.json  (gen-difficile.mjs : écritures plus dures, photo dégradée à part)
    node score.mjs <dossier> run 2          # 2 analyses de la langue par page avec le vrai Gemini → runs.json
    node score.mjs <dossier> eval           # score de Gemini seul
    node recaler.mjs <dossier>              # applique le recalage → runs-snap.json
    node score.mjs <dossier> eval <dossier>/runs-snap.json

Résultats du 18 octobre 2026 : Gemini seul 45-63 % de cadres justes ; avec le recalage 86-96 %.

19 octobre 2026, vraies photos de copies (grande écriture aux lettres espacées, encre pâle, lignes du papier) :
le recalage du 18 faisait pire que Gemini seul (morceaux de mots, mot voisin). Corrigé par un seuil d'encre
qui suit le contraste de la page, un contrôle de largeur et de position du mot choisi (sinon on resserre le cadre
de l'IA sur l'encre), et des bords complétés avec les traits pâles. Évalué à l'œil sur 3 copies (62 fautes) :
environ 68 % de cadres justes, contre environ 45 % avant ; copies générées inchangées (100 / 92 / 93 / 83 %).
Les écritures serrées sur des lignes rapprochées restent le cas le plus difficile.
