import orderPlacedCustomerWhatsappHandler from "../order-placed-customer-whatsapp"
import { formatAmount } from "../../modules/resend/templates"

describe("orderPlacedCustomerWhatsappHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const fetchMock = jest.fn()

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = fetchMock as any
  })

  afterEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it("sends a WhatsApp confirmation with product, total and payment method", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET = "s3cret"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 15000,
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Serpillière auto-essorante à éponge" }],
          payment_collections: [
            { payments: [{ provider_id: "pp_cash-on-delivery_cash-on-delivery" }] },
          ],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.com/webhook/order-confirmation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-webhook-secret": "s3cret" }),
        body: JSON.stringify({
          phone: "+22670000000",
          first_name: "Aminata",
          product_summary: "Serpillière auto-essorante à éponge",
          total: formatAmount(15000, "xof"),
          display_id: "42",
          payment_method: "Paiement à la réception",
        }),
      })
    )
  })

  it("retries when the computed total is still 0 right after order.placed", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    const staleOrder = {
      id: "order_123",
      display_id: 42,
      currency_code: "xof",
      total: 0,
      shipping_address: { first_name: "Aminata", phone: "+22670000000" },
      items: [{ product_title: "Serpillière auto-essorante à éponge" }],
      payment_collections: [],
    }
    graph
      .mockResolvedValueOnce({ data: [staleOrder] })
      .mockResolvedValueOnce({ data: [{ ...staleOrder, total: 15000 }] })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(graph).toHaveBeenCalledTimes(2)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.total).toBe(formatAmount(15000, "xof"))
  })

  it("summarizes as N articles when the order has more than one item", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 15000,
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Produit A" }, { product_title: "Produit B" }],
          payment_collections: [],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.product_summary).toBe("2 articles")
    expect(body.payment_method).toBe("Carte bancaire")
  })

  it("skips sending when the webhook URL is not configured", async () => {
    delete process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(graph).not.toHaveBeenCalled()
  })

  it("skips sending when the order has no phone", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 15000,
          shipping_address: { first_name: "Aminata", phone: null },
          items: [],
          payment_collections: [],
        },
      ],
    })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the webhook call fails", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 15000,
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [],
          payment_collections: [],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: false, status: 502 })

    await expect(
      orderPlacedCustomerWhatsappHandler({
        event: { data: { id: "order_123" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("order_123"),
      expect.any(Error)
    )
  })
})
