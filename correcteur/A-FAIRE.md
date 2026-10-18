# À faire avant la publicité (état au 18 octobre 2026)

## Fait
- Site en ligne sur burnthepile.com (FR/EN), Worker `correcteur-express`.
- Stripe en production : clé restreinte (Checkout Sessions en écriture), Radar Lite, taxes désactivées (petit fournisseur < 30 000 $).
- Webhook Stripe actif : `https://burnthepile.com/api/stripe-webhook` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`), secret `STRIPE_WEBHOOK_SECRET` dans Cloudflare.
- Clé d'accès inscrite sur le reçu Stripe ; E-mails clients → Paiements réussis activé en production.
- Achat avec code promo à 100 % crédité aussi.

## À vérifier
1. ~~Webhook~~ : vérifié, statut 200 (secret STRIPE_WEBHOOK_SECRET ajouté comme Secret dans le Worker).
2. Code `TESTPROF` : le désactiver, ou le garder (5 utilisations) pour des profs testeurs.
3. Stripe (production) : nom du compte et nom public « Brûle la pile », logo, langue des courriels en français.

Fait le 18 oct. : achat test avec code promo à 100 % → page de remerciement OK ; achat de 14 $ remboursé
(un remboursement ne retire pas les pages de la clé).

## Avant la publicité
5. brulelapile.ca : attendre « Active » dans Cloudflare (serveurs dora / trevor chez Hover), puis Worker → Domains → Add Domain
   (`brulelapile.ca` et `www.brulelapile.ca`). Ajouter aussi `www.burnthepile.com` si ce n'est pas fait.
6. Email Routing : `hello@burnthepile.com` et `bonjour@brulelapile.ca` → Gmail.
7. Base D1 (console), une seule fois, avant la première vraie vente :
   `DELETE FROM access_keys WHERE key IN (SELECT key FROM payments WHERE session_id LIKE 'cs_test_%'); DELETE FROM payments WHERE session_id LIKE 'cs_test_%';`
8. Gemini : facturation activée, ancienne clé (vue en photo) supprimée.
9. Cloudflare Workers Paid (~7 $ CA/mois).
10. Double authentification : Cloudflare, Stripe, Google, Hover.
11. Signer l'EFVP ; relecture des pages légales par un avocat.

## Ensuite (proposé)
- Annonces Facebook / Instagram (FR et EN).
