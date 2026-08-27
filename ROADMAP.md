# Golden Market — Feuille de route vers la production

Document de planification — complète `ARCHITECTURE.md` (décisions structurantes) en
découpant le travail restant en phases exécutables. À mettre à jour au fil de
l'avancement (cocher/rayer, ajuster si une phase change de périmètre).

## Périmètre retenu pour le lancement (MVP)

Décisions prises le 2026-08-16 :

- **MVP resserré** : storefront + paiement Orange Money manuel + catalogue géré à la
  main dans l'admin Medusa. La synchronisation automatisée vers `public.products` (n8n)
  et le bouton "Commander via WhatsApp" (voir `ARCHITECTURE.md`) sont **différés en
  post-lancement**, pas requis pour ouvrir la boutique.
- **Hébergement production : VPS + Docker**, auto-hébergé (cohérent avec l'infra
  existante de `n8n_automation`), pas de Medusa Cloud / Vercel.
- **Pas de date de lancement fixe** — la qualité prime sur la vitesse ; les phases 4
  (tests/CI) et 5 (vérification) ne sont pas sacrifiées.
- **Notification marchand** (nouvelle commande) : webhook n8n → WhatsApp, pas d'email.
- **Notification client** (confirmation de commande, réinitialisation de mot de passe) :
  provider email Medusa (Resend ou SMTP) — actuellement absent de `medusa-config.ts`,
  donc ces flux sont cassés en l'état.

## Phase 0 — Débloquer le paiement manuel Orange Money

Travail déjà entamé (fichiers non commités), à finaliser en premier car rien d'autre
n'est testable sans un paiement fonctionnel.

- [ ] **Bug bloquant** : `apps/backend/src/modules/orange-money-manual.ts` contient deux
      `export default` (la classe `OrangeMoneyManualService` ligne 45, et
      `ModuleProvider(...)` ligne 121) — invalide en TS/JS, ne compilera pas. Renommer
      l'export de la classe en export nommé et ne garder qu'un seul `export default`.
- [ ] Afficher les instructions Orange Money sur la page de confirmation de commande,
      pas seulement au checkout : `apps/storefront/src/modules/order/components/payment-details/index.tsx`
      n'utilise aujourd'hui que `paymentInfoMap` (titre/icône) et `isStripeLike` — ajouter
      le même traitement `isOrangeMoney` que dans
      `apps/storefront/src/modules/checkout/components/payment/index.tsx` pour réafficher
      numéro/nom/montant après passage de commande.
- [ ] `apps/backend/src/subscribers/order-placed.ts` : remplacer le simple `logger.info`
      par un appel au webhook n8n existant (notification marchand WhatsApp). Récupérer
      l'URL du webhook n8n et la stocker en variable d'environnement backend
      (`.env.template` à documenter).
- [ ] Configurer un module `notification` dans `medusa-config.ts` (absent actuellement) :
      provider Resend ou SMTP, pour la confirmation de commande client et la
      réinitialisation de mot de passe.
- [ ] Vérifier de bout en bout : commande passée → session de paiement Orange Money →
      commande `pending` → capture manuelle dans l'admin → statut `paid`.

## Phase 1 — Catalogue & région Burkina Faso

Implémentation complétée le 2026-08-16 via deux scripts d'import idempotents :
`apps/backend/src/scripts/seed-region-bf.ts` et `apps/backend/src/scripts/import-catalog.ts`.

- [x] Créer/seed la région Burkina Faso (`bf`, devise `xof`).
- [ ] Retirer ou neutraliser les régions/produits de démo Europe (T-Shirt, Sweatpants,
      Shorts, Sweatshirt du scaffold initial) — actuellement toujours visibles dans le
      catalogue storefront aux côtés des 29 produits réels.
- [x] `apps/storefront/.env.local` : `NEXT_PUBLIC_DEFAULT_REGION=bf` (actuellement absent
      du fichier, donc le middleware retombe sur le défaut `dk`, cf.
      `apps/storefront/src/middleware.ts`).
- [x] Vérifier que la clé publishable est bien liée au *Default Sales Channel* utilisé par
      la région BF (piège déjà documenté dans `ARCHITECTURE.md` : sinon `GET /store/products`
      renvoie 0 produit).
