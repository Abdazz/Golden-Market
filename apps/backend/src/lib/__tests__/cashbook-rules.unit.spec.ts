import {
  feeEntriesFromDelivery,
  monthlyHistory,
  monthOf,
  parseManualEntry,
  refundEntriesFromPayment,
  saleEntriesFromPayment,
  summarizeMonth,
  withRunningBalance,
  type EntryLike,
} from "../cashbook-rules"

const e = (over: Partial<EntryLike>): EntryLike => ({
  id: "x",
  date: "2026-09-10T10:00:00Z",
  direction: "in",
  amount: 1000,
  category: "sale",
  ...over,
})

describe("parseManualEntry", () => {
  it("accepte une dépense valide et met la date du jour par défaut", () => {
    const result = parseManualEntry({ direction: "out", category: "purchase", amount: 25000, label: " Achat balais " }, new Date("2026-09-28T08:00:00Z"))
    expect(result).toEqual({
      ok: true,
      values: { direction: "out", category: "purchase", amount: 25000, label: "Achat balais", note: null, date: new Date("2026-09-28T08:00:00Z") },
    })
  })

  it("refuse un montant nul, négatif ou décimal, un libellé vide, une catégorie incohérente", () => {
    expect(parseManualEntry({ direction: "out", category: "purchase", amount: 0, label: "x" }).ok).toBe(false)
    expect(parseManualEntry({ direction: "out", category: "purchase", amount: -5, label: "x" }).ok).toBe(false)
    expect(parseManualEntry({ direction: "out", category: "purchase", amount: 10.5, label: "x" }).ok).toBe(false)
    expect(parseManualEntry({ direction: "out", category: "purchase", amount: 100, label: " " }).ok).toBe(false)
    expect(parseManualEntry({ direction: "in", category: "purchase", amount: 100, label: "x" }).ok).toBe(false)
    expect(parseManualEntry({ direction: "out", category: "sale", amount: 100, label: "x" }).ok).toBe(false)
  })

  it("accepte le solde initial en entrée et une date fournie", () => {
    expect(parseManualEntry({ direction: "in", category: "opening_balance", amount: 300, label: "Solde initial", date: "2026-09-01" })).toMatchObject({
      ok: true,
      values: { date: new Date("2026-09-01T00:00:00.000Z") },
    })
  })
})

describe("monthOf / summarizeMonth / withRunningBalance", () => {
  const entries = [
    e({ id: "a", date: "2026-08-20T10:00:00Z", direction: "in", amount: 300, category: "opening_balance" }),
    e({ id: "b", date: "2026-09-02T10:00:00Z", direction: "in", amount: 9500, category: "sale" }),
    e({ id: "c", date: "2026-09-02T11:00:00Z", direction: "out", amount: 1000, category: "courier_fee" }),
    e({ id: "d", date: "2026-09-05T11:00:00Z", direction: "out", amount: 500, category: "refund" }),
    e({ id: "f", date: "2026-10-01T00:00:00Z", direction: "out", amount: 2000, category: "purchase" }),
  ]

  it("donne le mois AAAA-MM", () => {
    expect(monthOf("2026-09-30T23:59:59Z")).toBe("2026-09")
  })

  it("résume un mois : entrées, sorties, chiffre d'affaires, solde avant et après", () => {
    expect(summarizeMonth(entries, "2026-09")).toEqual({
      income: 9500,
      expenses: 1500,
      revenue: 9000,
      balanceBefore: 300,
      balanceAfter: 8300,
    })
  })

  it("mois sans écriture : totaux à 0, solde reporté", () => {
    expect(summarizeMonth(entries, "2026-11")).toEqual({ income: 0, expenses: 0, revenue: 0, balanceBefore: 6300, balanceAfter: 6300 })
  })

  it("calcule le solde après chaque écriture, dans l'ordre chronologique", () => {
    const september = entries.filter((x) => monthOf(x.date) === "2026-09")
    expect(withRunningBalance([...september].reverse(), 300).map((x) => [x.id, x.balance_after])).toEqual([
      ["b", 9800],
      ["c", 8800],
      ["d", 8300],
    ])
  })

  it("historique des 12 derniers mois : ventes, dépenses, résultat", () => {
    const history = monthlyHistory(entries, new Date("2026-10-15T00:00:00Z"), 3)
    expect(history).toEqual([
      { month: "2026-10", sales: 0, expenses: 2000, result: -2000 },
      { month: "2026-09", sales: 9000, expenses: 1000, result: 8000 },
      { month: "2026-08", sales: 0, expenses: 0, result: 0 },
    ])
  })
})

