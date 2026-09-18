import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { triggerStorefrontRevalidate } from "../lib/storefront-revalidate-client"

/**
 * Couvre à la fois les changements de prix par défaut d'une variante
 * (product-variant.updated - déclenché par updateProductVariantsWorkflow,
 * voir product-variant-price-updated-meta-catalog.ts) et les overrides de
 * price list (pricing.price.created/updated/deleted - déclenchés par
 * updatePriceListPricesWorkflow, qui ne touche jamais le module produit et ne
 * peut donc pas émettre product-variant.updated). Sans ce deuxième groupe
 * d'événements, un changement de prix promo dans une price list ne serait
 * jamais répercuté sur le storefront (voir bug constaté le 2026-09-18 :
 * cache Next.js "force-cache" jamais invalidé, HANDOFF.md).
 */
export default async function priceUpdatedStorefrontRevalidateHandler({
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storefrontUrl = process.env.STOREFRONT_URL
  const secret = process.env.REVALIDATE_SECRET

  if (!storefrontUrl || !secret) {
    logger.info(
      "Changement de prix détecté — STOREFRONT_URL/REVALIDATE_SECRET non configurés, revalidation storefront ignorée"
    )
    return
  }

  try {
    await triggerStorefrontRevalidate({ storefrontUrl, secret })
    logger.info("Cache produits du storefront revalidé après changement de prix")
  } catch (error) {
    logger.error(
      "Échec de la revalidation du cache produits du storefront",
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    "product-variant.updated",
    "pricing.price.created",
    "pricing.price.updated",
    "pricing.price.deleted",
  ],
}
