# Statistiques de visite storefront (Matomo self-hosted)

Spec validée par brainstorming le 2026-09-02. Sous-projet issu du prompt de reprise
« observabilité et statistiques de visite » (voir `HANDOFF.md`) — traité en premier,
avant l'observabilité backend (traces/erreurs), différée à une session future.

## Contexte et décisions de périmètre

Aucun tracking de visite n'existe aujourd'hui sur le storefront (ni SaaS ni maison).
Contrainte non négociable du propriétaire : **self-hosted uniquement**, aucune
solution SaaS (Google Analytics, Plausible/Umami/Sentry cloud, Vercel Analytics…).

Cadrage acté avec le propriétaire pendant le brainstorming :

- **Objectifs** (les 4 retenus) : volume de trafic global, pages/produits les plus
  vus, provenance des visiteurs (canaux), entonnoir de conversion vue produit →
  panier → commande.
- **Audience** : un dashboard analytics dédié **et** un résumé de chiffres clés
  intégré à l'admin Medusa existant.
- **Confidentialité** : approche avec cookies/session et bannière de consentement
  explicite acceptée (pas d'obligation de rester cookieless).
- **Rétention** : illimitée, aucune purge automatique à construire dans ce
  sous-projet — la marge disque (32 Gio libres sur 197 Gio au 2026-09-02) est à
  resurveiller dans un futur point de suivi VPS, hors périmètre ici.
- **Environnements** : production uniquement. Staging n'a pas de vrais visiteurs à
  mesurer et ne doit pas polluer les statistiques.
- **Nouveau moteur de base de données** : l'ajout de MySQL/MariaDB (à côté du
  PostgreSQL déjà utilisé partout ailleurs sur ce VPS) est accepté si l'outil le
  justifie.
- **Entonnoir de conversion** : le module gratuit Matomo "Objectifs" (Goals) est
  retenu (taux de conversion par étape en tableaux/chiffres) plutôt que le plugin
  payant "Funnels" (~150-200 $/an, visualisation graphique avec paliers d'abandon
  dessinés) — pas de coût récurrent supplémentaire pour ce sous-projet.

Contraintes d'infrastructure existantes (déjà actées, reprises de
`docs/superpowers/specs/2026-08-27-phase3-deploiement-staging-production-design.md`) :

- VPS unique, `/opt/golden-market/{staging,production}`, deux checkouts indépendants,
  un seul `docker-compose.prod.yml` partagé paramétré par `.env.deploy` par
  environnement.
- Marge VPS mesurée le 2026-09-02 (revérifiée au début de cette session) : ~5,8 Gio
  RAM disponible sur 11 Gio, ~32 Gio disque libre sur 197 Gio (84 % utilisé). Le VPS
  héberge déjà staging + production (Postgres, Redis, backend, storefront ×2) sur la
  même machine.
- Apache déjà en place comme reverse proxy pour tous les vhosts du VPS.

## Approches envisagées (pour mémoire)

1. **Matomo self-hosted (retenu)** — mature, conçu pour l'auto-hébergement, couvre
   les 4 objectifs (module Ecommerce natif pour le funnel), gère nativement cookies +
   consentement. Coût : conteneur Matomo (PHP) + conteneur MariaDB.
2. **PostHog self-hosted (écarté)** — funnels visuels + session replay plus riches,
   mais déploiement self-hosted officiel recommandé à ~4 vCPU / 8 Gio RAM, dépassant
   largement la marge VPS disponible sur cette machine partagée. Écarté uniquement
   pour cette raison de dimensionnement, pas pour ses qualités.
3. **Solution maison sur Postgres (écartée)** — évite un nouveau moteur de base,
   mais oblige à reconstruire à la main tout ce qu'un outil d'analytics mature fait
   déjà (parsing referrers, filtrage bots, sessions, funnel, dashboard) — coût
   d'ingénierie/maintenance disproportionné par rapport au gain (le propriétaire a
   explicitement accepté MySQL/MariaDB, ce qui retire l'intérêt principal de cette
   option).

## Architecture

### Infrastructure (Docker Compose)

