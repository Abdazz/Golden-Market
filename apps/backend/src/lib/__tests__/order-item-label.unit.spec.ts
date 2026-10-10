import { orderItemLabel } from "../order-item-label"

describe("orderItemLabel", () => {
  const produit = "Balai-éponge à essorage automatique"

  it("ajoute la variante au titre du produit", () => {
    expect(orderItemLabel({ product_title: produit, variant_title: "Avec seau" })).toBe(`${produit} - Avec seau`)
  })

  it("renvoie le titre seul quand la variante est absente", () => {
    expect(orderItemLabel({ product_title: produit })).toBe(produit)
    expect(orderItemLabel({ product_title: produit, variant_title: null })).toBe(produit)
  })

  it("renvoie le titre seul pour une variante générique de Medusa", () => {
    expect(orderItemLabel({ product_title: produit, variant_title: "Default Title" })).toBe(produit)
    expect(orderItemLabel({ product_title: produit, variant_title: "Default variant" })).toBe(produit)
  })

  it("renvoie le titre seul quand la variante égale le titre du produit", () => {
    expect(orderItemLabel({ product_title: produit, variant_title: produit })).toBe(produit)
  })
})
