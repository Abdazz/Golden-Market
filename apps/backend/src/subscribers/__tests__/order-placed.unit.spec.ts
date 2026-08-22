import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import orderPlacedHandler from "../order-placed"

describe("orderPlacedHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const order = {
    id: "order_123",
    display_id: 42,
    email: "client@golden-market.co",
    currency_code: "xof",
    total: 975000,
    items: [{ title: "Produit test", detail: { quantity: 2 } }],
  }
  const query = { graph: jest.fn(async () => ({ data: [order] })) }
  const container = {
    resolve: jest.fn((key: string) =>
      key === ContainerRegistrationKeys.QUERY ? query : logger
    ),
  }
  const originalWebhookUrl = process.env.N8N_ORDER_WEBHOOK_URL

  afterEach(() => {
    jest.restoreAllMocks()
    process.env.N8N_ORDER_WEBHOOK_URL = originalWebhookUrl
  })

  it("posts the order details to the n8n webhook when configured", async () => {
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
          display_id: 42,
          provider: "orange-money-manual",
          email: "client@golden-market.co",
          currency_code: "xof",
          total: 975000,
          items: [{ title: "Produit test", quantity: 2 }],
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