describe("écritures automatiques", () => {
  it("une entrée par capture de paiement (captures partielles)", () => {
    const payment = {
      id: "pay_1",
      captures: [
        { id: "capt_1", amount: 5000, created_at: "2026-09-02T10:00:00Z" },
        { id: "capt_2", amount: 4500, created_at: "2026-09-03T10:00:00Z" },
      ],
    }
    expect(saleEntriesFromPayment(payment, { orderId: "order_1", orderNumber: "20260902001" })).toEqual([
      { date: new Date("2026-09-02T10:00:00Z"), direction: "in", amount: 5000, category: "sale", label: "Vente commande 20260902001", source: "auto", reference: "capture:capt_1", order_id: "order_1" },
      { date: new Date("2026-09-03T10:00:00Z"), direction: "in", amount: 4500, category: "sale", label: "Vente commande 20260902001", source: "auto", reference: "capture:capt_2", order_id: "order_1" },
    ])
  })

  it("une sortie par remboursement", () => {
    const payment = { id: "pay_1", refunds: [{ id: "ref_1", amount: 2500, created_at: "2026-09-04T10:00:00Z" }] }
    expect(refundEntriesFromPayment(payment, { orderId: "order_1", orderNumber: "20260902001" })).toEqual([
      { date: new Date("2026-09-04T10:00:00Z"), direction: "out", amount: 2500, category: "refund", label: "Remboursement commande 20260902001", source: "auto", reference: "refund:ref_1", order_id: "order_1" },
    ])
  })

  it("frais d'une livraison : livreur seul, livreur + compagnie, aucun", () => {
    const base = { id: "deliv_1", order_id: "order_1", completed_at: "2026-09-02T12:00:00Z", transport_company: "STAF" }
    expect(feeEntriesFromDelivery({ ...base, courier_fee: 1000, transport_fee: null }, "Gildas", "20260902001")).toEqual([
      { date: new Date("2026-09-02T12:00:00Z"), direction: "out", amount: 1000, category: "courier_fee", label: "Frais livreur Gildas - commande 20260902001", source: "auto", reference: "delivery:deliv_1:courier_fee", order_id: "order_1" },
    ])
    expect(feeEntriesFromDelivery({ ...base, courier_fee: 1000, transport_fee: 1500 }, "Gildas", "20260902001").map((x) => x.reference)).toEqual([
      "delivery:deliv_1:courier_fee",
      "delivery:deliv_1:transport_fee",
    ])
    expect(feeEntriesFromDelivery({ ...base, courier_fee: 1000, transport_fee: 1500 }, "Gildas", "20260902001")[1].label).toBe("Frais STAF - commande 20260902001")
    expect(feeEntriesFromDelivery({ ...base, courier_fee: null, transport_fee: 0 }, "Gildas", "20260902001")).toEqual([])
  })
})

