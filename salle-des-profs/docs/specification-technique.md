# Salle des profs : spécification technique

Version 0.1, 9 novembre 2026. Document de référence avant le développement. Les décisions marquées **[À trancher]** attendent une réponse.

## 1. Principes non négociables

1. **Les résultats, jamais les copies.** Aucune image de copie n'est conservée sur nos serveurs. Elles restent dans le navigateur, ou dans le OneDrive de l'enseignante.
2. **Les noms des élèves sont chiffrés dans le navigateur.** Le serveur ne connaît que des codes pseudonymes.
3. **Le nom n'est jamais envoyé à l'IA.** La zone du nom est masquée avant tout envoi.
4. **Deux circuits étanches.**
   - **Correction** (renseignements personnels) : IA à Montréal seulement, sans aucun repli ailleurs.
   - **Création** (aucun renseignement personnel) : n'importe quel modèle.
5. **L'IA propose, l'enseignante valide.** Aucun résultat n'est final sans validation humaine (article 12.1 de la Loi 25).
6. **Interface épurée, sans emoji**, dans l'esprit de Mozaïk-Portail.

## 2. Ce que la 1.0 apporte (branche `ccr-fa15538c-lda5fe`, dossier `correcteur/`)

| Élément de la 1.0 | Fichier | Dans la 2.0 |
|---|---|---|
| Prompt de correction (barème, grille, lisibilité, manipulation, commentaire varié, calibration) | `src/worker.js` : `buildPrompt`, `grade`, `snapToGrid`, `normalize` | Repris. On ajoute le lien question → critère → savoir et on retire la lecture du nom. |
| Correction de la langue (1re lecture, relecture, loupe), catégories du Québec | `worker.js` : `language`, `languageReread`, `languageVerify` | Repris. `pda.js` est remplacé par `donnees/pda-fra-primaire.json`. |
| Redressement des photos | `worker.js` : `orient`, `public/orient.js` | Repris tel quel |
| Masquage du nom (bande en haut de la copie) | `app.js` : `nameBand`, `maskName` | Repris, puis adapté à la zone du nom du gabarit imprimé |
| Séparation d'une pile en copies | `worker.js` : `split`, `app.js` : `detectCopies` | Remplacé par la lecture des QR, gardé en secours pour les copies sans QR |
| Grille détaillée, calibration | `rubric`, `readGrid`, `calibration` | Repris |
| Caméra, annotations | `camera.js`, `boxes.js` | Repris tels quels |
| Lecture de PDF, Word et HEIC dans le navigateur | `vendor/` (pdf.js, mammoth, heic2any) | Repris |
| Reconnaissance de texte locale (Tesseract, français) | `vendor/tesseract-5.1.1/` | Nouvel usage : proposer l'élève à partir du nom écrit, **dans le navigateur seulement** |
| Clés, solde de pages, Stripe, parrainage, admin | `worker.js`, `admin.html`, D1 | Repris. La clé devient le portefeuille d'un compte. |
| Bilinguisme | `i18n.js` | Repris |
| Vertex AI à Montréal | `vertexBase`, `vertexToken`, en-tête `X-Region: qc` | **Devient obligatoire** pour le circuit Correction |
| Documents Loi 25 (EFVP signée, entente, lettre aux parents, procédure d'incident) | Hors dépôt | À mettre à jour pour la 2.0 |

### Constats sur la 1.0

- **Par défaut, la 1.0 envoie les copies à Google AI Studio** (`generativelanguage.googleapis.com`), **sans garantie de pays**. Montréal n'est qu'une option.
- **Seul `gemini-3.5-flash` est offert à Montréal** (constat du 28 octobre 2026). Le modèle de la langue, `gemini-3.7-flash`, ne l'est pas. Mesure de la 1.0 sur 9 vraies copies : **75 %** de surlignages exacts à Montréal, contre **84 %** ailleurs.
- **`pda.js` contient des écarts avec la PDA officielle.** Exemple : « Accord de l'adjectif avec le nom » est noté maîtrisé en 4e, alors que la PDA le place en 3e (page 33, vérifié sur l'image).

## 3. Architecture

```
Navigateur (JS pur, sans compilation)
  - chiffrement des noms (WebCrypto), QR, PDF, PowerPoint, masquage du nom, Tesseract local
  - Microsoft Graph (OneDrive, dossier de l'application) appelé directement depuis le navigateur
        |
        v
Cloudflare Worker (point d'entrée unique, comme la 1.0)
  |-- D1 ............ facturation, clés et crédits, parrainage, admin, journal des coûts de l'IA
  |                   (aucune donnée d'élève)
  |-- Hyperdrive ---> Postgres Supabase, Montréal (ca-central-1), cache désactivé
  |                   comptes, groupes, élèves chiffrés, évaluations, résultats, journal d'accès
  |-- Vertex AI ----> northamerica-northeast1 (Montréal) : circuit Correction, sans repli
  |-- Gemini API ---> circuit Création seulement (aucune donnée d'élève)
  |-- AWS SES ------> ca-central-1 (Montréal) : courriels de connexion
  '-- Stripe ........ paiements (aucune donnée d'élève)
```

