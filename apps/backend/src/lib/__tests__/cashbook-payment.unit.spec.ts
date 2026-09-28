import { recordPaymentEntries } from "../cashbook-payment"

describe("recordPaymentEntries", () => {
  const payment = {
    id: "pay_1",
    captures: [{ id: "capt_1", amount: 9500, created_at: "2026-09-28T10:00:00Z" }],
    refunds: [{ id: "ref_1", amount: 2000, created_at: "2026-09-28T11:00:00Z" }],
    payment_collection: { order: { id: "order_1", custom_display_id: "20260928001", display_id: 3 } },
  }
  const setup = (data: unknown[]) => {
    const graph = jest.fn().mockResolvedValue({ data })
    const logger = { error: jest.fn(), info: jest.fn() }
    const container = { resolve: (key: string) => (key === "query" ? { graph } : logger) }
    const record = jest.fn().mockResolvedValue(undefined)
    return { container, record, logger }
  }

  it("capture : inscrit la vente avec le numéro de commande", async () => {
    const { container, record } = setup([payment])
    await recordPaymentEntries(container as any, "pay_1", "captured", record)
    expect(record).toHaveBeenCalledWith([
      expect.objectContaining({ category: "sale", amount: 9500, reference: "capture:capt_1", label: "Vente commande 20260928001", order_id: "order_1" }),
    ])
  })

  it("remboursement : inscrit la sortie", async () => {
    const { container, record } = setup([payment])
    await recordPaymentEntries(container as any, "pay_1", "refunded", record)
    expect(record).toHaveBeenCalledWith([expect.objectContaining({ category: "refund", amount: 2000, reference: "refund:ref_1" })])
  })

  it("ne lève jamais : erreur journalisée", async () => {
    const { container, record, logger } = setup([payment])
    record.mockRejectedValue(new Error("base indisponible"))
    await expect(recordPaymentEntries(container as any, "pay_1", "captured", record)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })

  it("paiement introuvable : rien n'est inscrit", async () => {
    const { container, record } = setup([])
    await recordPaymentEntries(container as any, "pay_x", "captured", record)
    expect(record).not.toHaveBeenCalled()
  })
})
