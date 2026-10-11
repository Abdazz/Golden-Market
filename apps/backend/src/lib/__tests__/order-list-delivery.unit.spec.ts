import { deliveryInfoByOrder, withDeliveryAsSalesChannel } from "../order-list-delivery"

describe("deliveryInfoByOrder", () => {
  it("commande confiée : type et livreur de la dernière livraison non annulée", () => {
    const infos = deliveryInfoByOrder(
      ["o1"],
      [
        { order_id: "o1", courier_id: "c1", type: "expedition", status: "failed", assigned_at: "2026-10-01T10:00:00Z" },
        { order_id: "o1", courier_id: "c2", type: "express", status: "delivered", assigned_at: "2026-10-02T10:00:00Z" },
        { order_id: "o1", courier_id: "c3", type: "expedition", status: "canceled", assigned_at: "2026-10-03T10:00:00Z" },
      ],
      [{ id: "o1", shipping_address: { city: "Bobo-Dioulasso" } }]
    )
    expect(infos.get("o1")).toEqual({ type: "express", courierId: "c2" })
  })

  it("commande pas encore confiée : type prévu d'après la ville, sans livreur", () => {
    const infos = deliveryInfoByOrder(
      ["o1", "o2", "o3"],
      [],
      [
        { id: "o1", shipping_address: { city: "Ouagadougou" } },
        { id: "o2", shipping_address: { city: "Bobo-Dioulasso" } },
        { id: "o3", shipping_address: null },
      ]
    )
    expect([...infos.values()]).toEqual([
      { type: "express", courierId: null },
      { type: "expedition", courierId: null },
      { type: "express", courierId: null },
    ])
  })
})

describe("withDeliveryAsSalesChannel", () => {
  it("remplace le nom du canal de vente par le type de livraison et le livreur", () => {
    const body = {
      orders: [
        { id: "o1", sales_channel: { id: "sc_1", name: "Default Sales Channel" } },
        { id: "o2", sales_channel: null },
      ],
    }
    const infos = new Map([
      ["o1", { type: "express" as const, courierId: "c1" }],
      ["o2", { type: "expedition" as const, courierId: null }],
    ])
    const result = withDeliveryAsSalesChannel(body, infos, new Map([["c1", "Moussa"]]))
    expect(result.orders.map((o: any) => o.sales_channel.name)).toEqual(["Livraison Ouaga · Moussa", "Expédition"])
    expect(result.orders[0].sales_channel.id).toBe("sc_1")
  })

  it("corps sans liste de commandes : renvoyé tel quel", () => {
    expect(withDeliveryAsSalesChannel({ order: { id: "o1" } }, new Map(), new Map())).toEqual({ order: { id: "o1" } })
    expect(withDeliveryAsSalesChannel(null, new Map(), new Map())).toBeNull()
  })
})
