const mockRun = jest.fn().mockResolvedValue({ result: { id: "ful_1", shipped_at: null, delivered_at: null } })
jest.mock("@medusajs/medusa/core-flows", () => ({
  markPaymentCollectionAsPaid: jest.fn(() => ({ run: mockRun })),
  capturePaymentWorkflow: jest.fn(() => ({ run: mockRun })),
  createOrderFulfillmentWorkflow: jest.fn(() => ({ run: mockRun })),
  createOrderShipmentWorkflow: jest.fn(() => ({ run: mockRun })),
  markOrderFulfillmentAsDeliveredWorkflow: jest.fn(() => ({ run: mockRun })),
}))

import { capturePaymentWorkflow, markPaymentCollectionAsPaid } from "@medusajs/medusa/core-flows"
import { syncOrderAfterDelivery } from "../delivery-order-sync"

const containerWith = (order: unknown) => {
  const graph = jest.fn().mockResolvedValue({ data: [order] })
  return { resolve: () => ({ graph }) }
}

describe("syncOrderAfterDelivery : encaissement", () => {
  beforeEach(() => jest.clearAllMocks())

  it("commande du site (paiement autorisé à la livraison) : le paiement est capturé", async () => {
    const container = containerWith({
      id: "order_1",
      items: [],
      fulfillments: [{ id: "ful_1", shipped_at: "x", delivered_at: "x" }],
      payment_collections: [{ id: "pc_1", status: "authorized", payments: [{ id: "pay_1", captured_at: null }] }],
    })
    await syncOrderAfterDelivery(container, { orderId: "order_1", status: "delivered", collected: 9500 })
    expect(capturePaymentWorkflow).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalledWith({ input: { payment_id: "pay_1" } })
    expect(markPaymentCollectionAsPaid).not.toHaveBeenCalled()
  })

  it("commande par téléphone (collecte non payée) : marquée payée", async () => {
    const container = containerWith({
      id: "order_2",
      items: [],
      fulfillments: [{ id: "ful_1", shipped_at: "x", delivered_at: "x" }],
      payment_collections: [{ id: "pc_2", status: "not_paid", payments: [] }],
    })
    await syncOrderAfterDelivery(container, { orderId: "order_2", status: "delivered", collected: 9500 })
    expect(markPaymentCollectionAsPaid).toHaveBeenCalled()
    expect(capturePaymentWorkflow).not.toHaveBeenCalled()
  })

  it("rien encaissé : aucun paiement touché", async () => {
    const container = containerWith({
      id: "order_3",
      items: [],
      fulfillments: [{ id: "ful_1", shipped_at: "x", delivered_at: "x" }],
      payment_collections: [{ id: "pc_3", status: "authorized", payments: [{ id: "pay_3", captured_at: null }] }],
    })
    await syncOrderAfterDelivery(container, { orderId: "order_3", status: "delivered", collected: 0 })
    expect(capturePaymentWorkflow).not.toHaveBeenCalled()
    expect(markPaymentCollectionAsPaid).not.toHaveBeenCalled()
  })
})

describe("syncOrderAfterDelivery : expédition annulée", () => {
  beforeEach(() => jest.clearAllMocks())

  it("une expédition annulée est ignorée : nouvelle expédition créée", async () => {
    const { createOrderFulfillmentWorkflow, createOrderShipmentWorkflow } = jest.requireMock("@medusajs/medusa/core-flows")
    const container = containerWith({
      id: "order_9",
      items: [{ id: "item_1", quantity: 1 }],
      fulfillments: [{ id: "ful_old", shipped_at: null, delivered_at: null, canceled_at: "2026-10-16T00:00:00Z" }],
      payment_collections: [],
    })
    const warning = await syncOrderAfterDelivery(container, { orderId: "order_9", status: "delivered", collected: 0 })
    expect(warning).toBeNull()
    expect(createOrderFulfillmentWorkflow).toHaveBeenCalled()
    expect(createOrderShipmentWorkflow).toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ fulfillment_id: "ful_old" }) }))
  })
})
