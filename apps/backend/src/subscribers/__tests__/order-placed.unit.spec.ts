import orderPlacedHandler from "../order-placed"

describe("orderPlacedHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const container = { resolve: jest.fn(() => logger) }
  const originalWebhookUrl = process.env.N8N_ORDER_WEBHOOK_URL

  afterEach(() => {
    jest.restoreAllMocks()
    process.env.N8N_ORDER_WEBHOOK_URL = originalWebhookUrl
  })

  it("posts the order id to the n8n webhook when configured", async () => {
    process.env.N8N_ORDER_WEBHOOK_URL = "https://n8n.example.com/webhook/order-placed"
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true } as Response)

    await orderPlacedHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.com/webhook/order-placed",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          order_id: "order_123",
          provider: "orange-money-manual",
        }),
      })
    )
  })

  it("skips the webhook call and logs when N8N_ORDER_WEBHOOK_URL is not set", async () => {
    delete process.env.N8N_ORDER_WEBHOOK_URL
    const fetchMock = jest.spyOn(global, "fetch")

    await orderPlacedHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("order_123"))
  })
})
