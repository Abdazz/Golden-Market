import { GoldenMarketShippingService } from "../golden-market-shipping"

const serviceWith = (graph: jest.Mock) => {
  const service = new GoldenMarketShippingService({}, {})
  service.resolveQuery = () => ({ graph })
  return service
}

const context = (city: string | null, productIds: string[]) =>
  ({ shipping_address: city === null ? null : { city }, items: productIds.map((id) => ({ product_id: id })) }) as any

describe("GoldenMarketShippingService", () => {
  it("sait calculer ses prix", async () => {
    await expect(new GoldenMarketShippingService({}, {}).canCalculate({} as any)).resolves.toBe(true)
  })

  it("calcule les frais d'expédition du panier", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [{ id: "p1", metadata: { frais_expedition_xof: 2000 } }] })
    const price = await serviceWith(graph).calculatePrice({}, {}, context("Kaya", ["p1"]))
    expect(price).toEqual({ calculated_amount: 2000, is_calculated_price_tax_inclusive: true })
  })

  it("0 F tant que l'adresse n'est pas saisie", async () => {
    const graph = jest.fn()
    const price = await serviceWith(graph).calculatePrice({}, {}, context(null, ["p1"]))
    expect(price.calculated_amount).toBe(0)
  })

  it("lecture des produits en échec : 1 000 F hors Ouagadougou, sans bloquer la commande", async () => {
    const graph = jest.fn().mockRejectedValue(new Error("timeout"))
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const price = await serviceWith(graph).calculatePrice({}, {}, context("Kaya", ["p1"]))
    expect(price.calculated_amount).toBe(1000)
    spy.mockRestore()
  })

  it("expose une option de livraison et accepte les données telles quelles", async () => {
    const service = new GoldenMarketShippingService({}, {})
    await expect(service.getFulfillmentOptions()).resolves.toEqual([{ id: "golden-market-shipping" }])
    await expect(service.validateFulfillmentData({}, { a: 1 }, {} as any)).resolves.toEqual({ a: 1 })
  })
})
