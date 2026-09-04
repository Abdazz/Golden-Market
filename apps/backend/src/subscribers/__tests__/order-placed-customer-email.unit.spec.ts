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

  const originalEnv = { ...process.env }

  afterEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  it("sends an order confirmation email when the order has an email", async () => {
    process.env.ORANGE_MONEY_NUMBER = "07 00 00 00 00"
    process.env.ORANGE_MONEY_NAME = "Golden Market"

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
      data: {
        display_id: 42,
        total: 15000,
        currency_code: "xof",
        orange_money_number: "07 00 00 00 00",
        orange_money_account_name: "Golden Market",
      },
    })
  })

  it("requests the summary relation so the computed total resolves (sinon 0 FCFA)", async () => {
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

    expect(retrieveOrder).toHaveBeenCalledWith(
      "order_123",
      expect.objectContaining({ relations: expect.arrayContaining(["summary"]) })
    )
  })

  it("retries when the computed total is still 0 right after order.placed", async () => {
    retrieveOrder
      .mockResolvedValueOnce({
        id: "order_123",
        display_id: 42,
        email: "client@example.com",
        currency_code: "xof",
        total: 0,
      })
      .mockResolvedValueOnce({
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

    expect(retrieveOrder).toHaveBeenCalledTimes(2)
    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 15000 }) })
    )
  })

  it("skips sending when the order has no email", async () => {
    retrieveOrder.mockResolvedValue({ id: "order_123", email: null })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).not.toHaveBeenCalled()
  })

  it("logs and does not throw when retrieveOrder fails", async () => {
    retrieveOrder.mockRejectedValue(new Error("db down"))

    await expect(
      orderPlacedCustomerEmailHandler({
        event: { data: { id: "order_123" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(createNotifications).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("order_123"),
      expect.any(Error)
    )
  })
})
