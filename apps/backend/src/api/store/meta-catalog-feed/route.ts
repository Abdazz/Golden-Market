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
