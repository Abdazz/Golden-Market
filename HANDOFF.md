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

2026-08-29 (soir) - **Staging entièrement déployé et validé sur le VPS réel**
(`https://staging.golden-market.co`) : pipeline CI/CD entièrement automatisé (build → migrate →
seed → démarrage, sans aucune étape manuelle par déploiement), parcours d'achat complet vérifié
via l'API (panier → livraison → Orange Money → commande, `display_id 1`), cron de sauvegarde
Postgres installé et testé (dump réel confirmé, rétention 7 jours). Phase 3 reste **en cours**
uniquement parce que la production n'est pas encore déployée (décision explicite du propriétaire :
staging d'abord, validation avant toute promotion vers `main`/production). Voir le journal
ci-dessous pour le détail complet (4 bugs réels trouvés et corrigés pendant ce premier
déploiement).

2026-08-29 - Correctif de persistance des images produit (Phase 3) : le module `file`
(file-local, jamais configuré explicitement) construisait ses URLs sur
`http://localhost:9000/static` en dur et rien ne servait ce chemin nulle part (ni Medusa,
ni Apache) - les images étaient donc cassées indépendamment de tout redéploiement. Corrigé
via `MEDUSA_BACKEND_PUBLIC_URL`, un bind mount Docker persistant et une route Apache dédiée.
Politique de branche confirmée : tout passe par `staging` (poussée sur `origin`) avant `main`.
Décision explicite du propriétaire : déploiement staging seul pour le moment, production
seulement après validation. Accès SSH VPS fourni (`admin@144.91.110.105`). Voir le journal
ci-dessous pour le détail technique.

2026-08-28 - Phase 3 (déploiement VPS + Docker) : artefacts de code livrés et mergés sur `main`
(Dockerfiles backend/storefront, `docker-compose.prod.yml` paramétré par `.env.deploy`, script de
sauvegarde Postgres avec rétention, templates de vhost Apache staging/production, workflows
GitHub Actions de déploiement automatique). Statut global passé à **en cours** : reste le Runbook
manuel VPS (accès réel, secrets, premier déploiement staging puis validation explicite avant
production), volontairement non automatisé. Voir `ROADMAP.md` Phase 3 et le journal ci-dessous.

2026-08-27 - Phase 2 (durcissement sécurité) clôturée : garde-fou de démarrage
`assertProductionConfig` (secrets forts, CORS sans `localhost`, no-op hors production) et
rate limiting Redis sur `POST /auth/customer/emailpass/reset-password` (5 req / 15 min par
IP, best-effort) implémentés ; compte admin dédié en prod et hygiène `.env` déjà satisfaits
sans code. Voir `ROADMAP.md` Phase 2 et le journal ci-dessous pour le détail.

2026-08-27 — Phase 1.5 (refonte visuelle du storefront) clôturée : spec de design validée,
4 plans exécutés (Fondation, Accueil/Catalogue/Fiche produit, Panier/Paiement, Compte),
branding Medusa retiré, storefront traduit en français, vraie taxonomie de catégories créée,
3 bugs réels corrigés via vérification visuelle sur backend réel. Voir `ROADMAP.md` Phase 1.5
et le journal ci-dessous pour le détail.

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

### Phase 1.5 — Refonte visuelle du storefront
Statut global : **fait**

- [x] Spec de design validée, 4 plans exécutés et mergés — fait, voir `ROADMAP.md` Phase 1.5
- [x] Branding Medusa retiré, traduction française du storefront — fait
- [x] Accessibilité clavier du `Chip`, 3 bugs réels corrigés en vérification visuelle — fait
- [x] Vraie taxonomie de catégories (`seed:categories-bf`) — fait

**Point ouvert** : le contenu de l'onglet « Livraison et retours » de la fiche produit reste
une traduction du texte de démo Medusa, pas une politique vérifiée — à relire avant lancement.
Codé en dur côté storefront, non éditable depuis l'admin (comme tout le texte de marque/UI du
site — seules les données produit/catalogue le sont).

### Phase 2 — Durcissement sécurité
Statut global : **fait**

- [x] Secrets de production distincts des valeurs de `.env.template` - désormais imposé au
      démarrage par le garde-fou de code `assertProductionConfig`, pas seulement documenté
      (voir journal ci-dessous)
