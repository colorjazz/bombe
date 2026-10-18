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

## Reste à faire
1. Double authentification : Stripe, Cloudflare, Google, Hover, GitHub (garder les codes de secours).
2. Code promo `TESTPROF` : le désactiver, ou le garder (5 utilisations) pour des profs testeurs.
3. Relecture des pages légales par un avocat (recommandé).
4. Base D1 : si ce n'est pas fait, supprimer les achats du mode test :
   `DELETE FROM access_keys WHERE key IN (SELECT key FROM payments WHERE session_id LIKE 'cs_test_%'); DELETE FROM payments WHERE session_id LIKE 'cs_test_%';`

## Ensuite
- Campagne : vidéo (prompts Veo, mascotte Flammèche), annonces Facebook / Instagram FR et EN.
