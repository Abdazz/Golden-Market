# Synchronisation du catalogue Medusa vers Meta Commerce Manager

## Contexte

Golden Market veut exploiter les fonctionnalités commerce de Meta (catalogue
WhatsApp natif, Shops Facebook/Instagram, pubs dynamiques/catalogue). Ces
fonctionnalités reposent toutes sur un même objet côté Meta : un **Commerce
Catalog**, alimenté par un flux produit.

Ce document couvre uniquement la synchronisation Medusa → Meta. La création
du catalogue dans Commerce Manager, sa liaison au compte WhatsApp Business,
et la création des pubs elles-mêmes sont des étapes manuelles côté Meta, hors
scope de ce document (voir « Étapes manuelles côté Meta » plus bas).

Golden Market a déjà :
- un backend Medusa v2 avec des subscribers d'événements établis
  (`order-placed-customer-whatsapp.ts`, `order-placed-customer-email.ts`) —
  pattern à réutiliser : `try/catch`, log, jamais de `throw`, jamais bloquant
  pour le flux principal ;
- un storefront Next.js avec des URLs produit stables :
  `https://golden-market.co/bf/products/{handle}` ;
- une logique de disponibilité stock déjà établie (reprise du storefront et
  du tool WhatsApp `find_products`) : pas de suivi de stock → toujours
  disponible ; suivi + réappro autorisée → toujours disponible ; suivi sans
  réappro → dépend de la quantité réelle.
- des produits avec plusieurs variantes (tailles, modèles), prix et stock
  différents par variante.

## Objectif

Maintenir un catalogue Meta à jour avec le catalogue Medusa réel, avec une
fraîcheur suffisante pour :
1. la navigation catalogue native dans WhatsApp,
2. les pubs dynamiques/catalogue Facebook & Instagram.

## Non-objectifs (hors scope)

- Créer ou gérer des campagnes publicitaires — c'est un travail côté Meta
  Ads Manager, indépendant de ce document.
- Push temps réel sur la création d'un produit, le changement de titre, de
  description ou d'images — voir « Décision : portée du temps réel ».
- Configuration du Shop Facebook/Instagram (UI Meta).
- Gestion multi-devises/multi-région (Golden Market ne vend qu'en XOF, au
  Burkina Faso).

## Décision : portée du temps réel

Deux champs justifient un push immédiat, parce qu'un décalage y est
directement visible et gênant pour le client : **le prix** et la
**disponibilité stock** (rupture ↔ retour en stock).

Tout le reste (nouveau produit, titre, description, images) est couvert par
le flux périodique uniquement, avec un délai acceptable équivalent à la
fréquence de récupération choisie côté Meta (typiquement quotidienne). Un
produit tout juste créé n'apparaît donc pas instantanément dans le
catalogue Meta — c'est un compromis assumé pour ne pas multiplier les
points d'intégration temps réel.

## Architecture

Trois composants, tous côté backend Medusa (`apps/backend`) :

### 1. Client Meta Catalog

`apps/backend/src/modules/meta-catalog/client.ts`

Wrapper fin autour de l'API Batch de Meta
(`POST /{catalog_id}/items_batch`), utilisé par les subscribers temps réel.
Une seule fonction exportée dans un premier temps :

```ts
upsertCatalogItem(item: MetaCatalogItem): Promise<void>
```

Construit le payload attendu par l'API Batch (`method: "UPDATE"` avec
`retailer_id` + les champs modifiés) et l'envoie. Suit le même style que les
appels `fetch` déjà présents dans les subscribers existants — pas de nouvelle
dépendance HTTP.

### 2. Route de flux périodique

`apps/backend/src/api/meta-catalog-feed/route.ts`

Route GET publique (les données sont déjà publiques sur le storefront —
pas de secret requis). Interroge `query.graph` pour tous les produits
publiés avec leurs variantes, prix, stock et images, et retourne un fichier
CSV au format attendu par Meta (une ligne = une variante).

**Volontairement hors du préfixe `/store`** : Medusa applique
automatiquement `ensurePublishableApiKeyMiddleware` à tout `/store/*` au
niveau du framework (`@medusajs/framework/dist/http/router.js`,
indépendant de `apps/backend/src/api/middlewares.ts` — invisible en lisant
seulement le code du projet). Un flux planifié Meta n'a aucun moyen
d'envoyer ce header, donc la route vit à la racine (`/meta-catalog-feed`,
pas `/store/meta-catalog-feed`) pour rester réellement accessible sans
authentification. Découvert en testant manuellement après le premier merge
(la revue de code, y compris la revue finale multi-tâches, n'avait vérifié
que le fichier `middlewares.ts` du projet, pas le comportement global du
framework Medusa) — voir HANDOFF.md 2026-09-05.

C'est cette URL (`https://golden-market.co/meta-catalog-feed`) qu'on
enregistre manuellement dans Commerce Manager comme « flux planifié », avec
la fréquence de récupération choisie côté Meta.

### 3. Subscribers temps réel

Même pattern que `order-placed-customer-whatsapp.ts` (try/catch, logger,
jamais de throw) :

- `product-variant-price-updated-meta-catalog.ts` — `config.event =
  "product-variant.updated"`. Pousse le nouveau `price` pour l'item concerné.
- `product-variant-stock-updated-meta-catalog.ts` — `config.event = ["inventory-level.updated",
  "reservation-item.created", "reservation-item.updated",
  "reservation-item.deleted"]` (un subscriber Medusa accepte un tableau
  d'événements). Recalcule la disponibilité (même logique in-stock que le
  storefront) et pousse la nouvelle `availability` si elle a changé.

