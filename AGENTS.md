# AGENTS.md

## Overview

Medusa DTC Starter — a Turborepo workspace monorepo containing a Medusa backend (`@medusajs/medusa` latest, Node 20+, PostgreSQL 15+) and an optional storefront (Next.js, Tanstack, etc...).

## Directory Structure

```text
.
├── apps/
│   ├── backend/                  # Medusa application (@dtc/backend)
│   │   ├── medusa-config.ts      # Medusa config: DB URL, CORS, secrets, modules
│   │   ├── integration-tests/    # setup.js (Jest setupFiles) and http/*.spec.ts suites
│   │   └── src/
│   │       ├── admin/            # Admin dashboard extensions (widgets/, i18n/, routes)
│   │       ├── api/              # API routes: api/store/*, api/admin/* (file-based)
│   │       ├── jobs/             # Scheduled jobs
│   │       ├── links/            # Module links between modules
│   │       ├── migration-scripts/# Data migration scripts (e.g. initial-data-seed.ts)
│   │       ├── modules/          # Custom modules (service + models + migrations)
│   │       ├── subscribers/      # Event subscribers
│   │       └── workflows/        # Workflows and workflow steps
│   └── storefront/               # OPTIONAL storefront
├── eslint.config.ts              # Root ESLint: @medusajs/eslint-plugin recommended
├── turbo.json                    # Task graph: build, dev, start, lint, test, seed
```

**`apps/storefront` is optional and may not exist.** It is skipped when the user chooses not to install it. Before running any storefront command, referencing storefront files, or assuming a full-stack change is possible, check that `apps/storefront/` exists. If it doesn't, the project is backend-only — do not scaffold it or suggest it was deleted by mistake.

Each app can have its own nested `AGENTS.md`; agents read the nearest one in the directory tree, so put app-specific context there rather than expanding this file.

## Package Manager

**The package manager is chosen at install time and is not fixed.** Detect it before running anything, in this order:

1. The `packageManager` field in the root `package.json` (e.g. `"pnpm@10.11.1"`) — authoritative when present.
2. The lockfile at the repo root: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm.

```bash
node -p "require('./package.json').packageManager ?? 'unset'"
ls pnpm-lock.yaml yarn.lock package-lock.json bun.lock bun.lockb 2>/dev/null
```

Use that manager for every command and never introduce a second lockfile. Below, `<pm>` means the detected manager. The `<pm> run <script>` and `<pm> exec <bin>` forms work across npm, pnpm, yarn, and bun; workspace-filter flags do not, so the per-app commands below `cd` into the app instead.

## Commands

Run from the repo root unless noted. Turbo skips missing apps automatically.

### Development

```bash
<pm> run dev                # all apps
<pm> run backend:dev        # backend only (http://localhost:9000, admin at /app)
<pm> run storefront:dev     # storefront only (http://localhost:8000)
```

### Build

```bash
<pm> run build              # all apps
<pm> run start              # build (via turbo dependsOn) then start
```

### Lint

```bash
<pm> run lint                          # all apps via turbo
cd apps/backend && <pm> run lint       # medusa lint
cd apps/storefront && <pm> run lint    # next lint
```

### Test (backend only; the storefront has no test suite)

```bash
<pm> run test                                              # all test tasks via turbo
cd apps/backend && <pm> run test:unit                      # **/src/**/__tests__/**/*.unit.spec.ts
cd apps/backend && <pm> run test:integration:modules       # **/src/modules/*/__tests__/**
cd apps/backend && <pm> run test:integration:http          # **/integration-tests/http/*.spec.ts
cd apps/storefront && <pm> run test:e2e                    # Playwright, apps/storefront/e2e/*.spec.ts
```

`test:e2e` (Playwright, navigateur réel) cible un storefront + backend déjà démarrés (voir
`apps/storefront/playwright.config.ts` - pas de `webServer` : la stack a besoin de Postgres/
Redis + Medusa en plus de Next.js, hors du périmètre que Playwright peut démarrer seul).
`PLAYWRIGHT_BASE_URL` permet de cibler un autre environnement (défaut `http://localhost:8002`).

Single test — pass a path/pattern through to Jest, keeping `TEST_TYPE`:

```bash
cd apps/backend && <pm> run test:unit -- src/modules/foo/__tests__/service.unit.spec.ts
cd apps/backend && <pm> run test:unit -- -t "returns the cart"
```

### Database

```bash
cd apps/backend
<pm> exec medusa db:generate <module-name>   # generate migrations for a custom module
<pm> exec medusa db:migrate                  # run migrations
<pm> exec medusa user -e admin@test.com -p supersecret
<pm> run backend:seed                        # from root; seeds initial data
```

### Catalogue Burkina Faso (one-shot, idempotent)

