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
