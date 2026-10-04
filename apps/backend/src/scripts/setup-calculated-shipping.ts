import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow, deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

// One-shot idempotent (spec 2026-10-04 frais-expedition-par-produit) :
// remplace l'option "Livraison — à convenir avec le marchand" (0 F fixe) par
// l'option "Livraison" à prix calculé (fournisseur golden-market-shipping).
// Les commandes passées gardent leur mode de livraison.
const PROVIDER_ID = "golden-market-shipping_golden-market-shipping"
const OLD_OPTION_NAME = "Livraison — à convenir avec le marchand"

export default async function setupCalculatedShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "fulfillment_providers.id", "fulfillment_sets.service_zones.id"],
  })
  const location = locations[0]
  const serviceZoneId = location?.fulfillment_sets?.[0]?.service_zones?.[0]?.id
  if (!location || !serviceZoneId) throw new Error("Emplacement de stock ou zone de service introuvable (lancer seed:region-bf d'abord).")

  if (!(location.fulfillment_providers ?? []).some((p: any) => p?.id === PROVIDER_ID)) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVIDER_ID },
    })
    logger.info("Fournisseur golden-market-shipping relié à l'emplacement de stock.")
  }

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id", "price_type", "shipping_profile_id", "rules.attribute", "rules.value"],
  })
  const isReturn = (o: any) => (o.rules ?? []).some((r: any) => r.attribute === "is_return" && r.value === "true")
  const outbound = options.filter((o: any) => !isReturn(o))

  if (!outbound.some((o: any) => o.provider_id === PROVIDER_ID)) {
    const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Livraison",
          price_type: "calculated",
          provider_id: PROVIDER_ID,
          service_zone_id: serviceZoneId,
          shipping_profile_id: outbound[0]?.shipping_profile_id ?? profiles[0].id,
          type: {
            label: "Livraison",
            description: "Gratuite à Ouagadougou ; ailleurs, frais d'expédition selon les produits.",
            code: "livraison",
          },
          data: { id: "golden-market-shipping" },
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        } as any,
      ],
    })
    logger.info("Option de livraison calculée créée.")
  }

  // Seule l'ancienne option à 0 F est supprimée ; toute autre option est laissée telle quelle.
  const obsolete = outbound.filter((o: any) => o.provider_id !== PROVIDER_ID && o.name === OLD_OPTION_NAME)
  const others = outbound.filter((o: any) => o.provider_id !== PROVIDER_ID && o.name !== OLD_OPTION_NAME)
  for (const o of others) {
    logger.warn(`Option de livraison conservée (non remplacée) : ${o.id} « ${o.name} » (fournisseur ${o.provider_id}).`)
  }
  if (obsolete.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: obsolete.map((o: any) => o.id) } })
    for (const o of obsolete) {
      logger.info(`Option de livraison à prix fixe supprimée : ${o.id} « ${o.name} ».`)
    }
  }
  logger.info("Livraison à frais d'expédition calculés : prête.")
}