```bash
cd apps/backend
<pm> run seed:region-bf       # région BF/XOF, taxe, livraison (medusa exec ./src/scripts/seed-region-bf.ts)
<pm> run import:catalog       # 29 produits depuis le fichier Excel (medusa exec ./src/scripts/import-catalog.ts)
<pm> run seed:categories-bf   # 6 catégories réelles + rattachement des 29 produits (medusa exec ./src/scripts/seed-categories-bf.ts)
```

Les trois scripts sont ré-exécutables sans risque de doublon (vérification par nom/titre avant création). `seed:categories-bf` doit tourner après `import:catalog` (il rattache les produits par handle) ; il supprime aussi les catégories de démo Medusa (Shirts/Sweatshirts/Merch/Pants) si elles sont encore vides.

`apps/storefront/.env.local` (gitignored, jamais commité) doit définir `NEXT_PUBLIC_DEFAULT_REGION=bf` pour que le storefront serve la région Burkina Faso par défaut — sans cette variable, il retombe silencieusement sur la région de démo `dk` (Danemark, prix EUR). Voir `apps/storefront/check-env-variables.js`, qui échoue désormais au démarrage si elle est absente.

### Recherche sémantique produits (one-shot, idempotent, requiert pgvector)

```bash
cd apps/backend
<pm> run search:create-embedding-schema   # extension pgvector + table product_embedding + index HNSW
<pm> run search:backfill-embeddings       # embarque les produits publiés sans embedding à jour (OPENAI_API_KEY requise)
```

Ces deux scripts ne sont **pas** joués automatiquement par `medusa db:migrate` ni par les workflows de déploiement — nécessaires sur tout environnement (nouvelle machine de dev, nouveau volume Postgres, nouvel environnement de staging) qui n'a jamais reçu ces schémas, sans quoi le subscriber d'embeddings logue une erreur à chaque sauvegarde produit et la route `/store/products-semantic-search` répond 500. Nécessite l'extension Postgres `pgvector` disponible sur l'image utilisée par `docker-compose.yml`/`docker-compose.prod.yml` (absente de l'image `postgres:16-alpine` par défaut au moment d'écrire cette entrée). Voir `docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md`.

### Frais d'expédition par produit (one-shot, idempotent)

```bash
cd apps/backend
<pm> run setup:calculated-shipping   # remplace l'option de livraison à 0 F par l'option calculée (fournisseur golden-market-shipping)
```

À lancer une fois par environnement **après** le déploiement du backend qui enregistre le fournisseur
`golden-market-shipping` (`medusa-config.ts`). Frais : gratuits à Ouagadougou ; ailleurs, le
maximum de `product.metadata.frais_expedition_xof` des produits du panier (1 000 F par défaut, `DEFAULT_SHIPPING_FEE_XOF`, depuis le 2026-10-06),
saisi dans l'encadré « Frais d'expédition » de la fiche produit. Voir
`docs/superpowers/specs/2026-10-04-frais-expedition-par-produit-design.md`.

### Téléphone comme identifiant principal du compte client

