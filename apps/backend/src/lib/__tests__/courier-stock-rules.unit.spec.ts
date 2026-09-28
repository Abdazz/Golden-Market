import { balances, courierTotals, deliveryTakes, itemLabel, orderItemNeeds, parseMovementLines } from "../courier-stock-rules"

describe("balances / courierTotals", () => {
  it("somme les mouvements par livreur et article, omet les soldes nuls", () => {
    const b = balances([
      { courier_id: "c1", inventory_item_id: "balai", quantity: 5 },
      { courier_id: "c1", inventory_item_id: "balai", quantity: -2 },
      { courier_id: "c1", inventory_item_id: "seau", quantity: 3 },
      { courier_id: "c1", inventory_item_id: "seau", quantity: -3 },
      { courier_id: "c2", inventory_item_id: "balai", quantity: 1 },
    ])
    expect(b).toEqual({ c1: { balai: 3 }, c2: { balai: 1 } })
    expect(courierTotals(b)).toEqual({ balai: 4 })
  })
})

describe("orderItemNeeds", () => {
  const inv = {
    kit: [
      { inventory_item_id: "balai", required_quantity: 1 },
      { inventory_item_id: "seau", required_quantity: 1 },
    ],
    seau: [{ inventory_item_id: "seau", required_quantity: 1 }],
    lot2: [{ inventory_item_id: "eponge", required_quantity: 2 }],
  }
  it("décompose les kits et additionne par article physique", () => {
    expect(
      orderItemNeeds(
        [
          { variant_id: "kit", quantity: 1 },
          { variant_id: "seau", quantity: 2 },
          { variant_id: "lot2", quantity: 3 },
        ],
        inv
      )
    ).toEqual({ balai: 1, seau: 3, eponge: 6 })
  })
  it("ignore les articles sans variante ou sans stock suivi", () => {
    expect(orderItemNeeds([{ variant_id: null, quantity: 1 }, { variant_id: "inconnu", quantity: 1 }], inv)).toEqual({})
  })
})

describe("deliveryTakes", () => {
  it("prend min(besoin, solde), rien si solde nul", () => {
    expect(deliveryTakes({ balai: 2, seau: 1, eponge: 4 }, { balai: 1, seau: 5 })).toEqual([
      { inventory_item_id: "balai", quantity: 1 },
      { inventory_item_id: "seau", quantity: 1 },
    ])
  })
})

describe("parseMovementLines", () => {
  const ctx = { balance: { balai: 3 }, warehouse: { balai: 4, seau: 0 } }
  it("remise : fusionne les doublons, quantité positive", () => {
    expect(
      parseMovementLines("handover", [
        { inventory_item_id: "balai", quantity: 2 },
        { inventory_item_id: "balai", quantity: 2 },
      ], ctx)
    ).toEqual({ movements: [{ inventory_item_id: "balai", quantity: 4 }], stockAdjustments: [] })
  })
  it("remise : refuse plus que le stock au dépôt", () => {
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "balai", quantity: 5 }], ctx)).toThrow(/dépôt/)
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "seau", quantity: 1 }], ctx)).toThrow(/dépôt/)
  })
  it("retour : négatif, au plus le solde du livreur", () => {
    expect(parseMovementLines("return", [{ inventory_item_id: "balai", quantity: 3 }], ctx)).toEqual({
      movements: [{ inventory_item_id: "balai", quantity: -3 }],
      stockAdjustments: [],
    })
    expect(() => parseMovementLines("return", [{ inventory_item_id: "balai", quantity: 4 }], ctx)).toThrow(/livreur/)
  })
  it("correction : écart compté - solde, répercuté sur le stock Medusa", () => {
    expect(parseMovementLines("adjustment", [
      { inventory_item_id: "balai", quantity: 1 },
      { inventory_item_id: "seau", quantity: 2 },
    ], ctx)).toEqual({
      movements: [
        { inventory_item_id: "balai", quantity: -2 },
        { inventory_item_id: "seau", quantity: 2 },
      ],
      stockAdjustments: [
        { inventory_item_id: "balai", adjustment: -2 },
        { inventory_item_id: "seau", adjustment: 2 },
      ],
    })
  })
  it("correction sans écart : refusée", () => {
    expect(() => parseMovementLines("adjustment", [{ inventory_item_id: "balai", quantity: 3 }], ctx)).toThrow(/Aucun écart/)
  })
  it("refuse les quantités non entières, nulles (remise/retour) ou une liste vide", () => {
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "balai", quantity: 1.5 }], ctx)).toThrow(/entier/)
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "balai", quantity: 0 }], ctx)).toThrow(/entier/)
    expect(() => parseMovementLines("adjustment", [{ inventory_item_id: "balai", quantity: -1 }], ctx)).toThrow(/entier/)
    expect(() => parseMovementLines("handover", [], ctx)).toThrow(/au moins un produit/)
  })
  it("refuse une quantité aberrante (faute de frappe) au-delà de 10 000", () => {
    expect(() => parseMovementLines("adjustment", [{ inventory_item_id: "balai", quantity: 30000 }], ctx)).toThrow(/10 000/)
  })
})

describe("itemLabel", () => {
  it("produit + variante, sans variante par défaut, repli titre/sku", () => {
    expect(itemLabel({ variants: [{ title: "Simple", product: { title: "Balai" } }] })).toBe("Balai - Simple")
    expect(itemLabel({ variants: [{ title: "Default variant", product: { title: "Seau" } }] })).toBe("Seau")
    expect(itemLabel({ variants: [{ title: "Default Title", product: { title: "Balai" } }] })).toBe("Balai")
    expect(itemLabel({ title: "Éponge", variants: [] })).toBe("Éponge")
    expect(itemLabel({ sku: "SKU-1" })).toBe("SKU-1")
  })
})
