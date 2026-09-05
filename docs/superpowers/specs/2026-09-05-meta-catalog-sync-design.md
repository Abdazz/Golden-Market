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

`apps/backend/src/api/store/meta-catalog-feed/route.ts`

Route GET publique (les données sont déjà publiques sur le storefront —
pas de secret requis). Interroge `query.graph` pour tous les produits
publiés avec leurs variantes, prix, stock et images, et retourne un fichier
CSV au format attendu par Meta (une ligne = une variante).

C'est cette URL (`https://golden-market.co/store/meta-catalog-feed`) qu'on
enregistre manuellement dans Commerce Manager comme « flux planifié », avec
la fréquence de récupération choisie côté Meta.

### 3. Subscribers temps réel

Même pattern que `order-placed-customer-whatsapp.ts` (try/catch, logger,
jamais de throw) :

- `product-variant-price-updated-meta-catalog.ts` — déclenché sur
  changement de prix d'une variante. Pousse le nouveau `price` pour l'item
  concerné.
- `product-variant-stock-updated-meta-catalog.ts` — déclenché quand la
  disponibilité calculée (via la même logique in-stock que le storefront)
  bascule. Pousse la nouvelle `availability`.

Les noms d'événements Medusa exacts (prix : `product-variant.updated` a
priori ; stock : événement du module Inventory, à confirmer) sont à vérifier
pendant l'implémentation — Medusa v2 sépare le module Inventory du module
Product, et le nom précis de l'événement de changement de quantité n'a pas
été vérifié dans ce document.

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
    --GET--> /store/meta-catalog-feed
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
2. Enregistrer `https://golden-market.co/store/meta-catalog-feed` comme flux
   planifié, choisir la fréquence de récupération.
3. Lier le catalogue au compte WhatsApp Business (active la navigation
   catalogue native dans le chat).
4. Vérifier que le token utilisé a la permission `catalog_management` sur ce
   catalogue.

## Risques / points à vérifier pendant l'implémentation

- Noms exacts des événements Medusa v2 pour le changement de quantité de
  stock (module Inventory) — non vérifiés dans ce document.
- Confirmer si `WHATSAPP_ACCESS_TOKEN` couvre la permission
  `catalog_management`, ou si un token dédié est nécessaire.
