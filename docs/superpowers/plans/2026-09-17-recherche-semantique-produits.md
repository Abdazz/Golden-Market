# Recherche sémantique de produits (pgvector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une recherche vectorielle (embeddings OpenAI + pgvector) comme
troisième niveau de repli pour la recherche produit de l'agent WhatsApp, qui
reste pertinente quel que soit le nombre futur de produits (contrairement au
tool `browse_catalog` actuel, qui dépend directement de la taille du
catalogue).

**Architecture:** Nouveau module de stockage côté Medusa (`apps/backend`) :
table `product_embedding` (pgvector, index HNSW), maintenue à jour par un
subscriber `product.created`/`product.updated` et un backfill one-shot,
exposée via une nouvelle route `GET /store/products-semantic-search`. Pas de
module link Medusa formel (pgvector n'a pas de type DML natif dans Medusa
v2) — `product_id` est une référence "douce" en texte brut, requêtée en SQL
direct via `PG_CONNECTION`, exactement comme `product-fuzzy-search.ts` le
fait déjà pour `pg_trgm`. Côté agent (`n8n_automation`), un nouveau tool
`search_products_semantic` appelle cette route ; `find_products` reste en
première ligne, `browse_catalog` ne reste qu'en tout dernier recours.

**Tech Stack:** Medusa v2 (TypeScript, Jest), extension Postgres `pgvector`
(index HNSW, distance cosinus), API OpenAI `text-embedding-3-small`, n8n
(workflow low-code).

**Spec:** `docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md`

## Global Constraints

- Pas de semicolons, guillemets doubles, indentation 2 espaces (règles
  `@medusajs/eslint-plugin` du backend).
- Business logic backend testée en TDD (`__tests__/*.unit.spec.ts`), comme
  `meta-conversions-mapping.ts`/`meta-conversions-client.ts`.
- Les scripts one-shot (`src/scripts/`) ne sont pas testés unitairement —
  idempotents, vérifiés en les exécutant réellement, comme
  `activate-stock-tracking-old-catalog.ts`.
- Aucun secret réel dans le code ou committé — `.env.template` documente
  uniquement le nom de la variable.
- `product_id` = référence texte brute vers `product.id`, jamais de
  contrainte FK Medusa (pgvector sort du système de modèles standard).
- Pas de seuil de similarité cosinus codé en dur (voir spec, « Décision :
  pas de seuil au démarrage ») — la route renvoie toujours le top-K.
- Circuit de déploiement habituel : `staging` → vérification → `main` →
  production (voir `HANDOFF.md`).

---

## Task 1: Hash de contenu produit (pur, TDD)

**Files:**
- Create: `apps/backend/src/lib/product-embedding-hash.ts`
- Test: `apps/backend/src/lib/__tests__/product-embedding-hash.unit.spec.ts`

**Interfaces:**
- Produces: `computeProductContentHash(title: string, description: string | null | undefined): string`

- [ ] **Step 1: Write the failing test**

```typescript
import { computeProductContentHash } from "../product-embedding-hash"

describe("computeProductContentHash", () => {
  it("returns a stable hash for the same title and description", () => {
    const a = computeProductContentHash("Chargeur USB", "Câble 1m")
    const b = computeProductContentHash("Chargeur USB", "Câble 1m")
    expect(a).toBe(b)
  })

  it("returns a different hash when the title changes", () => {
    const a = computeProductContentHash("Chargeur USB", "Câble 1m")
    const b = computeProductContentHash("Chargeur USB 6A", "Câble 1m")
    expect(a).not.toBe(b)
  })

  it("returns a different hash when the description changes", () => {
    const a = computeProductContentHash("Chargeur USB", "Câble 1m")
    const b = computeProductContentHash("Chargeur USB", "Câble 2m")
    expect(a).not.toBe(b)
  })

  it("treats a missing description the same as an empty one", () => {
    const a = computeProductContentHash("Chargeur USB", null)
    const b = computeProductContentHash("Chargeur USB", "")
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-embedding-hash.unit.spec.ts`
Expected: FAIL — `Cannot find module '../product-embedding-hash'`

- [ ] **Step 3: Write minimal implementation**

```typescript
import { createHash } from "crypto"

// Sert à ne ré-embedder un produit que si son titre/description a
// réellement changé (pas à chaque mise à jour de prix/stock) - voir le
// subscriber product-upserted-embedding.ts.
export function computeProductContentHash(
  title: string,
  description: string | null | undefined
): string {
  return createHash("sha256")
    .update(`${title}\n${description ?? ""}`)
    .digest("hex")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-embedding-hash.unit.spec.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/product-embedding-hash.ts apps/backend/src/lib/__tests__/product-embedding-hash.unit.spec.ts
git commit -m "feat(backend): ajoute le hash de contenu pour la recherche sémantique produits"
```

---

## Task 2: Client d'embeddings OpenAI (TDD)

**Files:**
- Create: `apps/backend/src/lib/product-embedding-client.ts`
- Test: `apps/backend/src/lib/__tests__/product-embedding-client.unit.spec.ts`
- Modify: `apps/backend/.env.template`

**Interfaces:**
- Produces: `embedText(text: string, apiKey: string, fetchImpl?: typeof fetch): Promise<number[]>`

- [ ] **Step 1: Write the failing test**

