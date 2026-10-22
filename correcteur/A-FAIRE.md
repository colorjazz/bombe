# Brûle la pile / Burn the Pile — état au 18 octobre 2026

## En place
- Sites en ligne : brulelapile.ca (FR) et burnthepile.com (EN), Worker `correcteur-express`, plan Workers Paid.
- Stripe en production : clé restreinte (Checkout Sessions en écriture), Radar Lite, taxes désactivées (petit fournisseur < 30 000 $),
  nom « Brûle la pile » et logo, reçus activés (la clé d'accès figure sur le reçu).
- Webhook Stripe : `https://burnthepile.com/api/stripe-webhook`, secret `STRIPE_WEBHOOK_SECRET` (type Secret) dans le Worker, vérifié (200).
- Achat avec code promo à 100 % crédité ; achat réel testé puis remboursé (un remboursement ne retire pas les pages de la clé).
- Courriels : bonjour@brulelapile.ca et hello@burnthepile.com → Gmail (Email Routing), testés.
- Gemini : niveau Payant 1, recharge automatique, ancienne clé supprimée.
- EFVP signée.

## Tests d'enseignants (18 oct.) et correctifs
- 5 profils testeurs (français, univers social, sciences, anglais Ontario, direction / Loi 25) avec le vrai Gemini.
- Lot 1 : note finale fiable, copies illisibles non notées ni facturées, tentatives de manipulation signalées,
  2e correction par un autre modèle, sévérité sans corrigé, mode Rapide par défaut, CSV par question,
  virgule décimale, Échap, mobile, bibliothèques hébergées sur le site, nettoyage horaire des IP.
- Lot 2 : surlignages recalés sur l'encre (45-63 % → 86-96 % de cadres justes, voir tools/surlignages),
  ajout d'une faute oubliée, impression une feuille par page, réglages mémorisés.
- Lot 3 : option « Masquer le nom de l'élève », politique de confidentialité et conditions complétées.
- À faire : mettre à jour l'EFVP (Cloudflare, Google Fonts, durées, masquage des noms).

## 2e ronde de tests (19 oct., 9 vraies copies d'univers social)
- Notes : Isabelle (direction) 6/10, Marc-André (univers social) 7,5/10, Sylvie (français) 6,5/10.
- Notes de l'IA proches d'une application stricte du corrigé (écart moyen 0,9 point sur 19 avec l'évaluateur, 1,6 pour l'enseignant).
- Correctifs : redressement fiable (4 copies sur 9 étaient laissées à l'envers) et sans envoyer le nom ; n° de copie et fichier
  partout ; « Voir la copie » ; corrigé retenu ; remboursement sur erreur imprévue ; fin de session qui peut oublier la clé ;
  surlignages sur vraies photos (≈ 45 % → 68 %) ; catégories selon la grammaire du Québec ; zone masquée visible.
- Reste : surlignages sur écritures serrées ; colonnes CSV nommées selon le corrigé (Q4.1…) et sous-totaux par partie ;
  arrondi de la moyenne en mode approfondi ; choix de la langue des commentaires ; modèles « preview » (2e correction, langue) ;
  entente de traitement et résumé d'EFVP à fournir aux écoles.

## 3e mesure (19 oct., matin)
- Modèle stable gemini-3.7-flash : surlignages exacts à 81-82 % (vérité de terrain, 9 vraies copies), 2 % sur le mauvais mot.
- Deuxième lecture des fautes oubliées : repérage ≈ 73 % → ≈ 88 %, environ 1 fausse faute par copie (évaluation de Sylvie).
- Notes : Sylvie 8/10 (achèterait le pack Session après un essai réel), Isabelle 7/10, Marc-André 7,5/10.
- Isabelle ne montera qu'avec les documents : entente de traitement, preuve du palier payant Gemini, résumé d'EFVP,
  lettre aux parents, procédure d'incident (brouillons à préparer, relecture par un avocat).

## Point de reprise (19 oct., fin de journée)
- Langue : 1re lecture affichée tout de suite (~1 min/copie), puis en arrière-plan relecture des fautes oubliées
  (/api/language-reread, jeton signé 30 min) et loupe (/api/language-verify : mot recadré, recopié à l'aveugle ;
  s'il égale la correction → « à vérifier », jamais retiré). Modèle gemini-3.7-flash, réflexion normale
  (« low » = 2-3× plus de fausses fautes), limites de temps sur tous les appels.
- Redressement des photos : réflexion « low », 30 s max, 18/18.
- Mode caméra « Numériser « Brûle la pile » » (flamme) : s'ouvre en pause, bouton Démarrer/Pause, cibles aux coins,
  bip + vibration, correction pendant la prise de vue, geste « retour » = fermer la caméra.
  Testé seulement avec une caméra simulée : à essayer sur un vrai téléphone (seuils camera.js : MOVE, STABLE_MS).
- Mesures : vérité de terrain des surlignages (164 mots, 9 vraies copies) hors dépôt, dans le scratchpad de la session ;
  méthode dans tools/surlignages/README.md. Évaluations : Sylvie 8/10 (version à relecture), Isabelle 7/10, Marc-André 7,5/10.
- Documents Loi 25 (entente, attestation Gemini, résumé EFVP, lettre aux parents, procédure d'incident) : brouillons
  dans le document « Brûle la pile — Documents pour les écoles (Loi 25) » ; à compléter (crochets) et faire relire.
- À FAIRE PAR LE FONDATEUR : supprimer la clé Gemini temporaire dans AI Studio ; double authentification
  Cloudflare, Google, Hover, GitHub.
- Idées en attente : licence établissement / sauvegarde des corrigés (sans données d'élèves) ; clé affichée sur la
  page Stripe pour les commandes à 0 $ ; colonnes CSV Q4.1… et sous-totaux ; FAQ et pub du mode caméra.

## Reste à faire
1. Double authentification : Stripe, Cloudflare, Google, Hover, GitHub (garder les codes de secours).
2. Code promo `TESTPROF` : le désactiver, ou le garder (5 utilisations) pour des profs testeurs.
3. Relecture des pages légales par un avocat (recommandé).
4. Base D1 : si ce n'est pas fait, supprimer les achats du mode test :
   `DELETE FROM access_keys WHERE key IN (SELECT key FROM payments WHERE session_id LIKE 'cs_test_%'); DELETE FROM payments WHERE session_id LIKE 'cs_test_%';`

## Ensuite
- Campagne : vidéo (prompts Veo, mascotte Flammèche), annonces Facebook / Instagram FR et EN.
- Courriel à l'essai gratuit (mis de côté le 22 oct., l'essai reste en un clic) : courriel obligatoire, clé envoyée
  par courriel (Resend, secret RESEND_API_KEY), un essai par adresse (variantes +étiquette et points Gmail),
  adresses jetables refusées, politique de confidentialité à jour. Fait et testé en local sur la branche locale
  `courriel-local` (commit 5740154, non poussée : perdue si la session se ferme).
- Idée à évaluer : signaler les copies tapées qui ressemblent à un texte produit par l'IA (voir la discussion du 22 oct. :
  indices à montrer au prof, jamais un verdict ni un pourcentage).
