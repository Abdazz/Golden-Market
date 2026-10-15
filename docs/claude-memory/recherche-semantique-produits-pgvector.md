---
name: recherche-semantique-produits-pgvector
description: "Recherche sémantique produits (embeddings OpenAI + pgvector) ajoutée le 2026-09-18 comme 3e niveau de repli pour l'agent WhatsApp, déployée et vérifiée en prod/staging"
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-18T15:24:01.945Z
  originSessionId: 4ef3cac7-28fa-4f10-9d26-b19ee62f47db
---

**Statut au 2026-09-18 : déployé et vérifié en production et staging, sujet clos** sauf
un point ouvert noté en bas (invocation réelle du tool jamais observée en conditions
réelles, pas bloquant).

**Contexte de la décision** : le 2026-09-15, `browse_catalog` (le modèle IA lit tout le
catalogue publié) avait été choisi plutôt qu'une infra d'embeddings, jugée
disproportionnée à l'échelle de 39 produits (voir [[golden-market-whatsapp-agent-audit]]).
Le 2026-09-17/18, le propriétaire a demandé pourquoi, motivé par l'anticipation d'une
croissance du catalogue (`browse_catalog` ne scale pas au-delà de quelques centaines de
produits). Décision : ajouter une vraie recherche vectorielle en 3e niveau
(`find_products` pg_trgm → `search_products_semantic` pgvector → `browse_catalog` en
tout dernier recours), sans retirer les deux premiers.

**Architecture** (voir `docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md`
et le plan associé dans le même dossier) : table `product_embedding` (pgvector, index
HNSW, distance cosinus) en SQL brut via `PG_CONNECTION`, **pas de module/modèle Medusa
formel** - pgvector n'a pas de type DML natif dans Medusa v2, même approche que
`product-fuzzy-search.ts` pour `pg_trgm` (contourne l'ORM). Embeddings maintenus à jour
par un subscriber (`product.created`/`product.updated`, hash de contenu pour éviter de
ré-embedder à chaque changement de prix/stock). Route `GET /store/products-semantic-search`
sans seuil de similarité codé en dur (renvoie toujours le top-8, le modèle IA juge de la
pertinence). API OpenAI `text-embedding-3-small`, nouvelle variable backend
`OPENAI_API_KEY` (distincte des credentials OpenAI de n8n).

**Piège majeur rencontré, trouvé seulement à la revue finale de branche (aucune
single-task review ne pouvait le voir)** : aucune image Postgres du projet
(`postgres:16-alpine` nu dans `docker-compose.yml`/`docker-compose.prod.yml`) n'avait
l'extension pgvector. Alpine 3.24 ne fournit pas de paquet pgvector compilé pour
PostgreSQL 16 (le paquet générique tire PostgreSQL 18 en dépendance et installe
l'extension au mauvais endroit). Résolu en compilant pgvector depuis les sources
officielles par-dessus l'image existante (`deploy/postgres/Dockerfile`) - reste sur
Alpine/musl plutôt que l'image officielle `pgvector/pgvector:pg16` (glibc) pour éviter un
changement de collation sur les volumes de données déjà existants. `clang21`/`llvm21`
requis dans l'étape de build uniquement parce que ce build de PostgreSQL 16.15 a le
support JIT activé (sinon `make install` échoue sur les fichiers `.bc`).

**Piège opérationnel** : le workflow de déploiement (`deploy-staging.yml`/
`deploy-production.yml`) ne reconstruit/redémarre jamais le service `postgres` - un
changement dans `docker-compose.prod.yml` touchant ce service doit être appliqué à la
main sur chaque VPS (`docker compose build postgres && docker compose up -d postgres`)
après le déploiement automatique du code.

**Process utilisé** : `superpowers:brainstorming` (cadrage complet, 4 questions) →
`superpowers:writing-plans` (spec + plan écrits, committés) →
`superpowers:subagent-driven-development` dans un worktree dédié (7 tâches TDD, chacune
avec un subagent implémenteur + un subagent reviewer séparé, boucle de correctifs si
besoin) → revue finale de branche sur le modèle le plus capable (a trouvé le blocage
pgvector + 3 autres problèmes réels : `findNearestProductIds` sans filtre
`status='published'`/`deleted_at`, mauvais fichier d'env dans le plan, duplication du
texte d'embedding entre hash/backfill/subscriber) → un seul fix wave + une re-review
scopée → merge dans `staging` puis `main`.

**Vérification en conditions réelles** : route testée par `curl` direct sur staging et
production (`?q=serpilliere`, sans accent, renvoie en tête "Seau à roulettes...
serpillière" et "Balai-éponge..." - le cas synonyme balai/serpillière de l'audit
2026-09-15). Tool n8n câblé (sous-workflow importé, node ajouté au workflow principal,
prompt système mis à jour, voir `n8n_automation/guide-golden-market-agent.md` §2.6).

**Point resté ouvert, pas bloquant** : trois vrais tours de conversation testés (webhook
signé) avec des formulations sans recoupement lexical avec les titres produits - les
trois ont abouti à une réponse correcte sans erreur, mais `search_products_semantic`
lui-même n'a jamais été observé invoqué : le modèle infère souvent un terme de recherche
déjà pertinent avant même d'appeler `find_products` (pg_trgm), qui réussit alors
directement plus souvent qu'anticipé. **How to apply** : ne pas relancer de tests
artificiels coûteux pour forcer cette invocation - si le sujet revient, vérifier plutôt
via un cas réel rencontré en production (logs `n8n.execution_entity` filtrés sur
`workflowId = '2pOjBE9G1Un877H8'`).
