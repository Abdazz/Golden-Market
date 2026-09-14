import { sendConversionEvent } from "../meta-conversions-client"
import type { MetaConversionEvent } from "../meta-conversions-mapping"

describe("sendConversionEvent", () => {
  const event: MetaConversionEvent = {
    event_name: "Purchase",
    event_time: 1700000000,
    event_id: "order_1",
    action_source: "website",
    user_data: { ph: ["hash"] },
    custom_data: {
      currency: "XOF",
      value: 15000,
      content_type: "product",
      contents: [{ id: "prod_1", quantity: 2 }],
    },
  }

  const config = { pixelId: "pixel_123", accessToken: "token_abc" }

  it("posts a JSON body with the event wrapped in a data array", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await sendConversionEvent(event, config, fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://graph.facebook.com/v20.0/pixel_123/events?access_token=token_abc"
    )
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body as string)).toEqual({ data: [event] })
  })

  it("throws when the pixel id is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      sendConversionEvent(
        event,
        { pixelId: "", accessToken: "token_abc" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/META_PIXEL_ID/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the access token is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      sendConversionEvent(
        event,
        { pixelId: "pixel_123", accessToken: "" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/META_CONVERSIONS_API_ACCESS_TOKEN/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when Meta responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 })

    await expect(
      sendConversionEvent(event, config, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/401/)
  })
})