- [x] `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` restreints en production - désormais imposé
      par le même garde-fou de démarrage, pas seulement documenté
- [x] Compte admin dédié en prod - déjà satisfait sans action de code, documenté dans
      `ARCHITECTURE.md` ligne 64
- [x] Hygiène `.env` / `.env.local` de production - déjà satisfait sans action de code,
      revérifié pendant ce plan
- [x] Rate limiting de `POST /auth/customer/emailpass/reset-password` - implémenté, voir
      le journal ci-dessous pour le détail

### Phase 3 — Déploiement VPS + Docker
Statut global : **en cours**

- [x] Dockerfiles production backend/storefront, `docker-compose.prod.yml`, script de
      sauvegarde Postgres, templates Apache, workflows GitHub Actions - livrés et mergés sur
      `main`. Voir `ROADMAP.md` Phase 3 pour le détail et le journal ci-dessous.
- [x] Persistance des images produit entre redéploiements (module `file` configuré,
      volume bind mount + route Apache dédiée) - voir journal ci-dessous.
- [ ] Runbook manuel VPS (provisionnement réel : accès SSH `admin@144.91.110.105` fourni par
      le propriétaire, secrets, premier déploiement staging validé explicitement par le
      propriétaire, puis production) - volontairement non automatisé côté bootstrap initial
      (le déploiement lui-même, une fois le VPS provisionné, est entièrement automatisé via
      les workflows GitHub Actions). Détail complet dans
      `docs/superpowers/plans/2026-08-27-phase3-deploiement-staging-production.md`.
      **Décision explicite du propriétaire (2026-08-29) : déploiement staging uniquement pour
      le moment, production seulement après validation explicite du staging.**
- [x] Staging entièrement provisionné, déployé et vérifié - voir journal ci-dessous. Reste :
      provisionner `/opt/golden-market/production` (même procédure, une fois validée par le
      propriétaire) et son propre cron de sauvegarde (30 jours de rétention, jamais fait).

### Phase 4 — Tests & CI minimale
Statut global : **à faire**

### Phase 5 — Vérification pré-lancement
Statut global : **à faire**

### Phase différée (post-lancement)
Non commencée, hors périmètre du lancement (sync n8n, bouton WhatsApp, import
catalogue automatisé, nettoyage TODOs template).

## Journal

- **2026-08-29 (soir, validation finale staging, Phase 3)** - Suite directe de l'entrée
  précédente. Deux bugs réels supplémentaires trouvés en poussant le pipeline CI/CD jusqu'au bout
  (jamais testé de bout en bout avant ce soir) :
  - **Race BuildKit** : `docker compose build` (sans argument de service) construisait backend et
    storefront en parallèle - même contexte de monorepo, même `package-lock.json`, panne
    aléatoire `ETXTBSY` sur un binaire postinstall (`esbuild`) quand les deux `npm ci`
    s'exécutent en même temps. Corrigé : build toujours séquentiel (`build backend` puis, après
    migration/seed/démarrage du backend, `build storefront`) - ordre qui corrige aussi un défaut
    de conception plus profond : le storefront ne doit être construit qu'une fois le backend
    joignable (`next build` fait de vraies requêtes réseau via `generateStaticParams`), jamais
    avant, comme le faisait le script précédent.
  - **Scripts de seed cassés en production** : `medusa exec ./src/scripts/*.ts` échoue sur
    l'image compilée (seule la sortie `.js` existe dans `.medusa/server`) - bug déjà documenté
    dans ce fichier (entrée Task 5 du 2026-08-27/28) mais jamais corrigé dans le code, seulement
    contourné à la main. Corrigé cette fois dans `apps/backend/package.json` : chaque script
    tente d'abord le `.ts` (dev) puis retombe sur le `.js` compilé (prod).
  - **Résultat** : premier déploiement CI/CD 100% automatisé réussi de bout en bout sur staging.
    Base reseedée proprement (région Burkina Faso uniquement, 29 produits réels, 6 catégories,
    1 option de livraison) - `db:migrate:scripts` confirmé sûr à répéter maintenant que le script
    de démo est supprimé.
  - **Clé publishable et compte admin recréés** après la remise à zéro de la base (perdus avec
    le `DROP DATABASE` de la tentative précédente) - positionnés directement sur le VPS, jamais
    commités.
  - **Test de checkout complet fait via l'API** (extension Chrome indisponible pour un test
    visuel réel - à refaire au navigateur dès que possible, voir mémoire session
    `feedback_visual_verification_required`) : panier → article (3000 XOF) → adresse Ouagadougou
    → option de livraison unique à 0 FCFA → session de paiement Orange Money (instructions
    correctes : `+226 64 94 73 73`, "Golden Market") → commande complétée
    (`order_01M17V6ET8AMEHNNW1BP2P9J5X`, `display_id 1`, statut `pending`, paiement non capturé -
    comportement attendu, capture manuelle par le marchand). Aucune erreur dans les logs du
    subscriber d'email de confirmation (clé Resend réelle désormais configurée).
  - **Cron de sauvegarde installé et testé** (dump réel produit, 64 Ko, contenant la commande de
    test ci-dessus) - avec un ajustement de chemin : `/opt/backups` et `/var/log` appartiennent à
    `root` sur ce VPS partagé, et le propriétaire n'avait accès qu'à un terminal mobile au moment
    de la session (pas de moyen simple de lancer une commande `sudo` interactive). Contourné sans
    sudo : dumps et logs stockés sous `/opt/golden-market/staging/backups/` (déjà `admin:admin`,
    survit à `git reset --hard` comme `.env.deploy` - jamais suivi par git). Rétention 7 jours,
    cron quotidien à 3h.
  - **Reste ouvert** : provisionner `/opt/golden-market/production` (même procédure) après
    validation explicite de ce staging par le propriétaire ; son propre cron (30 jours) ; vrai
    test de checkout au navigateur (extension Chrome à reconnecter).

