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
          items: [{ product_id: "prod_1", quantity: 2 }],
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
          items: [{ product_id: "prod_1", quantity: 2 }],
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
})
