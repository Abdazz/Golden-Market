# Recherche sémantique de produits (pgvector) pour l'agent WhatsApp

## Contexte

L'agent WhatsApp (dépôt `n8n_automation`) dispose aujourd'hui de deux
mécanismes de recherche produit, appelés en cascade :

1. `find_products` — recherche floue `pg_trgm` (`/store/products-fuzzy-search`),
   tolérante aux fautes de frappe/accents/pluriel, mais pas aux synonymes
   (« balai » ne matche jamais « serpillière »).
2. `browse_catalog` — repli quand `find_products` échoue deux fois : renvoie
   la liste complète du catalogue publié (titre, prix, disponibilité) au
   modèle IA, qui fait lui-même le rapprochement sémantique/phonétique.
   Choix documenté dans `HANDOFF.md` (2026-09-15) : à 39 produits, une vraie
   infra d'embeddings semblait disproportionnée face au coût de
   développement, et l'appel IA a de toute façon déjà lieu à chaque tour.

Cette deuxième solution fonctionne bien à l'échelle actuelle (39 produits)
mais ne passera pas à l'échelle si le catalogue grossit significativement
(des centaines/milliers de produits) : dumper tout le catalogue dans le
prompt à chaque repli devient impraticable (coût et latence des appels IA).

Le catalogue Medusa reste la source de vérité (voir `ARCHITECTURE.md`) ;
cette recherche doit donc vivre côté Medusa comme les routes de recherche
existantes (`/store/products-fuzzy-search`, `/store/products-catalog`), pas
côté n8n.

## Objectif

Ajouter une recherche vectorielle (embeddings + pgvector) qui :
- reste pertinente quel que soit le nombre de produits futurs (contrairement
  à `browse_catalog`, qui dépend directement de la taille du catalogue) ;
- reste économiquement négligeable au volume actuel (embeddings OpenAI,
  crédential déjà existante côté n8n pour la vision/Whisper, réutilisée côté
  Medusa via une nouvelle variable dédiée) ;
- s'intègre à la cascade existante sans en dégrader le comportement pour le
  cas déjà bien géré (fautes de frappe).

## Non-objectifs (hors scope)

- Remplacer ou retirer `find_products` (pg_trgm reste la première ligne,
  rapide et bien calibrée pour les fautes de frappe).
- Retirer `browse_catalog` — il reste un filet de sécurité de dernier
  recours, pas modifié dans son fonctionnement interne.
- Calibrer un seuil de similarité cosinus dès cette itération (voir
  « Décision : pas de seuil au démarrage »).
- Ré-indexation en masse programmée (cron) — la mise à jour se fait au fil
  de l'eau (subscriber) plus un backfill one-shot initial.
- Étendre la recherche sémantique aux images ou à d'autres modalités.

## Décision : pas de seuil de similarité au démarrage

Le seuil `pg_trgm` actuel (`SIMILARITY_THRESHOLD = 0.4`) a été calibré
empiriquement sur des requêtes réelles. On n'a pas encore l'équivalent pour
des embeddings sur ce catalogue précis — fixer un seuil de coupure
maintenant serait arbitraire. La route renvoie donc systématiquement le
top-K (par défaut 8, plafond 15, mêmes bornes que `/store/products-catalog`)
et laisse le modèle IA juger de la pertinence parmi les candidats — même
philosophie que `browse_catalog`, appliquée à un sous-ensemble ciblé plutôt
qu'au catalogue entier. Un seuil pourra être introduit plus tard une fois
des données réelles de requêtes disponibles.

## Décision : ordre d'essai des trois tools

`find_products` → `search_products_semantic` (nouveau tool) →
`browse_catalog` en tout dernier recours. Même déclencheur qu'aujourd'hui
(2 échecs consécutifs de `find_products`) pour passer à la recherche
sémantique ; `browse_catalog` n'intervient que si celle-ci ne renvoie rien
de pertinent. Le garde-fou déterministe `consecutive_search_misses` se
comporte comme aujourd'hui : remis à zéro dès qu'une recherche (sémantique
incluse) aboutit à un produit réellement présenté au client.

## Architecture

### Modèle de données (backend Medusa)

Nouveau module custom `apps/backend/src/modules/product-embedding/` :

- Modèle `ProductEmbedding` : `id`, `embedding` (`vector(1536)`, dimension du
  modèle `text-embedding-3-small`), `content_hash` (SHA-256 de
  `title + description`, permet de ne ré-embedder que si le texte source a
  changé), `created_at`/`updated_at`.
