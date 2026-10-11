import { deliveryTypeByOrder, withDeliveryTypeAsSalesChannel } from "../order-list-delivery"

describe("deliveryTypeByOrder", () => {
  it("commande confiée : type de la dernière livraison non annulée", () => {
    const types = deliveryTypeByOrder(
      ["o1"],
      [
        { order_id: "o1", type: "expedition", status: "failed", assigned_at: "2026-10-01T10:00:00Z" },
        { order_id: "o1", type: "express", status: "assigned", assigned_at: "2026-10-02T10:00:00Z" },
        { order_id: "o1", type: "expedition", status: "canceled", assigned_at: "2026-10-03T10:00:00Z" },
      ],
      [{ id: "o1", shipping_address: { city: "Bobo-Dioulasso" } }]
    )
    expect(types.get("o1")).toBe("express")
  })

  it("commande pas encore confiée : type prévu d'après la ville", () => {
    const types = deliveryTypeByOrder(
      ["o1", "o2", "o3"],
      [],
      [
        { id: "o1", shipping_address: { city: "Ouagadougou" } },
        { id: "o2", shipping_address: { city: "Bobo-Dioulasso" } },
        { id: "o3", shipping_address: null },
      ]
    )
    expect([...types.values()]).toEqual(["express", "expedition", "express"])
  })
})

describe("withDeliveryTypeAsSalesChannel", () => {
  it("remplace le nom du canal de vente par le libellé du type de livraison", () => {
    const body = {
      orders: [
        { id: "o1", sales_channel: { id: "sc_1", name: "Default Sales Channel" } },
        { id: "o2", sales_channel: null },
      ],
    }
    const types = new Map([["o1", "express"], ["o2", "expedition"]] as const)
    const result = withDeliveryTypeAsSalesChannel(body, new Map(types))
    expect(result.orders.map((o: any) => o.sales_channel.name)).toEqual(["Livraison Ouaga", "Expédition"])
    expect(result.orders[0].sales_channel.id).toBe("sc_1")
  })

  it("corps sans liste de commandes : renvoyé tel quel", () => {
    expect(withDeliveryTypeAsSalesChannel({ order: { id: "o1" } }, new Map())).toEqual({ order: { id: "o1" } })
    expect(withDeliveryTypeAsSalesChannel(null, new Map())).toBeNull()
  })
})
