import { DEFAULT_SHIPPING_FEE_XOF, computeShippingFee, productShippingFee } from "../shipping-fee-rules"

describe("productShippingFee", () => {
  it.each([
    [{ frais_expedition_xof: 2000 }, 2000],
    [{ frais_expedition_xof: "2500" }, 2500],
    [{ frais_expedition_xof: 0 }, 0],
    [{ frais_expedition_xof: -100 }, DEFAULT_SHIPPING_FEE_XOF],
    [{ frais_expedition_xof: 1500.5 }, DEFAULT_SHIPPING_FEE_XOF],
    [{ frais_expedition_xof: "abc" }, DEFAULT_SHIPPING_FEE_XOF],
    [{ frais_expedition_xof: "" }, DEFAULT_SHIPPING_FEE_XOF],
    [{}, DEFAULT_SHIPPING_FEE_XOF],
    [null, DEFAULT_SHIPPING_FEE_XOF],
  ])("%j -> %i", (metadata, expected) => {
    expect(productShippingFee(metadata as any)).toBe(expected)
  })
})

describe("computeShippingFee", () => {
  const balai = { metadata: { frais_expedition_xof: 1500 } }
  const ventilo = { metadata: { frais_expedition_xof: 2500 } }
  const petit = { metadata: { frais_expedition_xof: 500 } }

  it.each(["Ouagadougou", "ouaga 2000", "  OUAGADOUGOU ", "", null, undefined])(
    "livraison gratuite à Ouagadougou (%p)",
    (city) => expect(computeShippingFee({ city: city as any, products: [ventilo] })).toBe(0)
  )

  it("hors Ouagadougou : les frais les plus élevés des produits du panier", () => {
    expect(computeShippingFee({ city: "Kaya", products: [balai, ventilo, petit] })).toBe(2500)
  })

  it("hors Ouagadougou : un produit sans frais saisis compte pour 1 500 F", () => {
    expect(computeShippingFee({ city: "Koudougou", products: [petit, { metadata: null }] })).toBe(1500)
  })

  it("panier vide : 0 F", () => {
    expect(computeShippingFee({ city: "Kaya", products: [] })).toBe(0)
  })
})
