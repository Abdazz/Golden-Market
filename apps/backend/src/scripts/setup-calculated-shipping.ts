import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
  refreshCartShippingMethodsWorkflow,
} from "@medusajs/medusa/core-flows"

// One-shot idempotent (spec 2026-10-04 frais-expedition-par-produit) :
// remplace l'option "Livraison — à convenir avec le marchand" (0 F fixe) par
// l'option "Livraison" à prix calculé (fournisseur golden-market-shipping).
// Les commandes passées gardent leur mode de livraison.
const PROVIDER_ID = "golden-market-shipping_golden-market-shipping"
const OLD_OPTION_NAME = "Livraison — à convenir avec le marchand"

const isReturn = (o: any) => (o.rules ?? []).some((r: any) => r.attribute === "is_return" && r.value === "true")

export default async function setupCalculatedShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const optionFields = ["id", "name", "provider_id", "shipping_profile_id", "service_zone_id", "rules.attribute", "rules.value"]

  // Options sortantes déjà calculées (golden-market-shipping).
  const { data: calculatedOptions } = await query.graph({
    entity: "shipping_option",
    fields: optionFields,
    filters: { provider_id: PROVIDER_ID },
  })
  const calculated = calculatedOptions.filter((o: any) => !isReturn(o))

  // L'ancienne option sert de référence : on reprend sa zone, son profil et
  // l'emplacement de sa zone, sans dépendre de l'ordre des résultats.
  const { data: oldOptions } = await query.graph({
    entity: "shipping_option",
    fields: [...optionFields, "service_zone.fulfillment_set.location.id"],
    filters: { name: OLD_OPTION_NAME },
  })
  const obsolete = oldOptions.filter((o: any) => !isReturn(o) && o.provider_id !== PROVIDER_ID)

  if (!obsolete.length && !calculated.length) {
    throw new Error(
      `Ni l'option « ${OLD_OPTION_NAME} » ni une option calculée n'existent : aucune référence de zone, rien n'a été modifié.`
    )
  }

  if (!calculated.length) {
    const reference = obsolete[0]
    const locationId = reference.service_zone?.fulfillment_set?.location?.id
    if (!locationId || !reference.service_zone_id || !reference.shipping_profile_id) {
      throw new Error(
        `Option « ${OLD_OPTION_NAME} » (${reference.id}) : zone, profil ou emplacement introuvable, rien n'a été modifié.`
      )
    }

    const { data: locations } = await query.graph({
      entity: "stock_location",
      fields: ["id", "fulfillment_providers.id"],
      filters: { id: locationId },
    })
    if (!(locations[0]?.fulfillment_providers ?? []).some((p: any) => p?.id === PROVIDER_ID)) {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVIDER_ID },
      })
      logger.info(`Fournisseur golden-market-shipping relié à l'emplacement de stock ${locationId}.`)
    }

    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Livraison",
          price_type: "calculated",
          provider_id: PROVIDER_ID,
          service_zone_id: reference.service_zone_id,
          shipping_profile_id: reference.shipping_profile_id,
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
    logger.info(`Option de livraison calculée créée dans la zone ${reference.service_zone_id} (profil ${reference.shipping_profile_id}).`)
  }

  // Seule l'ancienne option à 0 F est supprimée ; toute autre option est laissée telle quelle.
  const { data: allOptions } = await query.graph({ entity: "shipping_option", fields: optionFields })
  const others = allOptions.filter((o: any) => !isReturn(o) && o.provider_id !== PROVIDER_ID && o.name !== OLD_OPTION_NAME)
  for (const o of others) {
    logger.warn(`Option de livraison conservée (non remplacée) : ${o.id} « ${o.name} » (fournisseur ${o.provider_id}).`)
  }
  if (obsolete.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: obsolete.map((o: any) => o.id) } })
    for (const o of obsolete) {
      logger.info(`Option de livraison à prix fixe supprimée : ${o.id} « ${o.name} ».`)
    }
  }

  // Paniers ouverts encore rattachés à l'ancienne option (y compris supprimée lors
  // d'un passage précédent) : sans rafraîchissement, le paiement échoue.
  const { data: deletedOld } = await query.graph({
    entity: "shipping_option",
    fields: ["id"],
    filters: { name: OLD_OPTION_NAME },
    withDeleted: true,
  })
  const oldIds = deletedOld.map((o: any) => o.id)
  let refreshed = 0
  if (oldIds.length) {
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id"],
      filters: { completed_at: null, shipping_methods: { shipping_option_id: oldIds } } as any,
    })
    for (const cart of carts) {
      try {
        await refreshCartShippingMethodsWorkflow(container).run({ input: { cart_id: cart.id } })
        refreshed++
      } catch (e: any) {
        logger.error(`Panier ${cart.id} : rafraîchissement du mode de livraison impossible (${e?.message ?? e}).`)
      }
    }
  }
  logger.info(`Paniers ouverts rafraîchis (ancienne option retirée) : ${refreshed}.`)
  logger.info("Livraison à frais d'expédition calculés : prête.")
}
