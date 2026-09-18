import { triggerStorefrontRevalidate } from "../storefront-revalidate-client"

describe("triggerStorefrontRevalidate", () => {
  const config = {
    storefrontUrl: "https://golden-market.co",
    secret: "shared_secret",
  }

  it("posts to /api/revalidate with the secret header", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await triggerStorefrontRevalidate(config, fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://golden-market.co/api/revalidate")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "x-revalidate-secret": "shared_secret" })
  })

  it("throws when the storefront URL is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      triggerStorefrontRevalidate(
        { storefrontUrl: "", secret: "shared_secret" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/STOREFRONT_URL/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the secret is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      triggerStorefrontRevalidate(
        { storefrontUrl: "https://golden-market.co", secret: "" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/REVALIDATE_SECRET/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the storefront responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 })

    await expect(
      triggerStorefrontRevalidate(config, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/401/)
  })
})
