import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  batchLinksWorkflow,
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"

// Aligne l'environnement courant sur la configuration de suivi de stock déjà
// appliquée manuellement en production (jamais scriptée, jamais reportée sur
// staging - constaté en comparant les deux bases le 2026-09-03, signalé par
// le propriétaire). import-catalog.ts crée volontairement ses 29 produits
// avec manage_inventory: false (toujours "disponible", voir commentaire du
// script) ; en production ce choix a ensuite été inversé à la main pour
// refléter que ces 29 anciens produits du catalogue sont réellement en
// rupture (contrairement aux lots plus récents, importés avec un vrai
// suivi de stock dès le départ - voir new-products-2026-09/link-inventory.ts).
//
// Ce script ne touche à aucune variante déjà en manage_inventory: true (les
// lots récents ne sont jamais concernés) - cible uniquement les variantes
// encore à false, les bascule à true, puis leur crée un item d'inventaire à
// stock 0 sur "Entrepôt Ouagadougou", exactement le même triplet
// (manage_inventory=true, allow_backorder=false, stocked_quantity=0)
// vérifié en production pour ces mêmes produits.
//
// Idempotent : une variante déjà manage_inventory=true est ignorée pour la
// bascule ; un inventory item déjà lié à un emplacement est ignoré pour la
// liaison de stock (ré-exécution sûre).
export default async function activateStockTrackingOldCatalog({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION)

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

  const { data: untrackedVariants } = await query.graph({
    entity: "product_variant",
    filters: { manage_inventory: false },
    fields: ["id", "title", "product.title"],
  })

  if (untrackedVariants.length === 0) {
    logger.info(
      "Aucune variante en manage_inventory=false, rien à activer (déjà fait ?)."
    )
  } else {
    logger.info(
      `${untrackedVariants.length} variante(s) à basculer en manage_inventory=true.`
    )
    await updateProductVariantsWorkflow(container).run({
      input: {
        product_variants: untrackedVariants.map((v: any) => ({
          id: v.id,
          manage_inventory: true,
        })),
      },
    })
    logger.info("Bascule manage_inventory terminée.")
  }

  // Deuxième passe (idempotente indépendamment de la première) : toutes les
  // variantes qui n'ont pas encore d'item d'inventaire lié à un emplacement -
  // couvre à la fois celles basculées ci-dessus et une éventuelle
  // ré-exécution partielle précédente.
  const { data: allVariants } = await query.graph({
    entity: "product_variant",
    filters: { manage_inventory: true },
    fields: ["id", "title", "product.title"],
  })

  let linked = 0
  let skipped = 0

  for (const variant of allVariants as any[]) {
    const { data: existingLinks } = await query.graph({
      entity: "product_variant_inventory_item",
      filters: { variant_id: variant.id },
      fields: ["inventory_item_id", "inventory.location_levels.location_id"],
    })
    const alreadyStocked = existingLinks.some(
      (l: any) => (l.inventory?.location_levels?.length ?? 0) > 0
    )
    if (alreadyStocked) {
      skipped += 1
      continue
    }

    let inventoryItemId: string | undefined = existingLinks[0]?.inventory_item_id

    if (!inventoryItemId) {
      const { result } = await createInventoryItemsWorkflow(container).run({
        input: { items: [{ title: variant.product?.title ?? variant.title }] },
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
            // Rupture volontaire (0), pas une valeur par défaut oubliée :
            // c'est exactement l'état vérifié en production pour ces mêmes
            // anciens produits du catalogue.
            stocked_quantity: 0,
          },
        ],
      },
    })

    logger.info(`"${variant.product?.title ?? variant.title}" -> stock 0 lié.`)
    linked += 1
  }

  logger.info(
    `Liaison inventaire terminée : ${linked} lié(s), ${skipped} déjà fait(s).`
  )
}
