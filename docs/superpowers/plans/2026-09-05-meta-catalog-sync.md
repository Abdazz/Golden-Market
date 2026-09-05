# Synchronisation catalogue Medusa → Meta Commerce Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a Meta Commerce Catalog in sync with the real Medusa catalog — a periodic full feed as the source of truth, plus real-time push on price and stock-availability changes only.

**Architecture:** Three pieces inside `apps/backend`: a small pure mapping module (Medusa data → Meta catalog item), a thin Meta Batch API client, and a query-graph-aware sync module that resolves "which variant changed" from an event and pushes it. A public GET route serves the full CSV feed for Meta's scheduled fetch (the safety net). Two subscribers wire real Medusa v2 events into the sync module, following the existing `order-placed-customer-whatsapp.ts` pattern: try/catch, `logger.error`, never throw.

**Tech Stack:** Medusa v2.18.0 (`@medusajs/framework/utils`), native `fetch`/`FormData` (no new HTTP dependency), Jest + `@swc/jest` (existing `test:unit` setup).

**Spec:** `docs/superpowers/specs/2026-09-05-meta-catalog-sync-design.md`

## Global Constraints

- Golden Market sells only in XOF, only in Burkina Faso — no multi-currency/multi-region handling anywhere in this feature (per spec "Non-objectifs").
- Product URLs are always `https://golden-market.co/bf/products/{handle}`.
- Subscribers must never throw: `try/catch` + `logger.error`, exactly like `apps/backend/src/subscribers/order-placed-customer-whatsapp.ts` — a catalog sync failure must never block a Medusa product/stock mutation.
- Real-time push covers **only** price and stock availability. New products, title/description/image changes wait for the next periodic feed fetch (accepted delay, per spec "Décision : portée du temps réel").
- Meta Graph API version pinned to `v20.0` — matches the version already used for the WhatsApp Cloud API integration (`n8n-workflows/*.json`), keep both Meta integrations on the same version.
- Confirmed real Medusa v2 event names (verified by reading `@medusajs/core-flows@2.18.0` compiled source, not the unused `@medusajs/utils` `PricingEvents`/`InventoryEvents` constants, which are dead code — see spec): `product-variant.updated` for price, `inventory-level.updated` + `reservation-item.created`/`.updated`/`.deleted` for stock. Import these as constants from `@medusajs/framework/utils` (`ProductVariantWorkflowEvents`, `InventoryLevelWorkflowEvents`, `ReservationItemWorkflowEvents`) — never hardcode the strings.
- Unit tests live at `**/src/**/__tests__/**/*.unit.spec.ts` and run via `npm run test:unit` (from `apps/backend`) — this is enforced by `apps/backend/jest.config.js`, not a style preference.
- Deviation from the spec's exact file path: the spec says `apps/backend/src/modules/meta-catalog/client.ts`, but `apps/backend/src/modules/` in this codebase is reserved for actual Medusa provider modules (payment/notification services with `service.ts` + module registration — see `src/modules/resend/`, `src/modules/cash-on-delivery.ts`). Plain HTTP-client helpers with no Medusa module registration live in `apps/backend/src/lib/` (see `src/lib/matomo-reporting.ts`). This plan places all new files under `src/lib/` instead, following that established convention.

## File Structure

- `apps/backend/src/lib/meta-catalog-mapping.ts` — pure functions: turn a product+variant+availability into a `MetaCatalogItem`. No I/O, fully unit-testable with plain objects.
- `apps/backend/src/lib/meta-catalog-client.ts` — `upsertCatalogItem()`, the Meta Batch API wrapper (native `fetch` + `FormData`).
- `apps/backend/src/lib/meta-catalog-sync.ts` — the only place that calls `query.graph`. Resolves a variant id (or an inventory item id) down to a pushable `MetaCatalogItem` and calls the client. Both subscribers and the feed route route through here so a mapping/query fix only has to happen once.
- `apps/backend/src/api/store/meta-catalog-feed/route.ts` — public GET route, CSV feed (the periodic safety net).
- `apps/backend/src/subscribers/product-variant-price-updated-meta-catalog.ts` — real-time price push.
- `apps/backend/src/subscribers/product-variant-stock-updated-meta-catalog.ts` — real-time stock push.
- `apps/backend/.env.template` — document the two new env vars.

## Task 1: Pure mapping module

**Files:**
- Create: `apps/backend/src/lib/meta-catalog-mapping.ts`
- Test: `apps/backend/src/lib/__tests__/meta-catalog-mapping.unit.spec.ts`

**Interfaces:**
- Produces: `MetaCatalogItem` type, `CatalogProduct` type, `CatalogVariant` type, `computeAvailability(variant, availableQuantity): "in stock" | "out of stock"`, `formatMetaPrice(amount: number, currencyCode: string): string`, `resolveImageLink(variant, product): string`, `buildCatalogItem(product: CatalogProduct, variant: CatalogVariant, availableQuantity: number | null): MetaCatalogItem` — all consumed by Task 3 (sync module) and Task 4 (feed route).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/lib/__tests__/meta-catalog-mapping.unit.spec.ts
import {
  computeAvailability,
  formatMetaPrice,
  resolveImageLink,
  buildCatalogItem,
  type CatalogProduct,
  type CatalogVariant,
} from "../meta-catalog-mapping"

describe("computeAvailability", () => {
  it("is always in stock when inventory is not managed", () => {
    expect(
      computeAvailability({ manage_inventory: false, allow_backorder: false }, 0)
    ).toBe("in stock")
  })

  it("is always in stock when backorders are allowed", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: true }, 0)
    ).toBe("in stock")
  })

  it("is in stock when managed inventory has quantity available", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: false }, 3)
    ).toBe("in stock")
  })

  it("is out of stock when managed inventory has zero quantity", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: false }, 0)
    ).toBe("out of stock")
  })

  it("treats a null availability (no inventory item linked) as out of stock", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: false }, null)
    ).toBe("out of stock")
  })
})

describe("formatMetaPrice", () => {
  it("formats a zero-decimal XOF amount as '<amount> XOF'", () => {
    expect(formatMetaPrice(15000, "xof")).toBe("15000 XOF")
  })

  it("rounds a non-integer amount", () => {
    expect(formatMetaPrice(1500.6, "xof")).toBe("1501 XOF")
  })
})

