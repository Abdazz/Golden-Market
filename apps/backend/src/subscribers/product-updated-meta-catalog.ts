import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getConfiguredMetaCatalogConfigs, syncVariantToMetaCatalog } from "../lib/meta-catalog-sync"

/**
 * product.updated (vidéo, photos, titre, description ajoutés ou modifiés) :
 * repousse toutes les variantes du produit vers le catalogue Meta. Sans cela
 * Meta ne reçoit le nouveau lien vidéo qu'au prochain changement de prix ou de
 * stock (constaté le 2026-10-16 : vidéo ajoutée, avertissement Meta conservé).
 * Jamais de throw : un échec est journalisé et n'affecte pas l'enregistrement.
 */
export default async function productUpdatedMetaCatalogHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const configs = getConfiguredMetaCatalogConfigs()
  if (configs.length === 0) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  try {
    const {
      data: [product],
    } = await query.graph({ entity: "product", fields: ["id", "variants.id"], filters: { id: event.data.id } })
    for (const variant of product?.variants ?? []) {
      try {
        await syncVariantToMetaCatalog(query, variant.id, configs)
      } catch (error) {
        logger.error(`Produit ${event.data.id}, variante ${variant.id} : échec de la synchro avec le catalogue Meta`, error as Error)
      }
    }
    logger.info(`Produit ${event.data.id} mis à jour : synchronisé avec le catalogue Meta`)
  } catch (error) {
    logger.error(`Produit ${event.data.id} : échec de la synchro avec le catalogue Meta`, error as Error)
  }
}

export const config: SubscriberConfig = {
  event: "product.updated",
}
