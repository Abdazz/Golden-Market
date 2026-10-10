import { courierBadge, courierFor } from "../courier-match"

const c = (over: Record<string, unknown>) => ({
  id: "c",
  name: "Issa",
  phone: "+226 70 00 00 00",
  active: true,
  notes: null,
  ...over,
}) as any

describe("courierFor", () => {
  it("retrouve le livreur actif quel que soit le format du numéro", () => {
    expect(courierFor([c({})], "22670000000")?.name).toBe("Issa")
    expect(courierFor([c({ phone: "70000000" })], "22670000000")?.name).toBe("Issa")
  })
  it("ignore un livreur inactif", () => {
    expect(courierFor([c({ active: false })], "22670000000")).toBeNull()
  })
  it("renvoie null pour un autre numéro ou une liste vide", () => {
    expect(courierFor([c({})], "22677406101")).toBeNull()
    expect(courierFor([], "22670000000")).toBeNull()
  })
})

describe("courierBadge", () => {
  it("affiche Livreur suivi du nom", () => {
    expect(courierBadge(c({}))).toBe("Livreur · Issa")
  })
})
