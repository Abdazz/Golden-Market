import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

export default async function seedRegionBf({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionModuleService = container.resolve(Modules.REGION)
  const storeModuleService = container.resolve(Modules.STORE)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

  const [existingRegion] = await regionModuleService.listRegions({
    name: "Burkina Faso",
  })

  if (existingRegion) {
    logger.info("La région Burkina Faso existe déjà, rien à faire.")
    return
  }

  logger.info("Ajout de la devise XOF au store...")
  const [store] = await storeModuleService.listStores(
    {},
    { relations: ["supported_currencies"] }
  )
  const currentCurrencies =
    store.supported_currencies?.map((c) => ({
      currency_code: c.currency_code,
      is_default: c.is_default,
    })) ?? []

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          ...currentCurrencies,
          { currency_code: "xof", is_default: false },
        ],
      },
    },
  })

  logger.info("Création de la région Burkina Faso...")
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Burkina Faso",
          currency_code: "xof",
          countries: ["bf"],
          payment_providers: ["pp_orange-money-manual_orange-money-manual"],
        },
      ],
    },
  })
  const region = regionResult[0]

  logger.info("Création de la tax region...")
  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "bf", provider_id: "tp_system" }],
  })

  logger.info("Création du stock location...")
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Entrepôt Ouagadougou",
          address: { city: "Ouagadougou", country_code: "BF", address_1: "" },
        },
      ],
    },
  })
  const stockLocation = stockLocationResult[0]

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfileResult[0]

  logger.info("Création du fulfillment set...")
  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Burkina Faso delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Burkina Faso",
        geo_zones: [{ country_code: "bf", type: "country" }],
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [store.default_sales_channel_id!],
    },
  })

  logger.info("Création de l'option de livraison...")
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Livraison — à convenir avec le marchand",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "À convenir",
          description:
            "Le montant de la livraison est convenu avec le marchand après la commande.",
          code: "a-convenir",
        },
        prices: [
          { currency_code: "xof", amount: 0 },
          { region_id: region.id, amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })

  logger.info("Région Burkina Faso créée avec succès.")
}
