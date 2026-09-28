import { prepareDeliveryTakes } from "../courier-stock-query"

describe("prepareDeliveryTakes", () => {
  it("rien si la livraison a déjà déstocké (double clic)", () => {
    expect(prepareDeliveryTakes({ existingCount: 1, needs: { balai: 1 }, balance: { balai: 3 } })).toEqual([])
  })
  it("sinon min(besoin, solde)", () => {
    expect(prepareDeliveryTakes({ existingCount: 0, needs: { balai: 2 }, balance: { balai: 1 } })).toEqual([
      { inventory_item_id: "balai", quantity: 1 },
    ])
  })
})
