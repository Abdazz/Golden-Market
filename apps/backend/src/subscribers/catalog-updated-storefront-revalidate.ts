import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { triggerStorefrontRevalidate } from "../lib/storefront-revalidate-client"

/**
 * Invalide le cache produits du storefront (tag "products", force-cache sans
 * expiration côté Next.js) à chaque changement de catalogue visible par le
 * client :
 * - fiche produit créée, modifiée ou supprimée (product.* - émis par
 *   create/update/deleteProductsWorkflow, donc aussi bien depuis l'admin que
 *   depuis un script) : titre, description, images, catégorie, statut de
 *   publication. Sans ce groupe, un nouveau produit ou une image changée
 *   restait invisible jusqu'au prochain redéploiement du storefront -
 *   constaté le 2026-09-24 après la conversion webp -> jpeg des images ;
 * - prix par défaut d'une variante (product-variant.updated - déclenché par
 *   updateProductVariantsWorkflow, voir product-variant-price-updated-meta-catalog.ts) ;
 * - overrides de price list (pricing.price.* - updatePriceListPricesWorkflow
 *   ne touche jamais le module produit et n'émet donc aucun évènement
 *   product.*, voir bug du 2026-09-18 dans HANDOFF.md).
 */
export default async function catalogUpdatedStorefrontRevalidateHandler({
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storefrontUrl = process.env.STOREFRONT_URL
  const secret = process.env.REVALIDATE_SECRET

  if (!storefrontUrl || !secret) {
    logger.info(
      "Changement de catalogue détecté — STOREFRONT_URL/REVALIDATE_SECRET non configurés, revalidation storefront ignorée"
    )
    return
  }

  try {
    await triggerStorefrontRevalidate({ storefrontUrl, secret })
    logger.info("Cache produits du storefront revalidé après changement de catalogue")
  } catch (error) {
    logger.error(
      "Échec de la revalidation du cache produits du storefront",
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-variant.updated",
    "pricing.price.created",
    "pricing.price.updated",
    "pricing.price.deleted",
  ],
}
