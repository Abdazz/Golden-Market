import { shippingFeeForProducts, shippingFeeForVariants } from "../shipping-fee-query"

const queryWith = (data: any[]) => ({ graph: jest.fn().mockResolvedValue({ data }) })

describe("shippingFeeForProducts", () => {
  it("lit les métadonnées des produits et applique la règle", async () => {
    const query = queryWith([
      { id: "p1", metadata: { frais_expedition_xof: 1500 } },
      { id: "p2", metadata: { frais_expedition_xof: 2500 } },
    ])
    await expect(shippingFeeForProducts(query, "Kaya", ["p1", "p2", "p1"])).resolves.toBe(2500)
    expect(query.graph).toHaveBeenCalledWith({ entity: "product", fields: ["id", "metadata"], filters: { id: ["p1", "p2"] } })
  })

  it("ne lit rien à Ouagadougou ni pour un panier vide", async () => {
    const query = queryWith([])
    await expect(shippingFeeForProducts(query, "Ouagadougou", ["p1"])).resolves.toBe(0)
    await expect(shippingFeeForProducts(query, "Kaya", [])).resolves.toBe(0)
    expect(query.graph).not.toHaveBeenCalled()
  })
})

describe("shippingFeeForVariants", () => {
  it("passe par le produit de chaque variante", async () => {
    const query = queryWith([
      { id: "v1", product: { id: "p1", metadata: { frais_expedition_xof: 3000 } } },
      { id: "v2", product: { id: "p2", metadata: {} } },
    ])
    await expect(shippingFeeForVariants(query, "Bobo-Dioulasso", ["v1", "v2"])).resolves.toBe(3000)
    expect(query.graph).toHaveBeenCalledWith({ entity: "product_variant", fields: ["id", "product.id", "product.metadata"], filters: { id: ["v1", "v2"] } })
  })
})
