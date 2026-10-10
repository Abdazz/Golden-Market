import { toTourLine } from "../delivery-service-helpers"

const order = {
  id: "order_1",
  display_id: 12,
  status: "pending",
  shipping_address: { first_name: "Awa", last_name: "Traoré", phone: "70000000", city: "Ouagadougou", address_1: "Secteur 15" },
  items: [{ title: "Sac", quantity: 2 }],
}

const base = {
  id: "del_1",
  order_id: "order_1",
  courier_id: "cou_1",
  status: "assigned",
  tour_date: "2026-10-10",
  postponed_count: 0,
  assigned_at: "2026-10-10T08:00:00Z",
  amount_to_collect: 5000,
}

describe("toTourLine : champs du message livreur", () => {
  it("expose l'adresse d'une livraison express et laisse la compagnie et la ville à null", () => {
    const line = toTourLine({ ...base, type: "express", address: "Secteur 15, rue 3" }, order, "Moussa")
    expect(line.address).toBe("Secteur 15, rue 3")
    expect(line.transport_company).toBeNull()
    expect(line.destination_city).toBeNull()
    expect(line.place).toBe("Secteur 15, rue 3")
  })

  it("expose la compagnie et la ville d'une expédition", () => {
    const line = toTourLine(
      { ...base, type: "expedition", address: null, transport_company: "STAF", destination_city: "Bobo-Dioulasso" },
      order,
      "Moussa",
    )
    expect(line.address).toBeNull()
    expect(line.transport_company).toBe("STAF")
    expect(line.destination_city).toBe("Bobo-Dioulasso")
    expect(line.place).toBe("STAF → Bobo-Dioulasso")
  })

  it("renvoie null quand les valeurs sont absentes de la livraison", () => {
    const line = toTourLine({ ...base, type: "express" }, order)
    expect(line.address).toBeNull()
    expect(line.transport_company).toBeNull()
    expect(line.destination_city).toBeNull()
  })
})