### Authentification

Deux méthodes :
- **« Se connecter avec Microsoft »** : application Entra multi-organisations. Permissions : `openid`, `profile`, `email`, `offline_access`, `Files.ReadWrite.AppFolder`.
- **Lien magique par courriel**, envoyé par SES à Montréal.

**[À trancher] Qui gère les comptes ?**
- **A. Supabase Auth** (recommandé) : il gère déjà les liens magiques, la connexion Microsoft et les sessions, avec un envoi SMTP par SES. Le Worker vérifie le jeton de Supabase. C'est moins de code à écrire et à sécuriser.
- **B. Notre propre code dans le Worker** : plus de contrôle, mais plus de travail et plus de risques.

### Le circuit Correction

- Une seule fonction d'appel à l'IA pour ce circuit, qui **refuse de s'exécuter** si la région n'est pas Montréal. Pas de modèle de secours hors région.
- Si Montréal est indisponible : message d'erreur, les pages sont rendues, et on réessaie plus tard.
- La qualité des surlignages à Montréal (75 %) se mesure avec `tools/surlignages` de la 1.0. On améliore les prompts, et on vérifie chaque mois si `gemini-3.7-flash` arrive à Montréal.

## 4. Modèle de données (Postgres à Montréal)

### Référentiel (public, sans renseignement personnel)

Chargé depuis `donnees/*.json`. Chaque ligne garde la version de la source.

| Table | Colonnes principales |
|---|---|
| `disciplines` | `code` (FRA, MAT…), `nom`, `ordre` |
| `competences` | `code` (FRA-ECRIRE…), `discipline`, `nom`, `ponderation_par_cycle`, `au_bulletin` |
| `criteres` | `code` (FRA-ECRIRE-CR2…), `competence`, `texte`, `au_bulletin` |
| `elements_critere` | `critere`, `texte`, `cycles`, `retroaction_seulement_cycles` |
| `savoirs` | `id` (FRA-ACC-042…), `discipline`, `competence`, `section`, `chemin`, `texte`, `prioritaire`, `progression` (1re à 6e) |

### Données des enseignantes

| Table | Colonnes principales | Remarque |
|---|---|---|
| `enseignants` | `id`, `auth_id`, `courriel`, `nom_affiche`, `langue`, `centre_services`, `cle_publique` (ECDH) | Le courriel est un renseignement personnel de l'enseignante, pas d'un élève |
| `coffres` | `enseignant`, `cle_maitre_par_phrase` (+ sel, paramètres), `cle_maitre_par_recuperation`, `cle_maitre_par_passkey` | Seulement des clés enveloppées, illisibles pour le serveur |
| `groupes` | `id`, `nom_chiffre`, `niveau`, `annee_scolaire`, `disciplines` | |
| `membres_groupe` | `groupe`, `enseignant`, `role` (titulaire, coenseignante, orthopédagogue, suppléante), `cle_groupe_enveloppee` | Partage d'un groupe sans que le serveur voie la clé |
| `eleves` | `id` (code aléatoire, par exemple 7F3A-K2), `groupe`, `nom_chiffre`, `actif` | |
| `evaluations` | `id`, `groupe`, `titre`, `discipline`, `competences`, `etape`, `date`, `bareme_total`, `grille`, `corrige_texte` | Le corrigé appartient à l'enseignante, sans renseignement d'élève |
| `questions` | `id`, `evaluation`, `numero`, `points_max`, `critere`, `savoirs[]` | Le lien qui alimente le tableau de bord |
| `copies` | `id`, `evaluation`, `eleve`, `statut` (imprimee, numerisee, corrigee, validee), `lisibilite`, `nb_pages`, `manipulation` | **Aucune image** |
| `resultats_question` | `copie`, `question`, `points_ia`, `points_valides`, `niveau`, `justification`, `valide_par`, `valide_le` | |
| `fautes_langue` | `copie`, `categorie`, `savoir`, `comptee` | Alimente les tendances de la classe |
| `commentaires` | `copie`, `texte_ia`, `texte_valide` | |
| `journal_acces` | `enseignant`, `action`, `objet`, `quand`, `empreinte_ip` | Exigé par la Loi 25 |

