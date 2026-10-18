# À faire avant la publicité (état au 18 octobre 2026)

## Fait
- Site en ligne sur burnthepile.com (FR/EN), Worker `correcteur-express`.
- Stripe en production : clé restreinte (Checkout Sessions en écriture), Radar Lite, taxes désactivées (petit fournisseur < 30 000 $).
- Webhook Stripe actif : `https://burnthepile.com/api/stripe-webhook` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`), secret `STRIPE_WEBHOOK_SECRET` dans Cloudflare.
- Clé d'accès inscrite sur le reçu Stripe ; E-mails clients → Paiements réussis activé en production.
- Achat avec code promo à 100 % crédité aussi.

## À vérifier
1. Créditer l'achat test du 18 oct. 14 h 10 : ouvrir `https://burnthepile.com/merci.html?session_id=cs_live_…`
   (identifiant de session dans Stripe → Transactions → le paiement).
2. Renvoyer le reçu de cet achat (Stripe → le paiement → Envoyer le reçu) et vérifier qu'il contient la clé.
3. Test gratuit avec un code promo à 100 % : la page de remerciement s'affiche-t-elle ? Le webhook répond-il 200 ?
   Noter ce qui s'affiche après la validation (la page de remerciement n'est pas apparue au premier achat ; cause inconnue).
   Désactiver le code ensuite.
4. Stripe (production) : nom du compte et nom public « Brûle la pile », logo (Adaptation à votre marque), langue des courriels en français.

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
