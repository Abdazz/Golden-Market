import { upsertCatalogItem } from "../meta-catalog-client"
import type { MetaCatalogItem } from "../meta-catalog-mapping"

describe("upsertCatalogItem", () => {
  const item: MetaCatalogItem = {
    id: "variant_1",
    item_group_id: "prod_1",
    title: "Produit",
    description: "Description",
    availability: "in stock",
    condition: "new",
    price: "15000 XOF",
    link: "https://golden-market.co/bf/products/produit",
    image_link: "https://example.com/img.jpg",
    brand: "Golden Market",
    video_url: null,
  }

  const config = { catalogId: "catalog_123", accessToken: "token_abc" }

  it("posts a multipart UPDATE batch request with the item nested under data", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await upsertCatalogItem(item, config, fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://graph.facebook.com/v20.0/catalog_123/items_batch")
    expect(init.method).toBe("POST")

    const body = init.body as FormData
    expect(body.get("access_token")).toBe("token_abc")
    expect(body.get("item_type")).toBe("PRODUCT_ITEM")
    const { video_url, ...itemWithoutVideoUrl } = item
    expect(JSON.parse(body.get("requests") as string)).toEqual([
      { method: "UPDATE", data: itemWithoutVideoUrl },
    ])
  })

  it("translates video_url into Meta's 'videos' array field, and omits the internal video_url key", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const itemWithVideo: MetaCatalogItem = {
      ...item,
      video_url: "https://golden-market.co/static/video.mp4",
    }

    await upsertCatalogItem(itemWithVideo, config, fetchMock as unknown as typeof fetch)

    const body = fetchMock.mock.calls[0][1].body as FormData
    const sentData = JSON.parse(body.get("requests") as string)[0].data
    expect(sentData.videos).toEqual([
      { url: "https://golden-market.co/static/video.mp4" },
    ])
    expect(sentData).not.toHaveProperty("video_url")
  })

  it("does not send a 'videos' field at all when there is no video", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await upsertCatalogItem(item, config, fetchMock as unknown as typeof fetch)

    const body = fetchMock.mock.calls[0][1].body as FormData
    const sentData = JSON.parse(body.get("requests") as string)[0].data
    expect(sentData).not.toHaveProperty("videos")
    expect(sentData).not.toHaveProperty("video_url")
  })

  it("throws when the catalog id is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      upsertCatalogItem(
        item,
        { catalogId: "", accessToken: "token_abc" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/META_CATALOG_ID/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the access token is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      upsertCatalogItem(
        item,
        { catalogId: "catalog_123", accessToken: "" },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/META_CATALOG_ACCESS_TOKEN/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when Meta responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('{"error":{"message":"Invalid parameter"}}'),
    })

    await expect(
      upsertCatalogItem(item, config, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/401/)
    await expect(
      upsertCatalogItem(item, config, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/Invalid parameter/)
  })
})
