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

## Phase 2 — Durcissement sécurité

Statut : **en cours**. Deux points sont réellement actionnables dans le dépôt et sont
faits ; les trois autres sont des actions qui ne peuvent s'exécuter que sur un vrai
environnement de production (secrets, domaine réel, compte admin) — préparés (documentés
dans `.env.template`) mais volontairement laissés non cochés tant qu'ils n'ont pas été
faits pour de vrai lors du déploiement (Phase 3/5).

- [ ] Secrets de production distincts des valeurs de `.env.template`
      (`JWT_SECRET=supersecret`, `COOKIE_SECRET=supersecret` sont des valeurs de dev à ne
      jamais réutiliser en prod) — générer des secrets aléatoires forts. Préparé : commentaire
      d'avertissement ajouté dans `.env.template` avec la commande de génération
      (`openssl rand -base64 32`) ; la génération réelle se fait au déploiement (Phase 3).
- [ ] `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` restreints aux domaines réels de
      production (actuellement `localhost` + domaines Medusa dans le template). Préparé :
      commentaire ajouté dans `.env.template` ; la valeur réelle dépend du nom de domaine
      choisi en Phase 3, pas encore connu.
- [ ] Compte admin dédié en prod, mot de passe fort — ne pas réutiliser
      `admin@golden-market.co` / mot de passe de dev mentionné dans `ARCHITECTURE.md`.
      Action pure de déploiement, à faire en Phase 3/5 (pas de compte prod à créer avant
      qu'un vrai serveur existe).
- [x] Revalider que `.env` / `.env.local` de production suivent la même hygiène qu'en dev
      (jamais commités). Revalidé le 2026-08-17 : `.gitignore` racine couvre `**/.env` et
      `**/.env.local` (toutes apps), `apps/backend/.gitignore` couvre `.env` explicitement
      en plus — aucun fichier `.env*` suivi par git dans le dépôt.
- [x] Limiter le débit (rate limiting) de l'endpoint public
      `POST /auth/customer/emailpass/reset-password` — non authentifié, répond
      toujours 201 (comportement Medusa voulu pour ne pas révéler l'existence d'un
      compte), et déclenche un email sortant à chaque appel : vecteur
      d'amplification/abus une fois une vraie clé Resend configurée. Fait le 2026-08-17 :
      `apps/backend/src/api/middlewares.ts` (nouveau), limiteur `express-rate-limit`
      (5 requêtes / 15 min par IP, 429 au-delà) posé sur cette route précise via
      `defineMiddlewares`. Vérifié par test unitaire avec un vrai serveur Express
      (`src/api/__tests__/middlewares.unit.spec.ts`) : 5 requêtes acceptées (201), la 6ᵉ
      rejetée (429). Bonne surprise vérifiée en lisant le code de Medusa : le loader Express
      du framework pose déjà `app.set("trust proxy", 1)` par défaut
      (`@medusajs/framework/dist/http/express-loader.js`) — donc `req.ip` restera correct
      derrière le futur reverse proxy Nginx de la Phase 3 (un seul saut), aucune
      configuration supplémentaire à prévoir pour ce point.

## Phase 3 — Déploiement VPS + Docker

Statut : **écrit, non vérifié en conditions réelles**. Tous les livrables ci-dessous
existent dans le dépôt (voir `DEPLOYMENT.md` pour la procédure complète et le détail des
choix), mais **aucun `docker build` réel n'a pu être lancé** pendant cette session : le
sandbox où ce travail a été fait bloque par politique réseau l'accès à
`production.cloudfront.docker.com` (registre Docker Hub), donc impossible de tirer
`node:20-alpine`. Écrit avec un soin particulier (comportement réel de `medusa build`
— sortie `.medusa/server`, package.json copié tel quel, `medusa start` sert aussi
l'admin — vérifié en lisant le code source de `@medusajs/framework` et
`@medusajs/medusa`, pas supposé), mais **à valider par un vrai build/`docker compose up`
avant tout déploiement réel** (Phase 5). Cases volontairement non cochées jusqu'à cette
vérification.

- [ ] Dockerfile production pour `apps/backend` (`medusa build` puis `medusa start`) —
      `apps/backend/Dockerfile` (build multi-étages) + `apps/backend/docker-entrypoint.sh`
      (migrations puis démarrage, sûr en mono-instance).
- [ ] Dockerfile production pour `apps/storefront` (`next build` puis serveur autonome) —
      `apps/storefront/Dockerfile`, sortie Next.js `output: "standalone"` ajoutée à
      `apps/storefront/next.config.js`. Nouveau `apps/storefront/.env.template`
      (n'existait pas encore) documentant les variables `NEXT_PUBLIC_*` requises.
- [ ] `docker-compose` de production — `docker-compose.prod.yml` (racine) : Postgres,
      Redis, backend, storefront et reverse proxy conteneurisés, réseau interne dédié,
      aucun port applicatif exposé directement à l'hôte (seul Caddy expose 80/443).
      **Intégration à l'infra VPS existante de `n8n_automation` non traitée** — pas
      d'accès à ce dépôt pendant cette session ; risque de collision de ports 80/443 si
      ce VPS a déjà un reverse proxy, signalé dans `DEPLOYMENT.md` (section Prérequis) à
      vérifier avant le premier déploiement réel.
- [ ] Reverse proxy + TLS (Let's Encrypt) devant backend et storefront — `deploy/Caddyfile`
      (Caddy, TLS automatique, pas de config `certbot` manuelle à maintenir).
- [ ] Procédure de déploiement : migrations (`medusa db:migrate`), création du user admin,
      variables d'environnement de prod — documentée dans `DEPLOYMENT.md` ; migrations
      automatisées à chaque démarrage du conteneur backend (voir `docker-entrypoint.sh`
      ci-dessus) ; création du user admin et variables listées dans
      `deploy/.env.example` (nouveau, sur le modèle de `.env.example` existant à la
      racine pour l'infra de dev).
- [ ] Sauvegardes Postgres (dump périodique automatisé, a minima un cron) —
      `deploy/backup-postgres.sh` (dump gzippé + purge à 14 jours), exemple de cron et
      procédure de restauration dans `DEPLOYMENT.md`.

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

Passer la Phase 0 dans le skill `writing-plans` pour produire un plan d'implémentation
détaillé (fichiers exacts, ordre des changements, critères de vérification).