describe("resolveImageLink", () => {
  const product: CatalogProduct = {
    id: "prod_1",
    title: "Produit",
    description: "desc",
    handle: "produit",
    thumbnail: "https://example.com/thumb.jpg",
    images: [{ url: "https://example.com/product-1.jpg" }],
  }

  it("prefers the variant's own image", () => {
    const variant: Pick<CatalogVariant, "images"> = {
      images: [{ url: "https://example.com/variant-1.jpg" }],
    }
    expect(resolveImageLink(variant, product)).toBe(
      "https://example.com/variant-1.jpg"
    )
  })

  it("falls back to the product's first image when the variant has none", () => {
    expect(resolveImageLink({ images: [] }, product)).toBe(
      "https://example.com/product-1.jpg"
    )
  })

  it("falls back to the product thumbnail when there are no images at all", () => {
    expect(resolveImageLink({ images: [] }, { ...product, images: [] })).toBe(
      "https://example.com/thumb.jpg"
    )
  })
})

describe("buildCatalogItem", () => {
  const product: CatalogProduct = {
    id: "prod_1",
    title: "Serpillière auto-essorante",
    description: "Une bonne serpillière.",
    handle: "serpilliere-auto-essorante",
    thumbnail: "https://example.com/thumb.jpg",
    images: [],
  }

  it("builds a full item for a single-variant product (Default Title)", () => {
    const variant: CatalogVariant = {
      id: "variant_1",
      title: "Default Title",
      manage_inventory: true,
      allow_backorder: false,
      images: [],
      calculated_price: { calculated_amount: 15000, currency_code: "xof" },
    }

    expect(buildCatalogItem(product, variant, 5)).toEqual({
      id: "variant_1",
      item_group_id: "prod_1",
      title: "Serpillière auto-essorante",
      description: "Une bonne serpillière.",
      availability: "in stock",
      condition: "new",
      price: "15000 XOF",
      link: "https://golden-market.co/bf/products/serpilliere-auto-essorante",
      image_link: "https://example.com/thumb.jpg",
      brand: "Golden Market",
    })
  })

  it("appends the variant title for a real multi-variant option", () => {
    const variant: CatalogVariant = {
      id: "variant_2",
      title: "Rouge / L",
      manage_inventory: true,
      allow_backorder: false,
      images: [],
      calculated_price: { calculated_amount: 12000, currency_code: "xof" },
    }

    expect(buildCatalogItem(product, variant, 0).title).toBe(
      "Serpillière auto-essorante - Rouge / L"
    )
    expect(buildCatalogItem(product, variant, 0).availability).toBe(
      "out of stock"
    )
  })

  it("falls back to '0 XOF' when calculated_price could not be resolved", () => {
    const variant: CatalogVariant = {
      id: "variant_3",
      title: "Default Title",
      manage_inventory: false,
      allow_backorder: false,
      images: [],
      calculated_price: null,
    }

    expect(buildCatalogItem(product, variant, null).price).toBe("0 XOF")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-mapping`
Expected: FAIL with "Cannot find module '../meta-catalog-mapping'"

- [ ] **Step 3: Implement the mapping module**

```ts
// apps/backend/src/lib/meta-catalog-mapping.ts
// Mapping pur Medusa -> Meta Commerce Catalog. Aucun I/O ici (pas de
// query.graph, pas de fetch) : c'est ce qui rend ce fichier testable avec de
// simples objets, et garantit que le flux périodique (route) et les
// subscribers temps réel produisent exactement le même item pour les mêmes
// données - la cohérence entre les deux est tout l'intérêt du "filet de
// sécurité" décrit dans la spec.

export type MetaCatalogItem = {
  id: string
  item_group_id: string
  title: string
  description: string
  availability: "in stock" | "out of stock"
  condition: "new"
  price: string
  link: string
  image_link: string
  brand: string
}

export type CatalogProduct = {
  id: string
  title: string
  description: string | null
  handle: string
  thumbnail: string | null
  images?: Array<{ url: string }> | null
}

export type CatalogVariant = {
  id: string
  title: string
  manage_inventory: boolean
  allow_backorder: boolean
  images?: Array<{ url: string }> | null
  calculated_price?: { calculated_amount: number; currency_code: string } | null
}

const BRAND = "Golden Market"
const STORE_PRODUCT_BASE_URL = "https://golden-market.co/bf/products"
// Titre par défaut d'une variante unique généré par Medusa (voir
// apps/backend/src/scripts/import-catalog.ts) - pas la peine de l'accoler au
// titre du produit, il n'apporte aucune information pour un produit à une
// seule variante.
const DEFAULT_VARIANT_TITLE = "Default Title"

export function computeAvailability(
  variant: Pick<CatalogVariant, "manage_inventory" | "allow_backorder">,
  availableQuantity: number | null
): "in stock" | "out of stock" {
  if (!variant.manage_inventory) {
    return "in stock"
  }
  if (variant.allow_backorder) {
    return "in stock"
  }
  return (availableQuantity ?? 0) > 0 ? "in stock" : "out of stock"
}

export function formatMetaPrice(amount: number, currencyCode: string): string {
  return `${Math.round(amount)} ${currencyCode.toUpperCase()}`
}

export function resolveImageLink(
  variant: Pick<CatalogVariant, "images">,
  product: Pick<CatalogProduct, "thumbnail" | "images">
): string {
  return (
    variant.images?.[0]?.url ??
    product.images?.[0]?.url ??
    product.thumbnail ??
    ""
  )
}

export function buildCatalogItem(
  product: CatalogProduct,
  variant: CatalogVariant,
  availableQuantity: number | null
): MetaCatalogItem {
  const price = variant.calculated_price

  return {
    id: variant.id,
    item_group_id: product.id,
    title:
      variant.title && variant.title !== DEFAULT_VARIANT_TITLE
        ? `${product.title} - ${variant.title}`
        : product.title,
    description: product.description ?? "",
    availability: computeAvailability(variant, availableQuantity),
    condition: "new",
    price: price
      ? formatMetaPrice(price.calculated_amount, price.currency_code)
      : "0 XOF",
    link: `${STORE_PRODUCT_BASE_URL}/${product.handle}`,
    image_link: resolveImageLink(variant, product),
    brand: BRAND,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-mapping`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/meta-catalog-mapping.ts apps/backend/src/lib/__tests__/meta-catalog-mapping.unit.spec.ts
git commit -m "feat(meta-catalog): add pure Medusa->Meta catalog item mapping"
```

## Task 2: Meta Batch API client

**Files:**
- Create: `apps/backend/src/lib/meta-catalog-client.ts`
- Test: `apps/backend/src/lib/__tests__/meta-catalog-client.unit.spec.ts`

**Interfaces:**
- Consumes: `MetaCatalogItem` from Task 1 (`../meta-catalog-mapping`).
- Produces: `MetaCatalogConfig` type (`{ catalogId: string; accessToken: string }`), `upsertCatalogItem(item: MetaCatalogItem, config: MetaCatalogConfig, fetchImpl?: typeof fetch): Promise<void>` — consumed by Task 3.

Confirmed request shape (fetched directly from `developers.facebook.com/docs/marketing-api/reference/product-catalog/items_batch/`, verified twice): `POST https://graph.facebook.com/v20.0/{catalog_id}/items_batch` as `multipart/form-data` (curl `-F` fields) with top-level fields `access_token`, `item_type=PRODUCT_ITEM`, and `requests` = a JSON-stringified array of `{ method: "UPDATE", data: { id, ...fields } }` — the item's `id` lives **inside** `data`, not as a sibling of `method`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/lib/__tests__/meta-catalog-client.unit.spec.ts
import { upsertCatalogItem } from "../meta-catalog-client"
import type { MetaCatalogItem } from "../meta-catalog-mapping"

describe("upsertCatalogItem", () => {
  const item: MetaCatalogItem = {
    id: "variant_1",
    item_group_id: "prod_1",
    title: "Produit",
    description: "Description",
    availability: "in stock",
    condition: "new",
    price: "15000 XOF",
    link: "https://golden-market.co/bf/products/produit",
    image_link: "https://example.com/img.jpg",
    brand: "Golden Market",
  }

  const config = { catalogId: "catalog_123", accessToken: "token_abc" }

  it("posts a multipart UPDATE batch request with the item nested under data", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await upsertCatalogItem(item, config, fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://graph.facebook.com/v20.0/catalog_123/items_batch")
    expect(init.method).toBe("POST")

    const body = init.body as FormData
    expect(body.get("access_token")).toBe("token_abc")
    expect(body.get("item_type")).toBe("PRODUCT_ITEM")
    expect(JSON.parse(body.get("requests") as string)).toEqual([
      { method: "UPDATE", data: item },
    ])
  })

  it("throws when the catalog id is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      upsertCatalogItem(
        item,
        { catalogId: "", accessToken: "token_abc" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/META_CATALOG_ID/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the access token is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      upsertCatalogItem(
        item,
        { catalogId: "catalog_123", accessToken: "" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/META_CATALOG_ACCESS_TOKEN/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when Meta responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 })

    await expect(
      upsertCatalogItem(item, config, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-client`
Expected: FAIL with "Cannot find module '../meta-catalog-client'"

- [ ] **Step 3: Implement the client**

```ts
// apps/backend/src/lib/meta-catalog-client.ts
import type { MetaCatalogItem } from "./meta-catalog-mapping"

export type MetaCatalogConfig = {
  catalogId: string
  accessToken: string
}

// v20.0 : même version que l'intégration WhatsApp Cloud API existante côté
// n8n (n8n-workflows/*.json) - les deux intégrations Meta restent alignées.
const GRAPH_API_VERSION = "v20.0"

/**
 * POST /{catalog_id}/items_batch, méthode UPDATE (upsert par défaut côté
 * Meta - voir allow_upsert dans la doc officielle). Format confirmé dans la
 * doc Meta (Product Catalog Items Batch API reference) : multipart/form-data
 * avec access_token, item_type et requests (JSON stringifié) en champs de
 * formulaire - pas de JSON body brut, pas de query param pour le jeton.
 */
export async function upsertCatalogItem(
  item: MetaCatalogItem,
  config: MetaCatalogConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const { catalogId, accessToken } = config

  if (!catalogId) {
    throw new Error("META_CATALOG_ID non configuré")
  }
  if (!accessToken) {
    throw new Error("META_CATALOG_ACCESS_TOKEN non configuré")
  }

  const body = new FormData()
  body.append("access_token", accessToken)
  body.append("item_type", "PRODUCT_ITEM")
  body.append(
    "requests",
    JSON.stringify([{ method: "UPDATE", data: item }])
  )

  const response = await fetchImpl(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/items_batch`,
    { method: "POST", body }
  )

  if (!response.ok) {
    throw new Error(`Meta Catalog API (items_batch) a répondu ${response.status}`)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-client`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/meta-catalog-client.ts apps/backend/src/lib/__tests__/meta-catalog-client.unit.spec.ts
git commit -m "feat(meta-catalog): add Meta Batch API client (items_batch UPDATE)"
```

## Task 3: Sync module (query.graph resolution + orchestration)

**Files:**
- Create: `apps/backend/src/lib/meta-catalog-sync.ts`
- Test: `apps/backend/src/lib/__tests__/meta-catalog-sync.unit.spec.ts`

**Interfaces:**
- Consumes: `buildCatalogItem`, `CatalogProduct`, `CatalogVariant` (Task 1); `upsertCatalogItem`, `MetaCatalogConfig` (Task 2); `getTotalVariantAvailability` from `@medusajs/framework/utils` (verified exported, wraps the exact algorithm the Medusa Admin/Store API uses for `variant.inventory_quantity` — see `variant-inventory-quantity.js` middleware in `@medusajs/medusa`).
- Produces: `loadVariantCatalogData(query, variantId): Promise<{ product: CatalogProduct; variant: CatalogVariant } | null>`, `resolveVariantIdsForInventoryItem(query, inventoryItemId): Promise<string[]>`, `syncVariantToMetaCatalog(query, variantId, config, fetchImpl?): Promise<void>` — all three consumed by Task 5 and Task 6 (subscribers). `query` is whatever `container.resolve(ContainerRegistrationKeys.QUERY)` returns (a `{ graph(input): Promise<{ data: any[] }> }`-shaped object — typed as `any` here to avoid fighting Medusa's generic `RemoteQueryFunction` typing in a plain helper, consistent with how `activate-stock-tracking-old-catalog.ts` types its `query.graph` results).

Query shape rationale: the event payload only ever gives an id with no relation info (confirmed in the spec). `product_variant` is queryable directly as a root `query.graph` entity for plain fields (proven in `apps/backend/src/scripts/activate-stock-tracking-old-catalog.ts`, which fetches `"product.title"` off `entity: "product_variant"`), but the computed `calculated_price` field is only confirmed working when the query root is `entity: "product"` with `context: { variants: { calculated_price: QueryContext(...) } }` (this is the exact shape used by Medusa's own `@medusajs/medusa/dist/api/store/products/route.js`). To stay on verified ground rather than guessing whether `calculated_price` also resolves with `product_variant` as root, this module does the lookup in two steps: resolve the variant's `product_id` first (proven shape), then fetch the full product + all its variants (including `calculated_price`) by id (also proven shape) and pick the matching variant out of `product.variants`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/lib/__tests__/meta-catalog-sync.unit.spec.ts
import {
  loadVariantCatalogData,
  resolveVariantIdsForInventoryItem,
  syncVariantToMetaCatalog,
} from "../meta-catalog-sync"

describe("loadVariantCatalogData", () => {
  it("resolves the product id from the variant, then fetches the full product", async () => {
    const graph = jest.fn()
    graph.mockImplementationOnce(async ({ entity, filters }: any) => {
      expect(entity).toBe("product_variant")
      expect(filters).toEqual({ id: "variant_1" })
      return { data: [{ id: "variant_1", product_id: "prod_1" }] }
    })
    graph.mockImplementationOnce(async ({ entity, filters, context }: any) => {
      expect(entity).toBe("product")
      expect(filters).toEqual({ id: "prod_1" })
      expect(context).toBeDefined()
      return {
        data: [
          {
            id: "prod_1",
            title: "Produit",
            description: "Desc",
            handle: "produit",
            thumbnail: null,
            images: [],
            variants: [
              {
                id: "variant_1",
                title: "Default Title",
                manage_inventory: true,
                allow_backorder: false,
                images: [],
                calculated_price: { calculated_amount: 1000, currency_code: "xof" },
              },
              { id: "variant_2", title: "Autre" },
            ],
          },
        ],
      }
    })

    const result = await loadVariantCatalogData({ graph } as any, "variant_1")

    expect(result?.product.id).toBe("prod_1")
    expect(result?.variant.id).toBe("variant_1")
  })

  it("returns null when the variant does not exist", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    const result = await loadVariantCatalogData({ graph } as any, "missing")
    expect(result).toBeNull()
  })

  it("returns null when the product lookup comes back empty", async () => {
    const graph = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ id: "variant_1", product_id: "prod_1" }] })
      .mockResolvedValueOnce({ data: [] })
    const result = await loadVariantCatalogData({ graph } as any, "variant_1")
    expect(result).toBeNull()
  })
})

describe("resolveVariantIdsForInventoryItem", () => {
  it("returns the variant ids linked to the inventory item", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity, filters }: any) => {
      expect(entity).toBe("product_variant_inventory_item")
      expect(filters).toEqual({ inventory_item_id: "iitem_1" })
      return { data: [{ variant_id: "variant_1" }, { variant_id: "variant_2" }] }
    })

    const result = await resolveVariantIdsForInventoryItem({ graph } as any, "iitem_1")
    expect(result).toEqual(["variant_1", "variant_2"])
  })
})

describe("syncVariantToMetaCatalog", () => {
  const catalogProductGraphResponse = {
    data: [
      {
        id: "prod_1",
        title: "Produit",
        description: "Desc",
        handle: "produit",
        thumbnail: null,
        images: [],
        variants: [
          {
            id: "variant_1",
            title: "Default Title",
            manage_inventory: true,
            allow_backorder: false,
            images: [],
            calculated_price: { calculated_amount: 1000, currency_code: "xof" },
          },
        ],
      },
    ],
  }

  it("loads the variant, computes availability and pushes it to Meta", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product_variant") {
        return { data: [{ id: "variant_1", product_id: "prod_1" }] }
      }
      if (entity === "product") {
        return catalogProductGraphResponse
      }
      if (entity === "product_variant_inventory_items") {
        return {
          data: [
            {
              variant_id: "variant_1",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 4 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await syncVariantToMetaCatalog(
      { graph } as any,
      "variant_1",
      { catalogId: "catalog_123", accessToken: "token_abc" },
      fetchMock as unknown as typeof fetch
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = fetchMock.mock.calls[0][1].body as FormData
    const pushedItem = JSON.parse(body.get("requests") as string)[0].data
    expect(pushedItem.id).toBe("variant_1")
    expect(pushedItem.availability).toBe("in stock")
    expect(pushedItem.price).toBe("1000 XOF")
  })

  it("throws when the variant cannot be resolved (caller is responsible for catching)", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    const fetchMock = jest.fn()

    await expect(
      syncVariantToMetaCatalog(
        { graph } as any,
        "missing",
        { catalogId: "catalog_123", accessToken: "token_abc" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/introuvable/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-sync`
Expected: FAIL with "Cannot find module '../meta-catalog-sync'"

- [ ] **Step 3: Implement the sync module**

```ts
// apps/backend/src/lib/meta-catalog-sync.ts
import { QueryContext, getTotalVariantAvailability } from "@medusajs/framework/utils"
import { buildCatalogItem, type CatalogProduct, type CatalogVariant } from "./meta-catalog-mapping"
import { upsertCatalogItem, type MetaCatalogConfig } from "./meta-catalog-client"

const PRODUCT_FIELDS = [
  "id",
  "title",
  "description",
  "handle",
  "thumbnail",
  "images.url",
  "variants.id",
  "variants.title",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.images.url",
  "variants.calculated_price.calculated_amount",
  "variants.calculated_price.currency_code",
]

/**
 * L'événement Medusa (product-variant.updated, inventory-level.updated, ...)
 * ne porte jamais que l'id de l'entité modifiée (voir spec, section
 * "Subscribers temps réel") - jamais l'id de variante/produit associé, ni la
 * nouvelle valeur. Deux requêtes sont donc nécessaires : la première résout
 * juste le product_id depuis la variante (forme éprouvée dans
 * activate-stock-tracking-old-catalog.ts), la seconde récupère le produit
 * complet avec calculated_price (forme éprouvée dans le store product route
 * de Medusa lui-même) - on ne devine pas si calculated_price se résout aussi
 * en interrogeant product_variant directement en racine.
 */
export async function loadVariantCatalogData(
  query: any,
  variantId: string
): Promise<{ product: CatalogProduct; variant: CatalogVariant } | null> {
  const {
    data: [variantRef],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product_id"],
    filters: { id: variantId },
  })

  if (!variantRef) {
    return null
  }

  const {
    data: [product],
  } = await query.graph(
    {
      entity: "product",
      fields: PRODUCT_FIELDS,
      filters: { id: variantRef.product_id },
      context: {
        variants: { calculated_price: QueryContext({ currency_code: "xof" }) },
      },
    }
  )

  if (!product) {
    return null
  }

  const variant = (product.variants ?? []).find((v: CatalogVariant) => v.id === variantId)

  if (!variant) {
    return null
  }

  return { product, variant }
}

/**
 * inventory-level.updated et reservation-item.* ne portent que l'id du
 * niveau d'inventaire / de la réservation, jamais l'id de variante - un
 * inventory_item peut en théorie être lié à plusieurs variantes (bundles),
 * d'où le tableau en retour plutôt qu'un seul id.
 */
export async function resolveVariantIdsForInventoryItem(
  query: any,
  inventoryItemId: string
): Promise<string[]> {
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["variant_id"],
    filters: { inventory_item_id: inventoryItemId },
  })

  return links.map((link: { variant_id: string }) => link.variant_id)
}

/**
 * Lève en cas d'échec (variante introuvable, appel Meta en échec) - les
 * subscribers appelants sont responsables du try/catch/log, exactement comme
 * order-placed-customer-whatsapp.ts.
 */
export async function syncVariantToMetaCatalog(
  query: any,
  variantId: string,
  config: MetaCatalogConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const data = await loadVariantCatalogData(query, variantId)

  if (!data) {
    throw new Error(`Variante ${variantId} introuvable pour la synchro catalogue Meta`)
  }

  const { product, variant } = data

  const availability = await getTotalVariantAvailability(query, {
    variant_ids: [variantId],
  })
  const availableQuantity = availability[variantId]?.availability ?? null

  const item = buildCatalogItem(product, variant, availableQuantity)
  await upsertCatalogItem(item, config, fetchImpl)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-sync`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/meta-catalog-sync.ts apps/backend/src/lib/__tests__/meta-catalog-sync.unit.spec.ts
git commit -m "feat(meta-catalog): add query.graph resolution and sync orchestration"
```

## Task 4: Periodic CSV feed route

**Files:**
- Create: `apps/backend/src/api/store/meta-catalog-feed/route.ts`
- Test: `apps/backend/src/api/store/meta-catalog-feed/__tests__/route.unit.spec.ts`

**Interfaces:**
- Consumes: `buildCatalogItem` (Task 1), `getTotalVariantAvailability` + `QueryContext` from `@medusajs/framework/utils` (same as Task 3).
- Produces: `GET(req, res)` Express-style handler, registered automatically by Medusa's file-based routing at `GET /store/meta-catalog-feed` — no other file consumes this directly.

No global publishable-key middleware is applied to custom `/store/*` routes in this codebase (checked `apps/backend/src/api/middlewares.ts` — the only route-scoped middleware is the password-reset rate limiter; publishable-key enforcement is baked into Medusa's own built-in store routes, not custom ones). This route is genuinely public, matching the spec.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/api/store/meta-catalog-feed/__tests__/route.unit.spec.ts
import { GET } from "../route"

function createFakeRes() {
  const res: any = { statusCode: 200, headers: {}, sentBody: undefined }
  res.setHeader = jest.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.send = jest.fn((body: string) => {
    res.sentBody = body
    return res
  })
  return res
}

describe("GET /store/meta-catalog-feed", () => {
  it("returns a CSV row per variant, across multiple products", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product") {
        return {
          data: [
            {
              id: "prod_1",
              title: "Produit A",
              description: "Desc A",
              handle: "produit-a",
              thumbnail: "https://example.com/a.jpg",
              images: [],
              variants: [
                {
                  id: "variant_1",
                  title: "Default Title",
                  manage_inventory: false,
                  allow_backorder: false,
                  images: [],
                  calculated_price: { calculated_amount: 5000, currency_code: "xof" },
                },
              ],
            },
            {
              id: "prod_2",
              title: "Produit B",
              description: "Desc \"B\"",
              handle: "produit-b",
              thumbnail: null,
              images: [],
              variants: [
                {
                  id: "variant_2",
                  title: "Default Title",
                  manage_inventory: true,
                  allow_backorder: false,
                  images: [],
                  calculated_price: { calculated_amount: 12000, currency_code: "xof" },
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
              variant_id: "variant_2",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 0 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })

    const req: any = { scope: { resolve: jest.fn(() => ({ graph })) } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.headers["Content-Type"]).toBe("text/csv")
    const rows = (res.sentBody as string).trim().split("\n")
    expect(rows[0]).toBe(
      "id,title,description,availability,condition,price,link,image_link,brand,item_group_id"
    )
    expect(rows).toHaveLength(3) // header + 2 variants
    expect(rows[1]).toContain('"variant_1"')
    expect(rows[1]).toContain('"in stock"') // manage_inventory: false -> always available
    expect(rows[2]).toContain('"variant_2"')
    expect(rows[2]).toContain('"out of stock"') // available_quantity 0, tracked, no backorder
    expect(rows[2]).toContain('"Desc ""B"""') // embedded quote escaped per CSV convention
  })

  it("returns just the header row when there are no published products", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    const req: any = { scope: { resolve: jest.fn(() => ({ graph })) } }
    const res = createFakeRes()

    await GET(req, res)

    expect((res.sentBody as string).trim()).toBe(
      "id,title,description,availability,condition,price,link,image_link,brand,item_group_id"
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-feed`
Expected: FAIL with "Cannot find module '../route'"

- [ ] **Step 3: Implement the route**

```ts
// apps/backend/src/api/store/meta-catalog-feed/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, QueryContext, getTotalVariantAvailability } from "@medusajs/framework/utils"
import { buildCatalogItem, type CatalogProduct, type CatalogVariant, type MetaCatalogItem } from "../../../lib/meta-catalog-mapping"

const CSV_HEADER =
  "id,title,description,availability,condition,price,link,image_link,brand,item_group_id"

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function toCsvRow(item: MetaCatalogItem): string {
  return [
    item.id,
    item.title,
    item.description,
    item.availability,
    item.condition,
    item.price,
    item.link,
    item.image_link,
    item.brand,
    item.item_group_id,
  ]
    .map((value) => csvEscape(String(value)))
    .join(",")
}

/**
 * Route publique (flux planifié Meta, pas de secret) - photo complète du
 * catalogue publié, une ligne = une variante. Sert de filet de sécurité au
 * push temps réel des subscribers prix/stock (voir spec, "Flux de données").
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "handle",
      "thumbnail",
      "images.url",
      "variants.id",
      "variants.title",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.images.url",
      "variants.calculated_price.calculated_amount",
      "variants.calculated_price.currency_code",
    ],
    filters: { status: "published" },
    context: {
      variants: { calculated_price: QueryContext({ currency_code: "xof" }) },
    },
  })

  const typedProducts = products as unknown as Array<
    CatalogProduct & { variants: CatalogVariant[] }
  >

  const allVariantIds = typedProducts.flatMap((product) =>
    product.variants.map((variant) => variant.id)
  )

  const availability =
    allVariantIds.length > 0
      ? await getTotalVariantAvailability(query, { variant_ids: allVariantIds })
      : {}

  const rows = typedProducts.flatMap((product) =>
    product.variants.map((variant) =>
      toCsvRow(
        buildCatalogItem(
          product,
          variant,
          availability[variant.id]?.availability ?? null
        )
      )
    )
  )

  res.setHeader("Content-Type", "text/csv")
  res.status(200).send([CSV_HEADER, ...rows].join("\n"))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- meta-catalog-feed`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add "apps/backend/src/api/store/meta-catalog-feed/route.ts" "apps/backend/src/api/store/meta-catalog-feed/__tests__/route.unit.spec.ts"
git commit -m "feat(meta-catalog): add periodic CSV feed route for Meta Commerce Manager"
```

## Task 5: Price subscriber

**Files:**
- Create: `apps/backend/src/subscribers/product-variant-price-updated-meta-catalog.ts`
- Test: `apps/backend/src/subscribers/__tests__/product-variant-price-updated-meta-catalog.unit.spec.ts`

**Interfaces:**
- Consumes: `syncVariantToMetaCatalog` (Task 3).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/subscribers/__tests__/product-variant-price-updated-meta-catalog.unit.spec.ts
import productVariantPriceUpdatedMetaCatalogHandler from "../product-variant-price-updated-meta-catalog"
import * as metaCatalogSync from "../../lib/meta-catalog-sync"

describe("productVariantPriceUpdatedMetaCatalogHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it("pushes the variant to Meta when configured", async () => {
    process.env.META_CATALOG_ID = "catalog_123"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_abc"
    const sync = jest
      .spyOn(metaCatalogSync, "syncVariantToMetaCatalog")
      .mockResolvedValue(undefined)

    await productVariantPriceUpdatedMetaCatalogHandler({
      event: { name: "product-variant.updated", data: { id: "variant_1" } } as any,
      container: container as any,
    })

    expect(sync).toHaveBeenCalledWith(
      { graph },
      "variant_1",
      { catalogId: "catalog_123", accessToken: "token_abc" }
    )
  })

  it("skips silently when Meta catalog env vars are not configured", async () => {
    delete process.env.META_CATALOG_ID
    delete process.env.META_CATALOG_ACCESS_TOKEN
    const sync = jest.spyOn(metaCatalogSync, "syncVariantToMetaCatalog")

    await productVariantPriceUpdatedMetaCatalogHandler({
      event: { name: "product-variant.updated", data: { id: "variant_1" } } as any,
      container: container as any,
    })

    expect(sync).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the sync fails", async () => {
    process.env.META_CATALOG_ID = "catalog_123"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_abc"
    jest
      .spyOn(metaCatalogSync, "syncVariantToMetaCatalog")
      .mockRejectedValue(new Error("boom"))

    await expect(
      productVariantPriceUpdatedMetaCatalogHandler({
        event: { name: "product-variant.updated", data: { id: "variant_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("variant_1"),
      expect.any(Error)
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npm run test:unit -- product-variant-price-updated-meta-catalog`
Expected: FAIL with "Cannot find module '../product-variant-price-updated-meta-catalog'"

- [ ] **Step 3: Implement the subscriber**

```ts
// apps/backend/src/subscribers/product-variant-price-updated-meta-catalog.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, ProductVariantWorkflowEvents } from "@medusajs/framework/utils"
import { syncVariantToMetaCatalog } from "../lib/meta-catalog-sync"

/**
 * product-variant.updated est émis pour TOUT changement de variante, pas
 * seulement le prix (voir updateProductVariantsWorkflow dans
 * @medusajs/core-flows) - il n'y a pas de moyen de filtrer à la source, donc
 * ce subscriber recalcule et repousse à chaque déclenchement. Coût
 * négligeable, cohérent avec le pattern "jamais de throw" des autres
 * subscribers (voir order-placed-customer-whatsapp.ts).
 */
export default async function productVariantPriceUpdatedMetaCatalogHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const catalogId = process.env.META_CATALOG_ID
  const accessToken = process.env.META_CATALOG_ACCESS_TOKEN

  if (!catalogId || !accessToken) {
    logger.info(
      `Variante ${event.data.id} mise à jour — META_CATALOG_ID/META_CATALOG_ACCESS_TOKEN non configurés, synchro Meta ignorée`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    await syncVariantToMetaCatalog(query, event.data.id, { catalogId, accessToken })
    logger.info(`Variante ${event.data.id} — prix/stock synchronisés avec le catalogue Meta`)
  } catch (error) {
    logger.error(
      `Variante ${event.data.id} — échec de la synchro avec le catalogue Meta`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: ProductVariantWorkflowEvents.UPDATED,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npm run test:unit -- product-variant-price-updated-meta-catalog`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/subscribers/product-variant-price-updated-meta-catalog.ts apps/backend/src/subscribers/__tests__/product-variant-price-updated-meta-catalog.unit.spec.ts
git commit -m "feat(meta-catalog): push price updates to Meta catalog in real time"
```

## Task 6: Stock subscriber

**Files:**
- Create: `apps/backend/src/subscribers/product-variant-stock-updated-meta-catalog.ts`
- Test: `apps/backend/src/subscribers/__tests__/product-variant-stock-updated-meta-catalog.unit.spec.ts`

**Interfaces:**
- Consumes: `resolveVariantIdsForInventoryItem`, `syncVariantToMetaCatalog` (Task 3). `Modules.INVENTORY` module service — auto-generated `retrieveInventoryLevel(id)` / `retrieveReservationItem(id)` methods (verified: `InventoryModuleService extends MedusaService({ InventoryItem, InventoryLevel, ReservationItem })` in `@medusajs/inventory/dist/services/inventory-module.js` — `MedusaService` generates a `retrieve<Model>` per registered model), both returning an object with `inventory_item_id`.

Design note on `reservation-item.deleted`: by the time this subscriber runs, `softDeleteReservationItems` (confirmed in `@medusajs/core-flows/dist/reservation/steps/delete-reservations.js`) has already soft-deleted the row, so `retrieveReservationItem` may throw "not found". This is left to the existing outer `try/catch` — it gets logged like any other sync failure and the periodic feed heals the discrepancy, exactly the safety-net design the spec already commits to. No special-casing needed.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/subscribers/__tests__/product-variant-stock-updated-meta-catalog.unit.spec.ts
import productVariantStockUpdatedMetaCatalogHandler from "../product-variant-stock-updated-meta-catalog"
import * as metaCatalogSync from "../../lib/meta-catalog-sync"

describe("productVariantStockUpdatedMetaCatalogHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const retrieveInventoryLevel = jest.fn()
  const retrieveReservationItem = jest.fn()
  const inventoryModuleService = { retrieveInventoryLevel, retrieveReservationItem }

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      if (key === "inventory") return inventoryModuleService
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.META_CATALOG_ID = "catalog_123"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_abc"
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it("resolves the inventory item from an inventory-level.updated event, then syncs every linked variant", async () => {
    retrieveInventoryLevel.mockResolvedValue({ id: "ilev_1", inventory_item_id: "iitem_1" })
    jest
      .spyOn(metaCatalogSync, "resolveVariantIdsForInventoryItem")
      .mockResolvedValue(["variant_1", "variant_2"])
    const sync = jest
      .spyOn(metaCatalogSync, "syncVariantToMetaCatalog")
      .mockResolvedValue(undefined)

    await productVariantStockUpdatedMetaCatalogHandler({
      event: { name: "inventory-level.updated", data: { id: "ilev_1" } } as any,
      container: container as any,
    })

    expect(retrieveInventoryLevel).toHaveBeenCalledWith("ilev_1")
    expect(retrieveReservationItem).not.toHaveBeenCalled()
    expect(sync).toHaveBeenCalledTimes(2)
    expect(sync).toHaveBeenCalledWith({ graph }, "variant_1", {
      catalogId: "catalog_123",
      accessToken: "token_abc",
    })
    expect(sync).toHaveBeenCalledWith({ graph }, "variant_2", {
      catalogId: "catalog_123",
      accessToken: "token_abc",
    })
  })

  it("resolves the inventory item from a reservation-item event", async () => {
    retrieveReservationItem.mockResolvedValue({ id: "resitem_1", inventory_item_id: "iitem_1" })
    jest
      .spyOn(metaCatalogSync, "resolveVariantIdsForInventoryItem")
      .mockResolvedValue(["variant_1"])
    jest.spyOn(metaCatalogSync, "syncVariantToMetaCatalog").mockResolvedValue(undefined)

    await productVariantStockUpdatedMetaCatalogHandler({
      event: { name: "reservation-item.created", data: { id: "resitem_1" } } as any,
      container: container as any,
    })

    expect(retrieveReservationItem).toHaveBeenCalledWith("resitem_1")
    expect(retrieveInventoryLevel).not.toHaveBeenCalled()
  })

  it("skips silently when Meta catalog env vars are not configured", async () => {
    delete process.env.META_CATALOG_ID
    const resolveIds = jest.spyOn(metaCatalogSync, "resolveVariantIdsForInventoryItem")

    await productVariantStockUpdatedMetaCatalogHandler({
      event: { name: "inventory-level.updated", data: { id: "ilev_1" } } as any,
      container: container as any,
    })

    expect(resolveIds).not.toHaveBeenCalled()
    expect(retrieveInventoryLevel).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the reservation was already deleted", async () => {
    retrieveReservationItem.mockRejectedValue(new Error("not found"))

    await expect(
      productVariantStockUpdatedMetaCatalogHandler({
        event: { name: "reservation-item.deleted", data: { id: "resitem_gone" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("resitem_gone"),
      expect.any(Error)
    )
  })

  it("logs and does not throw when one of the variant syncs fails", async () => {
    retrieveInventoryLevel.mockResolvedValue({ id: "ilev_1", inventory_item_id: "iitem_1" })
    jest
      .spyOn(metaCatalogSync, "resolveVariantIdsForInventoryItem")
      .mockResolvedValue(["variant_1"])
    jest
      .spyOn(metaCatalogSync, "syncVariantToMetaCatalog")
      .mockRejectedValue(new Error("Meta 500"))

    await expect(
      productVariantStockUpdatedMetaCatalogHandler({
        event: { name: "inventory-level.updated", data: { id: "ilev_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npm run test:unit -- product-variant-stock-updated-meta-catalog`
Expected: FAIL with "Cannot find module '../product-variant-stock-updated-meta-catalog'"

- [ ] **Step 3: Implement the subscriber**

```ts
// apps/backend/src/subscribers/product-variant-stock-updated-meta-catalog.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  InventoryLevelWorkflowEvents,
  Modules,
  ReservationItemWorkflowEvents,
} from "@medusajs/framework/utils"
import { resolveVariantIdsForInventoryItem, syncVariantToMetaCatalog } from "../lib/meta-catalog-sync"

export default async function productVariantStockUpdatedMetaCatalogHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const catalogId = process.env.META_CATALOG_ID
  const accessToken = process.env.META_CATALOG_ACCESS_TOKEN

  if (!catalogId || !accessToken) {
    logger.info(
      `Stock modifié (${event.name} ${event.data.id}) — META_CATALOG_ID/META_CATALOG_ACCESS_TOKEN non configurés, synchro Meta ignorée`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventoryModuleService = container.resolve(Modules.INVENTORY)

  try {
    // reservation-item.deleted : la ligne est déjà soft-supprimée
    // (softDeleteReservationItems) au moment où ce subscriber tourne -
    // retrieveReservationItem peut légitimement lever "not found" ici. On ne
    // le traite pas à part : ça tombe dans le catch général ci-dessous,
    // loggé comme un échec de synchro parmi d'autres, rattrapé par le flux
    // périodique au prochain passage - le filet de sécurité prévu par la
    // spec pour exactement ce genre de cas.
    const isInventoryLevelEvent = event.name === InventoryLevelWorkflowEvents.UPDATED
    const inventoryItemId = isInventoryLevelEvent
      ? (await inventoryModuleService.retrieveInventoryLevel(event.data.id)).inventory_item_id
      : (await inventoryModuleService.retrieveReservationItem(event.data.id)).inventory_item_id

    const variantIds = await resolveVariantIdsForInventoryItem(query, inventoryItemId)

    for (const variantId of variantIds) {
      await syncVariantToMetaCatalog(query, variantId, { catalogId, accessToken })
    }

    logger.info(
      `${event.name} (${event.data.id}) — stock synchronisé avec le catalogue Meta pour ${variantIds.length} variante(s)`
    )
  } catch (error) {
    logger.error(
      `${event.name} (${event.data.id}) — échec de la synchro stock avec le catalogue Meta`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    InventoryLevelWorkflowEvents.UPDATED,
    ReservationItemWorkflowEvents.CREATED,
    ReservationItemWorkflowEvents.UPDATED,
    ReservationItemWorkflowEvents.DELETED,
  ],
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npm run test:unit -- product-variant-stock-updated-meta-catalog`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/subscribers/product-variant-stock-updated-meta-catalog.ts apps/backend/src/subscribers/__tests__/product-variant-stock-updated-meta-catalog.unit.spec.ts
git commit -m "feat(meta-catalog): push stock availability updates to Meta catalog in real time"
```

## Task 7: Environment configuration

**Files:**
- Modify: `apps/backend/.env.template`

**Interfaces:**
- None (documentation-only task, no code interface).

- [ ] **Step 1: Add the new variables**

Read `apps/backend/.env.template` first to find the right place (near the other third-party integration blocks, e.g. next to the `MATOMO_*`/`N8N_*` vars), then add:

```
# Synchronisation catalogue Medusa -> Meta Commerce Manager (WhatsApp
# catalogue natif + pubs dynamiques Facebook/Instagram). Voir
# docs/superpowers/specs/2026-09-05-meta-catalog-sync-design.md.
# META_CATALOG_ACCESS_TOKEN doit avoir la permission catalog_management sur
# le catalogue - vérifier si le jeton WhatsApp existant peut être réutilisé
# avant d'en provisionner un nouveau (mêmes scopes de Business Manager).
META_CATALOG_ID=
META_CATALOG_ACCESS_TOKEN=
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/.env.template
git commit -m "docs(meta-catalog): document META_CATALOG_ID/META_CATALOG_ACCESS_TOKEN"
```

## Manual verification (not part of the automated test suite)

Once all 7 tasks are merged and deployed to staging:

1. `curl https://staging.golden-market.co/store/meta-catalog-feed` (or the staging equivalent) and confirm it returns a well-formed CSV with one row per real variant.
2. Change a real variant's price in the staging admin, confirm the `product-variant-price-updated-meta-catalog` subscriber logs a success line (GlitchTip/container logs), and confirm the pushed price in Meta Events Manager / Catalog Manager test tools once `META_CATALOG_ID`/`META_CATALOG_ACCESS_TOKEN` are provisioned.
3. Manually edit a tracked variant's stock to 0, confirm the stock subscriber fires and Meta shows the item as out of stock.
4. Complete the manual Meta-side steps listed in the spec ("Étapes manuelles côté Meta") — these were explicitly out of scope for this plan.

## Self-review

**Spec coverage:** Client (Task 2) ✓, periodic route (Task 4) ✓, price subscriber (Task 5) ✓, stock subscriber (Task 6) ✓, field mapping table (Task 1's `buildCatalogItem`) ✓, error handling / never-throw (Tasks 5-6) ✓, configuration (Task 7) ✓, tests per spec's "Tests" section (periodic feed multi-variant/no-image/out-of-stock cases, price subscriber payload, stock subscriber in/out of stock, both subscribers log-not-throw) ✓ across Tasks 1, 4, 5, 6. The one open spec risk ("confirmer si `WHATSAPP_ACCESS_TOKEN` couvre `catalog_management`") is an operational/Meta-side check, not code — left for the manual verification section and Task 7's env var comment.

**Placeholder scan:** no TBD/TODO, no "add error handling" hand-waving — every step has runnable code and a concrete expected test result.

**Type consistency:** `MetaCatalogItem`/`CatalogProduct`/`CatalogVariant` (Task 1) are the exact same names and shapes used in Tasks 2-6; `MetaCatalogConfig` (Task 2) matches the `{ catalogId, accessToken }` object built from `process.env` in Tasks 5-6; `loadVariantCatalogData`/`resolveVariantIdsForInventoryItem`/`syncVariantToMetaCatalog` (Task 3) signatures match every call site in Tasks 4-6.
