import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  batchLinksWorkflow,
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
import { parseNewProducts } from "./parse-new-products"

const DEFAULT_NEW_PRODUCTS_PATH =
  process.env.NEW_PRODUCTS_PATH ?? "/app/catalog-data/Golden_Market_New_products.xlsx"

// Deuxième passe après import-new-products.ts : chaque variante des 11
// nouveaux produits a manage_inventory: true mais aucun article
// d'inventaire ni emplacement de stock (createProductsWorkflow n'en crée
// pas). On relit le fichier pour récupérer les vraies quantités (colonne
// Stock), on crée un inventory item par variante, on le lie à la variante
// (batchLinksWorkflow, comme la route admin) puis à l'unique emplacement
// de stock du magasin avec la quantité réelle.
//
// Idempotent : une variante dont l'inventaire est déjà lié à un
// emplacement est ignorée (ré-exécution sûre).
export default async function linkInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION)

  const parsed = await parseNewProducts(DEFAULT_NEW_PRODUCTS_PATH)

  // Le magasin livre depuis "Entrepôt Ouagadougou". En dev local, le seed de
  // démo Medusa crée aussi "European Warehouse" - on cible donc l'entrepôt
  // par nom plutôt que d'exiger un unique emplacement.
  const OUAGA_LOCATION_NAME = "Entrepôt Ouagadougou"
  const locations = await stockLocationModuleService.listStockLocations({})
  const location = locations.find((l) => l.name === OUAGA_LOCATION_NAME)
  if (!location) {
    throw new Error(
      `Emplacement de stock "${OUAGA_LOCATION_NAME}" introuvable (trouvés : ${
        locations.map((l) => l.name).join(", ") || "aucun"
      }).`
    )
  }
  const locationId = location.id
  logger.info(`Emplacement de stock : "${location.name}" (${locationId})`)

  let linked = 0
  let skipped = 0
  let missing = 0

  for (const product of parsed) {
    const [dbProduct] = await productModuleService.listProducts(
      { title: product.name },
      { relations: ["variants"] }
    )
    if (!dbProduct || !dbProduct.variants?.length) {
      logger.error(`Produit "${product.name}" introuvable ou sans variante, ignoré.`)
      missing += 1
      continue
    }
    const variant = dbProduct.variants[0]

    const { data: existingLinks } = await query.graph({
      entity: "product_variant_inventory_item",
      filters: { variant_id: variant.id },
      fields: [
        "inventory_item_id",
        "inventory.location_levels.location_id",
      ],
    })
    const alreadyStocked = existingLinks.some(
      (l: any) => (l.inventory?.location_levels?.length ?? 0) > 0
    )
    if (alreadyStocked) {
      logger.info(`"${product.name}" a déjà un stock lié, ignoré.`)
      skipped += 1
      continue
    }

    let inventoryItemId: string | undefined = existingLinks[0]?.inventory_item_id

    if (!inventoryItemId) {
      const { result } = await createInventoryItemsWorkflow(container).run({
        input: { items: [{ title: product.name }] },
      })
      inventoryItemId = result[0].id

      await batchLinksWorkflow(container).run({
        input: {
          create: [
            {
              [Modules.PRODUCT]: { variant_id: variant.id },
              [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
              data: { required_quantity: 1 },
            },
          ],
        },
      })
    }

    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: [
          {
            inventory_item_id: inventoryItemId!,
            location_id: locationId,
            stocked_quantity: product.stock,
          },
        ],
      },
    })

    logger.info(`"${product.name}" -> stock ${product.stock} lié.`)
    linked += 1
  }

  logger.info(
    `Liaison inventaire terminée : ${linked} liés, ${skipped} déjà faits, ${missing} introuvables.`
  )
}