**Noms d'événements confirmés** (lus directement dans
`@medusajs/core-flows@2.18.0`, code réellement exécuté par les workflows —
pas les constantes `PricingEvents`/`InventoryEvents` de `@medusajs/utils`,
qui sont mortes, commentées dans le code source avec un TODO "à réactiver
plus tard", et ne sont émises par aucun workflow) :

- **Prix** : `product-variant.updated` (payload `{ id }`, id de la variante
  uniquement). C'est le seul événement émis par `updateProductVariantsWorkflow`
  — celui que l'admin API appelle pour modifier le prix d'une variante — que
  le changement porte sur le prix ou sur un autre champ. Le subscriber doit
  donc se déclencher sur cet événement générique et recalculer/repousser le
  prix à chaque fois (pas de moyen de filtrer "uniquement si le prix a
  changé" à la source ; coût négligeable, cohérent avec le pattern existant
  des subscribers WhatsApp qui ne relancent jamais).
- **Stock** : deux événements distincts sont nécessaires pour couvrir tous les
  cas réels de changement de disponibilité :
  - `inventory-level.updated` (payload `{ id, order_id? }`, id du niveau
    d'inventaire) — édition directe de `stocked_quantity`/`reserved_quantity`
    (ex. admin "Modifier le stock").
  - `reservation-item.created` / `.updated` / `.deleted` (payload
    `{ id, order_id? }`, id de la réservation) — une commande passée en
    checkout crée une réservation qui réduit la quantité *disponible* sans
    toucher à `inventory-level`, donc sans déclencher l'événement ci-dessus.

Dans les deux familles, le payload ne contient que l'id de l'entité
Medusa concernée (jamais l'id de variante/produit, ni la nouvelle valeur) —
le subscriber doit toujours recharger l'entité via `query.graph` pour
retrouver la variante concernée et sa valeur actuelle avant de pousser vers
Meta.

## Granularité et mapping des champs

Une **variante Medusa = un item catalogue Meta**, regroupées via
`item_group_id` = id du produit parent (pour que Meta les affiche comme un
seul produit avec plusieurs options).

| Champ flux Meta | Source Medusa |
|---|---|
| `id` (retailer_id) | id de la variante |
| `item_group_id` | id du produit parent |
| `title` | titre du produit (+ nom de la variante si pertinent) |
| `description` | description du produit |
| `availability` | calculée (voir logique in-stock existante) → `in stock` / `out of stock` |
| `condition` | toujours `new` |
| `price` | `calculated_price` de la variante, format `"<montant> XOF"` |
| `link` | `https://golden-market.co/bf/products/{handle}` |
| `image_link` | image de la variante, ou image principale du produit à défaut |
| `brand` | `"Golden Market"` (constante) |

## Flux de données

```
Périodique (photo complète, filet de sécurité) :
  Commerce Manager (planifié côté Meta)
    --GET--> /meta-catalog-feed
    --query.graph--> tous les produits publiés
    --CSV--> Meta ingère et réconcilie tout le catalogue

Temps réel (prix / stock uniquement) :
  Événement Medusa (prix ou stock change)
    --subscriber--> upsertCatalogItem()
    --Batch API--> un seul item mis à jour chez Meta en quelques secondes
```

Le flux périodique agit comme filet de sécurité : si un push temps réel
échoue (jeton expiré, coupure réseau) ou qu'un événement a été manqué, la
prochaine récupération du flux périodique corrige automatiquement l'écart.

## Gestion des erreurs

- Subscribers temps réel : `try/catch`, `logger.error`, ne relancent jamais
  — un échec de synchro catalogue ne doit jamais faire échouer une mutation
  produit/stock côté Medusa. Identique au pattern des subscribers WhatsApp
  et email existants.
- Route de flux : si `query.graph` échoue, retourne une erreur HTTP standard
  — Meta réessaiera à sa prochaine fréquence planifiée, pas de logique de
  retry à construire de notre côté.

## Configuration

Nouvelles variables d'environnement (backend Medusa, staging et
production) :
- `META_CATALOG_ID` — id du catalogue créé dans Commerce Manager.
- `META_CATALOG_ACCESS_TOKEN` — jeton d'accès avec la permission
  `catalog_management`. À vérifier si le token WhatsApp existant
  (`WHATSAPP_ACCESS_TOKEN`) peut être réutilisé (mêmes scopes de Business
  Manager) avant d'en provisionner un nouveau.

## Tests

Mêmes conventions que `order-placed-customer-whatsapp.unit.spec.ts` :
`query.graph` et l'appel Meta mockés, un test par cas :
- flux périodique : génère les bonnes lignes CSV pour un produit
  multi-variantes, gère un produit sans image, gère un produit hors stock ;
- subscriber prix : pousse le bon payload sur changement de prix ;
- subscriber stock : pousse `in stock` / `out of stock` selon la logique
  existante (suivi, réappro, quantité) ;
- les deux subscribers logguent et ne relancent pas en cas d'échec de l'appel
  Meta.

## Étapes manuelles côté Meta (hors code)

1. Créer le Commerce Catalog dans Business Manager.
2. Enregistrer `https://golden-market.co/meta-catalog-feed` comme flux
   planifié, choisir la fréquence de récupération.
3. Lier le catalogue au compte WhatsApp Business (active la navigation
   catalogue native dans le chat).
4. Vérifier que le token utilisé a la permission `catalog_management` sur ce
   catalogue.

## Risques / points à vérifier pendant l'implémentation

- Confirmer si `WHATSAPP_ACCESS_TOKEN` couvre la permission
  `catalog_management`, ou si un token dédié est nécessaire.
