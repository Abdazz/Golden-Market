import { Modules } from "@medusajs/framework/utils"
import orderPlacedCustomerEmailHandler from "../order-placed-customer-email"

describe("orderPlacedCustomerEmailHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const retrieveOrder = jest.fn()
  const createNotifications = jest.fn()

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === Modules.ORDER) return { retrieveOrder }
      if (key === Modules.NOTIFICATION) return { createNotifications }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("sends an order confirmation email when the order has an email", async () => {
    retrieveOrder.mockResolvedValue({
      id: "order_123",
      display_id: 42,
      email: "client@example.com",
      currency_code: "xof",
      total: 15000,
    })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).toHaveBeenCalledWith({
      to: "client@example.com",
      channel: "email",
      template: "order-placed",
      data: { display_id: 42, total: 15000, currency_code: "xof" },
    })
  })

  it("skips sending when the order has no email", async () => {
    retrieveOrder.mockResolvedValue({ id: "order_123", email: null })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).not.toHaveBeenCalled()
  })
})