- Lié au `Product` via un module link (`src/links/product-embedding.ts`),
  pattern Medusa v2 standard pour étendre une entité core sans toucher à ses
  tables.
- Migration : `CREATE EXTENSION IF NOT EXISTS vector` (idempotent) + table
  `product_embedding` avec index `USING hnsw (embedding vector_cosine_ops)`.
  HNSW plutôt qu'IVFFlat : reste correct dès le premier produit (IVFFlat a
  besoin d'un volume suffisant pour être efficace) et jusqu'à plusieurs
  millions de lignes — pas besoin de changer de stratégie d'index si le
  catalogue grossit.

### Pipeline d'indexation

- `lib/product-embedding-client.ts` (pur, testable comme
  `meta-conversions-client.ts`) : POST `https://api.openai.com/v1/embeddings`,
  modèle `text-embedding-3-small`, retourne le vecteur.
- Subscriber sur `product.created`/`product.updated` : recalcule le hash du
  texte source ; ne rappelle l'API OpenAI et ne réécrit l'embedding que si le
  hash a changé (évite un appel inutile sur un simple changement de prix/stock).
  Même pattern défensif (try/catch, jamais de `throw`, log) que les autres
  subscribers Meta.
- Script one-shot idempotent `backfill-product-embeddings.ts` (même
  convention qu'`activate-stock-tracking-old-catalog.ts`) : embarque les
  produits publiés sans entrée `product_embedding` existante.

### Nouvelle variable d'environnement

`OPENAI_API_KEY` (backend), à documenter dans `.env.template`. Distincte des
credentials OpenAI de n8n (systèmes différents), mais mêmes coûts
négligeables à ce volume.

### Route API

`GET /store/products-semantic-search?q=<texte>&limit=<n>` (route publique
standard sous `/store`, passe par le middleware clé publiable comme les
autres routes store) :

1. Embed `q` via `product-embedding-client.ts`.
2. Requête pgvector : tri par distance cosinus (`embedding <=> vecteur`)
   contre `product_embedding`, jointure vers les produits **publiés
   uniquement**, limite par défaut 8 (plafond 15).
3. Même règle de confidentialité stock que `/store/products-catalog` :
   disponibilité binaire (« in stock »/« out of stock ») uniquement, jamais
   la quantité exacte (réutilise `getTotalVariantAvailability`/
   `computeAvailability`).
4. Si `OPENAI_API_KEY` n'est pas configurée : réponse d'erreur explicite
   (jamais un tableau vide silencieux), pour que n8n distingue
   « fonctionnalité indisponible » d'« aucun résultat pertinent ».

### Intégration agent WhatsApp (n8n)

- Nouveau tool `search_products_semantic` (sous-workflow *Call n8n Workflow
  Tool*, trigger *When Executed by Another Workflow*, input `query`).
- `HTTP Request` en `GET` vers la nouvelle route, `onError:
  "continueErrorOutput"` au **niveau racine du node** (piège déjà documenté
  dans `AGENTS.md` de `n8n_automation`), rerouté vers une réponse de repli
  cohérente pour le client.
- Prompt système mis à jour : ordre d'essai des trois tools (voir
  « Décision : ordre d'essai »).

## Tests

TDD complet côté backend, mêmes conventions que `meta-conversions-*` :
- `product-embedding-client.ts` : appel HTTP mocké, gestion des erreurs.
- Subscriber : logique de hash (recalcule seulement si le texte change),
  jamais de throw, mock du client d'embeddings.
- Migration/module : au minimum un test d'intégration confirmant l'extension
  et l'index.
- Route `products-semantic-search` : mock du client + de la requête,
  confidentialité stock, comportement sans `OPENAI_API_KEY`.

Vérification finale en conditions réelles (comme les sessions précédentes) :
`curl` avec signature HMAC (jamais de vrai message WhatsApp), avec une
requête volontairement synonyme (type recherche qui échouerait sur
`pg_trgm`) pour confirmer que la cascade fonctionne bout en bout.

## Rollout

1. Backend : migration + module + subscriber + route, TDD, déployé sur
   staging puis production (circuit habituel `staging` → vérification →
   `main`).
2. `OPENAI_API_KEY` ajoutée aux deux environnements (`.env.deploy` de
   chaque VPS).
3. `backfill-product-embeddings.ts` exécuté sur staging puis production
   après déploiement (même pattern que les scripts one-shot précédents).
4. Vérification manuelle de la route sur staging.
5. n8n : nouveau tool + prompt mis à jour, testé en conditions réelles
   (webhook signé) sur l'instance n8n (bascule `MEDUSA_ENV` déjà en place
   pour cibler staging vs production).