Deux nouveaux services ajoutés à `docker-compose.prod.yml` (fichier unique partagé
staging/production existant, inchangé pour le reste) :

- `matomo` — image officielle Matomo (PHP).
- `matomo-db` — image officielle MariaDB, base dédiée à Matomo, isolée des données
  Postgres existantes (aucune donnée partagée, aucune requête croisée directe).

Ces deux services sont déclarés sous un **profil Compose** (`profiles: [analytics]`),
activé uniquement via `COMPOSE_PROFILES=analytics` dans le `.env.deploy` de
**production**. Ce flag est absent du `.env.deploy` de staging : les conteneurs n'y
sont jamais créés ni démarrés (pas juste désactivés — inexistants), donc 0 Gio
consommé côté staging, conforme à la décision « production uniquement ».

Volumes nommés (suivent le pattern existant `postgres_data`/`redis_data`) pour les
données MariaDB et la config Matomo — pas de bind mount, Apache n'a pas besoin
d'accéder directement à ces fichiers (contrairement à `static-data`/`catalog-data`
pour le backend).

### Domaine et reverse proxy

Nouveau sous-domaine `analytics.golden-market.co`, vhost Apache dédié + certificat
certbot — même procédure manuelle en SSH que les vhosts staging/production existants
(`docs/superpowers/specs/2026-08-27-phase3-deploiement-staging-production-design.md`).
`ProxyPass`/`ProxyPassReverse` standards vers le port local du conteneur `matomo`
(publié uniquement sur `127.0.0.1`, jamais exposé directement à internet — même
convention que `backend`/`storefront`).

### Sauvegarde

Le script de sauvegarde Postgres existant (cron, rétention 30 jours en production)
est étendu pour dumper aussi `matomo-db`. C'est une sauvegarde de sécurité contre la
perte de données/incident serveur — indépendante de la rétention illimitée des
données à l'intérieur de Matomo lui-même (aucune purge automatique n'est mise en
place par ce sous-projet).

## Intégration du tracking (storefront)

### Activation conditionnelle par variables d'environnement

