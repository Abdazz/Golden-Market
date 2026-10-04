import { container } from "@medusajs/framework"
import {
  AbstractFulfillmentProviderService,
  ContainerRegistrationKeys,
  ModuleProvider,
  Modules,
} from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types"
import { DEFAULT_SHIPPING_FEE_XOF } from "../lib/shipping-fee-rules"
import { defaultTypeForCity } from "../lib/delivery-rules"
import { shippingFeeForProducts } from "../lib/shipping-fee-query"

/**
 * Livraison Golden Market (spec 2026-10-04 frais-expedition-par-produit) :
 * option "calculée" - gratuite à Ouagadougou, ailleurs les frais d'expédition
 * les plus élevés des produits du panier (metadata.frais_expedition_xof,
 * 1 500 F par défaut). Aucun service externe : expédition gérée à la main,
 * comme le fournisseur "manual" de Medusa.
 *
 * Le conteneur d'un fournisseur ne donne accès qu'au module fulfillment :
 * les produits sont lus par Query depuis le conteneur global de l'application.
 */
export class GoldenMarketShippingService extends AbstractFulfillmentProviderService {
  static identifier = "golden-market-shipping"

  resolveQuery: () => { graph: (config: any) => Promise<{ data: any[] }> } = () =>
    container.resolve(ContainerRegistrationKeys.QUERY)

  constructor(_container: any, _options: Record<string, unknown>) {
    super()
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "golden-market-shipping" }]
  }

  async validateFulfillmentData(_optionData: Record<string, unknown>, data: Record<string, unknown>, _context: any) {
    return data
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async canCalculate(_data: any): Promise<boolean> {
    return true
  }

  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const city = (context as any)?.shipping_address?.city ?? null
    const productIds = (((context as any)?.items ?? []) as any[]).map((i) => i.product_id ?? i.product?.id ?? i.variant?.product?.id)
    let amount: number
    try {
      amount = await shippingFeeForProducts(this.resolveQuery(), city, productIds)
    } catch (error) {
      // Ne jamais bloquer une commande pour ça : montant par défaut hors Ouagadougou.
      console.error("[golden-market-shipping] lecture des frais d'expédition impossible :", error)
      amount = defaultTypeForCity(city) === "express" || !productIds.length ? 0 : DEFAULT_SHIPPING_FEE_XOF
    }
    return { calculated_amount: amount, is_calculated_price_tax_inclusive: true }
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }

  async cancelFulfillment(): Promise<any> {
    return {}
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }
}

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [GoldenMarketShippingService],
})
