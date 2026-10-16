import handler from "../product-updated-meta-catalog"
import * as sync from "../../lib/meta-catalog-sync"

jest.mock("../../lib/meta-catalog-sync", () => ({
  ...jest.requireActual("../../lib/meta-catalog-sync"),
  syncVariantToMetaCatalog: jest.fn(),
}))

describe("productUpdatedMetaCatalogHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const container = {
    resolve: (key: string) => (key === "logger" ? logger : { graph }),
  } as any
  const env = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    graph.mockResolvedValue({ data: [{ id: "prod_1", variants: [{ id: "v1" }, { id: "v2" }] }] })
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it("repousse chaque variante du produit, une erreur n'arrête pas les autres", async () => {
    process.env.META_CATALOG_ID = "cat"
    process.env.META_CATALOG_ACCESS_TOKEN = "tok"
    ;(sync.syncVariantToMetaCatalog as jest.Mock).mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined)
    await handler({ event: { name: "product.updated", data: { id: "prod_1" } } as any, container })
    expect(sync.syncVariantToMetaCatalog).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it("ne fait rien sans catalogue configuré", async () => {
    delete process.env.META_CATALOG_ID
    delete process.env.META_CATALOG_APP_ID
    await handler({ event: { name: "product.updated", data: { id: "prod_1" } } as any, container })
    expect(sync.syncVariantToMetaCatalog).not.toHaveBeenCalled()
  })
})
