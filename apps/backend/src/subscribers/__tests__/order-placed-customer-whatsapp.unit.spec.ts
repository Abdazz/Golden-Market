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
          total: 0,
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Serpillière auto-essorante à éponge" }],
          payment_collections: [
            {
              payments: [
                { provider_id: "pp_cash-on-delivery_cash-on-delivery", amount: 15000 },
              ],
            },
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
          template_name: "order_confirmation_from_website",
          params: [
            "Aminata",
            "Serpillière auto-essorante à éponge",
            formatAmount(15000, "xof"),
            "42",
            "Paiement à la réception",
          ],
        }),
      })
    )
  })

  it("uses payment.amount rather than order.total, which can stay stale right after order.placed", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 0, // order.total resolved stale (confirmed in production, 2026-09-04)
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Serpillière auto-essorante à éponge" }],
          payment_collections: [
            { payments: [{ provider_id: "pp_cash-on-delivery_cash-on-delivery", amount: 8500 }] },
          ],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.params[2]).toBe(formatAmount(8500, "xof"))
  })

  it("falls back to order.total when no payment record is present", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 15000,
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Produit A" }],
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
    expect(body.params[2]).toBe(formatAmount(15000, "xof"))
    expect(body.params[4]).toBe("Carte bancaire")
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
    expect(body.params[1]).toBe("2 articles")
    expect(body.params[4]).toBe("Carte bancaire")
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

  it("uses the dedicated whatsapp template (no first name) for orders placed via WhatsApp itself", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 8500,
          metadata: { source: "whatsapp" },
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Produit A" }],
          payment_collections: [{ payments: [{ amount: 8500 }] }],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template_name).toBe("order_confirmation_from_whatsapp")
    expect(body.params).toEqual([
      "Produit A",
      formatAmount(8500, "xof"),
      "42",
      "Carte bancaire",
    ])
  })

  it("uses the website template (with first name) for orders not placed via WhatsApp", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_123",
          display_id: 42,
          currency_code: "xof",
          total: 8500,
          shipping_address: { first_name: "Aminata", phone: "+22670000000" },
          items: [{ product_title: "Produit A" }],
          payment_collections: [{ payments: [{ amount: 8500 }] }],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template_name).toBe("order_confirmation_from_website")
    expect(body.params[0]).toBe("Aminata")
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
