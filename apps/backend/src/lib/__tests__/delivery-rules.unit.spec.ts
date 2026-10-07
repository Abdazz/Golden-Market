import {
  amountForAssignment,
  amountsByType,
  canAssign,
  computeAmountToCollect,
  computeSettlement,
  dayOf,
  deliveriesToCancel,
  parseCourierInput,
  postponeUpdates,
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

describe("amountsByType", () => {
  it("montant proposé par type : reste dû en express, rien en expédition", () => {
    expect(amountsByType({ paid: false, outstanding: 9500 })).toEqual({ express: 9500, expedition: 0 })
  })
  it("commande payée : rien à encaisser", () => {
    expect(amountsByType({ paid: true, outstanding: 0 })).toEqual({ express: 0, expedition: 0 })
  })
})

describe("amountForAssignment", () => {
  it("montant saisi à l'affectation : il remplace le montant calculé", () => {
    expect(amountForAssignment(9500, 7000)).toBe(7000)
    expect(amountForAssignment(9500, 0)).toBe(0)
  })
  it("aucun montant saisi : montant calculé", () => {
    expect(amountForAssignment(9500, undefined)).toBe(9500)
    expect(amountForAssignment(9500, null)).toBe(9500)
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

describe("parseCourierInput", () => {
  it("normalise le numéro et exige un nom", () => {
    expect(parseCourierInput({ name: " Zakaria ", phone: "70 00 00 00" })).toEqual({
      ok: true,
      values: { name: "Zakaria", phone: "+22670000000", notes: null },
    })
    expect(parseCourierInput({ name: "", phone: "70000000" }).ok).toBe(false)
    expect(parseCourierInput({ name: "Zakaria", phone: "12" }).ok).toBe(false)
  })
})

describe("postponeUpdates", () => {
  it("reporte à aujourd'hui les livraisons encore confiées d'un jour passé", () => {
    expect(
      postponeUpdates(
        [
          { id: "a", status: "assigned", tour_date: "2026-09-27", postponed_count: 0 },
          { id: "b", status: "assigned", tour_date: "2026-09-28", postponed_count: 0 },
          { id: "c", status: "delivered", tour_date: "2026-09-27", postponed_count: 0 },
          { id: "d", status: "assigned", tour_date: "2026-09-25", postponed_count: 2 },
        ],
        "2026-09-28"
      )
    ).toEqual([
      { id: "a", tour_date: "2026-09-28", postponed_count: 1 },
      { id: "d", tour_date: "2026-09-28", postponed_count: 3 },
    ])
  })
})

describe("deliveriesToCancel", () => {
  it("annule seulement les livraisons confiées non terminées", () => {
    expect(
      deliveriesToCancel([
        { id: "d1", status: "assigned" },
        { id: "d2", status: "delivered" },
        { id: "d3", status: "failed" },
        { id: "d4", status: "canceled" },
      ])
    ).toEqual([{ id: "d1", status: "canceled" }])
  })
  it("aucune livraison : rien", () => {
    expect(deliveriesToCancel([])).toEqual([])
  })
})
