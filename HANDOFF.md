# Golden Market — Handoff / suivi d'avancement

Document de suivi entre sessions Claude Code. Chaque session doit :

1. Lire ce document en premier pour savoir où en est le projet.
2. Cocher/mettre à jour le statut d'une tâche **dès qu'elle est terminée** (pas en fin
   de session — au fil de l'eau).
3. Ajouter une entrée dans le journal en bas si une décision ou un blocage mérite d'être
   tracé pour la session suivante.

Le détail des tâches vit dans `ROADMAP.md` (phases 0 à 5 + phase différée) ainsi que
dans les décisions actées de `ARCHITECTURE.md`. Ce document-ci ne répète pas le contenu
des tâches, seulement leur **statut**.

Statuts possibles : `à faire` · `en cours` · `bloqué` · `fait`.

## Dernière mise à jour

2026-08-22 — Phase 4 (tests & CI) faite et vérifiée en exécutant réellement chaque
commande : Postgres/Redis natifs démarrés dans le sandbox (`service postgresql start`,
`redis-server --daemonize yes` — installés nativement, pas besoin de Docker Hub pour
ça), nouveau test d'intégration HTTP sur le parcours critique
(`apps/backend/integration-tests/http/orange-money-checkout.spec.ts`, passé plusieurs
fois de suite sans flakiness), CI GitHub Actions (`.github/workflows/ci.yml`). En
écrivant la CI, découvert que `next lint` du storefront échouait déjà sur `main`
(indépendamment de cette session) — corrigé (voir journal) pour que la CI ne parte pas
rouge dès son premier run.
**Blocage de session à connaître** : `.github/workflows/ci.yml` n'a pas pu être poussé —
GitHub refuse la création/modification de fichiers sous `.github/workflows/` par un
token OAuth sans le scope `workflow` (message exact :
« refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml`
without `workflow` scope »). Le fichier existe bien dans le dépôt de travail de cette
session (contenu détaillé dans le journal ci-dessous) mais reste non commité/non
poussé — à ajouter manuellement (interface GitHub, ou un accès avec le scope `workflow`)
pour que la CI soit effectivement active. Tout le reste de la Phase 4 (tests, corrections
de lint, documentation) a bien été poussé.

2026-08-22 (suite) — Phase 5 démarrée : le point sur le contrat du webhook n8n est fait
et vérifié. Dépôt n8n cloné en lecture seule (nom réel `Abdazz/n8n`, pas
`n8n_automation` comme documenté jusqu'ici — corrigé dans `ARCHITECTURE.md`/`AGENTS.md`/
`ROADMAP.md`/`DEPLOYMENT.md`) : aucun workflow n'y reçoit de notification de commande
Medusa, seul un webhook `/webhook/whatsapp` existe (agent conversationnel, sans rapport).
Payload du subscriber `order-placed.ts` enrichi en conséquence et vérifié contre une
vraie commande ; un vrai bug trouvé et corrigé au passage (`items.quantity` →
`items.detail.quantity`). Les deux autres points de la Phase 5 (parcours en
environnement proche de la prod, emails transactionnels réels) restent bloqués par
l'absence de VPS/staging et de vraie clé Resend — voir journal détaillé plus bas.

2026-08-17 (suite) — Phase 3 (déploiement VPS/Docker) écrite en entier : Dockerfiles
backend/storefront, `docker-compose.prod.yml`, reverse proxy Caddy (TLS Let's Encrypt
automatique), script de sauvegarde Postgres, `DEPLOYMENT.md`. **Non vérifiée par un vrai
build** : le sandbox de cette session bloque l'accès au registre Docker Hub par
politique réseau (`production.cloudfront.docker.com`, 403 côté proxy sortant) — un
`docker build` réel n'a donc pas pu être lancé, malgré un démon Docker fonctionnel dans
ce sandbox (testé, root disponible). À valider avant tout déploiement réel. Voir journal
pour le détail des choix (basés sur la lecture du code source Medusa, pas des
suppositions).

2026-08-17 — Phase 2 démarrée : deux des cinq points sont réellement actionnables sans
environnement de production et sont faits (rate limiting sur la réinitialisation de mot
de passe, revalidation de l'hygiène `.env`). Les trois autres (secrets forts, CORS au
domaine réel, compte admin dédié) sont des actions qui n'ont de sens qu'une fois un vrai
serveur de production ouvert — préparées côté documentation mais volontairement laissées
non cochées ; à finaliser pendant la Phase 3 (déploiement) / Phase 5 (vérification
pré-lancement). Voir journal ci-dessous pour le détail.

2026-08-16 — Phase 1 clôturée : vérification bout en bout du storefront sur la région
Burkina Faso effectuée (Task 6 du plan « catalogue-region-bf »), commande réelle passée
avec succès en XOF (panier → checkout → livraison 0 FCFA → Orange Money → confirmation).
Voir journal ci-dessous pour le détail, notamment une pollution de données découverte et
corrigée (un `geo_zone` « bf » orphelin sur le fulfillment set européen, résidu de la
Phase 0, faussait les options de livraison proposées pour la région BF).

## Statut par phase

### Phase 0 — Débloquer le paiement manuel Orange Money
Statut global : **fait**

- [x] Corriger le double `export default` dans `orange-money-manual.ts` — fait (Task 1)
- [x] Instructions Orange Money sur la page de confirmation de commande — fait (Task 3)
- [x] Subscriber `order-placed` → webhook n8n (notification WhatsApp marchand) — fait (Task 2)
- [x] Provider email Medusa (Resend/SMTP) dans `medusa-config.ts` — fait (Task 4)
- [x] Vérification bout en bout du flux de paiement — fait (Task 10)

### Phase 1 — Catalogue & région Burkina Faso
Statut global : **fait**

- [x] Région BF (XOF) créée/seedée — fait (Task 3)
- [x] `NEXT_PUBLIC_DEFAULT_REGION=bf` dans le storefront — fait (Task 3)
- [x] Clé publishable liée au bon sales channel — fait (Task 3)
- [x] Import du catalogue réel via script (plus de saisie manuelle — décision révisée,
      voir journal) — fait (Task 4)

**Ne jamais éditer le prix d'un produit importé depuis l'admin Medusa** : le prix de
gros est une règle de prix sur le variant (`rules: { "customer.groups.id": ... }`),
pas une price list, invisible dans l'admin (aucune UI Medusa pour les règles de prix
au niveau variant), et silencieusement supprimé par toute modification de prix faite
depuis le formulaire produit de l'admin — le module de pricing traite le tableau de
prix reçu comme faisant autorité et supprime tout prix absent de ce tableau. Pas de
solution automatique de restauration : il faudrait supprimer le produit et réimporter
la ligne concernée (l'idempotence par titre du script d'import ne le restaurera pas
tant que le produit existe toujours).

### Phase 2 — Durcissement sécurité
Statut global : **en cours**

- [x] Rate limiting sur `POST /auth/customer/emailpass/reset-password` — fait
- [x] Hygiène `.env`/`.env.local` (jamais commités) — revalidé
- [ ] Secrets de production forts — préparé (doc `.env.template`), génération réelle
      différée au déploiement (Phase 3)
- [ ] CORS restreints au domaine réel de production — préparé (doc `.env.template`),
      valeur réelle différée au déploiement (Phase 3)
- [ ] Compte admin dédié en prod — action de déploiement, différée (Phase 3/5)

### Phase 3 — Déploiement VPS + Docker
Statut global : **écrit, non vérifié en conditions réelles** (voir `DEPLOYMENT.md` et
`ROADMAP.md` pour le détail — build Docker impossible à tester dans le sandbox de cette
session, registre Docker Hub bloqué par la politique réseau)

### Phase 4 — Tests & CI minimale
Statut global : **fait** — vérifié en exécutant réellement chaque commande (voir
journal), pas seulement écrit

### Phase 5 — Vérification pré-lancement
Statut global : **partiellement fait**

- [x] Contrat webhook n8n validé (aucun récepteur n'existe côté n8n — payload enrichi et
      vérifié contre une vraie commande, un vrai bug trouvé et corrigé)
- [x] Notification n8n reçue lors de la capture admin — vérifiée (capture elle-même déjà
      faite en Phase 0)
- [ ] Parcours client complet en environnement proche de la production — bloqué (pas de
      VPS/staging, cf. Phase 3)
- [ ] Emails transactionnels réels — bloqué (pas de vraie clé Resend dans ce sandbox)

### Phase différée (post-lancement)
Non commencée, hors périmètre du lancement (sync n8n, bouton WhatsApp, import
catalogue automatisé, nettoyage TODOs template).

## Journal

- **2026-08-16** — Analyse approfondie du dépôt effectuée. Constat clé : un seul
  commit d'initialisation (scaffold quasi intact) + travail non commité sur le
  provider `orange-money-manual` (bug bloquant : deux `export default` dans le même
  fichier). Décisions de périmètre prises avec l'utilisateur : MVP resserré (pas de
  sync n8n ni bouton WhatsApp au lancement), hébergement VPS + Docker, pas de date
  fixe, notification marchand via webhook n8n → WhatsApp, notification client via
  provider email Medusa. `ROADMAP.md` créé et validé. `HANDOFF.md` créé (ce fichier).
  Prochaine étape : plan d'implémentation détaillé de la Phase 0 via le skill
  `writing-plans`.
- **2026-08-16 (suite)** — Plan d'implémentation Phase 0 écrit (le plan détaillé de
  cette phase, écrit pendant la session — fichier de travail non commité :
  `docs/` n'est pas suivi par git, `.superpowers/` est dans `.gitignore`), 11 tâches
  (dont une ajoutée après coup) et exécuté via `subagent-driven-development`,
  directement sur `main`
  (décision utilisateur). Tasks 1 à 8 terminées et validées en review (détail des
  rulings conservé dans le ledger de session, lui aussi non commité). En cours :
  Tasks 9-10. Pendant l'exécution, l'utilisateur a
  fourni le catalogue produits réel (`Golden Market - Catalogue des produits.xlsx`,
  racine du dépôt, non versionné) : ~29 produits sur 2 feuilles (vente express / vente
  sur commande), 29 images intégrées. Décision : import automatisé (pas de saisie
  manuelle) via 2 collections Medusa + une règle de prix sur le variant pour le groupe
  client « Grossistes » (prix de gros, pas une price list — voir plus bas) —
  détail dans `ROADMAP.md` Phase 1. Ce travail sera traité comme un plan séparé après
  la clôture de la Phase 0.
- **2026-08-16 (clôture Phase 0)** — Task 9 (page de réinitialisation de mot de passe)
  et Task 10 (vérification E2E) terminées. Parcours complet rejoué en direct (backend
  `:9001` + storefront `:8001`, Postgres/Redis Docker) : panier → checkout → sélection
  Orange Money → instructions affichées au checkout (numéro, montant, texte FR) →
  commande passée → page de confirmation affichant les mêmes instructions Orange Money
  (Task 3 confirmé) → log backend `Commande ... placée — N8N_ORDER_WEBHOOK_URL non
  configuré, notification marchand ignorée` (fallback Task 2 propre, sans erreur) →
  admin Medusa : commande retrouvée, paiement `pending`, capture manuelle effectuée,
  passage à `Captured` / `paid` confirmé (`POST /admin/payments/.../capture` → 200).
  Suite de tests unitaires : 5 suites / 10 tests, tous verts (Tasks 1, 2, 4, 5, 6).
  Email de confirmation client (Task 5) : tentative bien déclenchée mais échoue
  proprement (log d'erreur explicite, capturé par le try/catch, ne bloque pas la
  commande) faute de `RESEND_API_KEY` réelle dans ce sandbox — vérification live de
  la réception email **différée à la Phase 5** (déjà signalé comme lacune connue
  depuis la review de la Task 9, pas une régression).
  **Bug non planifié découvert pendant la vérification** : le bouton « Place order »
  du storefront (`apps/storefront/src/modules/checkout/components/payment-button/index.tsx`,
  code du scaffold initial, jamais touché par aucune tâche de ce plan) ne gère pas le
  provider Orange Money dans son `switch` — seuls `isStripeLike` et `isManual` sont
  couverts, donc le bouton reste bloqué sur « Select a payment method » (disabled) dès
  qu'Orange Money est sélectionné, empêchant tout client réel de finaliser sa commande
  par ce moyen de paiement. Contourné temporairement (patch local non commité, retiré
  après usage) le temps de vérifier le reste du parcours ; **ce n'est pas un artefact
  Playwright/DOM** (le bouton est un vrai `<button disabled>` React, confirmé par
  lecture du code et par le comportement live) — c'est un vrai défaut applicatif, à
  corriger avant tout lancement réel. Recommandation : créer une tâche dédiée (ajouter
  un `case isOrangeMoney(...)` réutilisant `ManualTestPaymentButton`, les instructions
  de paiement Orange Money n'exigeant pas de saisie carte côté client) et l'inscrire
  dans `ROADMAP.md`. Par contraste, le flux de capture admin (dialogue de confirmation
  Radix) a fonctionné sans aucune friction d'automatisation ; le seul bruit console
  observé était un warning `validateDOMNesting` préexistant dans le composant
  `CostBreakdown` de l'admin Medusa lui-même, sans rapport avec ce plan.
  **Reste ouvert côté n8n** : le contrat exact du payload webhook (URL, méthode,
  structure JSON envoyée à `N8N_ORDER_WEBHOOK_URL`) n'a jamais été validé contre le
  dépôt `n8n_automation` — signalé depuis la Task 2, toujours non résolu. À faire avant
  de configurer une vraie URL n8n en production.
  Phase 0 marquée **fait** : les 5 points du `ROADMAP.md` sont couverts et vérifiés de
  bout en bout ; le bug du bouton « Place order » ci-dessus a été traité en Task 11
  (ajoutée après coup au plan, qui en compte donc 11 au lieu de 10).
- **2026-08-16 (Task 11)** — Correction du bug « Place order » décrit ci-dessus : ajout
  d'un `case isOrangeMoney(...)` réutilisant `ManualTestPaymentButton` dans
  `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`
  (commit `76f4973`, « Corrige le bouton "Place order" resté désactivé pour Orange
  Money »). Le bug ne reste donc plus un blocage réel — le paragraphe ci-dessus
  documente son historique (découverte, cause, contournement temporaire) mais est
  résolu depuis ce commit.
- **2026-08-16 (Phase 1)** — Phase 1 clôturée : catalogue et région Burkina Faso
  complètement implémentés via deux scripts idempotents (`seed-region-bf.ts`,
  `import-catalog.ts`). Livrables : région Burkina Faso (devise XOF, seul Orange Money
  comme payment provider, lieu de stock et fulfillment point, tax region), 29 produits
  réels importés depuis le fichier Excel « Golden Market - Catalogue des produits.xlsx »
  avec images intégrées (22 « Vente express » + 7 « Vente sur commande »), deux collections
  Medusa correspondantes, et customer group « Grossistes » pour le tarif de gros via une
  règle de prix sur le variant (pas une price list — voir avertissement plus bas).
  **Point ouvert intentionnel : la livraison est tarifiée à 0 XOF** (placeholder
  volontaire — le merchant négocie le coût réel de livraison après la commande via
  WhatsApp). Ce n'est pas un bug ; si une session future cherche à « fixer » ce prix,
  consulter d'abord l'utilisateur. Scripts ré-exécutables sans risque de doublon
  (vérification par nom/titre avant création).
- **2026-08-16 (Task 6 — vérification bout en bout)** — Storefront configuré
  (`apps/storefront/.env.local` : `NEXT_PUBLIC_DEFAULT_REGION=bf`, fichier gitignored,
  positionné manuellement) et parcours d'achat réel rejoué en direct (backend `:9001` +
  storefront `:8001`) : redirection `/` → `/bf` confirmée, 33 produits renvoyés par
  `/store/products` dont 29 réels (22 « Vente express » + 7 « Vente sur commande »,
  comptage vérifié via l'API par `collection_id`) + 4 produits de démo scaffold
  toujours présents (T-Shirt/Sweatpants/Shorts/Sweatshirt — non nettoyés, hors périmètre
  de ce plan) ; image produit vérifiée chargée (`naturalWidth` non nul) ; ajout au panier
  → checkout → option « Livraison — à convenir avec le marchand » sélectionnée à
  **F CFA 0** exact → Orange Money seul moyen de paiement proposé (aucun Stripe, aucun
  manuel générique) → commande passée avec succès, page de confirmation affichée
  (`order_...`, display_id 3, total 975 000 XOF, `payment_status: authorized`,
  `provider_id: pp_orange-money-manual_orange-money-manual`). Clé publishable du
  storefront déjà correctement liée au *Default Sales Channel* (vérifié via
  `/admin/api-keys`, aucune correction nécessaire).
  **Bug de données découvert et corrigé (hors scope des scripts Phase 1)** : le
  fulfillment set « European Warehouse delivery » avait une service zone renommée
  « Europe + Burkina Faso » avec un `geo_zone` `bf` orphelin (créé le 2026-08-12,
  donc résidu de la Phase 0 — ni `seed-region-bf.ts` ni `import-catalog.ts` ne touchent
  ce fulfillment set, vérifié par lecture du code). Conséquence concrète : le checkout
  BF proposait 3 options de livraison au lieu d'une seule — « Standard Shipping » et
  « Express Shipping » (du warehouse européen, prix `F CFA NaN` faute de prix XOF) en
  plus de la bonne option à 0 FCFA. Corrigé en direct via l'API admin
  (`POST /admin/fulfillment-sets/:id/service-zones/:zone_id`) : retrait du geo_zone
  `bf`, renommage de la zone en « Europe ». Après correction, `/store/shipping-options`
  ne renvoie plus que la bonne option. Un cache de fetch Next.js (disque,
  `.next/cache/fetch-cache`) a nécessité un redémarrage du storefront pour refléter le
  changement — comportement de cache normal, pas un bug applicatif.
  **Étape 4 (optionnelle) entièrement vérifiée, pas seulement documentée en limite** :
  le tarif de gros n'est pas implémenté via une `PriceList` Medusa (aucune trouvée sur
  `/admin/price-lists`) mais via une règle de prix directement sur le variant
  (`rules: { "customer.groups.id": ... }` dans `import-catalog.ts`). Client de test créé
  (`task6-grossiste@golden-market.co`), ajouté au groupe « Grossistes », connecté sur le
  vrai storefront (`/bf/account`) : le prix affiché passe de F CFA 975 000 (anonyme) à
  F CFA 875 000 (connecté, groupe Grossistes) sur la fiche produit et sur les produits
  liés — confirmé en direct dans l'UI, pas seulement via l'API.
  Comptes de vérification créés dans cette session (dev uniquement, non documentés comme
  identifiants permanents) : admin `task6-verify@golden-market.co`, client
  `task6-grossiste@golden-market.co`. Aucun code applicatif modifié (conforme au
  périmètre de la tâche) ; seule modification de fichier suivi par git : ce journal.
- **2026-08-16/17 (revue finale Phase 1 + correctif)** — La revue finale sur l'ensemble
  de la branche du plan « catalogue-region-bf » a trouvé un bug réel non détecté par la
  vérification E2E de la Task 6 : les 29 produits importés n'avaient pas de
  `shipping_profile_id`, donc Medusa les traitait silencieusement comme ne nécessitant
  pas de livraison (`requires_shipping: false`) — la commande de test avait donc réussi
  sans jamais réellement valider le flux de livraison. Corrigé : `import-catalog.ts`
  résout désormais le shipping profile par défaut et le passe à chaque produit créé ;
  les 29 produits déjà en base ont été réparés en direct (lien ajouté, vérifié 29/29).
  Autres correctifs du même lot : dédoublonnage de la devise XOF en cas de relance
  partielle de `seed-region-bf.ts`, `apps/backend/static/` ajouté au `.gitignore`
  (images uploadées, 7.5 Mo, non versionné), `NEXT_PUBLIC_DEFAULT_REGION` documenté
  dans `AGENTS.md` et rendu obligatoire au démarrage du storefront
  (`check-env-variables.js`), et durcissements sur `parse-catalog.ts` (association
  image/ligne par `Math.floor` au lieu de `Math.round`, vérification prix non-finis).
  `ROADMAP.md` corrigé : la case « retirer les régions de démo Europe » a été décochée
  (jamais fait, contrairement à ce qu'elle affirmait) et scindée en un item séparé.
  Revue ciblée du correctif : propre, aucun point bloquant résiduel.
- **2026-08-17 (réécriture d'historique git)** — L'utilisateur a signalé que Claude ne
  doit **jamais** être ajouté comme co-auteur dans les commits (préférence déjà énoncée
  avant cette session mais non documentée). Les 27 commits de la session portant la
  ligne `Co-Authored-By: Claude...` ont été réécrits via `git filter-repo` (hashes
  changés, contenu des fichiers inchangé) puis poussés en force
  (`git push --force-with-lease`) sur `origin/main`
  (`git@github.com:Abdazz/Golden-Market.git`, ajouté par l'utilisateur pendant la
  session). Vérifié après coup via l'API GitHub : aucune trace de Claude comme auteur
  ou co-auteur sur aucun commit. **Convention pour la suite : ne jamais inclure de
  trailer `Co-Authored-By: Claude...` dans un commit de ce dépôt, y compris dans les
  instructions données à un sous-agent qui committe.** Note : le panneau
  « Contributors » de la page d'accueil GitHub peut continuer à afficher « claude »
  pendant un moment après une réécriture d'historique — c'est un cache d'affichage
  asynchrone côté GitHub, indépendant des données réelles (déjà vérifiées propres via
  l'API `/commits` et `/contributors`), pas un signe d'échec de la correction.
- **2026-08-17 (Phase 2 — rate limiting + revalidation `.env`)** — Sur les cinq points de
  la Phase 2, deux sont réellement actionnables dans ce dépôt (pas d'environnement de
  production réel accessible dans cette session, ni Docker fonctionnel pour rejouer un
  test E2E live — daemon Docker absent du sandbox) :
  - **Rate limiting** sur `POST /auth/customer/emailpass/reset-password` : nouveau fichier
    `apps/backend/src/api/middlewares.ts` avec `defineMiddlewares` (idiome documenté dans
    `apps/backend/src/api/README.md`), limiteur `express-rate-limit` (nouvelle dépendance,
    5 requêtes / 15 min par IP, 429 au-delà) posé uniquement sur cette route précise.
    Vérifié par un vrai serveur Express dans un test unitaire
    (`src/api/__tests__/middlewares.unit.spec.ts`, ajouté `express`/`@types/express` en
    devDependencies pour ce test) : 5 requêtes → 201, 6ᵉ → 429. En lisant
    `@medusajs/framework/dist/http/express-loader.js` : le framework pose déjà
    `app.set("trust proxy", 1)` par défaut, donc `req.ip` (utilisé par le limiteur) restera
    correct derrière le futur reverse proxy Nginx de la Phase 3 — pas de configuration
    supplémentaire à prévoir sur ce point précis quand la Phase 3 sera traitée.
  - **Hygiène `.env`/`.env.local`** : revalidée, déjà correcte (`.gitignore` racine +
    `apps/backend/.gitignore`), aucune action nécessaire.
  Les trois points restants (secrets de prod forts, CORS restreints au domaine réel,
  compte admin dédié) ne peuvent pas être complétés pour de vrai sans un environnement de
  production existant — ce sont des actions de déploiement, pas du code. Préparés côté
  documentation (`apps/backend/.env.template` : avertissement sur `JWT_SECRET`/
  `COOKIE_SECRET` avec commande `openssl rand -base64 32`, avertissement sur les CORS à
  restreindre au domaine réel) et laissés non cochés dans `ROADMAP.md` volontairement,
  pour ne pas prétendre à un état qui ne sera vrai qu'après la Phase 3. Suite de tests
  unitaires complète rejouée après ce changement : 7 suites / 19 tests, tous verts. Lint
  backend rejoué : aucune nouvelle erreur/warning (les 6 warnings préexistants, sans
  rapport avec ce travail, viennent de `parse-catalog.ts` et `order-placed.ts`, déjà
  présents avant cette session).
- **2026-08-17 (Phase 3 — Docker/VPS, écrite non vérifiée)** — Avant d'écrire quoi que ce
  soit, lecture directe du code source de `@medusajs/framework`/`@medusajs/medusa`
  installés (pas de MCP `medusa` connecté dans cette session, pas de skills
  `medusa-dev` chargées) pour éviter de deviner le comportement de build/start :
  - `medusa build` compile vers `apps/backend/.medusa/server` et y copie
    `apps/backend/package.json` tel quel (donc les mêmes dépendances, y compris
    `express-rate-limit` ajouté en Phase 2) — confirmé dans
    `@medusajs/framework/dist/build-tools/compiler.js`.
    `medusa build` compile aussi l'admin par défaut (pas seulement le serveur) — confirmé
    dans `@medusajs/medusa/dist/commands/build.js` (`buildAppFrontend` appelé sauf
    `--admin-only`). `medusa start` sert un unique serveur Express qui expose à la fois
    l'API et l'admin (`@medusajs/medusa/dist/commands/start.js`) et enregistre déjà un
    `GET /health` — utilisé comme healthcheck Docker. Bonne surprise supplémentaire :
    `app.set("trust proxy", 1)` est déjà posé par le loader Express du framework
    (confirmé Phase 2) — donc rien à faire côté code pour que le rate limiter de la
    Phase 2 reste correct derrière Caddy.
  - Sortie Next.js "standalone" activée (`apps/storefront/next.config.js`) — nécessaire
    pour une image de production sans embarquer tout `node_modules`. Nouveau
    `apps/storefront/.env.template` (n'existait pas du tout avant cette session) :
    variables réellement utilisées listées par grep dans `src/`
    (`NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`,
    `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_BASE_URL`) — volontairement sans les
    variables Stripe/Medusa Cloud du scaffold, jamais utilisées par Golden Market
    (paiement manuel Orange Money uniquement, décision actée dans `ARCHITECTURE.md`).
  - Livrables : `apps/backend/Dockerfile` (+ `docker-entrypoint.sh` : migration puis
    démarrage à chaque boot, documenté comme sûr uniquement en mono-instance),
    `apps/storefront/Dockerfile` (build multi-étages, args `NEXT_PUBLIC_*` injectés au
    build ET au runtime), `.dockerignore` racine, `docker-compose.prod.yml` (Postgres,
    Redis, backend, storefront, Caddy comme reverse proxy — TLS Let's Encrypt
    automatique sans config `certbot` séparée), `deploy/Caddyfile`,
    `deploy/.env.example` (sur le modèle de `.env.example` déjà existant à la racine
    pour l'infra de dev), `deploy/backup-postgres.sh` (dump gzip + purge 14 jours,
    pensé pour cron sur le VPS), `DEPLOYMENT.md` (procédure complète : premier
    déploiement, création admin, import catalogue, sauvegardes, restauration).
    `.gitignore` : ajout de `/deploy/.env`.
  - **Tentative de vérification par un vrai build** : le sandbox dispose bien d'un
    démon Docker fonctionnel (root disponible, `dockerd` démarré manuellement avec
    succès — confirmé par `docker info`), mais `docker build` échoue au tout premier
    `FROM node:20-alpine` : la politique réseau sortante de ce sandbox bloque
    `production.cloudfront.docker.com` (le CDN de Docker Hub) avec un 403 côté proxy de
    sortie (confirmé via `curl $HTTPS_PROXY/__agentproxy/status` :
    `connect_rejected`, "gateway answered 403 to CONNECT (policy denial or upstream
    failure)"). Conformément à la consigne du proxy de ce sandbox (« ne pas contourner
    un refus de politique »), aucune tentative de contournement (registre miroir,
    etc.) — juste consigné ici. Démon Docker arrêté proprement après ce constat.
    Validation partielle possible sans démon : `docker compose --env-file deploy/.env
    -f docker-compose.prod.yml config` (ne nécessite pas de démon actif) confirme que le
    YAML est valide et que la substitution de variables produit exactement le résultat
    attendu (`DATABASE_URL`, CORS construits depuis les domaines, args de build du
    storefront, etc.) — donc pas d'erreur de syntaxe ou de câblage, seule la construction
    réelle des images reste à valider.
  - **Point non traité, signalé dans `DEPLOYMENT.md`** : l'intégration avec l'infra VPS
    existante de `n8n_automation` (dépôt non accessible depuis cette session) — risque
    concret de collision sur les ports 80/443 si ce VPS a déjà un reverse proxy pour
    n8n. À vérifier avant le premier déploiement réel.
  - Phase 3 marquée « écrit, non vérifié en conditions réelles » plutôt que « fait » —
    cases de `ROADMAP.md` volontairement laissées non cochées tant qu'un vrai
    `docker build`/`docker compose up` n'a pas été rejoué avec succès (Phase 5).
- **2026-08-22 (Phase 4 — tests & CI, faite et vérifiée)** — Contrairement à la Phase 3
  (bloquée par l'accès Docker Hub), Postgres 16 et Redis sont installés **nativement**
  dans ce sandbox (`postgresql-16`, paquets système, pas de conteneur) : démarrés
  (`service postgresql start`, `redis-server --daemonize yes`), mot de passe du rôle
  `postgres` positionné pour l'auth par mot de passe en TCP (`ALTER USER postgres
  PASSWORD 'postgres'` — le péer-auth par défaut ne suffit pas pour une connexion
  applicative Node). Tout ce qui suit a donc pu être **réellement exécuté**, pas
  seulement écrit.
  - **Test d'intégration HTTP** (`apps/backend/integration-tests/http/orange-money-checkout.spec.ts`) :
    utilise `medusaIntegrationTestRunner` de `@medusajs/test-utils` (déjà en
    devDependency, jamais utilisé jusqu'ici dans ce dépôt) — crée une base éphémère,
    la migre, démarre une vraie instance Medusa sur un port aléatoire, expose un
    client HTTP (`api`, axios). Plusieurs obstacles réels rencontrés et résolus en
    lisant le code source plutôt qu'en devinant :
    - Sur une base fraîche (migrations seules, pas de seed initial), aucun profil de
      livraison par défaut n'existe alors que `seed-region-bf.ts` (réutilisé tel quel
      pour les fixtures) suppose qu'il en existe un — corrigé en le créant explicitement
      dans le test (`fulfillmentModuleService.createShippingProfiles(...)`) avant
      d'appeler le script.
    - Toute route `/store/*` exige une clé publishable liée au sales channel (piège déjà
      documenté dans `ARCHITECTURE.md`, revérifié ici en conditions de test) : créée
      via `createApiKeysWorkflow` + `linkSalesChannelsToApiKeyWorkflow`.
    - `completeData.order.payment_status` est resté `undefined` dans un premier temps :
      en lisant `@medusajs/core-flows/dist/order/workflows/get-order-detail.js`, découvert
      que `payment_status` n'est **pas** un champ persisté sur `order` mais une valeur
      calculée à la volée par `getOrderDetailWorkflow` (via `getLastPaymentStatus`) —
      absente de la réponse de `POST /store/carts/:id/complete` (qui fait un
      `query.graph` brut sans passer par ce workflow), quel que soit le `fields` demandé.
      Corrigé en ajoutant un second appel `GET /store/orders/:id?fields=+payment_status`
      après la complétion du panier — exactement ce que fait la page de confirmation du
      storefront en production. Ce point n'était documenté nulle part avant cette
      session.
    - Le hook `beforeAll` du test runner dépasse le timeout Jest par défaut (5s) le temps
      de migrer + démarrer l'app : `jest.setTimeout(60000)` ajouté en tête de fichier.
    - Test rejoué à plusieurs reprises dans la même session : stable, aucune base de
      données éphémère résiduelle après coup (`\l` sur `postgres` vérifié vide de toute
      base `medusa-*`).
    - Bruit de log attendu et sans impact sur le résultat du test : `RESEND_API_KEY`
      factice (`.env.test`) fait échouer l'appel Resend réel avec un 403, intercepté
      proprement par le try/catch du provider (comportement voulu depuis la Phase 0) ;
      un warning Knex "Connection ended unexpectedly" apparaît parfois à la toute fin
      (subscriber d'email encore en vol au moment où le test ferme la connexion DB),
      sans faire échouer le test.
  - **`apps/backend/.env.test`** (nouveau, committé — volontairement non gitignored,
    aucun secret réel) : valeurs lues par `loadEnv("test", ...)` de Medusa
    (`DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD` pour `@medusajs/test-utils`,
    `JWT_SECRET`/`COOKIE_SECRET`/CORS/`RESEND_API_KEY`/etc. pour l'app elle-même).
    Conçu pour correspondre exactement aux services Postgres/Redis par défaut de GitHub
    Actions (port 5432/6379, user/password `postgres`), donc réutilisable tel quel en CI
    sans variables supplémentaires à déclarer dans le workflow.
  - **CI GitHub Actions** (`.github/workflows/ci.yml`, déclenché sur `pull_request`) :
    job `backend` (services Postgres 16 + Redis 7, `npm run lint`/`test:unit`/
    `test:integration:http` sur le workspace `@dtc/backend`) et job `storefront`
    (`npm run lint` sur `@dtc/storefront`, avec `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`/
    `NEXT_PUBLIC_DEFAULT_REGION` factices en env — `next lint` charge `next.config.js`,
    qui exige ces variables au chargement via `check-env-variables.js`). Volontairement
    pas de job `test:integration:modules` : la commande existe déjà dans
    `package.json` mais ne correspond à aucun fichier actuellement (testMatch
    `**/src/modules/*/__tests__/**` — les tests existants sont un niveau au-dessus,
    `src/modules/__tests__/`, donc couverts par `test:unit`) ; pré-existant, hors
    périmètre de cette session, non modifié.
  - **Bug de CI-readiness découvert et corrigé avant même le premier run réel** : en
    testant localement le job `storefront` avant de committer, `next lint` échouait
    déjà sur `main` (donc indépendamment de tout travail de cette session) avec 10
    erreurs ESLint réelles (pas des warnings) dans deux fichiers du template jamais
    nettoyés :
    - `src/lib/data/cart.ts` : trois fonctions mortes (`applyGiftCard`, `removeDiscount`,
      `removeGiftCard`) entièrement commentées, aucun appelant nulle part dans le
      dépôt (vérifié par recherche) — supprimées entièrement plutôt que rustinées
      (paramètres inutilisés, `any`), conformément à la consigne du projet de supprimer
      le code mort plutôt que de le complexifier. Correspond au point déjà identifié dans
      `ROADMAP.md` (Phase différée : « Nettoyage des TODOs hérités du template
      storefront »). Par ailleurs, deux vrais blocs `catch (e: any)` (actifs, pas morts :
      `submitPromotionForm`, `setAddresses`) corrigés proprement (`catch (e)` +
      cast `Error`/`HttpTypes.StoreUpdateCart` déjà importé, sans `any`).
    - `src/modules/layout/components/language-select/index.tsx` : deux `@ts-ignore`
      remplacés par `@ts-expect-error` (recommandation directe du linter, aucun
      changement de comportement).
    Sans cette correction, la CI ajoutée dans cette même session serait partie rouge dès
    son premier déclenchement sur la prochaine pull request, sur du code sans rapport
    avec Golden Market — corrigé avant de committer pour livrer une CI réellement verte.
  - Suite complète rejouée après tous ces changements : lint backend (6 warnings
    préexistants, aucune erreur), 7 suites / 19 tests unitaires verts, 1 test
    d'intégration HTTP vert, lint storefront vert (3 warnings `react-hooks/exhaustive-deps`
    préexistants et non touchés — changer les dépendances d'un `useEffect` sans en
    comprendre l'intention peut introduire une boucle de rendu, laissés tels quels
    volontairement).
- **2026-08-22 (Phase 5 — contrat webhook n8n)** — Le dépôt n8n a été attaché à cette
  session (`add_repo`, accès lecture) puis cloné et lu en entier
  (`/home/user/n8n`, hors du dépôt Golden Market — rien commité là-bas, accès lecture
  seule). Premier constat : son vrai nom GitHub est `Abdazz/n8n`, pas `n8n_automation`
  comme l'affirmaient `ARCHITECTURE.md`/`AGENTS.md`/`ROADMAP.md`/`DEPLOYMENT.md` depuis
  le début du projet — corrigé dans ces quatre fichiers (recherche/remplacement global,
  seule cette session-ci journal non touchée par convention pour ne pas réécrire
  l'historique).
  Contenu réel de ce dépôt : uniquement l'infra (`docker-compose.yml`, `schema.sql`,
  config Apache) et `guide-golden-market-agent.md`, qui documente en détail l'agent
  conversationnel WhatsApp (recherche produit, création de commande, confirmation de
  paiement — tout côté agent IA + Postgres `orders`/`conversations`/`messages`). Recherche
  exhaustive (`grep -i "medusa\|webhook\|order_id"` sur tout le dépôt) : **aucune mention
  de Medusa, d'e-commerce, ni de webhook de réception de commande** — le seul webhook qui
  existe est `/webhook/whatsapp` (réception des messages WhatsApp entrants, sans rapport
  avec le paiement Medusa). Confirmé aussi dans `AGENTS.md` de ce dépôt : "Path prod
  `/webhook/whatsapp`" est le seul chemin mentionné.
  **Conclusion concrète** : il n'existe donc, à ce jour, aucun contrat à "valider" côté
  n8n pour `N8N_ORDER_WEBHOOK_URL` — il n'y a tout simplement rien qui le reçoive. Ce
  n'est plus seulement "non validé" (comme documenté depuis la Phase 0) mais "pas encore
  construit côté n8n". Construire ce workflow n8n reste hors périmètre de cette session :
  accès en lecture seule à ce dépôt, pas d'instance n8n vivante accessible, et les
  workflows n8n eux-mêmes ne sont de toute façon pas versionnés dans ce dépôt (vivent dans
  le volume Docker de n8n, cf. `ARCHITECTURE.md`).
  Plutôt que de s'arrêter à ce constat, le payload envoyé par
  `apps/backend/src/subscribers/order-placed.ts` a été enrichi : en l'état
  (`{order_id, provider}`), un futur workflow n8n ne pourrait rien construire d'utile
  pour un message WhatsApp lisible par un humain. Ajouté : `display_id`, `email`,
  `currency_code`, `total`, `items[].{title, quantity}` (récupérés via
  `query.graph({ entity: "order", ... })`, resolu depuis `ContainerRegistrationKeys.QUERY`
  dans le container, pas depuis `event.data` qui ne porte que l'id). Test unitaire
  (`order-placed.unit.spec.ts`) mis à jour en conséquence (mock du container distinguant
  `LOGGER` et `QUERY`).
  **Vérifié contre une vraie commande, pas seulement en unitaire** : deuxième cas de test
  ajouté à `orange-money-checkout.spec.ts` — un petit serveur HTTP local (`http.createServer`,
  port éphémère) tient lieu de récepteur n8n, `N8N_ORDER_WEBHOOK_URL` pointé dessus juste
  avant de passer une vraie commande via le parcours HTTP complet, payload reçu comparé à
  la commande réellement créée. **Un vrai bug trouvé à cette occasion** : la clé `quantity`
  de chaque item était systématiquement absente du JSON envoyé (silencieusement supprimée
  par `JSON.stringify` sur une valeur `undefined`) — `items.quantity` n'est pas le bon
  chemin de champ pour `query.graph` sur l'entité `order` en Medusa v2 : `quantity` vit sur
  `OrderItemDTO` (la relation `detail`), pas directement sur `OrderLineItemDTO`. Corrigé en
  demandant `items.detail.quantity` et en lisant `item.detail?.quantity`. Sans ce test
  contre une vraie commande, ce bug serait passé inaperçu (le test unitaire avec des
  données mockées ne l'aurait jamais révélé) et chaque notification WhatsApp au marchand
  aurait silencieusement affiché des commandes sans quantités.
  Suite complète rejouée après ces changements : 7 suites / 19 tests unitaires verts,
  2/2 tests d'intégration HTTP verts (le nouveau vient s'ajouter à celui de la Phase 4),
  lint backend sans nouvelle erreur/warning.
