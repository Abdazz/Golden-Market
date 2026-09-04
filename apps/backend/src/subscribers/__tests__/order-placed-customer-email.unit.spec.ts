import orderPlacedCustomerEmailHandler from "../order-placed-customer-email"

describe("orderPlacedCustomerEmailHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const createNotifications = jest.fn()

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      if (key === "notification") return { createNotifications }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  afterEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  it("sends an order confirmation email using payment.amount", async () => {
    process.env.ORANGE_MONEY_NUMBER = "07 00 00 00 00"
    process.env.ORANGE_MONEY_NAME = "Golden Market"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          email: "client@example.com",
          currency_code: "xof",
          total: 0, // order.total peut rester stale juste après order.placed
          payment_collections: [{ payments: [{ amount: 15000 }] }],
        },
      ],
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

  it("falls back to order.total when no payment record is present", async () => {
    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          email: "client@example.com",
          currency_code: "xof",
          total: 15000,
          payment_collections: [],
        },
      ],
    })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 15000 }) })
    )
  })

  it("skips sending when the order has no email", async () => {
    graph.mockResolvedValue({ data: [{ id: "order_123", email: null }] })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the order lookup fails", async () => {
    graph.mockRejectedValue(new Error("db down"))

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
