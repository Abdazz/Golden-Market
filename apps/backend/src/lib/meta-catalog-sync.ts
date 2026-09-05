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