```typescript
import { embedText } from "../product-embedding-client"

describe("embedText", () => {
  it("posts the text to the OpenAI embeddings API and returns the vector", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    })

    const result = await embedText(
      "Chargeur USB",
      "sk-test",
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/embeddings")
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-test",
    })
    expect(JSON.parse(init.body as string)).toEqual({
      model: "text-embedding-3-small",
      input: "Chargeur USB",
    })
  })

  it("throws when the API key is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      embedText("Chargeur USB", "", fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/OPENAI_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when OpenAI responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 })

    await expect(
      embedText("Chargeur USB", "sk-test", fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-embedding-client.unit.spec.ts`
Expected: FAIL — `Cannot find module '../product-embedding-client'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// Client d'embeddings OpenAI - même pattern que meta-conversions-client.ts
// (fetch injecté, testable sans mocker le fetch global). Modèle
// text-embedding-3-small : le moins cher, largement suffisant pour des
// titres/descriptions produits courts (voir spec).
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
const EMBEDDING_MODEL = "text-embedding-3-small"

export async function embedText(
  text: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<number[]> {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configuré")
  }

  const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI embeddings API a répondu ${response.status}`)
  }

  const body = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }

  return body.data[0].embedding
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-embedding-client.unit.spec.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Document the new environment variable**

Ajouter à la fin de `apps/backend/.env.template` :

```
# --- Recherche sémantique produits (embeddings OpenAI + pgvector, agent
# WhatsApp). Voir docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md.
# Distincte des credentials OpenAI de n8n (systèmes différents).
OPENAI_API_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/product-embedding-client.ts apps/backend/src/lib/__tests__/product-embedding-client.unit.spec.ts apps/backend/.env.template
git commit -m "feat(backend): ajoute le client d'embeddings OpenAI pour la recherche sémantique"
```

---

## Task 3: Stockage pgvector en SQL brut (TDD)

**Files:**
- Create: `apps/backend/src/lib/product-embedding-store.ts`
- Test: `apps/backend/src/lib/__tests__/product-embedding-store.unit.spec.ts`

**Interfaces:**
- Consumes: rien (fonctions pures paramétrées par une connexion pg injectée)
- Produces:
  - `type PgConnection = { raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }> }`
  - `getStoredContentHash(pg: PgConnection, productId: string): Promise<string | null>`
  - `upsertProductEmbedding(pg: PgConnection, params: { productId: string; embedding: number[]; contentHash: string }): Promise<void>`
  - `findNearestProductIds(pg: PgConnection, params: { embedding: number[]; limit: number }): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  getStoredContentHash,
  upsertProductEmbedding,
  findNearestProductIds,
} from "../product-embedding-store"

describe("getStoredContentHash", () => {
  it("returns the stored hash for a product", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [{ content_hash: "abc" }] })
    const result = await getStoredContentHash({ raw }, "prod_1")
    expect(result).toBe("abc")
    expect(raw).toHaveBeenCalledWith(
      "select content_hash from product_embedding where product_id = ?",
      ["prod_1"]
    )
  })

  it("returns null when the product has no stored embedding yet", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [] })
    const result = await getStoredContentHash({ raw }, "prod_1")
    expect(result).toBeNull()
  })
})

describe("upsertProductEmbedding", () => {
  it("inserts the embedding as a pgvector literal, updating on conflict", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [] })

    await upsertProductEmbedding(
      { raw },
      { productId: "prod_1", embedding: [0.1, 0.2], contentHash: "hash_1" }
    )

    expect(raw).toHaveBeenCalledTimes(1)
    const [sql, bindings] = raw.mock.calls[0]
    expect(sql).toContain("on conflict (product_id) do update")
    expect(bindings).toEqual(["prod_1", "[0.1,0.2]", "hash_1"])
  })
})

describe("findNearestProductIds", () => {
  it("returns product ids ordered by vector distance", async () => {
    const raw = jest.fn().mockResolvedValue({
      rows: [{ product_id: "prod_2" }, { product_id: "prod_1" }],
    })

    const result = await findNearestProductIds(
      { raw },
      { embedding: [0.1, 0.2], limit: 8 }
    )

    expect(result).toEqual(["prod_2", "prod_1"])
    const [sql, bindings] = raw.mock.calls[0]
    expect(sql).toContain("order by embedding <=> ?::vector")
    expect(bindings).toEqual(["[0.1,0.2]", 8])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-embedding-store.unit.spec.ts`
