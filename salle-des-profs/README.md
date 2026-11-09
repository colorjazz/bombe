# Salle des profs

Plateforme québécoise pour les enseignantes et enseignants du primaire et du secondaire : planifier, créer, évaluer, observer. Spécialité : la correction d'épreuves manuscrites, conforme à la Loi 25, avec des données hébergées au Québec.

Évolution de Brûle la pile 1.0 (branche `ccr-fa15538c-lda5fe`, dossier `correcteur/`).

## Contenu

| Dossier | Contenu |
|---|---|
| `docs/` | Liste de vérification : décisions, architecture, Loi 25, pitch, phases |
| `donnees/` | Programme de formation en JSON : PDA et cadres d'évaluation |
| `outils/` | Scripts d'extraction des PDF du Ministère |
| `maquettes/` | Maquettes de l'interface |
| `gemini/` | Prompts pour Gemini et leurs résultats |

## Données du programme

| Fichier | Contenu |
|---|---|
| `pda-fra-primaire.json` | 1 188 savoirs, progression de la 1re à la 6e année, contenu prioritaire |
| `pda-mat-primaire.json` | 199 savoirs par domaine |
| `cadre-fra-primaire.json` | Compétences, critères, pondérations par cycle |
| `cadre-mat-primaire.json` | Compétences, critères, pondérations par cycle |

Progression : `apprentissage` (flèche), `maitrise` (étoile), `reinvestissement` (case bleue), `null` (vide).

Sources : documents officiels du ministère de l'Éducation du Québec (Progression des apprentissages, 2009-2011 ; Cadres d'évaluation, 2011-04-21).

## Extraire une nouvelle discipline

```bash
python3 -I outils/extraire_pda.py PDA.pdf CODE "Discipline" primaire donnees/pda-code-primaire.json
```

Le script lit la structure du PDF : images des flèches et des étoiles, rectangles bleus, police grasse, retrait du texte. Les pages où les symboles sont intégrés dans une grande image sont signalées (`a_verifier`) ; on les fait lire visuellement par Gemini (voir `gemini/04-pda-fra-verification-images.txt`), puis on intègre avec contrôle croisé :

```bash
python3 -I outils/integrer_verification.py PDA.pdf donnees/pda.json reponse_gemini.json donnees/pda.json
```

Une ligne de Gemini est acceptée seulement si ses cases bleues et ses flèches concordent avec le PDF et si sa séquence est logique.

Dépendances : `pdfplumber`, `pypdfium2`, `Pillow`.

## Remarque

`gemini/resultats/pda-mat-primaire-partie1-OBSOLETE.json` est une première tentative de Gemini par recherche web. Sa progression est erronée ; ne pas l'utiliser.

## Branches et déploiement

- `main` contient la 1.0 (`correcteur/`) et la 2.0 (`salle-des-profs/`).
- Le Worker `correcteur-express` (1.0) est déployé par Cloudflare depuis `main`, dossier racine `/correcteur`.
- Le travail de la 2.0 se fait sur la branche `salle-des-profs`, fusionnée dans `main` à chaque étape terminée.
- L'ancienne branche de la 1.0, `ccr-fa15538c-lda5fe`, est gardée comme filet de sécurité.