- [x] **Importer le catalogue réel via un script d'import** (décision révisée le
      2026-08-16 — remplace la saisie manuelle prévue initialement). Source :
      `Golden Market - Catalogue des produits.xlsx` (`apps/backend/src/scripts/catalog-import/`,
      committé dans le dépôt) — 2 feuilles, ~29 produits réels, 29 images intégrées au fichier :
      - **« Produits en vente express »** (~22 produits) → collection Medusa
        « Vente express ».
      - **« Produits en vente sur commande »** (~7 produits) → collection Medusa
        « Vente sur commande ».
      - Chaque produit a un prix détail et un prix de gros : prix détail = prix Medusa
        standard ; prix de gros = règle de prix sur le variant (`rules: { "customer.groups.id":
        ... }`), réservée au customer group « Grossistes » — **pas** une `PriceList` Medusa
        (`GET /admin/price-lists` renvoie vide, vérifié en Task 6). Voir avertissement dans
        `HANDOFF.md` (Phase 1) sur les dangers de ce choix côté admin.
      - Images : extraites du fichier xlsx (images intégrées, pas d'URL externe) et
        uploadées en tant que média produit.
      - À traiter comme un plan dédié après la Phase 0 (ne pas mélanger avec le paiement
        Orange Money / notifications).

## Phase 1.5 — Refonte visuelle du storefront

Réalisée le 2026-08-24/27, hors périmètre initial de ce document (les phases 0-5 ci-dessus
ciblaient le lancement fonctionnel, pas l'identité visuelle). Statut global : **fait**.

- [x] Spec de design validée par brainstorming (palette violet/or, typographie Baloo 2 + Inter,
      bibliothèque de composants, description page par page) :
      `docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`.
- [x] 4 plans exécutés via `subagent-driven-development`, chacun revu puis mergé sur `main` :
      Fondation (tokens/composants partagés), Accueil/Catalogue/Fiche produit, Panier/Paiement,
      Compte. Plans détaillés dans `docs/superpowers/plans/2026-08-24-storefront-redesign-*.md`.
- [x] Branding Medusa résiduel retiré (footer, composant `MedusaCTA`, icône), storefront traduit
      intégralement en français (hors Profil/Adresses/Commandes, hors périmètre des 4 plans).
- [x] Accessibilité clavier du composant `Chip` (converti `span` → `button`).
- [x] Vraie taxonomie de catégories : les 4 catégories de démo Medusa (Shirts/Sweatshirts/
      Merch/Pants, vides) remplacées par 6 catégories construites à partir du vrai catalogue
      (script idempotent `seed:categories-bf`, voir section Catalogue ci-dessus).
- [x] 3 bugs réels trouvés par vérification visuelle sur un backend réel (jamais détectables par
      `npm run build` seul) : ordre d'import CSS cassant le dev Turbopack, 500 sur un handle
      produit accentué (non décodé), chevauchement de texte dans le footer mobile.

**Point ouvert non résolu** : le contenu de l'onglet « Livraison et retours » de la fiche
produit (délais, politique d'échange/retour) est une traduction du texte de démo Medusa
d'origine, pas une politique vérifiée auprès du propriétaire — à relire avant lancement si les
délais/conditions réels diffèrent. Ce texte est codé en dur côté storefront (pas éditable
depuis l'admin Medusa, comme la quasi-totalité du texte de marque/UI du site).

## Phase 2 — Durcissement sécurité

Statut global : **fait**

- [x] Secrets de production distincts des valeurs de `.env.template`
      (`JWT_SECRET=supersecret`, `COOKIE_SECRET=supersecret` sont des valeurs de dev à ne
      jamais réutiliser en prod) — générer des secrets aléatoires forts. Désormais imposé
      par un garde-fou de démarrage (`assertProductionConfig`, appelé depuis
      `medusa-config.ts`) qui fait échouer le boot en production si un secret est absent,
      égal à la valeur de dev ou trop court (< 32 caractères), pas seulement documenté.
- [x] `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` restreints aux domaines réels de
      production (actuellement `localhost` + domaines Medusa dans le template). Désormais
      imposé par le même garde-fou de démarrage (`assertProductionConfig`) : le boot en
      production échoue si l'une de ces variables contient `localhost`, pas seulement
      documenté.
- [x] Compte admin dédié en prod, mot de passe fort — ne pas réutiliser
      `admin@golden-market.co` / mot de passe de dev mentionné dans `ARCHITECTURE.md`.
      Déjà couvert, aucun code requis : documenté dans `ARCHITECTURE.md` ligne 64 et fait
      partie de la procédure de déploiement listée en Phase 3 ci-dessous.
- [x] Revalider que `.env` / `.env.local` de production suivent la même hygiène qu'en dev
      (jamais commités — déjà correctement configuré dans `.gitignore`). Déjà couvert,
      vérifié pendant ce plan : aucun code requis.
- [x] Limiter le débit (rate limiting) de l'endpoint public
      `POST /auth/customer/emailpass/reset-password` — non authentifié, répond
      toujours 201 (comportement Medusa voulu pour ne pas révéler l'existence d'un
      compte), et déclenche un email sortant à chaque appel : vecteur
      d'amplification/abus une fois une vraie clé Resend configurée. Implémenté via un
      middleware Medusa (`apps/backend/src/api/middlewares.ts` et
      `apps/backend/src/api/middlewares/rate-limiter.ts`) qui limite à 5 requêtes / 15
      minutes par IP, en s'appuyant sur le module cache Redis déjà en place (pas de
      nouvelle dépendance).

## Phase 3 — Déploiement VPS + Docker

- [ ] Dockerfile production pour `apps/backend` (`medusa build` puis `medusa start`).
- [ ] Dockerfile production pour `apps/storefront` (`next build` puis `next start`).
- [ ] `docker-compose` de production (ou intégration au VPS existant aux côtés de
      `n8n_automation`) — Postgres/Redis managés ou conteneurisés selon ce que l'infra
      VPS supporte déjà.
- [ ] Reverse proxy + TLS (Let's Encrypt) devant backend et storefront.
- [ ] Procédure de déploiement : migrations (`medusa db:migrate`), création du user admin,
      variables d'environnement de prod.
- [ ] Sauvegardes Postgres (dump périodique automatisé, a minima un cron).

## Phase 4 — Tests & CI minimale

Actuellement : aucun test métier écrit (seul `integration-tests/setup.js` boilerplate),
aucune CI.

- [ ] Test d'intégration HTTP sur le parcours critique : panier → checkout → session de
      paiement Orange Money → commande créée (`apps/backend/integration-tests/http/`).
- [ ] Test unitaire sur `OrangeMoneyManualService`
      (`apps/backend/src/modules/__tests__/` ou équivalent — vérifier la convention Jest
      du projet, cf. `test:unit` dans `AGENTS.md`).
- [ ] CI GitHub Actions : lint + test sur chaque pull request.

## Phase 5 — Vérification pré-lancement

- [ ] Parcours client complet rejoué en environnement proche de la production (staging ou
      VPS avant bascule DNS finale).
- [ ] Vérification du traitement de commande côté admin : capture manuelle du paiement,
      changement de statut, notification n8n reçue.
- [ ] Vérification des emails transactionnels réels (confirmation de commande,
      réinitialisation de mot de passe) avec le provider configuré en phase 0.
- [ ] Valider le contrat exact du payload envoyé au webhook n8n
      (`N8N_ORDER_WEBHOOK_URL`) contre le workflow réel du dépôt `n8n_automation` —
      actuellement seul `{ order_id, provider }` est envoyé, jamais confronté au
      format attendu côté n8n.

## Phase différée (post-lancement)

Hors périmètre du lancement, à reprendre une fois la boutique ouverte :

- Synchronisation catalogue Medusa → `public.products` (workflow n8n périodique, décrit
  dans `ARCHITECTURE.md`).
- Bouton "Commander via WhatsApp" (message `wa.me` prérempli depuis le panier).
- Migration du catalogue de la base `golden_market.public.products` (source n8n/WhatsApp)
  vers Medusa via Admin API — distinct de l'import du fichier Excel traité en Phase 1 ;
  à évaluer si cette base contient des produits/données absents du fichier Excel.
- Migrer le tarif de gros (actuellement une règle de prix sur le variant, voir Phase 1)
  vers une vraie `PriceList` Medusa : gérable depuis l'admin et ne serait plus supprimée
  silencieusement par une modification de prix faite depuis l'admin (voir avertissement
  dans `HANDOFF.md`, Phase 1) — différé car la solution actuelle fonctionne côté storefront.
- Nettoyage des TODOs hérités du template storefront (Toaster de notifications,
  mise à jour email/mot de passe du compte client, gestion de l'inventaire v2 dans
  `apps/storefront/src/modules/cart/components/item/index.tsx`).

## Prochaine étape

Phases 0, 1, 1.5 et 2 terminées. Passer la Phase 3 (déploiement VPS + Docker) dans le skill
`writing-plans` pour produire un plan d'implémentation détaillé (fichiers exacts, ordre des
changements, critères de vérification).
