import {
  collectedTotals,
  countInProgress,
  orderedTotals,
  settleBlocks,
  unremittedByCourier,
  type CourierDelivery,
} from "../dashboard-rules"
import type { EntryLike } from "../cashbook-rules"

const d = (over: Partial<CourierDelivery>): CourierDelivery => ({
  courier_id: "c1",
  status: "delivered",
  type: "express",
  tour_date: "2026-10-03",
  completed_at: "2026-10-03T15:00:00Z",
  amount_to_collect: 6500,
  amount_collected: 6500,
  courier_fee: 1000,
  transport_fee: null,
  ...over,
})

describe("unremittedByCourier", () => {
  it("additionne par livreur les journées terminées sans versement validé", () => {
    const result = unremittedByCourier(
      [
        d({}),
        d({ completed_at: "2026-10-04T09:00:00Z", amount_collected: 9000, courier_fee: 1500 }),
        d({ courier_id: "c2", amount_collected: 3000, courier_fee: 500 }),
      ],
      []
    )
    expect(result).toEqual([
      { courier_id: "c1", amount: 5500 + 7500, days: 2 },
      { courier_id: "c2", amount: 2500, days: 1 },
    ])
  })

  it("exclut les journées déjà validées, même si une livraison s'y ajoute", () => {
    const result = unremittedByCourier(
      [d({}), d({ completed_at: "2026-10-03T18:00:00Z" }), d({ completed_at: "2026-10-04T09:00:00Z" })],
      [{ courier_id: "c1", day: "2026-10-03" }]
    )
    expect(result).toEqual([{ courier_id: "c1", amount: 5500, days: 1 }])
  })

  it("ignore les livraisons non terminées et garde un montant négatif (frais > encaissé)", () => {
    const result = unremittedByCourier(
      [
        d({ status: "assigned", completed_at: null }),
        d({ status: "failed", amount_collected: null, courier_fee: 1000 }),
      ],
      []
    )
    expect(result).toEqual([{ courier_id: "c1", amount: -1000, days: 1 }])
  })

  it("ne compte pas une journée dont le montant est nul", () => {
    expect(unremittedByCourier([d({ amount_collected: 0, courier_fee: 0 })], [])).toEqual([])
  })
})

describe("countInProgress", () => {
  it("compte les livraisons en cours et celles dont la date de tournée initiale est passée", () => {
    const result = countInProgress(
      [
        { status: "assigned", tour_date: "2026-10-04", first_tour_date: "2026-10-04" },
        { status: "assigned", tour_date: "2026-10-02", first_tour_date: "2026-10-02" },
        { status: "delivered", tour_date: "2026-10-01", first_tour_date: "2026-10-01" },
      ],
      "2026-10-04"
    )
    expect(result).toEqual({ count: 2, late: 1 })
  })

  it("une livraison reportée à aujourd'hui par le job nocturne reste en retard", () => {
    const result = countInProgress(
      [{ status: "assigned", tour_date: "2026-10-04", first_tour_date: "2026-10-02" }],
      "2026-10-04"
    )
    expect(result).toEqual({ count: 1, late: 1 })
  })
})

describe("orderedTotals", () => {
  it("répartit les commandes entre le jour et le mois, aux bornes UTC, hors annulées", () => {
    const result = orderedTotals(
      [
        { created_at: "2026-09-30T23:59:00Z", total: 5000, status: "pending" },
        { created_at: "2026-10-01T00:01:00Z", total: 7000, status: "pending" },
        { created_at: "2026-10-04T08:00:00Z", total: "9500", status: "completed" },
        { created_at: "2026-10-04T09:00:00Z", total: 3000, status: "canceled" },
      ],
      "2026-10-04",
      "2026-10"
    )
    expect(result).toEqual({ today: { count: 1, amount: 9500 }, month: { count: 2, amount: 16500 } })
  })
})

describe("collectedTotals", () => {
  const e = (over: Partial<EntryLike>): EntryLike => ({ id: "x", date: "2026-10-04T10:00:00Z", direction: "in", amount: 1000, category: "sale", ...over })

  it("ventes moins remboursements, jour et mois ; les autres écritures ne comptent pas", () => {
    const result = collectedTotals(
      [
        e({ amount: 10000 }),
        e({ direction: "out", category: "refund", amount: 12000 }),
        e({ date: "2026-10-02T10:00:00Z", amount: 8000 }),
        e({ date: "2026-09-30T10:00:00Z", amount: 50000 }),
        e({ direction: "out", category: "purchase", amount: 20000 }),
      ],
      "2026-10-04",
      "2026-10"
    )
    expect(result).toEqual({ today: -2000, month: 6000 })
  })
})

describe("settleBlocks", () => {
  it("marque disponible chaque bloc réussi et indisponible celui qui échoue, sans bloquer les autres", async () => {
    const log = jest.fn()
    const result = await settleBlocks(
      {
        ok: async () => ({ count: 3 }),
        chat: async () => {
          throw new Error("base du chat indisponible")
        },
      },
      log
    )
    expect(result).toEqual({ ok: { available: true, count: 3 }, chat: { available: false } })
    expect(log).toHaveBeenCalledWith("chat", expect.any(Error))
  })
})
