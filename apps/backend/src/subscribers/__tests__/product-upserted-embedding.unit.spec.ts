import productUpsertedEmbeddingHandler from "../product-upserted-embedding"
import { computeProductContentHash } from "../../lib/product-embedding-hash"
import * as embeddingClient from "../../lib/product-embedding-client"
import * as embeddingStore from "../../lib/product-embedding-store"

jest.mock("../../lib/product-embedding-client")
jest.mock("../../lib/product-embedding-store")

describe("productUpsertedEmbeddingHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const pg = {}
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      if (key === "__pg_connection__") return pg
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("re-embeds and upserts when the content hash changed", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({
      data: [{ id: "prod_1", title: "Chargeur USB", description: "Câble 1m" }],
    })
    jest.spyOn(embeddingStore, "getStoredContentHash").mockResolvedValue("old_hash")
    jest.spyOn(embeddingClient, "embedText").mockResolvedValue([0.1, 0.2])
    const upsert = jest
      .spyOn(embeddingStore, "upsertProductEmbedding")
      .mockResolvedValue(undefined)

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_1" } } as any,
      container: container as any,
    })

    expect(upsert).toHaveBeenCalledWith(pg, {
      productId: "prod_1",
      embedding: [0.1, 0.2],
      contentHash: computeProductContentHash("Chargeur USB", "Câble 1m"),
    })
  })

  it("skips re-embedding when the content hash is unchanged", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({
      data: [{ id: "prod_1", title: "Chargeur USB", description: "Câble 1m" }],
    })
    jest
      .spyOn(embeddingStore, "getStoredContentHash")
      .mockResolvedValue(computeProductContentHash("Chargeur USB", "Câble 1m"))
    const embedText = jest.spyOn(embeddingClient, "embedText")

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_1" } } as any,
      container: container as any,
    })

    expect(embedText).not.toHaveBeenCalled()
  })

  it("skips silently when OPENAI_API_KEY is not configured", async () => {
    delete process.env.OPENAI_API_KEY
    const embedText = jest.spyOn(embeddingClient, "embedText")

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_1" } } as any,
      container: container as any,
    })

    expect(embedText).not.toHaveBeenCalled()
    expect(graph).not.toHaveBeenCalled()
  })

  it("logs and does not throw when embedding fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({
      data: [{ id: "prod_1", title: "Chargeur USB", description: "Câble 1m" }],
    })
    jest.spyOn(embeddingStore, "getStoredContentHash").mockResolvedValue("old_hash")
    jest.spyOn(embeddingClient, "embedText").mockRejectedValue(new Error("boom"))

    await expect(
      productUpsertedEmbeddingHandler({
        event: { name: "product.updated", data: { id: "prod_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("prod_1"),
      expect.any(Error)
    )
  })

  it("skips when the product cannot be found", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    graph.mockResolvedValue({ data: [] })
    const embedText = jest.spyOn(embeddingClient, "embedText")

    await productUpsertedEmbeddingHandler({
      event: { name: "product.updated", data: { id: "prod_missing" } } as any,
      container: container as any,
    })

    expect(embedText).not.toHaveBeenCalled()
  })
})