describe("formulaire Marquer comme payée", () => {
  const { parsePaymentForm, finalPaymentEntries, expectedFees } = require("../cashbook-rules")

  it("valide le montant encaissé (entier positif) et les deux frais (entiers, 0 par défaut)", () => {
    expect(parsePaymentForm({ amount: 9500, courier_fee: 1000, transport_fee: 1500 })).toEqual({
      ok: true,
      amount: 9500,
      courier_fee: 1000,
      transport_fee: 1500,
    })
    expect(parsePaymentForm({ amount: "9500", courier_fee: "", transport_fee: undefined })).toEqual({
      ok: true,
      amount: 9500,
      courier_fee: 0,
      transport_fee: 0,
    })
    expect(parsePaymentForm({ amount: 0 }).ok).toBe(false)
    expect(parsePaymentForm({ amount: 9500, courier_fee: -1 }).ok).toBe(false)
    expect(parsePaymentForm({ amount: 9500, transport_fee: 10.5 }).ok).toBe(false)
  })

  it("écritures de la caisse : vente = montant encaissé, une sortie par frais", () => {
    const date = new Date("2026-10-11T10:00:00Z")
    const entries = finalPaymentEntries({ orderId: "o1", orderNumber: "20261011001", amount: 11000, courier_fee: 1000, transport_fee: 2000, date })
    expect(entries).toEqual([
      expect.objectContaining({ direction: "in", category: "sale", amount: 11000, reference: "order-final:o1:sale", order_id: "o1" }),
      expect.objectContaining({ direction: "out", category: "courier_fee", amount: 1000, reference: "order-final:o1:courier_fee", label: "Course du livreur - commande 20261011001" }),
      expect.objectContaining({ direction: "out", category: "transport_fee", amount: 2000, reference: "order-final:o1:transport_fee", label: "Frais Expédition - commande 20261011001" }),
    ])
  })

  it("frais à 0 : aucune sortie inscrite", () => {
    const entries = finalPaymentEntries({ orderId: "o1", orderNumber: null, amount: 9500, courier_fee: 0, transport_fee: 0, date: new Date() })
    expect(entries).toHaveLength(1)
  })

  it("pré-remplissage : frais de la livraison, sinon course à 1 000 F et, pour une expédition, frais d'expédition des produits", () => {
    expect(expectedFees({ type: "expedition", courierFee: 1500, transportFee: 2000, productShippingFee: 1500 })).toEqual({ courier_fee: 1500, transport_fee: 2000 })
    expect(expectedFees({ type: "expedition", courierFee: null, transportFee: null, productShippingFee: 1500 })).toEqual({ courier_fee: 1000, transport_fee: 1500 })
    expect(expectedFees({ type: "express", courierFee: null, transportFee: null, productShippingFee: 0 })).toEqual({ courier_fee: 1000, transport_fee: 0 })
    expect(expectedFees({ type: "express", courierFee: 0, transportFee: null, productShippingFee: 0 })).toEqual({ courier_fee: 0, transport_fee: 0 })
  })
})

describe("périodes de la caisse", () => {
  const { periodRange, shiftAnchor, summarizeRange } = require("../cashbook-rules")
  const iso = (r: { start: Date; end: Date }) => [r.start.toISOString().slice(0, 10), r.end.toISOString().slice(0, 10)]

  it("jour, semaine (lundi -> lundi suivant), mois, année", () => {
    expect(iso(periodRange("day", "2026-10-12"))).toEqual(["2026-10-12", "2026-10-13"])
    expect(iso(periodRange("week", "2026-10-12"))).toEqual(["2026-10-12", "2026-10-19"])
    expect(iso(periodRange("week", "2026-10-18"))).toEqual(["2026-10-12", "2026-10-19"])
    expect(iso(periodRange("month", "2026-10-12"))).toEqual(["2026-10-01", "2026-11-01"])
    expect(iso(periodRange("year", "2026-10-12"))).toEqual(["2026-01-01", "2027-01-01"])
  })

  it("période précédente / suivante", () => {
    expect(shiftAnchor("day", "2026-10-01", -1)).toBe("2026-09-30")
    expect(shiftAnchor("week", "2026-10-12", 1)).toBe("2026-10-19")
    expect(shiftAnchor("month", "2026-01-31", -1)).toBe("2025-12-01")
    expect(shiftAnchor("year", "2026-10-12", 1)).toBe("2027-01-01")
  })

  it("totaux de la période et solde avant / après", () => {
    const entries = [
      { id: "1", date: "2026-10-11T10:00:00Z", direction: "in", amount: 1000, category: "sale" },
      { id: "2", date: "2026-10-12T10:00:00Z", direction: "in", amount: 9500, category: "sale" },
      { id: "3", date: "2026-10-12T11:00:00Z", direction: "out", amount: 1000, category: "courier_fee" },
      { id: "4", date: "2026-10-13T00:00:00Z", direction: "in", amount: 500, category: "other_in" },
    ]
    expect(summarizeRange(entries, periodRange("day", "2026-10-12"))).toEqual({
      income: 9500,
      expenses: 1000,
      revenue: 9500,
      result: 8500,
      balanceBefore: 1000,
      balanceAfter: 9500,
    })
  })
})