Expected: FAIL — `Cannot find module '../product-embedding-store'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// SQL brut contre la table product_embedding - pgvector n'a pas de type DML
// natif dans Medusa v2, même approche que product-fuzzy-search.ts pour
// pg_trgm (contourne l'ORM, requête PG_CONNECTION directement). product_id
// est une référence texte "douce" vers product.id, pas une FK Medusa.
export type PgConnection = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }>
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

export async function getStoredContentHash(
  pg: PgConnection,
  productId: string
): Promise<string | null> {
  const { rows } = await pg.raw(
    "select content_hash from product_embedding where product_id = ?",
    [productId]
  )
  return rows[0]?.content_hash ?? null
}

export async function upsertProductEmbedding(
  pg: PgConnection,
  params: { productId: string; embedding: number[]; contentHash: string }
): Promise<void> {
  await pg.raw(
    `insert into product_embedding (product_id, embedding, content_hash, created_at, updated_at)
     values (?, ?::vector, ?, now(), now())
     on conflict (product_id) do update
       set embedding = excluded.embedding,
           content_hash = excluded.content_hash,
           updated_at = now()`,
    [params.productId, toVectorLiteral(params.embedding), params.contentHash]
  )
}

export async function findNearestProductIds(
  pg: PgConnection,
  params: { embedding: number[]; limit: number }
): Promise<string[]> {
  const { rows } = await pg.raw(
    `select product_id
     from product_embedding
     order by embedding <=> ?::vector
     limit ?`,
    [toVectorLiteral(params.embedding), params.limit]
  )
  return rows.map((row: { product_id: string }) => row.product_id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-embedding-store.unit.spec.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/product-embedding-store.ts apps/backend/src/lib/__tests__/product-embedding-store.unit.spec.ts
git commit -m "feat(backend): ajoute les requêtes pgvector brutes pour les embeddings produits"
```

---

## Task 4: Script one-shot — schéma pgvector

**Files:**
- Create: `apps/backend/src/scripts/create-product-embedding-schema.ts`

**Interfaces:**
- Consumes: `ContainerRegistrationKeys.PG_CONNECTION` (`__pg_connection__`), `ContainerRegistrationKeys.LOGGER` (`logger`)
- Produces: table `product_embedding` + extension `vector` + index HNSW (état final que Task 5, 6 et 7 supposent déjà présent)

Pas de test unitaire — script one-shot idempotent au même titre que
`activate-stock-tracking-old-catalog.ts` (voir `AGENTS.md`, section
« Catalogue Burkina Faso »), vérifié en l'exécutant réellement (Task 8).

- [ ] **Step 1: Write the script**

```typescript
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// One-shot idempotent : crée l'extension pgvector, la table
// product_embedding et son index HNSW s'ils n'existent pas déjà.
// product_id est une référence "douce" (pas de FK Medusa) - voir
// product-embedding-store.ts et la spec pour le contexte complet.
export default async function createProductEmbeddingSchema({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  await pg.raw("CREATE EXTENSION IF NOT EXISTS vector")
  logger.info("Extension pgvector : présente.")

  await pg.raw(`
    CREATE TABLE IF NOT EXISTS product_embedding (
      product_id text PRIMARY KEY,
      embedding vector(1536) NOT NULL,
      content_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  logger.info("Table product_embedding : présente.")

  await pg.raw(`
    CREATE INDEX IF NOT EXISTS product_embedding_hnsw
    ON product_embedding
    USING hnsw (embedding vector_cosine_ops)
  `)
  logger.info("Index HNSW product_embedding_hnsw : présent.")
}
```

- [ ] **Step 2: Commit (exécution différée à Task 8/12, sur staging puis production)**

```bash
git add apps/backend/src/scripts/create-product-embedding-schema.ts
git commit -m "feat(backend): script one-shot de création du schéma pgvector produits"
```

---

## Task 5: Script one-shot — backfill des embeddings existants

**Files:**
- Create: `apps/backend/src/scripts/backfill-product-embeddings.ts`

**Interfaces:**
- Consumes: `computeProductContentHash` (Task 1), `embedText` (Task 2), `getStoredContentHash`/`upsertProductEmbedding` (Task 3)

Pas de test unitaire (même raison que Task 4).

- [ ] **Step 1: Write the script**

```typescript
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeProductContentHash } from "../lib/product-embedding-hash"
import { embedText } from "../lib/product-embedding-client"
import {
  getStoredContentHash,
  upsertProductEmbedding,
} from "../lib/product-embedding-store"

// One-shot idempotent : embarque tous les produits publiés qui n'ont pas
// encore d'embedding à jour (même hash de contenu que la dernière fois). À
// lancer après create-product-embedding-schema.ts.
export default async function backfillProductEmbeddings({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    logger.info("OPENAI_API_KEY non configurée, backfill ignoré.")
    return
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "description"],
    filters: { status: "published" },
  })

  let embedded = 0
  let skipped = 0

  for (const product of products as Array<{
    id: string
    title: string
    description: string | null
  }>) {
    const contentHash = computeProductContentHash(product.title, product.description)
    const storedHash = await getStoredContentHash(pg, product.id)

    if (storedHash === contentHash) {
      skipped += 1
      continue
    }

    const embedding = await embedText(
      `${product.title}\n${product.description ?? ""}`,
      apiKey
    )
    await upsertProductEmbedding(pg, {
      productId: product.id,
      embedding,
      contentHash,
    })
    logger.info(`"${product.title}" -> embedding créé/mis à jour.`)
    embedded += 1
  }

  logger.info(`Backfill terminé : ${embedded} embarqué(s), ${skipped} déjà à jour.`)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/scripts/backfill-product-embeddings.ts