- **2026-08-29 (premier déploiement staging réel, automatisation CI/CD, Phase 3)** - VPS
  provisionné (`/opt/golden-market/staging`, clé SSH dédiée `golden_market_deploy` distincte
  d'une clé personnelle, secrets GitHub Actions `VPS_HOST`/`VPS_SSH_USER`/`VPS_SSH_PRIVATE_KEY`
  configurés). Premier déploiement fait manuellement par nécessité (les secrets GitHub
  n'existaient pas encore), a révélé un bug réel non lié à la Phase 3 :
  - **`initial-data-seed.ts` (scaffold Medusa jamais nettoyé)** : ce script de démo
    (`apps/backend/src/migration-scripts/`, région Europe + 4 produits T-Shirt/Sweatshirt de
    démo - déjà connu comme résidu en dev, voir journal Phase 1.5) se réexécute automatiquement
    dès que `medusa db:migrate:scripts` tourne sur une base neuve, ce qui a pollué la première
    tentative de staging. **Supprimé définitivement** (commit sur `staging`) - les vrais scripts
    de seed du projet (`seed-region-bf.ts`, `import-catalog.ts`, `seed-categories-bf.ts`, tous
    idempotents) n'en dépendent pas.
  - **Base staging réinitialisée** (`DROP DATABASE` / `CREATE DATABASE` via `psql` dans le
    conteneur Postgres - aucune donnée réelle perdue, environnement neuf) puis reseedée
    proprement via le pipeline CI/CD corrigé ci-dessous.
  - **Automatisation étendue** (demande explicite du propriétaire : ne plus jamais rejouer ces
    étapes à la main pour la production) : `.github/workflows/deploy-{staging,production}.yml`
    exécutent désormais aussi `db:migrate:scripts`, `seed:region-bf`, `import:catalog` (ignoré
    silencieusement si `CATALOG_PATH` ne pointe vers aucun fichier - le fichier Excel du
    catalogue n'est jamais commité, placé manuellement une fois par environnement) et
    `seed:categories-bf`, dans cet ordre, à chaque déploiement. Tous idempotents (vérifient
    l'existant par nom/handle) - sûrs à rejouer indéfiniment, y compris le tout premier
    déploiement d'un environnement neuf.
  - **Reste manuel, structurellement** (le pipeline dépend de leur existence préalable) :
    création des répertoires `/opt/golden-market/*`, `.env.deploy`/`apps/backend/.env` avec les
    vrais secrets, vhost Apache + certbot (chicken-and-egg avec le DNS/TLS), les 3 secrets
    GitHub Actions eux-mêmes, création du premier utilisateur admin (`medusa user`, volontairement
    non automatisé - pas d'identifiants admin en clair dans la CI), cron de sauvegarde.
  - **Bug bloquant découvert et résolu en session** : le provider `resend`
    (`apps/backend/src/modules/resend/service.ts`) a une validation stricte
    (`validateOptions`) qui fait planter tout le démarrage du backend si `RESEND_API_KEY` est
    vide - pas un échec silencieux à l'envoi comme documenté ailleurs pour le comportement prévu
    hors-Resend. Clé réelle fournie par le propriétaire et positionnée dans `apps/backend/.env`
    de staging (jamais commitée).
  - **Vérifié en direct** : `https://staging.golden-market.co` répond en HTTPS valide (certbot),
    redirection HTTP→HTTPS confirmée (301), `X-Forwarded-For`/`X-Forwarded-Proto` bien copiés
    dans le vhost `-le-ssl.conf` généré par certbot, route `/static` Apache dédiée aux images en
    place, backend accessible via le reverse proxy (`/store/products` répond, 400 attendu sans
    clé publishable dans l'en-tête - confirme le bon routage). Clé publishable réelle déjà
    auto-créée par Medusa et liée au Default Sales Channel, positionnée dans `.env.deploy`.
  **Reste à faire avant validation finale du staging** : fournir le fichier Excel du catalogue
  (`Golden Market - Catalogue des produits.xlsx`, jamais commité) pour déclencher l'import réel
  des 29 produits ; construire et démarrer le service `storefront` (bloqué sur la région/le
  catalogue jusqu'ici) ; cron de sauvegarde restant à installer.

- **2026-08-29 (persistance des images produit, Phase 3)** - Investigation déclenchée par une
  question directe du propriétaire ("on ne doit pas perdre les images à chaque déploiement").
  Root cause identifiée par lecture du code source de `@medusajs/file-local`
  (`node_modules/@medusajs/file-local/dist/services/local-file.js`) et de `@medusajs/medusa`
  (aucune occurrence de `express.static` dans tout le package - confirmé par grep) : le module
  `file` n'était configuré nulle part dans `medusa-config.ts`, donc file-local tournait sur ses
  valeurs par défaut (`backend_url: "http://localhost:9000/static"`, `upload_dir: "static"`
  relatif à `process.cwd()`) - et rien, ni Medusa lui-même ni Apache, ne sert jamais ce chemin.
  Les images produit étaient donc cassées par construction, indépendamment de toute question de
  redéploiement (bug préexistant, pas introduit par la Phase 3). Le commentaire déjà présent dans
  `import-catalog.ts` (fonction `fixImageUrl`) documentait le symptôme (mauvais port en dev) sans
  corriger la cause racine.
  - **Choix tranché avec le propriétaire** : volume Docker + route Apache (pas de bascule vers un
    stockage objet S3-compatible - pas de compte/coût externe supplémentaire, cohérent avec
    l'infra VPS mono-serveur existante).
  - **Correctifs** : `apps/backend/medusa-config.ts` - module `file` configuré explicitement
    (`@medusajs/medusa/file` + provider `@medusajs/medusa/file-local`), `backend_url` construit
    depuis `MEDUSA_BACKEND_PUBLIC_URL` (fallback `http://localhost:9000` en dev, comportement
    inchangé en local). `docker-compose.prod.yml` - `MEDUSA_BACKEND_PUBLIC_URL` réutilise la même
    valeur que `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (même domaine public que le storefront) ; bind
    mount `./static-data:/app/static` sur le service `backend` (bind mount et non volume nommé
    Docker, délibérément : Apache tourne sur l'hôte, pas dans un conteneur, et doit lire ce même
    répertoire directement). `deploy/apache/*.conf` (staging et production) - `Alias /static/`
    vers `/opt/golden-market/{staging,production}/static-data/` avec `ProxyPass /static !` pour
    exclure ce chemin du reverse proxy vers le backend. `.gitignore` - `static-data/` ajouté (bind
    mount local, jamais commité, même traitement que `.env.deploy`).
  - **Vérifié** : `medusa build` repasse proprement (premier essai avait échoué -
    `@medusajs/medusa/file-local` ne s'utilise pas seul en `resolve` direct, il faut l'envelopper
    dans le module `@medusajs/medusa/file` avec un tableau `providers`, corrigé) ; suite unitaire
    toujours 40/40 verte ; `docker compose -f docker-compose.prod.yml --env-file ... config` valide
    sans erreur.
  - **Non fait dans ce lot, volontairement** : `fixImageUrl` dans `import-catalog.ts` (le
    contournement dev pour le port 9001) laissé en l'état - devenu inoffensif (no-op si
    `MEDUSA_BACKEND_PUBLIC_URL` est absent en dev, comportement par défaut inchangé) mais pas
    retiré, script sensible (tarifs de gros) hors périmètre de ce correctif ciblé.
  - Commité directement sur `staging` (pas de plan/subagent-driven-development pour ce
    correctif ciblé et déjà vérifié par build+tests - même traitement que les 3 correctifs
    TypeScript de la Task 3 originale de cette phase).

- **2026-08-27/28 (déploiement staging/production, Phase 3, artefacts de code)** - Design validé
  par brainstorming (`docs/superpowers/specs/2026-08-27-phase3-deploiement-staging-production-design.md`) :
  VPS unique partagé avec `n8n_automation`, Apache existant comme unique reverse proxy (pas de
  Traefik/Caddy), `docker-compose.prod.yml` unique paramétré par `.env.deploy` (préfixe `ENV_NAME`
  sur les noms de conteneurs, isolation réelle via le répertoire de déploiement), compte SSH `admin`
  existant réutilisé pour la CI/CD (décision explicite du propriétaire malgré le risque signalé -
  clé de déploiement avec accès sudo complet au VPS). Plan détaillé écrit
  (`docs/superpowers/plans/2026-08-27-phase3-deploiement-staging-production.md`), exécuté via
  `subagent-driven-development` dans un worktree isolé (`phase3-deploiement-staging-production`),
  8 tâches + une revue finale de branche (Opus) + un fix wave.
  - **Correctif préalable non planifié** : `medusa build` (jamais lancé en pratique avant cette
    phase, seul `medusa develop` l'avait été) échouait sur 3 erreurs TypeScript préexistantes sur
    `main`, sans rapport avec la Phase 3 - propriété `port` invalide dans `medusa-config.ts`
    (n'existe plus dans le type de `@medusajs/framework` 2.18.0), fichiers `__tests__/*.spec.ts`
    inclus dans la compilation `medusa build` (jamais utilisée par Jest, qui a sa propre
    transformation swc), et propriété `rules` (règle de prix de gros) invalide dans
    `import-catalog.ts` - traité avec l'accord explicite du propriétaire, correctif minimal et
    confirmé sans effet sur le comportement runtime (40/40 tests unitaires toujours verts, JS émis
    byte-identique pour le `@ts-expect-error`).
  - **Livrables** : `apps/backend/Dockerfile` et `apps/storefront/Dockerfile` (images construites
    sans `NODE_ENV=production`, secrets réels injectés seulement au runtime) ;
    `docker-compose.prod.yml` (Postgres/Redis dédiés sans port publié sur l'hôte,
    backend/storefront sur `127.0.0.1` uniquement, `network: host` sur le build du storefront -
    `next build` fait de vrais appels réseau au backend via `generateStaticParams` - et
    `?sslmode=disable` sur `DATABASE_URL`, Postgres du conteneur ne servant pas TLS) ;
    `deploy/backup-postgres.sh` (rétention 7 jours staging / 30 jours production) ;
    `deploy/apache/*.conf` (écrasement de `X-Forwarded-For`, condition du rate limiting Phase 2) ;
    `.github/workflows/deploy-{staging,production}.yml`.
  - **3 défauts de plan découverts et corrigés pendant l'exécution** (au-delà des tâches
    prévues) : (1) le test bout en bout local du storefront échouait contre le domaine de staging
    réel (sert un autre site sur le VPS partagé, mismatch TLS) - contourné en pointant vers le
    backend de dev local seedé pour valider le mécanisme de build ; (2) le `.env` de test prescrit
    par le plan utilisait des CORS `localhost`, rejetées par le garde-fou Phase 2 dès que
    `NODE_ENV=production` (ce que fixe le compose) - corrigé en `127.0.0.1` ; (3) `medusa start` ne
    migre jamais automatiquement le schéma, donc l'ordre initialement prévu (démarrer puis migrer)
    plantait en boucle sur une base neuve - corrigé en migrant via un conteneur jetable avant le
    démarrage du démon.
  - **Revue finale de branche (Opus)** : verdict "Ready to merge: With fixes", 3 findings Critical
    - tous liés au fait que le correctif du point (3) ci-dessus n'avait jamais été répercuté ni
    dans le Runbook manuel du plan ni dans les workflows GitHub Actions (corrigé dans le fix wave,
    re-review scoped clean, aucune régression). 7 findings Important corrigés dans le même fix wave
    (en-tête `X-Forwarded-Proto` codé en dur "http" cassant la redirection région en HTTPS,
    vérification manquante du redirect HTTP→HTTPS, absence de `concurrency:` sur les workflows,
    absence de nettoyage d'images Docker - risque disque sur le VPS partagé avec `n8n_automation` -,
    `generateStaticParams` de la page catégories sans gestion d'erreur contrairement à la page
    produit, avertissement manquant sur le piège CORS `localhost`).
  - **Point ouvert différé** (pas un défaut introduit par cette phase) : les images produit
    (`file-local`, pas de module `file` configuré) seraient perdues à chaque redéploiement et
    persisteraient des URLs `localhost` inatteignables en base - à résoudre avant tout import de
    catalogue réel en staging/production, nécessite une décision de conception (domaine public,
    volume) avec le propriétaire.
  - Merge local (fast-forward, pas de conflit) dans `main`, worktree et branche nettoyés. Aucun
    push effectué. Branche `staging` créée et poussée sur `origin` (Task 1 du plan, confirmée
    explicitement avant push) - reste vide de commits applicatifs au-delà de ce que `main`
    contenait au moment de sa création.
  **Reste à faire (Runbook manuel, hors périmètre automatisable)** : provisionnement réel du VPS
  (répertoires `/opt/golden-market/{staging,production}`, secrets réels dont Orange Money/Resend de
  test pour staging), installation effective des vhosts Apache + certbot, secrets GitHub Actions,
  cron de sauvegarde, premier déploiement staging suivi d'une validation explicite du propriétaire
  avant tout déploiement production - jamais enchaîné automatiquement.

- **2026-08-27 (durcissement sécurité, Phase 2)** - Phase 2 clôturée via un plan dédié
  (`.superpowers/sdd/2026-08-27-phase2-durcissement-securite/`, non commité comme le reste
  de `.superpowers/`, dans `.gitignore`), 2 tâches de code plus cette clôture documentaire :
  - **Garde-fou de démarrage** : `apps/backend/src/lib/assert-production-config.ts`, fonction
    `assertProductionConfig(env)` appelée au démarrage de `medusa-config.ts` (commit
    `be80946`). Fait échouer le boot en production (`throw`) si `JWT_SECRET` ou
    `COOKIE_SECRET` sont absents, égaux à la valeur de dev `"supersecret"`, ou trop courts
    (< 32 caractères), ou si `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` contiennent
    `"localhost"`. No-op hors production - ce qui répond aux deux premiers points du
    `ROADMAP.md` Phase 2 (secrets forts, CORS restreints) : désormais imposé au démarrage,
    plus seulement documenté.
  - **Rate limiting du reset de mot de passe** : middleware Medusa
    (`apps/backend/src/api/middlewares.ts` et
    `apps/backend/src/api/middlewares/rate-limiter.ts`, commits `a565ccd` puis `c966629`)
    qui limite `POST /auth/customer/emailpass/reset-password` à 5 requêtes / 15 minutes par
    IP, via le module cache Redis déjà en place (pas de nouvelle dépendance). Comptage
    best-effort (pas d'incrément atomique) - jugé suffisant pour ce cas d'usage (protection
    contre l'abus, pas une garantie stricte). En cas de panne du cache Redis, le middleware
    "fail open" : il logue un warning et laisse passer la requête plutôt que de bloquer tous
    les resets de mot de passe - choix (fail-open vs fail-closed) explicitement validé par le
    propriétaire du dépôt après qu'une revue de sécurité automatique en a suggéré l'inverse,
    précisément parce que Redis est déjà une dépendance dure ailleurs dans ce backend (cache
    et event bus, sans repli) : une panne Redis casse de toute façon d'autres flux en même
    temps.
  - **Deux points déjà satisfaits sans action de code**, vérifiés pendant le cadrage de ce
    plan : le compte admin dédié en prod (déjà documenté dans `ARCHITECTURE.md` ligne 64,
    fait partie de la procédure de déploiement listée en Phase 3 du `ROADMAP.md`) et
    l'hygiène des fichiers `.env` / `.env.local` (déjà correctement ignorés par git dans les
    `.gitignore` respectifs).
  Phase 2 marquée **fait** dans `ROADMAP.md` et ci-dessus : les 5 points sont couverts, 3 par
  du code réel (secrets forts et CORS via `assertProductionConfig`, rate limiting via le
  middleware Redis) et 2 par vérification sans changement de code (compte admin, hygiène
  `.env`).
- **2026-08-24/27 (refonte visuelle du storefront, Phase 1.5)** — Spec de design créée et
  validée par brainstorming (`docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`) :
  palette violet/or extraite de la charte existante, typographie Baloo 2 + Inter, bibliothèque
  de composants partagés. 4 plans d'implémentation écrits puis exécutés via
  `subagent-driven-development`, chacun revu et mergé séparément sur `main` : Fondation (tokens
  Tailwind, `Button`/`Badge`/`Chip`/`Heading`), Accueil/Catalogue/Fiche produit, Panier/Paiement,
  Compte. Détail des tâches et rulings dans `docs/superpowers/plans/2026-08-24-storefront-redesign-*.md`.
  Après les 4 merges, session de finition autonome (accord explicite du propriétaire pour
  continuer sans reconfirmation à chaque étape) :
  - Accessibilité clavier du `Chip` (`span` → `button`, focus ring).
  - Vérification visuelle avec un vrai backend (jamais fait avant dans ce dépôt — voir mémoire
    session `feedback_visual_verification_required`) : a trouvé 3 bugs invisibles à `npm run
    build` seul — ordre d'import CSS cassant `next dev --turbopack` (mais pas le build webpack
    de prod), 500 sur un handle produit accentué (`params.handle` arrive percent-encodé, jamais
    décodé), chevauchement de texte dans le footer en mobile.
  - Branding Medusa résiduel retiré (composant `MedusaCTA`, icône, mentions footer), storefront
    traduit intégralement en français (nav, boutons, fiche produit, sélecteur de pays, panier,
    checkout, compte) — hors Profil/Adresses/Commandes et labels de champs individuels, hors
    périmètre explicite des 4 plans.
  - ~20 constats mineurs parqués dans les ledgers des 4 plans traités en un lot dédié (revu par
    le propriétaire avant traitement).
  - Vraie taxonomie de catégories créée (`apps/backend/src/scripts/seed-categories-bf.ts`,
    idempotent) : les 4 catégories de démo Medusa (Shirts/Sweatshirts/Merch/Pants, restées vides
    depuis l'import du vrai catalogue) remplacées par 6 catégories construites à partir des 29
    produits réels (Électronique et Gadgets, Maison et Cuisine, Beauté et Bien-être, Mode et
    Bagagerie, Jouets et Enfants, Équipement commercial et Boucherie). Bug Medusa découvert au
    passage : un `&` dans le nom d'une catégorie est conservé tel quel dans le handle généré
    (`maison-&-cuisine`), ce qui fait 404 sur la route catégorie du storefront — noms choisis
    avec « et » pour l'éviter (voir mémoire session `project_golden_market_category_handle_ampersand_bug`).
  - Fond du menu mobile retinté aux couleurs `gm-*` (était resté aux tokens Medusa génériques,
    seul point de la refonte non couvert par un plan explicite).
  **Point ouvert** : le contenu de l'onglet « Livraison et retours » (délais, politique
  d'échange/retour) reste une traduction du texte de démo Medusa d'origine, jamais confronté à
  la vraie politique du propriétaire — à vérifier avant lancement. Voir aussi Phase différée
  ci-dessus pour les TODOs hérités du template (Toaster, gestion email/mot de passe du compte)
  restés hors périmètre de cette refonte.
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