describe("résultat de la période", () => {
  const { periodRange, summarizeRange } = require("../cashbook-rules")
  it("un remboursement baisse le CA mais n'est pas compté deux fois dans les sorties", () => {
    const entries = [
      { id: "1", date: "2026-10-12T10:00:00Z", direction: "in", amount: 10000, category: "sale" },
      { id: "2", date: "2026-10-12T11:00:00Z", direction: "out", amount: 2000, category: "refund" },
      { id: "3", date: "2026-10-12T12:00:00Z", direction: "out", amount: 1000, category: "courier_fee" },
    ]
    const s = summarizeRange(entries, periodRange("day", "2026-10-12"))
    expect(s.revenue).toBe(8000)
    expect(s.result).toBe(7000)
  })
})

describe("rowsByOrder", () => {
  const { rowsByOrder } = require("../cashbook-rules")
  it("une ligne par commande (entrée et sorties ensemble), une ligne par écriture sans commande", () => {
    const entries = [
      { id: "1", date: "2026-10-11T10:00:00Z", direction: "in", amount: 90000, category: "sale", label: "Vente commande 20260928004", order_id: "o4" },
      { id: "2", date: "2026-10-11T10:00:01Z", direction: "out", amount: 1000, category: "courier_fee", label: "Course du livreur - commande 20260928004", order_id: "o4" },
      { id: "3", date: "2026-10-11T11:00:00Z", direction: "out", amount: 5000, category: "purchase", label: "Achat cartons", order_id: null },
      { id: "4", date: "2026-10-11T12:00:00Z", direction: "in", amount: 9500, category: "sale", label: "Vente commande 20260928002", order_id: "o2" },
    ]
    const rows = rowsByOrder(entries, 1000)
    expect(rows.map((r: any) => [r.order_number, r.income, r.expense, r.balance_after])).toEqual([
      ["20260928004", 90000, 1000, 90000],
      [null, 0, 5000, 85000],
      ["20260928002", 9500, 0, 94500],
    ])
    expect(rows[0].entries.map((e: any) => e.id)).toEqual(["1", "2"])
  })
})

describe("periodHistory", () => {
  const { periodHistory } = require("../cashbook-rules")
  it("ventes, dépenses et résultat des dernières semaines, de la plus récente à la plus ancienne", () => {
    const entries = [
      { id: "1", date: "2026-10-12T10:00:00Z", direction: "in", amount: 9500, category: "sale" },
      { id: "2", date: "2026-10-12T10:00:00Z", direction: "out", amount: 1000, category: "courier_fee" },
      { id: "3", date: "2026-10-06T10:00:00Z", direction: "in", amount: 7000, category: "sale" },
    ]
    expect(periodHistory(entries, "week", "2026-10-14", 3)).toEqual([
      { start: "2026-10-12", sales: 9500, expenses: 1000, result: 8500 },
      { start: "2026-10-05", sales: 7000, expenses: 0, result: 7000 },
      { start: "2026-09-28", sales: 0, expenses: 0, result: 0 },
    ])
  })
})
