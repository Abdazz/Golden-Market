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

`apps/backend/src/migration-scripts/initial-data-seed.ts` est encore le seed générique
du starter (régions `gb/de/dk/se/fr/es/it`, devises EUR/USD).

- [ ] Créer/seed la région Burkina Faso (`bf`, devise `xof`) ; retirer ou neutraliser les
      régions de démo Europe si elles ne servent pas.
- [ ] `apps/storefront/.env.local` : `NEXT_PUBLIC_DEFAULT_REGION=bf` (actuellement absent
      du fichier, donc le middleware retombe sur le défaut `dk`, cf.
      `apps/storefront/src/middleware.ts`).
- [ ] Vérifier que la clé publishable est bien liée au *Default Sales Channel* utilisé par
      la région BF (piège déjà documenté dans `ARCHITECTURE.md` : sinon `GET /store/products`
      renvoie 0 produit).
- [ ] Charger le catalogue réel via l'admin Medusa (saisie manuelle pour le MVP — pas de
      script d'import automatisé à ce stade, cf. phase différée).

## Phase 2 — Durcissement sécurité

- [ ] Secrets de production distincts des valeurs de `.env.template`
      (`JWT_SECRET=supersecret`, `COOKIE_SECRET=supersecret` sont des valeurs de dev à ne
      jamais réutiliser en prod) — générer des secrets aléatoires forts.
- [ ] `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` restreints aux domaines réels de
      production (actuellement `localhost` + domaines Medusa dans le template).
- [ ] Compte admin dédié en prod, mot de passe fort — ne pas réutiliser
      `admin@golden-market.co` / mot de passe de dev mentionné dans `ARCHITECTURE.md`.
- [ ] Revalider que `.env` / `.env.local` de production suivent la même hygiène qu'en dev
      (jamais commités — déjà correctement configuré dans `.gitignore`).

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

## Phase différée (post-lancement)

Hors périmètre du lancement, à reprendre une fois la boutique ouverte :

- Synchronisation catalogue Medusa → `public.products` (workflow n8n périodique, décrit
  dans `ARCHITECTURE.md`).
- Bouton "Commander via WhatsApp" (message `wa.me` prérempli depuis le panier).
- Script d'import/migration automatisé du catalogue existant (`golden_market.public.products`
  → Medusa via Admin API), si le volume de produits rend la saisie manuelle de la phase 1
  trop coûteuse.
- Nettoyage des TODOs hérités du template storefront (Toaster de notifications,
  mise à jour email/mot de passe du compte client, gestion de l'inventaire v2 dans
  `apps/storefront/src/modules/cart/components/item/index.tsx`).

## Prochaine étape

Passer la Phase 0 dans le skill `writing-plans` pour produire un plan d'implémentation
détaillé (fichiers exacts, ordre des changements, critères de vérification).