git commit -m "feat(backend): script one-shot de backfill des embeddings produits"
```

---

## Task 6: Subscriber de maintien à jour (TDD)

**Files:**
- Create: `apps/backend/src/subscribers/product-upserted-embedding.ts`
- Test: `apps/backend/src/subscribers/__tests__/product-upserted-embedding.unit.spec.ts`

**Interfaces:**
- Consumes: `computeProductContentHash` (Task 1), `embedText` (Task 2), `getStoredContentHash`/`upsertProductEmbedding` (Task 3)

- [ ] **Step 1: Write the failing test**

```typescript
import productUpsertedEmbeddingHandler from "../product-upserted-embedding"
import { computeProductContentHash } from "../../lib/product-embedding-hash"
import * as embeddingClient from "../../lib/product-embedding-client"
import * as embeddingStore from "../../lib/product-embedding-store"

jest.mock("../../lib/product-embedding-client")
jest.mock("../../lib/product-embedding-store")

describe("productUpsertedEmbeddingHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const pg = {}
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      if (key === "__pg_connection__") return pg
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("re-embeds and upserts when the content hash changed", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({
      data: [{ id: "prod_1", title: "Chargeur USB", description: "Câble 1m" }],
    })
    jest.spyOn(embeddingStore, "getStoredContentHash").mockResolvedValue("old_hash")
    jest.spyOn(embeddingClient, "embedText").mockResolvedValue([0.1, 0.2])
    const upsert = jest
      .spyOn(embeddingStore, "upsertProductEmbedding")
      .mockResolvedValue(undefined)

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_1" } } as any,
      container: container as any,
    })

    expect(upsert).toHaveBeenCalledWith(pg, {
      productId: "prod_1",
      embedding: [0.1, 0.2],
      contentHash: computeProductContentHash("Chargeur USB", "Câble 1m"),
    })
  })

  it("skips re-embedding when the content hash is unchanged", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({
      data: [{ id: "prod_1", title: "Chargeur USB", description: "Câble 1m" }],
    })
    jest
      .spyOn(embeddingStore, "getStoredContentHash")
      .mockResolvedValue(computeProductContentHash("Chargeur USB", "Câble 1m"))
    const embedText = jest.spyOn(embeddingClient, "embedText")

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_1" } } as any,
      container: container as any,
    })

    expect(embedText).not.toHaveBeenCalled()
  })

  it("skips silently when OPENAI_API_KEY is not configured", async () => {
    delete process.env.OPENAI_API_KEY
    const embedText = jest.spyOn(embeddingClient, "embedText")

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_1" } } as any,
      container: container as any,
    })

    expect(embedText).not.toHaveBeenCalled()
    expect(graph).not.toHaveBeenCalled()
  })

  it("logs and does not throw when embedding fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({
      data: [{ id: "prod_1", title: "Chargeur USB", description: "Câble 1m" }],
    })
    jest.spyOn(embeddingStore, "getStoredContentHash").mockResolvedValue("old_hash")
    jest.spyOn(embeddingClient, "embedText").mockRejectedValue(new Error("boom"))

    await expect(
      productUpsertedEmbeddingHandler({
        event: { name: "product.updated", data: { id: "prod_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("prod_1"),
      expect.any(Error)
    )
  })

  it("skips when the product cannot be found", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({ data: [] })
    const embedText = jest.spyOn(embeddingClient, "embedText")

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_missing" } } as any,
      container: container as any,
    })

    expect(embedText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- src/subscribers/__tests__/product-upserted-embedding.unit.spec.ts`
Expected: FAIL — `Cannot find module '../product-upserted-embedding'`

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeProductContentHash } from "../lib/product-embedding-hash"
import { embedText } from "../lib/product-embedding-client"
import {
  getStoredContentHash,
  upsertProductEmbedding,
} from "../lib/product-embedding-store"

/**
 * Recalcule l'embedding uniquement si le titre/description a réellement
 * changé (pas à chaque mise à jour de prix/stock) - même pattern défensif
 * (try/catch, jamais de throw) que les autres subscribers Meta.
 */
export default async function productUpsertedEmbeddingHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    logger.info(
      `Produit ${event.data.id} modifié — OPENAI_API_KEY non configurée, embedding ignoré`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const {
      data: [product],
    } = await query.graph({
      entity: "product",
      fields: ["id", "title", "description"],
      filters: { id: event.data.id },
    })

    if (!product) {
      return
    }

    const contentHash = computeProductContentHash(product.title, product.description)
    const storedHash = await getStoredContentHash(pg, product.id)

    if (storedHash === contentHash) {
      return
    }

    const embedding = await embedText(
      `${product.title}\n${product.description ?? ""}`,
      apiKey
    )
    await upsertProductEmbedding(pg, {
      productId: product.id,
      embedding,
      contentHash,
    })
    logger.info(`Produit ${event.data.id} — embedding mis à jour`)
  } catch (error) {
    logger.error(
      `Produit ${event.data.id} — échec de la mise à jour de l'embedding`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- src/subscribers/__tests__/product-upserted-embedding.unit.spec.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/subscribers/product-upserted-embedding.ts apps/backend/src/subscribers/__tests__/product-upserted-embedding.unit.spec.ts
git commit -m "feat(backend): subscriber de maintien à jour des embeddings produits"
```

---

## Task 7: Route de recherche sémantique (TDD)

**Files:**
- Create: `apps/backend/src/api/store/products-semantic-search/route.ts`
- Test: `apps/backend/src/api/store/products-semantic-search/__tests__/route.unit.spec.ts`

**Interfaces:**
- Consumes: `embedText` (Task 2), `findNearestProductIds` (Task 3), `computeAvailability` (`../../../lib/meta-catalog-mapping`, déjà existant)
- Produces: `GET /store/products-semantic-search?q=<texte>&limit=<n>` → `{ products: Array<{id, title, handle, variants}>, count: number }`

- [ ] **Step 1: Write the failing test**

```typescript
import { GET } from "../route"
import * as embeddingClient from "../../../../lib/product-embedding-client"
import * as embeddingStore from "../../../../lib/product-embedding-store"

jest.mock("../../../../lib/product-embedding-client")
jest.mock("../../../../lib/product-embedding-store")

function createFakeRes() {
  const res: any = { statusCode: 200, jsonBody: undefined }
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = jest.fn((body: unknown) => {
    res.jsonBody = body
    return res
  })
  return res
}

describe("GET /store/products-semantic-search", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    jest.clearAllMocks()
  })

  it("returns products ordered by vector similarity with binary availability", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    jest.spyOn(embeddingClient, "embedText").mockResolvedValue([0.1, 0.2])
    jest
      .spyOn(embeddingStore, "findNearestProductIds")
      .mockResolvedValue(["prod_2", "prod_1"])

    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product") {
        return {
          data: [
            {
              id: "prod_1",
              title: "Serpillière auto-essorante",
              handle: "serpilliere",
              variants: [
                {
                  id: "variant_1",
                  manage_inventory: true,
                  allow_backorder: false,
                  calculated_price: { calculated_amount: 3000, currency_code: "xof" },
                },
              ],
            },
            {
              id: "prod_2",
              title: "Balai à franges",
              handle: "balai",
              variants: [
                {
                  id: "variant_2",
                  manage_inventory: false,
                  allow_backorder: false,
                  calculated_price: { calculated_amount: 1500, currency_code: "xof" },
                },
              ],
            },
          ],
        }
      }
      if (entity === "product_variant_inventory_items") {
        return {
          data: [
            {
              variant_id: "variant_1",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 0 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })

    const req: any = {
      query: { q: "balai serpillière" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "__pg_connection__") return {}
          if (key === "query") return { graph }
          throw new Error(`Unexpected resolve: ${key}`)
        }),
      },
    }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(200)
    // Ordre pgvector préservé (prod_2 avant prod_1) même si query.graph les
    // renvoie dans l'ordre inverse.
    expect(res.jsonBody.products.map((p: any) => p.id)).toEqual(["prod_2", "prod_1"])
    expect(res.jsonBody.products[1].variants[0].availability).toBe("out of stock")
    expect(res.jsonBody.products[0].variants[0].availability).toBe("in stock")
  })

  it("returns 400 when q is missing", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const req: any = { query: {}, scope: { resolve: jest.fn() } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(400)
  })

  it("returns 503 when OPENAI_API_KEY is not configured", async () => {
    delete process.env.OPENAI_API_KEY
    const req: any = { query: { q: "balai" }, scope: { resolve: jest.fn() } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(503)
  })

  it("returns an empty list when no embedding matches", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    jest.spyOn(embeddingClient, "embedText").mockResolvedValue([0.1, 0.2])
    jest.spyOn(embeddingStore, "findNearestProductIds").mockResolvedValue([])

    const req: any = {
      query: { q: "produit inexistant" },
      scope: { resolve: jest.fn(() => ({})) },
    }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.jsonBody).toEqual({ products: [], count: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- src/api/store/products-semantic-search/__tests__/route.unit.spec.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  QueryContext,
  getTotalVariantAvailability,
} from "@medusajs/framework/utils"
import { embedText } from "../../../lib/product-embedding-client"
import { findNearestProductIds } from "../../../lib/product-embedding-store"
import { computeAvailability } from "../../../lib/meta-catalog-mapping"

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 15

const SEARCH_FIELDS = [
  "id",
  "title",
  "handle",
  "variants.id",
  "variants.calculated_price.calculated_amount",
  "variants.calculated_price.currency_code",
  "variants.manage_inventory",
  "variants.allow_backorder",
]

type SearchProduct = {
  id: string
  title: string
  handle: string
  variants: Array<{
    id: string
    manage_inventory: boolean
    allow_backorder: boolean
    calculated_price?: { calculated_amount: number; currency_code: string }
    availability?: string
  }>
}

/**
 * Recherche vectorielle de repli pour l'agent WhatsApp - troisième niveau
 * après find_products (pg_trgm) et avant browse_catalog (dernier recours).
 * Voir docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md.
 * Pas de seuil de similarité codé en dur : renvoie toujours le top-K, laisse
 * le modèle IA juger de la pertinence parmi les candidats.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const apiKey = process.env.OPENAI_API_KEY
  const q = typeof req.query.q === "string" ? req.query.q : ""
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT)

  if (!apiKey) {
    res
      .status(503)
      .json({ message: "Recherche sémantique non configurée (OPENAI_API_KEY manquante)" })
    return
  }

  if (!q) {
    res.status(400).json({ message: "Paramètre q requis" })
    return
  }

  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const embedding = await embedText(q, apiKey)
  const productIds = await findNearestProductIds(pg, { embedding, limit })

  if (productIds.length === 0) {
    res.status(200).json({ products: [], count: 0 })
    return
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: SEARCH_FIELDS,
    filters: { id: productIds, status: "published" },
    context: {
      variants: { calculated_price: QueryContext({ currency_code: "xof" }) },
    },
  })

  const typedProducts = products as unknown as SearchProduct[]

  const allVariantIds = typedProducts.flatMap((p) => p.variants.map((v) => v.id))
  const availability = allVariantIds.length
    ? await getTotalVariantAvailability(query, { variant_ids: allVariantIds })
    : {}

  for (const product of typedProducts) {
    for (const variant of product.variants) {
      variant.availability = computeAvailability(
        variant,
        availability[variant.id]?.availability ?? null
      )
    }
  }

  // Préserve l'ordre de pertinence pgvector - query.graph ne le garantit pas.
  const orderedProducts = productIds
    .map((id) => typedProducts.find((p) => p.id === id))
    .filter((p): p is SearchProduct => !!p)

  res.status(200).json({ products: orderedProducts, count: orderedProducts.length })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- src/api/store/products-semantic-search/__tests__/route.unit.spec.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Run the full backend test suite and lint**

Run: `cd apps/backend && npm run test:unit && npm run lint`
Expected: tous les tests passent (existants + nouveaux), 0 erreur de lint

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/api/store/products-semantic-search
git commit -m "feat(backend): route GET /store/products-semantic-search"
```

---

## Task 8: Déploiement staging et vérification manuelle de la route

**Files:** aucun (déploiement + exécution de scripts + vérification)

- [ ] **Step 1: Pousser sur staging**

```bash
git push origin staging
```

- [ ] **Step 2: Vérifier que le déploiement staging réussit**

Suivre `https://github.com/Abdazz/Golden-Market/actions/workflows/deploy-staging.yml`
jusqu'à un run vert pour ce commit.

- [ ] **Step 3: Ajouter `OPENAI_API_KEY` à l'environnement staging**

Le service `backend` de `docker-compose.prod.yml` charge ses secrets
applicatifs via `env_file: apps/backend/.env` (pas `.env.deploy`, qui ne
sert qu'à l'interpolation `${...}` du compose lui-même — `OPENAI_API_KEY`
n'y serait jamais lu par le conteneur). Sur le VPS
(`ssh admin@144.91.110.105`), éditer
`/opt/golden-market/staging/apps/backend/.env` pour y ajouter une vraie clé
API OpenAI (`OPENAI_API_KEY=...`), puis relancer le service backend :

```bash
cd /opt/golden-market/staging
docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d backend
```

**Piège à éviter** : si la clé est ajoutée au mauvais fichier, le backfill
(Step 4) logue quand même `OPENAI_API_KEY non configurée, backfill ignoré.`
et se termine avec un code de sortie 0 — un run qui a l'air réussi mais n'a
rien indexé. Vérifier que le log de backfill mentionne un nombre non nul
d'« embarqué(s) » avant de continuer.

- [ ] **Step 4: Exécuter les deux scripts one-shot sur staging**

```bash
cd /opt/golden-market/staging
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npx medusa exec ./src/scripts/create-product-embedding-schema.js
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npx medusa exec ./src/scripts/backfill-product-embeddings.js
```

Attendu : logs `Extension pgvector : présente.`, `Table product_embedding :
présente.`, `Index HNSW ... : présent.`, puis `Backfill terminé : N
embarqué(s), 0 déjà à jour.`

- [ ] **Step 5: Vérifier la route manuellement**

```bash
curl -s "https://staging.golden-market.co/store/products-semantic-search?q=serpilliere" \
  -H "x-publishable-api-key: <clé publiable staging>" | head -c 2000
```

Attendu : un JSON `{ "products": [...], "count": N }` avec le produit
« Serpillière auto-essorante à éponge » (ou équivalent réel du catalogue)
en tête de liste malgré une faute d'accent/orthographe volontaire dans la
requête.

---

## Task 9: Créer le sous-workflow n8n `Tool - search_products_semantic`

**Files:** aucun fichier du dépôt (workflow n8n, stocké dans le volume Docker)

Crée un tout nouveau sous-workflow, isolé, sans toucher au workflow
principal (risque nul sur l'agent en production).

- [ ] **Step 1: Écrire le JSON du sous-workflow**

Sur le VPS, créer `/tmp/tool-search-products-semantic.json` avec exactement
ce contenu (ids déjà générés, valides et uniques) :

```json
[
  {
    "name": "Tool - search_products_semantic",
    "nodes": [
      {
        "id": "55c5aa01-32a8-44cc-8f15-621f6e3e995d",
        "name": "When Executed by Another Workflow",
        "type": "n8n-nodes-base.executeWorkflowTrigger",
        "typeVersion": 1.1,
        "position": [0, 0],
        "parameters": { "workflowInputs": { "values": [{ "name": "query" }] } }
      },
      {
        "id": "73134437-ef41-441e-91f7-bdc54843b3c6",
        "name": "Semantic Search Medusa Catalog",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.5,
        "position": [224, 0],
        "parameters": {
          "method": "GET",
          "url": "={{ $env.MEDUSA_ENV === 'production' ? $env.MEDUSA_BACKEND_URL_PRODUCTION : $env.MEDUSA_BACKEND_URL }}/store/products-semantic-search",
          "authentication": "none",
          "sendQuery": true,
          "queryParameters": {
            "parameters": [
              { "name": "q", "value": "={{ $json.query }}" },
              { "name": "limit", "value": "8" }
            ]
          },
          "sendHeaders": true,
          "headerParameters": {
            "parameters": [
              {
                "name": "x-publishable-api-key",
                "value": "={{ $env.MEDUSA_ENV === 'production' ? $env.MEDUSA_PUBLISHABLE_KEY_PRODUCTION : $env.MEDUSA_PUBLISHABLE_KEY }}"
              }
            ]
          },
          "options": {}
        },
        "onError": "continueErrorOutput"
      },
      {
        "id": "d133ddd2-9381-4a33-9766-82e3308013f4",
        "name": "Format Result",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [448, 0],
        "parameters": {
          "jsCode": "const products = $input.first().json.products || [];\n\nif (products.length === 0) {\n  return { json: { result: \"Aucun produit suffisamment proche trouvé par la recherche sémantique.\" } };\n}\n\nconst storefrontUrl = $env.MEDUSA_ENV === 'production' ? $env.MEDUSA_BACKEND_URL_PRODUCTION : $env.MEDUSA_BACKEND_URL;\n\nconst summary = products.map(p => {\n  const variant = p.variants?.[0];\n  const price = variant?.calculated_price?.calculated_amount;\n  const priceText = price != null ? `${price} FCFA` : 'prix indisponible';\n  const stockText = variant?.availability === \"in stock\" ? \"en stock\" : \"rupture de stock\";\n  const productUrl = `${storefrontUrl}/bf/products/${encodeURIComponent(p.handle)}`;\n  return `${p.title} : ${priceText}, ${stockText}\\nLien produit (à partager tel quel avec le client) : ${productUrl}\\nid variante interne pour place_order, ne JAMAIS afficher au client : ${variant?.id}`;\n}).join('\\n\\n');\n\nreturn { json: { result: `Candidats trouvés par recherche sémantique (${products.length}) :\\n\\n${summary}` } };"
        }
      },
      {
        "id": "7dddc082-29ae-472c-873d-aceac1113b8b",
        "name": "Semantic Search Error Fallback",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [448, 160],
        "parameters": {
          "jsCode": "return { json: { result: \"Recherche sémantique indisponible pour le moment (erreur technique). Essaie browse_catalog, ou réponds avec ce que tu sais déjà.\" } };"
        }
      }
    ],
    "connections": {
      "When Executed by Another Workflow": {
        "main": [[{ "node": "Semantic Search Medusa Catalog", "type": "main", "index": 0 }]]
      },
      "Semantic Search Medusa Catalog": {
        "main": [
          [{ "node": "Format Result", "type": "main", "index": 0 }],
          [{ "node": "Semantic Search Error Fallback", "type": "main", "index": 0 }]
        ]
      }
    },
    "settings": { "executionOrder": "v1" }
  }
]
```

Créer ce fichier sur le VPS via SSH (heredoc), pas localement :

```bash
ssh admin@144.91.110.105 "cat > /tmp/tool-search-products-semantic.json" <<'JSON'
[... coller exactement le JSON ci-dessus ...]
JSON
```

- [ ] **Step 2: Copier le fichier dans le conteneur et l'importer**

```bash
ssh admin@144.91.110.105 "docker cp /tmp/tool-search-products-semantic.json golden_market_n8n:/tmp/tool-search-products-semantic.json"
ssh admin@144.91.110.105 "cd /var/www/n8n && docker compose exec -T n8n n8n import:workflow --input=/tmp/tool-search-products-semantic.json"
```

Attendu : `Successfully imported 1 workflow.`

- [ ] **Step 3: Récupérer l'id généré du nouveau workflow**

```bash
ssh admin@144.91.110.105 "cd /var/www/n8n && docker compose exec -T n8n n8n list:workflow" | grep "search_products_semantic"
```

Noter l'id affiché (colonne de gauche) — nécessaire pour Task 10.

- [ ] **Step 4: Activer le sous-workflow**

Dans l'éditeur web n8n (`https://<domaine n8n>/workflow/<id noté>`), cliquer
**Publish/Active** en haut à droite (comme documenté dans `AGENTS.md` de
`n8n_automation` : « Mise en production par le bouton Publish »).

---

## Task 10: Brancher le nouveau tool dans le workflow principal (éditeur web)

**Files:** aucun fichier du dépôt

Édition manuelle via l'éditeur web n8n (pas de CLI ici : c'est le workflow
de production critique de l'agent, l'édition manuelle via l'UI est la
pratique documentée dans `n8n_automation/AGENTS.md` et évite le risque
d'une réimportation JSON malformée sur ce workflow précis).

- [ ] **Step 1: Ouvrir le workflow principal**

`Golden Market Sales Automation Workflow` (id `i6KGA9BvK9unjxxj`) dans
l'éditeur web n8n.

- [ ] **Step 2: Ajouter le node de tool**

Sur le node **AI Agent**, cliquer le connecteur "Tool" (petit `+` sous le
node), choisir **Call n8n Workflow Tool**. Dans le panneau de configuration :
- **Description** (exactement) :
  ```
  Recherche vectorielle de repli. N'utilise ce tool QUE si find_products a échoué deux fois de suite (recherche initiale + réessai avec terme simplifié) pour la même demande du client, AVANT d'essayer browse_catalog : renvoie les produits les plus proches sémantiquement de la demande, même en cas de synonyme ou de description approximative. Si ce tool ne renvoie rien de pertinent, essaie alors browse_catalog en tout dernier recours.
  ```
- **From list** → sélectionner `Tool - search_products_semantic` (id noté à
  la Task 9, Step 3).
- **Workflow Inputs** → mode "Define Below", un champ `query`, valeur :
  ```
  ={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('query', 'Termes de recherche du client, en langage naturel', 'string') }}
  ```
- Renommer le node `search_products_semantic` (nom exact = nom de fonction
  que le modèle appellera).

- [ ] **Step 3: Mettre à jour le prompt système de l'AI Agent**

Sur le node **AI Agent**, ouvrir **Options > System Message**. Remplacer ce
paragraphe exact :

> Ancien texte :
> ```
> - Si ce second essai échoue aussi, utilise browse_catalog pour voir tout le catalogue et essayer de repérer toi-même le produit voulu (faute non couverte, synonyme, description approximative) avant de conclure à l'absence du produit. Ne dis au client qu'aucun produit n'a été trouvé qu'après avoir aussi essayé browse_catalog.
> ```

> Nouveau texte :
> ```
> - Si ce second essai échoue aussi, utilise search_products_semantic pour trouver les produits les plus proches sémantiquement de la demande (faute non couverte, synonyme, description approximative). Si search_products_semantic ne renvoie rien de pertinent, utilise alors browse_catalog en tout dernier recours pour parcourir tout le catalogue toi-même. Ne dis au client qu'aucun produit n'a été trouvé qu'après avoir essayé les trois (find_products deux fois, search_products_semantic, puis browse_catalog).
> ```

- [ ] **Step 4: Publier**

Cliquer **Save** puis **Publish/Active**.

- [ ] **Step 5: Mettre à jour la documentation**

Dans `n8n_automation/guide-golden-market-agent.md`, ajouter une sous-section
`#### Tool search_products_semantic (id <id noté>)` juste après la section
`browse_catalog` existante, décrivant : input (`query`), route appelée
(`GET /store/products-semantic-search`), position dans la cascade
(`find_products` ×2 → `search_products_semantic` → `browse_catalog`),
référence à la spec `medusa-golden-market/docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md`.
Committer ce changement dans `n8n_automation` (dépôt infra, messages de
commit en français, voir son `AGENTS.md`).

```bash
cd n8n_automation
git add guide-golden-market-agent.md
git commit -m "docs: documente le nouveau tool search_products_semantic"
```

---

## Task 11: Vérification bout en bout en conditions réelles

**Files:** aucun

- [ ] **Step 1: Envoyer un webhook signé avec une requête volontairement synonyme**

Suivre la recette `curl` avec signature HMAC du guide (`n8n_automation`,
§ 4), path `/webhook-test/whatsapp` (jamais de vrai message WhatsApp), avec
un message texte qui échouerait sur `pg_trgm` mais existe dans le
catalogue réel (ex. un synonyme non couvert d'un produit existant).

- [ ] **Step 2: Vérifier dans les logs n8n l'ordre d'appel des tools**

```bash
ssh admin@144.91.110.105 "cd /var/www/n8n && docker compose logs --tail=100 n8n"
```

Attendu : `find_products` appelé (probablement deux fois), puis
`search_products_semantic`, avec une réponse cohérente renvoyée au client
(pas de crash, pas de "produit introuvable" prématuré).

- [ ] **Step 3: Vérifier qu'aucune régression n'affecte find_products/browse_catalog**

Renvoyer une requête avec une faute de frappe simple (déjà couverte par
`pg_trgm`) et confirmer que `find_products` seul suffit toujours (pas
d'appel superflu à `search_products_semantic`).

---

## Task 12: Promotion en production

**Files:** aucun (déploiement)

- [ ] **Step 1: Merger staging vers main**

```bash
git checkout main
git merge --ff-only staging
git push origin main
git checkout staging
```

- [ ] **Step 2: Vérifier le déploiement production**

Suivre `https://github.com/Abdazz/Golden-Market/actions/workflows/deploy-production.yml`
jusqu'à un run vert pour ce commit.

- [ ] **Step 3: Ajouter `OPENAI_API_KEY` à l'environnement production**

Même procédure que Task 8, Step 3, sur `/opt/golden-market/production`.

- [ ] **Step 4: Exécuter les deux scripts one-shot sur production**

```bash
cd /opt/golden-market/production
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npx medusa exec ./src/scripts/create-product-embedding-schema.js
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npx medusa exec ./src/scripts/backfill-product-embeddings.js
```

- [ ] **Step 5: Vérifier la route en production**

```bash
curl -s "https://golden-market.co/store/products-semantic-search?q=serpilliere" \
  -H "x-publishable-api-key: <clé publiable production>" | head -c 2000
```

- [ ] **Step 6: Confirmer que n8n cible bien la production**

Le même workflow n8n sert staging et production via la bascule
`$env.MEDUSA_ENV` déjà en place (voir Task 9 JSON) — vérifier simplement
que `MEDUSA_ENV=production` sur ce n8n avant de considérer le tool actif en
production, puis répéter Task 11 une dernière fois pour confirmer.
