import { QueryContext, getTotalVariantAvailability } from "@medusajs/framework/utils"
import { buildCatalogItem, type CatalogProduct, type CatalogVariant } from "./meta-catalog-mapping"
import { upsertCatalogItem, type MetaCatalogConfig } from "./meta-catalog-client"

export const PRODUCT_FIELDS = [
  "id",
  "title",
  "description",
  "handle",
  "thumbnail",
  "images.url",
  "metadata",
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
      filters: { id: variantRef.product_id, status: "published" },
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
 *
 * Un catalogue Meta désormais peut alimenter plusieurs catalogues (celui de
 * production, lié au compte WhatsApp Cloud API, et celui de l'app mobile
 * WhatsApp Business - voir [[golden-market-whatsapp-agent-audit]]) : l'item
 * est construit une seule fois puis poussé vers chaque config en parallèle.
 * Un échec sur un catalogue ne doit pas empêcher la tentative sur les
 * autres - les échecs sont collectés puis remontés ensemble à l'appelant.
 */
export async function syncVariantToMetaCatalog(
  query: any,
  variantId: string,
  configs: MetaCatalogConfig[],
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

  const results = await Promise.allSettled(
    configs.map((config) => upsertCatalogItem(item, config, fetchImpl))
  )

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  )

  if (failures.length > 0) {
    throw new Error(
      `Échec de la synchro Meta pour ${failures.length}/${configs.length} catalogue(s) : ` +
        failures.map((failure) => (failure.reason as Error).message).join(" | ")
    )
  }
}

/**
 * META_CATALOG_ID/META_CATALOG_ACCESS_TOKEN : catalogue de production, lié
 * au compte WhatsApp Cloud API (+226 61 85 37 37). META_CATALOG_APP_ID/
 * META_CATALOG_APP_ACCESS_TOKEN : second catalogue, dédié au compte WhatsApp
 * Business app mobile (+226 64 94 73 73) - un catalogue Meta ne peut être
 * connecté qu'à un seul compte WhatsApp à la fois (voir
 * [[golden-market-whatsapp-agent-audit]]), d'où deux catalogues distincts
 * alimentés par le même flux Medusa. Chaque paire est indépendante : une
 * seule des deux peut être configurée sans bloquer l'autre.
 */
export function getConfiguredMetaCatalogConfigs(): MetaCatalogConfig[] {
  const configs: MetaCatalogConfig[] = []

  if (process.env.META_CATALOG_ID && process.env.META_CATALOG_ACCESS_TOKEN) {
    configs.push({
      catalogId: process.env.META_CATALOG_ID,
      accessToken: process.env.META_CATALOG_ACCESS_TOKEN,
    })
  }

  if (process.env.META_CATALOG_APP_ID && process.env.META_CATALOG_APP_ACCESS_TOKEN) {
    configs.push({
      catalogId: process.env.META_CATALOG_APP_ID,
      accessToken: process.env.META_CATALOG_APP_ACCESS_TOKEN,
    })
  }

  return configs
}
