import { findSimilarProductIds, searchProductsFuzzy } from "../product-fuzzy-search"

function fakeKnex(rows: Array<{ id: string }>) {
  return { raw: jest.fn().mockResolvedValue({ rows }) }
}

describe("findSimilarProductIds", () => {
  it("returns matched ids in the order given by the DB", async () => {
    const knex = fakeKnex([{ id: "prod_1" }, { id: "prod_2" }])

    const ids = await findSimilarProductIds(knex, "aiguisseur de couteau", 5)

    expect(ids).toEqual(["prod_1", "prod_2"])
    expect(knex.raw).toHaveBeenCalledWith(
      expect.stringContaining("word_similarity"),
      ["aiguisseur de couteau", "aiguisseur de couteau", 5]
    )
  })

  it("returns an empty array when nothing matches", async () => {
    const knex = fakeKnex([])
    const ids = await findSimilarProductIds(knex, "xyz", 5)
    expect(ids).toEqual([])
  })
})

describe("searchProductsFuzzy", () => {
  it("returns an empty array without querying anything for a blank search term", async () => {
    const knex = fakeKnex([])
    const query = { graph: jest.fn() }

    const result = await searchProductsFuzzy(query, knex, "   ", 5)

    expect(result).toEqual([])
    expect(knex.raw).not.toHaveBeenCalled()
    expect(query.graph).not.toHaveBeenCalled()
  })

  it("re-orders query.graph results to match the similarity ranking, not filter order, and attaches availability", async () => {
    const knex = fakeKnex([{ id: "prod_best" }, { id: "prod_second" }])
    const query = {
      graph: jest.fn().mockImplementation(async ({ entity }: any) => {
        if (entity === "product") {
          return {
            data: [
              {
                id: "prod_second",
                title: "Second",
                variants: [{ id: "variant_second", manage_inventory: true, allow_backorder: false }],
              },
              {
                id: "prod_best",
                title: "Best",
                variants: [{ id: "variant_best", manage_inventory: false, allow_backorder: false }],
              },
            ],
          }
        }
        if (entity === "product_variant_inventory_items") {
          return { data: [] }
        }
        throw new Error(`Unexpected entity in test: ${entity}`)
      }),
    }

    const result = await searchProductsFuzzy(query, knex, "couteau", 5)

    expect(result.map((p: any) => p.id)).toEqual(["prod_best", "prod_second"])
    // manage_inventory: false -> toujours disponible, même sans lien d'inventaire
    expect(result[0].variants[0].availability).toBe("in stock")
    // manage_inventory: true, pas d'inventaire lié, pas de backorder -> rupture
    expect(result[1].variants[0].availability).toBe("out of stock")
  })

  it("returns an empty array without calling query.graph when no id matches", async () => {
    const knex = fakeKnex([])
    const query = { graph: jest.fn() }

    const result = await searchProductsFuzzy(query, knex, "produit inexistant", 5)

    expect(result).toEqual([])
    expect(query.graph).not.toHaveBeenCalled()
  })
})
