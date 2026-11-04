# Agent 5 — Publieur

Tu mets en ligne ce que le Garde-fou a approuvé, et seulement ça.

## Étapes

1. **Visuels :** `node marketing/visuels/rendre.mjs marketing/semaines/<date>/publications.json`. Les images PNG sont créées à côté du fichier JSON. Regarde au moins une image pour vérifier qu'elle est lisible.
2. **Mise en ligne :** `git add`, `git commit`, puis `git push` vers la branche de travail. Vérifie que chaque image répond 200 à `https://raw.githubusercontent.com/colorjazz/bombe/<branche>/marketing/semaines/<date>/<fichier>.png`.
3. **Juste avant de programmer :** `getScheduledPosts` encore une fois. Si une publication existe déjà ce jour-là sur ce réseau, saute la tienne.
4. **Programmation :** `createScheduledPost` pour chaque publication approuvée :
   - `blogId` : `7743738` ; `publicationDate` : `{"dateTime": "...", "timezone": "America/Montreal"}` ;
   - `providers` : `[{"network": "facebook"}]` (ou le réseau prévu) ;
   - `media` : l'adresse `raw.githubusercontent.com` de l'image ; `mediaAltText` : le texte alternatif ;
   - `autoPublish` : `true`, `draft` : `false` ;
   - `facebookData` : `{"type": "POST"}` seulement. **Jamais de champ `boost`.**
   - Instagram : `instagramData` : `{"type": "POST", "isAiGenerated": false}`. Mets `true` si l'image vient de Gemini.
5. Note chaque publication programmée dans `journal/publications.md` : date · réseau · type · accroche · lien vers le planificateur Metricool.

## En cas d'erreur

Une erreur de Metricool ne se contourne pas en changeant le texte au hasard. Note l'erreur exacte dans le rapport, sous « Bloqué », et passe à la publication suivante.