Le tracker JS Matomo (`matomo.js`) est chargé sur toutes les pages du storefront,
piloté par deux variables publiques : `NEXT_PUBLIC_MATOMO_URL`,
`NEXT_PUBLIC_MATOMO_SITE_ID`. Elles ne sont définies que dans le build de production
(ajoutées aux `args` du build storefront dans `docker-compose.prod.yml`, comme
`NEXT_PUBLIC_MEDUSA_BACKEND_URL` aujourd'hui). Absentes en dev/staging, le tracker ne
s'initialise pas — la contrainte « production uniquement » découle directement de
l'infra, pas d'une branche conditionnelle à maintenir dans le code applicatif.

### Pages vues

Next.js étant une SPA côté navigation, le tracker par défaut de Matomo (conçu pour
des rechargements complets de page) ne suffit pas seul. Un hook branché sur les
événements de route du routeur Next.js appelle `trackPageView` à chaque changement de
page.

### Entonnoir e-commerce (données réelles uniquement, rien fabriqué)

Via l'API JS Ecommerce de Matomo :

- **Fiche produit** → `setEcommerceView` (id, nom, catégorie, prix du produit Medusa
  réel).
- **Ajout au panier** → `trackEcommerceCartUpdate` (contenu réel du panier, montant
  réel).
- **Confirmation de commande** → `trackEcommerceOrder` (id de commande Medusa réel,
  lignes, montants réels) — un seul envoi par commande, déclenché sur la page de
  confirmation déjà existante.

Ces trois événements alimentent le module Objectifs (Goals) gratuit de Matomo pour le
calcul du taux de conversion par étape (vue → panier → commande).

### Provenance

Automatique côté Matomo (lecture de `document.referrer` + paramètres UTM le cas
échéant) — aucun code supplémentaire côté storefront.

### Consentement

Nouveau composant bandeau de consentement, affiché tant qu'aucun choix n'est
enregistré. Tant que le consentement n'est pas donné, le tracker est configuré en
`requireConsent` : aucun cookie posé, aucun appel réseau envoyé (fail closed par
défaut, jamais l'inverse). Le choix de l'utilisateur est mémorisé en `localStorage`
(pas un cookie de tracking) pour ne pas re-solliciter à chaque page.

## Résumé dans l'admin Medusa

Nouveau widget dans `apps/backend/src/admin/widgets/` (zone déjà utilisée pour les
extensions admin custom du projet) affichant : visites du jour/de la semaine, top 5
pages/produits vus, canal de provenance dominant, taux de conversion par étape — plus
un lien « Voir le dashboard complet » vers `analytics.golden-market.co`.

Le widget n'appelle jamais l'API Matomo directement depuis le navigateur (le jeton
d'authentification Matomo resterait exposé côté client). Il passe par une nouvelle
route backend `api/admin/analytics-summary/route.ts` qui, côté serveur, interroge
l'API de reporting Matomo (`module=API&method=VisitsSummary.get…&format=JSON`) avec un
jeton stocké en secret (`apps/backend/.env`, jamais committé, documenté dans
`.env.template` — même convention que le reste des secrets du projet) et renvoie un
JSON déjà agrégé au widget.

## Gestion des erreurs

- **Matomo indisponible côté storefront** (conteneur redémarré, réseau coupé) : les
  appels du tracker JS sont fire-and-forget par conception — un échec réseau ne
  bloque jamais la navigation, le panier ou le paiement du client.
- **Widget admin** : si l'appel à l'API Matomo échoue ou dépasse un timeout court, le
  widget affiche un message neutre « Statistiques indisponibles pour le moment » au
  lieu de faire planter le dashboard admin — jamais de blocage de l'usage quotidien de
  l'admin (produits/commandes) à cause d'un souci analytics.
- **Bandeau de consentement** : en cas d'erreur de lecture/écriture `localStorage`
  (navigation privée stricte, etc.), on retombe sur le comportement fail-closed déjà
  prévu — pas de tracking tant que le consentement explicite n'est pas confirmé.
- **Purge de rétention** : aucun mécanisme de purge automatique construit dans ce
  sous-projet (rétention illimitée décidée) — point de suivi VPS futur, hors
  périmètre.

## Vérification / tests

- **Local** : un conteneur Matomo temporaire (via `docker-compose.override.yml`
  local, jamais committé pour la prod) permet de vérifier en dev que le bandeau de
  consentement s'affiche, que les appels `_paq.push` partent après acceptation (et
  jamais avant), et que les événements Ecommerce sont correctement formés (inspection
  réseau navigateur).
- **Playwright** (`apps/storefront/e2e/`) : nouveaux tests sur le bandeau de
  consentement — affichage par défaut, persistance du choix en `localStorage`, aucun
  appel Matomo déclenché avant consentement explicite. Ces tests ne dépendent pas d'un
  vrai Matomo (comportement du bandeau, pas de Matomo lui-même).
- **Vérification visuelle obligatoire** (règle du projet) une fois déployé sur
  `staging` puis `production` : bandeau de consentement à l'écran, acceptation,
  navigation sur quelques pages/produits/panier, puis vérification dans le vrai
  dashboard Matomo (`analytics.golden-market.co`) que les visites/vues produits/étapes
  de commande apparaissent réellement — et dans l'admin Medusa que le nouveau widget
  affiche des chiffres cohérents avec Matomo (pas inventés).
- **Note staging** : Matomo ne tournant qu'en production, les tests Playwright du
  bandeau tournent en local/staging (le bandeau existe partout), mais la vérification
  bout-en-bout avec un vrai Matomo ne peut se faire qu'en production après déploiement
  — dernière étape, sur données réelles du site en direct (pas de commande de test
  passée en prod, comme d'habitude sur ce projet).

## Hors périmètre de ce sous-projet

- Observabilité backend (traces/erreurs applicatives, `instrumentation.ts`) — sujet
  réel mais différé, à re-proposer une fois ce sous-projet livré.
- Mécanisme de purge automatique des données de rétention.
- Plugin Matomo "Funnels" payant (visualisation graphique de l'entonnoir).
- Tracking sur l'environnement staging.
