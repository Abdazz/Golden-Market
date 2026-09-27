import { formatOrderDay, formatOrderNumber, nextOrderNumber, orderNumberOf } from "../order-number"

describe("formatOrderDay", () => {
  it("formate la date au format AAAAMMJJ à l'heure de Ouagadougou", () => {
    expect(formatOrderDay(new Date("2026-09-27T23:59:59Z"))).toBe("20260927")
    expect(formatOrderDay(new Date("2026-09-28T00:00:01Z"))).toBe("20260928")
  })
})

describe("formatOrderNumber", () => {
  it("ajoute le compteur du jour sur 3 chiffres", () => {
    expect(formatOrderNumber("20260927", 1)).toBe("20260927001")
    expect(formatOrderNumber("20260927", 42)).toBe("20260927042")
  })

  it("ne tronque pas au-delà de 999 commandes dans la journée", () => {
    expect(formatOrderNumber("20260927", 1000)).toBe("202609271000")
  })
})

describe("nextOrderNumber", () => {
  it("incrémente atomiquement le compteur du jour (upsert) et renvoie le numéro", async () => {
    const execute = jest.fn().mockResolvedValue([{ last_value: 3 }])

    const number = await nextOrderNumber({ execute }, new Date("2026-09-27T10:00:00Z"))

    expect(number).toBe("20260927003")
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain("ON CONFLICT (day) DO UPDATE")
    expect(sql).toContain("RETURNING last_value")
    expect(params).toEqual(["20260927"])
  })
})

describe("orderNumberOf", () => {
  it("renvoie le numéro personnalisé s'il existe, sinon le numéro natif", () => {
    expect(orderNumberOf({ custom_display_id: "20260927001", display_id: 14 })).toBe("20260927001")
    expect(orderNumberOf({ custom_display_id: null, display_id: 14 })).toBe("14")
  })
})
