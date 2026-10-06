import orderPlacedMetaConversionsApiHandler from "../order-placed-meta-conversions-api"
import * as metaConversionsClient from "../../lib/meta-conversions-client"

jest.mock("../../lib/meta-conversions-client")

describe("orderPlacedMetaConversionsApiHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it("sends the Purchase event when configured", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    graph.mockResolvedValue({
      data: [
        {
          id: "order_1",
          currency_code: "xof",
          total: 15000,
          shipping_address: { phone: "70123456" },
          items: [{ variant_id: "variant_1", quantity: 2 }],
        },
      ],
    })
    const send = jest
      .spyOn(metaConversionsClient, "sendConversionEvent")
      .mockResolvedValue(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_1" } } as any,
      container: container as any,
    })

    expect(send).toHaveBeenCalledTimes(1)
    const [sentEvent, config] = send.mock.calls[0]
    expect(sentEvent.event_id).toBe("order_1")
    expect(sentEvent.event_name).toBe("Purchase")
    expect(config).toEqual({ pixelId: "pixel_123", accessToken: "token_abc" })
  })

  it("demande les articles et la livraison en entier pour la valeur et les quantités", async () => {
    // Avec items.quantity demandé seul, query.graph ne renvoie pas la
    // quantité (constaté le 2026-09-27).
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    graph.mockResolvedValue({ data: [{ id: "order_2", currency_code: "xof", total: 0, items: [] }] })
    jest.spyOn(metaConversionsClient, "sendConversionEvent").mockResolvedValue(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_2" } } as any,
      container: container as any,
    })

    expect(graph.mock.calls[0][0].fields).toEqual(expect.arrayContaining(["metadata"]))
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.arrayContaining(["items.*", "shipping_methods.*"]) })
    )
  })

  it("skips silently when Meta env vars are not configured", async () => {
    delete process.env.META_PIXEL_ID
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN
    const send = jest.spyOn(metaConversionsClient, "sendConversionEvent")

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_1" } } as any,
      container: container as any,
    })

    expect(send).not.toHaveBeenCalled()
    expect(graph).not.toHaveBeenCalled()
  })

  it("skips when the order cannot be found", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    graph.mockResolvedValue({ data: [] })
    const send = jest.spyOn(metaConversionsClient, "sendConversionEvent")

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_missing" } } as any,
      container: container as any,
    })

    expect(send).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the send fails", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    graph.mockResolvedValue({
      data: [
        {
          id: "order_1",
          currency_code: "xof",
          total: 15000,
          shipping_address: { phone: "70123456" },
          items: [{ variant_id: "variant_1", quantity: 2 }],
        },
      ],
    })
    jest
      .spyOn(metaConversionsClient, "sendConversionEvent")
      .mockRejectedValue(new Error("boom"))

    await expect(
      orderPlacedMetaConversionsApiHandler({
        event: { name: "order.placed", data: { id: "order_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("order_1"),
      expect.any(Error)
    )
  })

  const whatsappOrder = {
    id: "order_wa",
    currency_code: "xof",
    total: 15000,
    metadata: { source: "whatsapp", ctwa_clid: "clid_1" },
    shipping_address: { phone: "70123456" },
    items: [{ variant_id: "variant_1", quantity: 1 }],
  }

  it("envoie en business_messaging avec le jeton WhatsApp", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID = "waba_1"
    process.env.META_WHATSAPP_EVENTS_ACCESS_TOKEN = "wa_token"
    graph.mockResolvedValue({ data: [whatsappOrder] })
    const send = jest.spyOn(metaConversionsClient, "sendConversionEvent").mockResolvedValue(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_wa" } } as any,
      container: container as any,
    })

    expect(send).toHaveBeenCalledTimes(1)
    const [sentEvent, config] = send.mock.calls[0]
    expect(sentEvent.action_source).toBe("business_messaging")
    expect(config).toEqual({ pixelId: "pixel_123", accessToken: "wa_token" })
  })

  it("renvoie en chat avec le jeton CAPI quand business_messaging est refusé", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID = "waba_1"
    process.env.META_WHATSAPP_EVENTS_ACCESS_TOKEN = "wa_token"
    graph.mockResolvedValue({ data: [whatsappOrder] })
    const send = jest
      .spyOn(metaConversionsClient, "sendConversionEvent")
      .mockRejectedValueOnce(new Error("refus"))
      .mockResolvedValueOnce(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_wa" } } as any,
      container: container as any,
    })

    expect(send).toHaveBeenCalledTimes(2)
    const [first, firstConfig] = send.mock.calls[0]
    const [second, secondConfig] = send.mock.calls[1]
    expect(first.action_source).toBe("business_messaging")
    expect(firstConfig.accessToken).toBe("wa_token")
    expect(second.action_source).toBe("chat")
    expect(second.event_id).toBe(first.event_id)
    expect(secondConfig).toEqual({ pixelId: "pixel_123", accessToken: "token_abc" })
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it("utilise META_WHATSAPP_DATASET_ID pour business_messaging et META_PIXEL_ID pour le renvoi chat", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID = "waba_1"
    process.env.META_WHATSAPP_EVENTS_ACCESS_TOKEN = "wa_token"
    process.env.META_WHATSAPP_DATASET_ID = "dataset_wa"
    graph.mockResolvedValue({ data: [whatsappOrder] })
    const send = jest
      .spyOn(metaConversionsClient, "sendConversionEvent")
      .mockRejectedValueOnce(Object.assign(new Error("refus"), { status: 400 }))
      .mockResolvedValueOnce(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_wa" } } as any,
      container: container as any,
    })

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][1]).toEqual({ pixelId: "dataset_wa", accessToken: "wa_token" })
    expect(send.mock.calls[1][0].action_source).toBe("chat")
    expect(send.mock.calls[1][1]).toEqual({ pixelId: "pixel_123", accessToken: "token_abc" })
  })

  it("envoie en chat sans variables WhatsApp", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    delete process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID
    delete process.env.META_WHATSAPP_EVENTS_ACCESS_TOKEN
    graph.mockResolvedValue({ data: [whatsappOrder] })
    const send = jest.spyOn(metaConversionsClient, "sendConversionEvent").mockResolvedValue(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_wa" } } as any,
      container: container as any,
    })

    expect(send).toHaveBeenCalledTimes(1)
    const [sentEvent, config] = send.mock.calls[0]
    expect(sentEvent.action_source).toBe("chat")
    expect(config.accessToken).toBe("token_abc")
  })

  it("renseigne event_source_url pour une commande du site", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    process.env.STOREFRONT_URL = "https://golden-market.co"
    graph.mockResolvedValue({
      data: [
        {
          id: "order_web",
          currency_code: "xof",
          total: 1000,
          shipping_address: { phone: "70123456", country_code: "bf" },
          items: [{ variant_id: "variant_1", quantity: 1 }],
        },
      ],
    })
    const send = jest.spyOn(metaConversionsClient, "sendConversionEvent").mockResolvedValue(undefined)

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_web" } } as any,
      container: container as any,
    })

    expect(send.mock.calls[0][0].event_source_url).toBe(
      "https://golden-market.co/bf/order/order_web/confirmed"
    )
  })

  it("demande metadata et le code pays de livraison", async () => {
    process.env.META_PIXEL_ID = "pixel_123"
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "token_abc"
    graph.mockResolvedValue({ data: [] })

    await orderPlacedMetaConversionsApiHandler({
      event: { name: "order.placed", data: { id: "order_x" } } as any,
      container: container as any,
    })

    expect(graph.mock.calls[0][0].fields).toEqual(
      expect.arrayContaining(["metadata", "shipping_address.country_code"])
    )
  })
})
