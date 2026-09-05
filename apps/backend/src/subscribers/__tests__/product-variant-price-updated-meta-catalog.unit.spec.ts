import productVariantPriceUpdatedMetaCatalogHandler from "../product-variant-price-updated-meta-catalog"
import * as metaCatalogSync from "../../lib/meta-catalog-sync"

jest.mock("../../lib/meta-catalog-sync")

describe("productVariantPriceUpdatedMetaCatalogHandler", () => {
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

  it("pushes the variant to Meta when configured", async () => {
    process.env.META_CATALOG_ID = "catalog_123"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_abc"
    ;(metaCatalogSync.syncVariantToMetaCatalog as jest.Mock).mockResolvedValue(undefined)

    await productVariantPriceUpdatedMetaCatalogHandler({
      event: { name: "product-variant.updated", data: { id: "variant_1" } } as any,
      container: container as any,
    })

    expect(metaCatalogSync.syncVariantToMetaCatalog).toHaveBeenCalledWith(
      { graph },
      "variant_1",
      { catalogId: "catalog_123", accessToken: "token_abc" }
    )
  })

  it("skips silently when Meta catalog env vars are not configured", async () => {
    delete process.env.META_CATALOG_ID
    delete process.env.META_CATALOG_ACCESS_TOKEN
    ;(metaCatalogSync.syncVariantToMetaCatalog as jest.Mock).mockResolvedValue(undefined)

    await productVariantPriceUpdatedMetaCatalogHandler({
      event: { name: "product-variant.updated", data: { id: "variant_1" } } as any,
      container: container as any,
    })

    expect(metaCatalogSync.syncVariantToMetaCatalog).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the sync fails", async () => {
    process.env.META_CATALOG_ID = "catalog_123"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_abc"
    ;(metaCatalogSync.syncVariantToMetaCatalog as jest.Mock).mockRejectedValue(new Error("boom"))

    await expect(
      productVariantPriceUpdatedMetaCatalogHandler({
        event: { name: "product-variant.updated", data: { id: "variant_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("variant_1"),
      expect.any(Error)
    )
  })
})
