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