Le téléphone est l'identifiant d'authentification principal (obligatoire à
l'inscription), l'email est facultatif — voir
`docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md`.
Nouveau provider de vérification Medusa `whatsapp-otp`
(`apps/backend/src/modules/whatsapp-otp-verification.ts`, code à 6 chiffres,
livré par le webhook n8n existant). **Nécessite le template Meta
`account_verification_code` approuvé** pour fonctionner en conditions
réelles - sans lui, le code est généré et stocké côté backend mais jamais
livré au client.

**Non traité, limite connue et documentée** : réinitialisation de mot de
passe pour un compte inscrit uniquement par téléphone (le subscriber
`auth-password-reset.ts` traite l'identifiant comme un email et échoue
silencieusement sinon).

**Override du core route Medusa `POST /store/carts/:id/complete`**
(`apps/backend/src/api/store/carts/[id]/complete/route.ts`) — le fichier le
plus sensible de cette fonctionnalité : c'est le point d'entrée de **toute**
commande passée sur le store, invité ou non. Reproduit le core route à
l'identique (voir le fichier lui-même dans
`node_modules/@medusajs/medusa/dist/api/store/carts/[id]/complete/route.js`,
version `@medusajs/medusa` `2.18.0` au moment où cet override a été écrit,
pinnée dans `package.json` sans caret exprès pour limiter le risque de
divergence silencieuse à la mise à jour) à l'exception d'un bloc additif :
pour une commande invité uniquement, génère et attache un jeton de création
de compte à usage unique (`apps/backend/src/lib/order-registration-token.ts`)
consommé par `/store/register-from-order`. **À chaque montée de version de
`@medusajs/medusa`, rediffer ce fichier contre le nouveau core route avant
de mettre à jour le pin** — un changement de comportement du core (gestion
d'erreur de paiement, format de réponse) ne sera jamais reçu automatiquement
puisque ce fichier prend le dessus sur celui du package.

### Conversations WhatsApp dans l'admin (lecture + reprise manuelle, production uniquement)

La page `/app/whatsapp-conversations` lit directement la base `golden_market` (propriété du dépôt `n8n_automation`) via `WHATSAPP_CHAT_DATABASE_URL` (rôle Postgres `medusa_whatsapp_reader`, **lecture seule** : Medusa n'écrit jamais dans cette base). Toute action (prendre/rendre la main, répondre, relancer) passe par le webhook n8n `Admin - actions conversation` (`N8N_ADMIN_ACTIONS_WEBHOOK_URL` + `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET`, même secret côté n8n) : n8n reste le seul écrivain de la base et le seul détenteur du jeton WhatsApp. Ces variables n'existent qu'en production ; sans elles, la page affiche « indisponible ». Voir `docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md`.

**Médias dans le chat (2026-09-28)** : la zone de message envoie photos, vidéos, documents, notes vocales et emojis. Chaque fichier passe par `POST /admin/whatsapp-conversations/:phone/media` (multer en mémoire, 100 Mo, noms décodés en UTF-8 ; type détecté sur le contenu, `src/lib/whatsapp-media-types.ts` ; image -> JPEG avec sharp, vocal -> OGG/Opus avec **ffmpeg**, installé dans l'image Docker du backend, `src/lib/whatsapp-media-prepare.ts` ; stockage `wa-media-<aléatoire>`) puis `POST .../media-messages` -> action n8n `send_media` (envoi par lien, `https://` obligatoire : en local les fichiers servis en `http://` sont refusés, normal). Médias reçus des clients (vidéo, vocal, document) copiés par n8n (`client-media-*`) ; purge n8n à 90 jours pour `client-photo-*`, `client-media-*`, `wa-media-*` (jamais les fichiers de l'agent). Tester l'écran en local : créer une base de test depuis `n8n_automation/schema.sql` et lancer `npx medusa develop` (pas `npm run backend:dev` : turbo ne transmet pas `WHATSAPP_CHAT_DATABASE_URL`) avec cette variable. Spec `docs/superpowers/specs/2026-09-28-whatsapp-chat-medias-design.md`.

Média refusé (2026-10-06) : quand n8n répond un échec certain (`invalid_request`, `not_found`, `window_expired`, `whatsapp_error`), la route `media-messages` supprime le fichier `wa-media` téléversé (`src/lib/whatsapp-media-cleanup.ts`, motif strict du nom), jamais sur `unavailable` (le message a pu partir). « Réessayer » téléverse un nouveau fichier.

Messages non envoyés : Meta peut refuser un message après l'avoir accepté (accusé de statut `failed`, ex. 131047 = plus de 24 h depuis le dernier message du client). n8n l'inscrit dans `messages.delivery_status` / `delivery_error` ("code: raison") ; l'admin affiche « Non envoyé » (`src/lib/whatsapp-delivery-failure.ts`) et considère la fenêtre fermée après un refus 131047 postérieur au dernier message client (`computeReplyWindow`, 3e paramètre). Piège : les messages entrants simulés par webhook signé comptent comme des messages client et faussent le calcul de la fenêtre.

Messages automatiques (confirmations de commande, retour en stock, livraison au livreur) : enregistrés par n8n dans la conversation du destinataire (`role = 'assistant'`, colonne `messages.template_name`, conversation créée si besoin ; jamais les codes de vérification). L'admin affiche « Message automatique · <modèle> » au lieu de « IA » (`src/lib/whatsapp-template-labels.ts`).

Prospect depuis le chat : bouton « Suivre comme prospect » dans l'en-tête d'une conversation (`src/admin/components/whatsapp-prospect.tsx`, formulaire partagé `prospect-form.tsx`), ou badge « Prospect · … » si le numéro est déjà suivi (comparaison sur les 8 derniers chiffres, `src/admin/lib/prospect-match.ts`).

Livreur dans le chat (2026-10-10) : badge « Livreur · Nom » dans l'en-tête et la liste des conversations quand le numéro est celui d'un livreur actif (`src/admin/lib/courier-match.ts`, 8 derniers chiffres, `src/admin/components/whatsapp-courier.tsx`). Côté agent n8n, le nœud `Identify Courier` lit `GET /admin/couriers` à chaque message : un livreur n'est jamais traité comme un client, ses reçus d'expédition sont transmis au propriétaire par le tool `report_courier_receipt` sans vérification des montants (guide n8n § 2.12, spec `docs/superpowers/specs/2026-10-10-agent-livreurs-et-copie-message-livreur-design.md`).

### Numéro de commande Golden Market

Format `AAAAMMJJ` + compteur du jour sur 3 chiffres (ex. `20260927001`), stocké dans le champ natif `order.custom_display_id` (recherchable dans la liste des commandes). Généré par l'option `generateCustomDisplayId` du module order (`medusa-config.ts`, `src/lib/order-number.ts`) avec la table `order_daily_counter`. Rattrapage idempotent des commandes sans numéro (commandes créées entre la migration et le redémarrage du serveur) : `docker exec <backend> npx medusa exec ./src/migration-scripts/create-order-daily-counter.js`. Toujours afficher le numéro via `orderNumberOf(order)`. Dans l'admin natif (liste des commandes, en-tête de la fiche, titre de l'onglet), les réponses de `GET /admin/orders` et `GET /admin/orders/:id` portent ce numéro dans `display_id` (`lib/order-list-customer.ts`, middleware `orderListCustomerNameMiddleware`) : l'en-tête affiche « #20261010012 », pas le compteur Medusa.

### Livreurs et livraisons (module `delivery`)

Module `src/modules/delivery` (tables `courier`, `delivery` = une tentative, `courier_settlement` = versement d'un livreur pour un jour) + lien `src/links/order-delivery.ts`. Toutes les écritures passent par les workflows `src/workflows/{couriers,assign-delivery,complete-delivery,update-delivery,courier-settlements}.ts` ; règles métier pures et testées dans `src/lib/delivery-rules.ts`. Routes `/admin/couriers`, `/admin/deliveries/*`, `/admin/courier-settlements/*` (schémas Zod dans `src/api/admin/deliveries/middlewares.ts`). Écrans : page `/app/deliveries` (À confier, Tournée du jour, Expéditions à faire payer, Livreurs) et encadré « Livraison » de la fiche commande. Job `src/jobs/postpone-deliveries.ts` (00 h 05 UTC) : livraison confiée non faite -> reportée au jour courant. Montant à encaisser : proposé par `amountsByType` (onglet « À confier », modifiable par commande, `amounts` dans `POST /admin/deliveries`, appliqué par `amountForAssignment`). Message au livreur : `buildCourierMessage` (module pur `src/lib/courier-message-text.ts`, qui contient aussi les corps exacts des deux modèles et `courierMessageText` pour le rendu local ; bouton « Copier le message livreur » de l'encadré Livraison, avant attribution depuis le formulaire et pour la livraison en cours) choisit le modèle Meta `livraison_livreur_ouaga` (client, téléphone, destination, produit, quantité, montant) ou `livraison_livreur_expedition` (client, téléphone, ville, compagnie, produit, quantité ; finit par « Merci 🙏 », Meta refusant un modèle qui se termine par une variable) ; l'ancien `livraison_livreur` n'est plus envoyé via le webhook n8n `N8N_ORDER_CONFIRMATION_WEBHOOK_URL` ; en local, pas de webhook -> `whatsapp_status = failed` (normal). Piège : `query.graph` sur `order` renvoie total 0 et quantités vides si on demande des champs unitaires (`items.quantity`) -> demander `items.*`, `summary.*` ; `payment_status`/`fulfillment_status` n'y sont pas calculés (voir `isPaid`/`isShippedOrDelivered`). Spec `docs/superpowers/specs/2026-09-28-livreurs-livraisons-design.md`.

Stock confié aux livreurs (même module) : table `courier_stock_movement` (quantité signée ; solde d'un livreur = somme de ses mouvements ; types remise / retour / livraison / correction). Le stock Medusa reste le **stock total possédé** (dépôt + livreurs) : remise et retour n'y touchent pas, seule une correction (perte / trouvaille) l'ajuste ; « Au dépôt » = `stocked_quantity` − total chez les livreurs. À « Livrée » / « Déposée à la gare », la route `complete` lance `takeDeliveryStockWorkflow` : le livreur déstocke `min(besoin, solde)` par article physique (kits décomposés), une seule fois par livraison (index unique partiel), jamais bloquant. `completeDeliveryWorkflow` prend un verrou par livraison (`acquireLockStep`) : deux validations simultanées créaient deux fulfillments. Tous les mouvements de stock livreur (remise, retour, correction, déstockage à « Livrée ») prennent le verrou commun `courier-stock` (`COURIER_STOCK_LOCK_KEY`, fournisseur de verrou en mémoire : valable tant qu'il n'y a qu'un conteneur backend). Variantes `manage_inventory = false` ignorées au déstockage (`inventoryByManagedVariant`). Déstockage en échec : avertissement « enregistrez un Retour » inscrit dans `delivery.sync_warning` (à la suite de l'éventuel avertissement de paiement, `combineWarnings`) ; jamais une correction, qui retirerait une seconde fois le stock Medusa déjà baissé par la livraison. Correction : un même produit saisi deux fois est refusé. Formulaires : recherche produit par nom (`admin/lib/product-search.ts`, sans accents, mots dans n'importe quel ordre). Spec `docs/superpowers/specs/2026-10-06-finitions-stock-livreurs-design.md`. Règles `src/lib/courier-stock-rules.ts`, lectures `src/lib/courier-stock-query.ts`, workflows `src/workflows/courier-stock.ts` ; routes `/admin/courier-stock`, `/admin/courier-stock/movements` ; onglet « Stock livreurs » (`src/admin/components/courier-stock-tab.tsx`, styles partagés `delivery-ui.tsx`). Spec `docs/superpowers/specs/2026-09-28-stock-livreurs-design.md`.

### Espace livreur (2026-10-15)

Spec `docs/superpowers/specs/2026-10-15-espace-livreur-design.md`, plan `docs/superpowers/plans/2026-10-15-espace-livreur.md`. Le livreur ouvre `/livreur` (storefront, mobile-first) avec son téléphone et un PIN à 4 chiffres, voit ses livraisons du jour et envoie un rapport ; l'équipe valide dans l'admin.
- **Architecture** : routes backend `/courier/*` (`src/api/courier/`, hors session Medusa) protégées par un jeton signé HMAC (secret `COOKIE_SECRET`, valable 12 h, `src/lib/courier-auth.ts`) ; le middleware `authenticateCourier` (`api/courier/middlewares.ts`) refuse aussi un livreur désactivé. Le storefront relaie par `/api/livreur/*` (`src/app/api/livreur`) et garde le jeton dans le cookie httpOnly `_gm_courier` ; page `src/modules/livreur`, route `/livreur`. Le relais exige `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (storefront) et `COOKIE_SECRET` (backend).
- **PIN** : 4 chiffres, haché scrypt (colonne `courier.pin_hash`, jamais renvoyée par une route), créé / changé dans l'onglet « Livreurs » de `/app/deliveries` (`has_pin`, `POST` du PIN). Hachage et vérification asynchrones (`crypto.scrypt`, format `sel:hash` inchangé). Connexion (`api/courier/login`, limiteur `checkRateLimit`) : 20 essais / 15 min par adresse IP (tous comptés ; `resolveClientIp` dans `courier-auth.ts`) : avec `COURIER_RELAY_SECRET` (même valeur backend et storefront, obligatoire en production), seuls les appels portant `x-courier-relay-secret` sont acceptés et l'IP est `x-courier-client-ip`, posée par le relais (dernière valeur de `x-forwarded-for`, sinon `x-real-ip`) ; sans secret (dev local), IP = adresse de connexion (socket ; pas `req.ip`, qui suit `x-forwarded-for` car Medusa règle « trust proxy »). un `x-forwarded-for` envoyé par un client n'est jamais lu ; 5 échecs / 15 min par numéro ; les essais d'un même numéro passent un par un (verrou `courier-login:<téléphone>`, 10 s), le compteur ne peut donc pas être contourné en parallèle ; un succès remet le compteur du numéro à zéro ; hachage factice si le numéro est inconnu (pas de fuite par le temps de réponse).
- **Règles Ouaga / expédition** (`src/lib/courier-report-rules.ts`, pures et testées) : livraison express (Ouaga) = montant encaissé + course du livreur ; expédition = course + « Frais Expédition » (le livreur ne voit jamais le montant à encaisser : le client paie l'entreprise par Mobile Money, saisi par l'équipe à la validation). Commande Ouaga déjà payée (`amount_to_collect` 0) : le montant encaissé n'est pas demandé au livreur (`fields.amount_collected` faux), enregistré à 0. Libellé « Frais Expédition » (ex-« frais compagnie de transport »), y compris dans la caisse.
- **Flux** : table `delivery_report` (une par livraison ; statuts `submitted` / `returned` / `validated` / `applied`). Le livreur répond d'abord Oui / Non. Non (motif obligatoire) : échec enregistré tout de suite via `completeDeliveryWorkflow` (la commande revient à confier), rapport `applied`, rien à valider. Oui : rapport `submitted`, en attente. L'équipe, dans l'onglet admin « Rapports livreurs » (liste du jour par livreur, routes `/admin/courier-reports*`), valide (`validated`) ou renvoie pour correction (`returned`, le livreur corrige puis renvoie). Validation, toujours sans le délai de 24 h (`skipEditWindow`) : Ouaga à encaisser = `submitPaymentForm` (marquer payée + livrée, montant du livreur = encaissement du versement du soir) ; sinon le livreur n'a rien encaissé, la livraison est close en « livrée » avec `amount_collected` 0 et les frais du rapport (`completeDeliveryWorkflow` + `finishDelivery`) : expédition avec montant saisi = paiement enregistré d'abord (`submitPaymentForm` sans livraison, écritures finales, frais compris ; les frais automatiques de la livraison sont alors ignorés), montant vide ou 0 = pas encore payée (frais inscrits par les écritures automatiques, la commande apparaît dans « Expéditions à faire payer ») ; Ouaga déjà payée = paiement déjà enregistré inchangé, sinon total de la commande enregistré. Journée du livreur déjà validée = validation refusée ; modifier le paiement d'une commande dont la livraison encaissée appartient à une journée validée est aussi refusé (« rouvrez-la »). Toute logique d'écriture dans `src/lib/courier-reports.ts`.
- **Verrous** : `courier-report:<id de la livraison>` (`withDeliveryLock`, 30 s) commun à l'envoi du livreur, la validation, le renvoi et « Changer de livreur » ; le rapport est relu et revérifié une fois le verrou pris. Le fournisseur de verrou Medusa est **en mémoire** : valable seulement avec un seul conteneur backend.
- **Piège connu** : verrous en mémoire (un seul conteneur backend) ; la limite par IP n'est pas sérialisée (quelques essais de plus possibles en rafale) ; sans `COURIER_RELAY_SECRET`, tous les livreurs passant par le relais partagent la limite par IP du storefront. Le jeton n'est pas révoqué à la déconnexion (sans état, 12 h).

- **Ajouts du 2026-10-16** : sélecteur de jour (`GET /courier/deliveries?date=AAAA-MM-JJ`, pas après aujourd'hui), date de commande et numéro du client copiable sur chaque carte, commentaire facultatif du rapport « Oui » (`delivery_report.comment`), onglet « Rapports livreurs » avec colonne « Commandée le » et sélecteur de jour. PIN aléatoire généré dans l'onglet « Livreurs », stocké haché (`pin_hash`) et chiffré AES-256-GCM (`pin_cipher`, `encryptPin` / `decryptPin` dans `courier-auth.ts`, clé dérivée de `COOKIE_SECRET`) : `GET /admin/couriers` renvoie `pin` pour le message d'accès copié (`admin/lib/courier-access-message.ts`) ; les PIN antérieurs sont à régénérer. Page `/app/courier-money` (argent à récupérer, confirmation = `POST /admin/courier-settlements`).
- **Date de livraison d'une commande** (2026-10-16) : `order.metadata.delivery_date` (formulaire de création et « Modifier la commande », aujourd'hui par défaut, jamais dans le passé, `lib/phone-order.ts`). `tourDateFor` (`lib/delivery-rules.ts`) donne le jour de tournée à l'attribution : le livreur ne voit la commande qu'à cette date ; « À confier » l'affiche avec « Livraison prévue le JJ/MM » ; `countInProgress` ignore les livraisons futures ; modifier la date met à jour `tour_date` de la livraison en cours.

Autres fonctions de la session du 2026-10-15 :
- **Supprimer une commande saisie à la main** (`POST /admin/phone-orders/:order_id/delete`, `src/lib/order-delete.ts`) : annule la commande et ses livraisons en cours puis la masque (`metadata.deleted_at`, listes filtrées) ; réversible en vidant la clé.
- **Changer de livreur** : `POST /admin/deliveries/:id/reassign` ; supprime les rapports non validés de l'ancien livreur.
- **Caisse** : période par défaut = jour, carte « Résultat » = chiffre d'affaires - sorties hors remboursements, heure affichée sur les écritures.
- **Modifier le paiement dans les 24 h** après la dernière action (« Marquer payée » ou « Modifier le paiement » ; l'échéance est portée par la date de l'écriture de vente de la caisse) : règle `src/lib/payment-edit-rules.ts`. La section « Paiement enregistré » est placée **en tête de la fiche commande** par un patch du dashboard compilé : conteneur `#golden-market-order-top`, voir `apps/backend/scripts/patch-dashboard.mjs`. Piège : après un changement de ce patch, vider `apps/backend/node_modules/.vite` et recharger le navigateur en forçant le cache (sinon l'ancien chunk pré-compilé est servi).
- **« Marquer non payée » / « Marquer non livrée »** (2026-10-16, en production ; enquête `docs/superpowers/specs/2026-10-16-annuler-paiement-livraison-enquete.md`) : boutons de la carte du haut (`widgets/order-payment-recorded.tsx`, carte compacte si payée sans formulaire) et de l'encadré Livraison (`components/undo-action.tsx`), confirmation sur place, visibles seulement 24 h après la dernière action (règles pures `src/lib/undo-rules.ts` : paiement = plus récente de `order-final:<id>:sale` et des captures ; livraison = `completed_at` de la dernière livraison livrée/expédiée, sinon dates de l'expédition Medusa). Routes `POST /admin/order-payments/:id/undo-paid|undo-delivered`, le GET de la même route renvoie `undo` (null en cas d'erreur). Workflows `src/workflows/order-undo.ts`, verrous imbriqués un par un (le fournisseur en mémoire se bloque sur une liste de clés) : `order-undo:<commande>` puis `courier-report:<livraison>` puis `complete-delivery:<livraison>` (livraison terminée, ou en cours pour « non payée ») puis `courier-stock` (« non livrée »).
  - **Non payée** : captures, transactions de commande (déplacées d'abord à la version courante : piège du résumé), paiement système et sa session supprimés (paiement à la livraison du site : dé-capturé -> « Autorisée ») ; vente et frais `order-final:*` et ventes `capture:*` retirées de la caisse (suppression réversible) ; `amount_collected` de la livraison à 0. Seule sur une commande qui reste livrée : elle redevient « livrée non payée », avec les écritures automatiques de frais de sa livraison (`delivery:<id>:courier_fee|transport_fee`, réinscrites si le formulaire les avait remplacées).
  - **Non livrée** : dates d'expédition effacées puis `cancelOrderFulfillmentWorkflow` natif (stock + réservation ; emplacement corrigé s'il n'a pas de niveau de stock), compteurs expédié/livré à 0, expédition effacée (au mieux : une expédition annulée restante est ignorée par `delivery-order-sync`) ; mouvements « livraison » du livreur et frais `delivery:<id>:*` supprimés (réversible) ; livraison « Confiée » (tournée du jour) ; rapport validé -> « À corriger ». Seule sur une commande payée : elle reste payée, ses frais `order-final:*` sont gardés et « Marquer livrée » les reprend sur la livraison.
  - Refus : commande annulée, pas payée / pas livrée, remboursée, délai dépassé, versement du livreur validé. Trace : `order.metadata.payment_undone_at` / `delivery_undone_at` / `undone_by`.
  - Méthodes Medusa hors interface publique, vérifiées avant toute écriture (refus clair si absentes) : paiement `deleteCaptures`, `deletePayments`, `deletePaymentSessions`, `updatePayment`, `maybeUpdatePaymentCollection_` ; commande `listOrderTransactions`, `updateOrderTransactions`, `softDeleteOrderTransactions`, `restoreOrderTransactions`, `listOrderItems`, `updateOrderItems` ; expédition `updateFulfillment`, `deleteFulfillment`. Rejouer la vérification après une mise à jour de Medusa.

### Caisse, approvisionnement, prospects (mini-SaaS de gestion, 2026-09-28)

Trois modules construits sur le modèle du module `delivery` (écritures par workflows, règles pures testées dans `src/lib/*-rules.ts`, Zod en middleware, pages admin en HTML natif) ; décisions prises en autonomie, **hypothèses à valider par le propriétaire** listées dans chaque spec.
- **Caisse** (`src/modules/cashbook`, page `/app/cash`) : écritures `cash_entry` ; ventes et remboursements inscrits par les abonnés `payment.captured` / `payment.refunded`, frais livreur / compagnie à la fin d'une livraison, achats fournisseurs à la commande ; références uniques (aucun doublon au rejeu) ; écritures automatiques non modifiables. Spec `docs/superpowers/specs/2026-09-28-journal-de-caisse-design.md`.
- **Approvisionnement et marges** (`src/modules/procurement`, page `/app/procurement`) : commandes fournisseurs avec les formules de la feuille « Sourcing » (taux 670, frais 2,99 %), « Commander » = sortie de caisse, « Réceptionner » = stock augmenté (`adjustInventoryLevelsStep`, kits compris) et coût de revient courant (`variant_cost`, aussi saisissable à la main dans l'onglet Marges). Spec `…/2026-09-28-approvisionnement-marges-design.md`.
- **Prospects** (`src/modules/prospects`, page `/app/prospects`) : à relancer aujourd'hui, en attente de stock (retours en stock en tête), un numéro = une fiche active, conversion automatique à `order.placed`. Spec `…/2026-09-28-prospects-design.md`.

### Événements d'achat Meta (API Conversions, 2026-10-06)

Abonné `order-placed-meta-conversions-api.ts`, règles `src/lib/meta-conversions-mapping.ts`. Source Meta selon `order.metadata` : `source = "telephone"` -> `phone_call` ; `source = "whatsapp"` -> `business_messaging` (`messaging_channel: "whatsapp"`, `whatsapp_business_account_id`, `ctwa_clid`) si la commande porte un `ctwa_clid` ET que `META_WHATSAPP_BUSINESS_ACCOUNT_ID` + `META_WHATSAPP_EVENTS_ACCESS_TOKEN` existent (jeu de données `META_WHATSAPP_DATASET_ID`, défaut `META_PIXEL_ID`), sinon `chat` ; site -> `website` avec `event_source_url` (`STOREFRONT_URL/<pays>/order/<id>/confirmed`, page du pixel, même `event_id = order.id`) et `metadata.meta_browser` (navigateur, IP, `_fbp`, `_fbc`) inscrit par le site à l'étape adresse (`setAddresses`, jamais juste avant `cart.complete` : une mise à jour à ce moment recalcule le panier et peut supprimer les sessions de paiement). Refus 4xx d'un `business_messaging` -> renvoi unique en `chat`. Côté n8n, `place_order` pose `{ source: "whatsapp", ctwa_clid }` sur le panier juste après sa création (le `ctwa_clid` vient de `conversations.ctwa_clid`, enregistré depuis `referral.ctwa_clid` du webhook, valable 7 jours). Spec `docs/superpowers/specs/2026-10-06-meta-evenements-achat-design.md`.

## Medusa Skills & MCP Server

These are optional but strongly recommended — they give documentation-backed answers instead of guesses about Medusa APIs. **Use them when available; if they are not, mention to the user that installing them meaningfully improves development on this project.**

**Agentic skills** ([docs](https://docs.medusajs.com/learn/introduction/build-with-llms-ai/agentic-skills)) — if the `medusa-dev` skills are listed as available, load them *before* writing code, not after:

- `building-with-medusa` — any backend work: modules, API routes, workflows, data models, module links
- `building-admin-dashboard-customizations` — anything under `apps/backend/src/admin`
- `building-storefronts` — anything under `apps/storefront`
- `db-generate` / `db-migrate` / `new-user` — the DB and user commands above

If they are not installed, suggest:

```bash
/plugin marketplace add medusajs/medusa-agent-skills
/plugin install medusa-dev@medusa
```

**MCP server** ([docs](https://docs.medusajs.com/learn/introduction/build-with-llms-ai/mcp-server)) — a `medusa` MCP server exposing the official docs. Prefer it over web search or memory for any Medusa API, config, or upgrade question. If it is not connected, suggest:

```bash
claude mcp add --transport http medusa https://docs.medusajs.com/mcp # or agent equivalent
```

## Code Style

- **The backend must satisfy `@medusajs/eslint-plugin`'s recommended config** (`eslint.config.ts`). Its rules encode Medusa framework requirements — correct route/workflow/module shapes, not just cosmetics — so a lint failure usually means the code is actually wrong, not just badly formatted. Never disable a `@medusajs/*` rule to make lint pass; fix the code.
- No semicolons. Double quotes, 2-space indent.
- Files: kebab-case. Types/classes: PascalCase. Functions/variables: camelCase. DB columns: snake_case.
- No emojis in code, comments, or commit messages.
- **Never add a `Co-Authored-By: Claude...` (or any AI) trailer to a commit message** — explicit owner preference. This applies to commits made directly and to instructions given to any subagent that commits.

## Conventions

- **Backend routing is file-based.** A store endpoint is `src/api/store/<path>/route.ts` exporting `GET`/`POST`/etc. Don't add a router or register routes manually.
- **Business logic belongs in workflows**, not in route handlers. Routes resolve and run a workflow; workflows compose steps.
- Adding a task to `turbo.json` requires declaring its `outputs`, or Turbo will cache nothing/the wrong thing.

## Common Mistakes

- Running storefront commands without checking that `apps/storefront/` exists.
- Assuming a package manager instead of detecting it, or running a command that creates a second lockfile.
- Installing a dependency at the root instead of inside the app that needs it (`cd apps/backend && <pm> add <pkg>`).
- Editing a custom module's model without running `<pm> exec medusa db:generate <module>` — the migration is missing and the change silently never applies.
- Writing raw SQL or importing DB clients directly in the backend instead of going through module services / workflows.
- Calling the Medusa API from the storefront without `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`; requests fail with a publishable-key error, not an obvious 401.
- Running the test task without a reachable PostgreSQL — integration suites need a live DB.
- Silencing `@medusajs/*` ESLint rules instead of fixing the underlying pattern.

## Off-Limits

- `apps/backend/.medusa/`, `.next/`, `dist/`, `out/`, `.turbo/` — build output, excluded from the workspace and regenerated.
- The lockfile (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json` — whichever this install produced) — never hand-edit or delete; change it only as a side effect of a package manager command.
- `.env` / `.env.local` — never commit, print, or copy secret values out of them. Edit `.env.template` instead when documenting a new variable.
- Existing migrations in `src/modules/*/migrations/` — add a new migration rather than rewriting one that may already have run.
- Don't run destructive DB commands (drops, `db:migrate --help`-style flags that reset state) against the user's database without explicit confirmation.

## Conventions Golden Market

- Tout commentaire, message de commit et documentation se rédigent en **français** (convention du propriétaire, identique au dépôt `n8n_automation`).
- Ports de dev déviants : backend `9001`, storefront `8001` (les 9000/8000 par défaut sont occupés par d'autres conteneurs de la machine hôte). Infra de dev (Postgres `5433`, Redis `6379`) dans `docker-compose.yml` à la racine.
- Le catalogue Medusa est la nouvelle source de vérité, mais l'agent n8n (dépôt `n8n_automation`) lit toujours `public.products` : toute évolution du modèle produit doit préserver la synchronisation (voir `ARCHITECTURE.md`).
- Aucun payment provider Mobile Money sans décision explicite : le flux de paiement est **manuel** (instructions Orange Money + confirmation humaine).
