import catalogUpdatedStorefrontRevalidateHandler, {
  config,
} from "../catalog-updated-storefront-revalidate"
import * as revalidateClient from "../../lib/storefront-revalidate-client"

jest.mock("../../lib/storefront-revalidate-client")

describe("catalogUpdatedStorefrontRevalidateHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }
  const args = { event: { data: { id: "prod_1" } }, container } as any

  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("écoute les changements de fiche produit en plus des changements de prix", () => {
    // Sans product.*, une modification d'images/titre/description ou un
    // nouveau produit restait invisible sur le storefront (cache
    // force-cache sans expiration) - constaté le 2026-09-24 après la
    // conversion webp -> jpeg des images produit.
    expect(config.event).toEqual(
      expect.arrayContaining([
        "product.created",
        "product.updated",
        "product.deleted",
        "product-variant.updated",
        "pricing.price.created",
        "pricing.price.updated",
        "pricing.price.deleted",
      ])
    )
  })

  it("déclenche la revalidation du storefront", async () => {
    process.env.STOREFRONT_URL = "https://golden-market.co"
    process.env.REVALIDATE_SECRET = "secret"
    const trigger = jest
      .spyOn(revalidateClient, "triggerStorefrontRevalidate")
      .mockResolvedValue()

    await catalogUpdatedStorefrontRevalidateHandler(args)

    expect(trigger).toHaveBeenCalledWith({
      storefrontUrl: "https://golden-market.co",
      secret: "secret",
    })
  })

  it("ne fait rien si le storefront n'est pas configuré", async () => {
    delete process.env.STOREFRONT_URL
    delete process.env.REVALIDATE_SECRET
    const trigger = jest.spyOn(revalidateClient, "triggerStorefrontRevalidate")

    await catalogUpdatedStorefrontRevalidateHandler(args)

    expect(trigger).not.toHaveBeenCalled()
  })

  it("ne propage pas une erreur de revalidation (journalisée seulement)", async () => {
    process.env.STOREFRONT_URL = "https://golden-market.co"
    process.env.REVALIDATE_SECRET = "secret"
    jest
      .spyOn(revalidateClient, "triggerStorefrontRevalidate")
      .mockRejectedValue(new Error("Revalidation storefront a répondu 500"))

    await expect(catalogUpdatedStorefrontRevalidateHandler(args)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
