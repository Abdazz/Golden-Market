import {
  canAssign,
  computeAmountToCollect,
  computeSettlement,
  dayOf,
  defaultTypeForCity,
  todayInOuaga,
  validateCompletion,
  type DeliveryLike,
} from "../delivery-rules"

const d = (over: Partial<DeliveryLike>): DeliveryLike => ({
  status: "delivered",
  type: "express",
  tour_date: "2026-09-28",
  completed_at: "2026-09-28T15:00:00Z",
  amount_to_collect: 6500,
  amount_collected: 6500,
  courier_fee: 1000,
  transport_fee: null,
  ...over,
})

describe("todayInOuaga / dayOf", () => {
  it("renvoie la date AAAA-MM-JJ à l'heure de Ouagadougou", () => {
    expect(todayInOuaga(new Date("2026-09-28T23:59:00Z"))).toBe("2026-09-28")
    expect(dayOf("2026-09-29T00:01:00Z")).toBe("2026-09-29")
  })
})

describe("defaultTypeForCity", () => {
  it.each([["Ouagadougou", "express"], ["ouaga", "express"], [" OUAGADOUGOU ", "express"], ["Koudougou", "expedition"], [null, "express"]])(
    "%s -> %s", (city, expected) => expect(defaultTypeForCity(city as any)).toBe(expected)
  )
})

describe("computeAmountToCollect", () => {
  it("encaisse le reste dû d'une livraison express non payée", () => {
    expect(computeAmountToCollect({ type: "express", paymentStatus: "not_paid", outstanding: 9500 })).toBe(9500)
  })
  it("n'encaisse rien si la commande est déjà payée", () => {
    expect(computeAmountToCollect({ type: "express", paymentStatus: "captured", outstanding: 0 })).toBe(0)
  })
  it("n'encaisse jamais rien pour une expédition", () => {
    expect(computeAmountToCollect({ type: "expedition", paymentStatus: "not_paid", outstanding: 9500 })).toBe(0)
  })
})

describe("canAssign", () => {
  it("refuse une deuxième livraison tant qu'une tentative est en cours", () => {
    expect(canAssign([{ status: "assigned" }])).toBe(false)
  })
  it("autorise après un échec, une livraison terminée ou annulée", () => {
    expect(canAssign([{ status: "failed" }, { status: "canceled" }])).toBe(true)
    expect(canAssign([])).toBe(true)
  })
})

describe("computeSettlement", () => {
  it("encaissé - frais livreur - frais compagnie, sur les livraisons terminées ce jour-là", () => {
    const result = computeSettlement(
      [
        d({}),
        d({ amount_to_collect: 9500, amount_collected: 9500, courier_fee: 1500 }),
        d({ type: "expedition", status: "shipped", amount_to_collect: 0, amount_collected: null, courier_fee: 1000, transport_fee: 1500 }),
      ],
      "2026-09-28"
    )
    expect(result).toEqual({ collected: 16000, courierFees: 3500, transportFees: 1500, toRemit: 11000, completedCount: 3 })
  })

  it("peut être négatif (journée d'expéditions : le propriétaire doit au livreur)", () => {
    const result = computeSettlement(
      [d({ type: "expedition", status: "shipped", amount_collected: null, amount_to_collect: 0, courier_fee: 1000, transport_fee: 1000 })],
      "2026-09-28"
    )
    expect(result.toRemit).toBe(-2000)
  })

  it("compte les frais d'un échec mais aucun encaissement", () => {
    const result = computeSettlement([d({ status: "failed", amount_collected: null, courier_fee: 1000 })], "2026-09-28")
    expect(result).toMatchObject({ collected: 0, courierFees: 1000, toRemit: -1000 })
  })

  it("exclut les livraisons reportées (non terminées), annulées ou terminées un autre jour", () => {
    const result = computeSettlement(
      [
        d({ status: "assigned", completed_at: null }),
        d({ status: "canceled", completed_at: null }),
        d({ completed_at: "2026-09-27T12:00:00Z" }),
      ],
      "2026-09-28"
    )
    expect(result).toEqual({ collected: 0, courierFees: 0, transportFees: 0, toRemit: 0, completedCount: 0 })
  })
})

describe("validateCompletion", () => {
  it("livrée : montant encaissé obligatoire, entier positif ou nul", () => {
    expect(validateCompletion({ status: "delivered", type: "express", amount_collected: 6500, courier_fee: 1000 })).toEqual({
      ok: true,
      values: { amount_collected: 6500, courier_fee: 1000, transport_fee: null, failure_reason: null },
    })
    expect(validateCompletion({ status: "delivered", type: "express", amount_collected: -5 }).ok).toBe(false)
    expect(validateCompletion({ status: "delivered", type: "express", amount_collected: "" }).ok).toBe(false)
  })
  it("échec : motif obligatoire", () => {
    expect(validateCompletion({ status: "failed", type: "express", failure_reason: " " }).ok).toBe(false)
    expect(validateCompletion({ status: "failed", type: "express", failure_reason: "Client absent", courier_fee: 1000 })).toMatchObject({ ok: true })
  })
  it("déposée : réservé aux expéditions", () => {
    expect(validateCompletion({ status: "shipped", type: "express" }).ok).toBe(false)
    expect(validateCompletion({ status: "shipped", type: "expedition", courier_fee: 1000, transport_fee: 1500 })).toMatchObject({ ok: true })
  })
})
