# Équipe marketing autonome — Brûle la pile

Une équipe de 5 agents qui fait la promotion de **brulelapile.ca** auprès des enseignants, chaque semaine, sans intervention.

## Comment ça tourne

Une **tâche planifiée Claude Code** démarre chaque jeudi soir. Elle tourne avec ton abonnement Claude, sans clé d'API. Elle lit `orchestrateur.md` et fait travailler les agents dans l'ordre :

| # | Agent | Fichier | Ce qu'il fait |
|---|---|---|---|
| 1 | Analyste | `agents/analyste.md` | Lit les chiffres Metricool des 14 derniers jours et note ce qui a marché |
| 2 | Stratège | `agents/stratege.md` | Choisit l'angle de la semaine selon le calendrier scolaire et les trous dans la programmation |
| 3 | Créateur | `agents/createur.md` | Écrit les publications et décrit les visuels |
| 4 | Garde-fou | `agents/garde-fou.md` | Vérifie chaque publication selon `regles.md` ; corrige ou rejette |
| 5 | Publieur | `agents/publieur.md` | Génère les visuels, les met en ligne et programme les publications dans Metricool |

Chaque semaine laisse une trace dans `semaines/AAAA-MM-JJ/` (plan, textes, visuels, rapport) et dans `journal/`.

## Les fichiers à modifier toi-même

- `marque.md` : les faits sur le produit. **Mets-le à jour quand le produit ou les prix changent**, sinon les agents répéteront de vieilles informations.
- `regles.md` : ce que les agents ont le droit de faire ou pas.
- `calendrier.md` : les dates de ton école ou de ton CSS (consignation, bulletins).
- `idees.md` : les idées de croissance qui ont besoin de toi ou d'une nouvelle fonction dans l'appli.

La tâche planifiée relit ces fichiers à chaque exécution : pas besoin de la reconfigurer.

## Visuels

- **Par défaut :** `visuels/rendre.mjs` transforme une liste de cartes (JSON) en images carrées de 1080 × 1080, avec Chromium. Pas de clé, pas de coût.
- **Avec Gemini (facultatif) :** si la variable d'environnement `GEMINI_API_KEY` existe, `visuels/gemini.mjs` peut générer une image d'ambiance (pile de copies, café, etc.). La clé se crée gratuitement dans Google AI Studio. Ton abonnement Gemini Advanced ne suffit pas : il ne donne pas accès à l'API.

Les images sont poussées dans ce dépôt public, puis Metricool les récupère par leur adresse `raw.githubusercontent.com`.

## Limites honnêtes

- Les agents publient seulement sur **tes propres comptes** connectés à Metricool. Aujourd'hui, c'est seulement la page Facebook. Connecte Instagram et Pinterest dans Metricool : les agents les utiliseront automatiquement.
- Ils ne publient **pas** dans les groupes Facebook, n'envoient **ni courriels ni messages privés** non sollicités et ne dépensent **jamais** d'argent en publicité. Ils te préparent ces actions dans le rapport de la semaine, sous « À faire par toi ».
- Ils ne voient pas l'admin de Brûle la pile. Le nombre d'essais et d'achats, c'est toi qui le vois. Si tu veux qu'ils en tiennent compte, note-le dans `journal/ventes.md`.
