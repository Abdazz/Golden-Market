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
