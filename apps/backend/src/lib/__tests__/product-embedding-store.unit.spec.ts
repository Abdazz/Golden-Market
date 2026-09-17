import {
  getStoredContentHash,
  upsertProductEmbedding,
  findNearestProductIds,
} from "../product-embedding-store"

describe("getStoredContentHash", () => {
  it("returns the stored hash for a product", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [{ content_hash: "abc" }] })
    const result = await getStoredContentHash({ raw }, "prod_1")
    expect(result).toBe("abc")
    expect(raw).toHaveBeenCalledWith(
      "select content_hash from product_embedding where product_id = ?",
      ["prod_1"]
    )
  })

  it("returns null when the product has no stored embedding yet", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [] })
    const result = await getStoredContentHash({ raw }, "prod_1")
    expect(result).toBeNull()
  })
})

describe("upsertProductEmbedding", () => {
  it("inserts the embedding as a pgvector literal, updating on conflict", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [] })

    await upsertProductEmbedding(
      { raw },
      { productId: "prod_1", embedding: [0.1, 0.2], contentHash: "hash_1" }
    )

    expect(raw).toHaveBeenCalledTimes(1)
    const [sql, bindings] = raw.mock.calls[0]
    expect(sql).toContain("on conflict (product_id) do update")
    expect(bindings).toEqual(["prod_1", "[0.1,0.2]", "hash_1"])
  })
})

describe("findNearestProductIds", () => {
  it("returns product ids ordered by vector distance", async () => {
    const raw = jest.fn().mockResolvedValue({
      rows: [{ product_id: "prod_2" }, { product_id: "prod_1" }],
    })

    const result = await findNearestProductIds(
      { raw },
      { embedding: [0.1, 0.2], limit: 8 }
    )

    expect(result).toEqual(["prod_2", "prod_1"])
    const [sql, bindings] = raw.mock.calls[0]
    expect(sql).toContain("order by pe.embedding <=> ?::vector")
    expect(sql).toContain("where p.deleted_at is null and p.status = 'published'")
    expect(bindings).toEqual(["[0.1,0.2]", 8])
  })
})