**Conservation (proposition, à valider dans l'EFVP) :**
- Résultats : jusqu'à la fin de l'année scolaire, plus un an, puis suppression.
- Journal d'accès : deux ans.
- Comptes inactifs : suppression après deux ans, avec avis par courriel.

**Contrôle d'accès :** chaque requête du Worker est filtrée par `enseignant` et par appartenance au groupe. On peut ajouter la sécurité au niveau des lignes de Postgres (RLS) comme seconde barrière.

## 5. Chiffrement des noms

| Élément | Choix |
|---|---|
| Clé maîtresse de l'enseignante | AES-GCM 256 bits, générée dans le navigateur |
| Phrase secrète vers clé | PBKDF2-SHA256, 600 000 itérations (natif dans WebCrypto). Argon2id en option plus tard. |
| Code de récupération | 128 bits aléatoires, affichés en groupes de 4 caractères, à imprimer |
| Passkey | Extension PRF de WebAuthn, si le navigateur la supporte |
| Clé de groupe | AES-GCM 256 bits, enveloppée par la clé maîtresse de chaque membre |
| Partage avec une collègue | ECDH P-256 : la clé de groupe est enveloppée pour la clé publique de la collègue |
| Copie dans OneDrive | Le code de récupération, enregistré dans le dossier de l'application |

**Compromis assumé :** la copie dans OneDrive est lisible par le centre de services, qui est déjà gardien des noms (Mozaïk). C'est acceptable, et c'est ce qui permet de récupérer une phrase oubliée.

**Importation des listes :** un fichier CSV de Mozaïk ou de GPI est lu et chiffré dans le navigateur. Le fichier n'est jamais envoyé tel quel.

## 6. Flux de correction

1. **Créer l'évaluation** : questions, points, critère et savoirs pour chaque question. L'IA peut proposer les liens, l'enseignante confirme.
2. **Imprimer** : un PDF généré dans le navigateur, une copie par élève. Chaque page porte un QR (`evaluation`, `eleve`, `page`), la zone du nom est à une position fixe et le nom de l'élève est imprimé dessus.
3. **Numériser** : la caméra de la 1.0 ou un PDF du photocopieur.
4. **Trier** : le navigateur lit les QR (BarcodeDetector, ou jsQR en secours), associe chaque page à l'élève, et signale les pages manquantes.
5. **Masquer** la zone du nom.
6. **Corriger** : le Worker envoie à Vertex AI à Montréal le corrigé, la grille et les pages masquées.
7. **Valider** :
   - **question par question** (la question 3 de tous les élèves à la suite) ou **copie par copie** ;
   - **barème dynamique** : changer la valeur d'un critère recalcule les copies déjà corrigées ;
   - à la fin, les résultats sont enregistrés et les images sont effacées du navigateur, ou copiées dans OneDrive au choix.

**Copies sans QR** (feuilles mobiles, anciens examens) : comme dans la 1.0, la pile est séparée en copies. Tesseract lit le nom **dans le navigateur** et propose l'élève correspondant dans la liste déchiffrée. L'enseignante confirme. Le nom ne quitte jamais l'appareil.

## 7. Tableau de bord (Observer)

- **Par élève :** la moyenne par critère et par compétence, pondérée par étape, et les savoirs maîtrisés ou à revoir selon la PDA de son année.
- **Par groupe :** la répartition en quatre niveaux par compétence, et les tendances (« 14 élèves sur 24 confondent -er et -é »).
- **Lien vers Créer :** chaque tendance mène à une activité de récupération ciblée sur le savoir concerné.
- **Exportation :** Excel au format d'importation de Mozaïk, si ce format est confirmé (voir la tâche Gemini 06).

## 8. Sécurité

- En-têtes de sécurité stricts (CSP, HSTS), cookies `HttpOnly`, `Secure` et `SameSite`.
- Aucun contenu de copie dans les journaux de Cloudflare (déjà le cas dans la 1.0).
- Limites de requêtes par compte.
- Révision de sécurité avant chaque mise en ligne majeure.
- Double authentification sur tous les comptes administratifs (déjà à faire pour la 1.0).

## 9. Jalons de la première version

| Jalon | Contenu | Dépend de |
|---|---|---|
| J1. Socle | Supabase à Montréal, Hyperdrive, chargement du référentiel, comptes (lien magique) | Décision sur l'authentification |
| J2. Coffre et groupes | Phrase secrète, code de récupération, importation CSV chiffrée, élèves | J1 |
| J3. Évaluation imprimable | Questions liées aux critères et aux savoirs, PDF avec QR et zone du nom | J2 |
| J4. Correction | Tri par QR, masquage, Vertex à Montréal sans repli, validation question par question | J3, code de la 1.0 |
| J5. Résultats | Enregistrement, barème dynamique, exportation Excel | J4 |
| J6. Microsoft | Connexion Microsoft, OneDrive, vérification d'éditeur | Entreprise enregistrée |
| J7. Observer | Tableau de bord par élève et par groupe, tendances | J5 |

## 10. Questions ouvertes

1. **Authentification :** Supabase Auth (A) ou notre propre code (B) ? Recommandation : A.
2. **Qualité à Montréal :** 75 % de surlignages exacts au lieu de 84 %. Est-ce acceptable au lancement, en améliorant les prompts ?
3. **La 1.0 continue-t-elle ?** Recommandation : oui, comme correcteur rapide sans compte, avec le même cœur de correction. Le traitement à Montréal deviendrait aussi son réglage par défaut.
4. **Modèle d'affaires de la 2.0 :** à la page, comme la 1.0, ou abonnement ?
5. **Code partagé :** un seul Worker pour la 1.0 et la 2.0, ou deux Workers qui partagent un module de correction ?
