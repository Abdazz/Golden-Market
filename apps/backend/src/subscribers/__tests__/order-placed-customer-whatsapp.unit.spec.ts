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

  it("commande issue d'un brouillon (téléphone), sans paiement enregistré : montant du paiement en attente et moyen de paiement à convenir", async () => {
    // Constaté le 2026-09-27 sur une commande test créée depuis l'admin
    // (Orders > Drafts) : "Montant : 0 F CFA" et "Paiement : Carte bancaire".
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_14",
          display_id: 14,
          currency_code: "xof",
          total: 0,
          shipping_address: { first_name: "Test", phone: "+22677406101" },
          items: [{ product_title: "Balai-éponge à essorage automatique" }],
          payment_collections: [{ amount: 8500, payments: [] }],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_14" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.params).toEqual([
      "Test",
      "Balai-éponge à essorage automatique",
      formatAmount(8500, "xof"),
      "14",
      "À convenir avec notre équipe",
    ])
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.arrayContaining(["payment_collections.amount"]) })
    )
  })

  it("commande convertie d'un brouillon sans aucune collecte de paiement : montant calculé depuis les articles et la livraison", async () => {
    // Constaté le 2026-09-27 (commande test 15 sur staging) : "Montant : 0 F CFA",
    // la conversion d'un brouillon ne crée pas de collecte de paiement et
    // order.total vaut encore 0 au moment de order.placed.
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_16",
          display_id: 16,
          currency_code: "xof",
          total: 0,
          metadata: { source: "telephone", payment_method: "cash-on-delivery" },
          shipping_address: { first_name: "Test", phone: "+22677406101" },
          items: [
            { product_title: "Balai-éponge à essorage automatique", unit_price: 6500, quantity: 1 },
            { product_title: "Seau à roulettes", unit_price: 2500, quantity: 2 },
          ],
          shipping_methods: [{ amount: 500 }],
          payment_collections: [],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_16" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.params[2]).toBe(formatAmount(12000, "xof"))
  })

  it("affiche le numéro de commande Golden Market (custom_display_id) plutôt que le numéro natif", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"
    graph.mockResolvedValue({
      data: [
        {
          id: "order_20",
          display_id: 20,
          custom_display_id: "20260927004",
          currency_code: "xof",
          total: 6500,
          shipping_address: { first_name: "Awa", phone: "+22670000000" },
          items: [{ product_title: "Balai-éponge à essorage automatique" }],
          payment_collections: [{ amount: 6500, payments: [] }],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_20" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.params[3]).toBe("20260927004")
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ fields: expect.arrayContaining(["custom_display_id"]) }))
  })

  it("commande par téléphone : affiche le moyen de paiement convenu (metadata.payment_method)", async () => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

    graph.mockResolvedValue({
      data: [
        {
          id: "order_15",
          display_id: 15,
          currency_code: "xof",
          total: 0,
          metadata: { source: "telephone", payment_method: "orange-money" },
          shipping_address: { first_name: "Awa", phone: "+22670000000" },
          items: [{ product_title: "Balai-éponge à essorage automatique" }],
          payment_collections: [{ amount: 9500, payments: [] }],
        },
      ],
    })
    fetchMock.mockResolvedValue({ ok: true })

    await orderPlacedCustomerWhatsappHandler({
      event: { data: { id: "order_15" } } as any,
      container: container as any,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template_name).toBe("order_confirmation_from_website")
    expect(body.params).toEqual([
      "Awa",
      "Balai-éponge à essorage automatique",
      formatAmount(9500, "xof"),
      "15",
      "Orange Money",
    ])
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
    expect(body.params[4]).toBe("À convenir avec notre équipe")
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
    expect(body.params[4]).toBe("À convenir avec notre équipe")
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
      "À convenir avec notre équipe",
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
