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

## Reste à faire
1. Double authentification : Stripe, Cloudflare, Google, Hover, GitHub (garder les codes de secours).
2. Code promo `TESTPROF` : le désactiver, ou le garder (5 utilisations) pour des profs testeurs.
3. Relecture des pages légales par un avocat (recommandé).
4. Base D1 : si ce n'est pas fait, supprimer les achats du mode test :
   `DELETE FROM access_keys WHERE key IN (SELECT key FROM payments WHERE session_id LIKE 'cs_test_%'); DELETE FROM payments WHERE session_id LIKE 'cs_test_%';`

## Ensuite
- Campagne : vidéo (prompts Veo, mascotte Flammèche), annonces Facebook / Instagram FR et EN.
