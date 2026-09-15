import { findSimilarProductIds, listAllProductIds, listAllProducts, searchProductsFuzzy } from "../product-fuzzy-search"

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

describe("listAllProductIds", () => {
  it("lists published product ids ordered alphabetically by title, no similarity filter", async () => {
    const knex = fakeKnex([{ id: "prod_a" }, { id: "prod_b" }])

    const ids = await listAllProductIds(knex, 60)

    expect(ids).toEqual(["prod_a", "prod_b"])
    expect(knex.raw).toHaveBeenCalledWith(expect.not.stringContaining("word_similarity"), [60])
    expect(knex.raw).toHaveBeenCalledWith(expect.stringContaining("order by title asc"), [60])
  })

  it("returns an empty array when the catalog has no published product", async () => {
    const knex = fakeKnex([])
    const ids = await listAllProductIds(knex, 60)
    expect(ids).toEqual([])
  })
})

describe("listAllProducts", () => {
  it("returns every available published product with availability attached, in the DB's listing order", async () => {
    const knex = fakeKnex([{ id: "prod_a" }, { id: "prod_b" }])
    const query = {
      graph: jest.fn().mockImplementation(async ({ entity }: any) => {
        if (entity === "product") {
          return {
            data: [
              {
                id: "prod_b",
                title: "Balai",
                variants: [{ id: "variant_b", manage_inventory: false, allow_backorder: false }],
              },
              {
                id: "prod_a",
                title: "Ananas séché",
                variants: [{ id: "variant_a", manage_inventory: false, allow_backorder: false }],
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

    const result = await listAllProducts(query, knex, 60)

    expect(result.map((p: any) => p.id)).toEqual(["prod_a", "prod_b"])
    expect(result[0].variants[0].availability).toBe("in stock")
  })

  it("excludes products with no variant in stock - no point listing what can't be sold", async () => {
    const knex = fakeKnex([{ id: "prod_available" }, { id: "prod_out_of_stock" }])
    const query = {
      graph: jest.fn().mockImplementation(async ({ entity }: any) => {
        if (entity === "product") {
          return {
            data: [
              {
                id: "prod_available",
                title: "Disponible",
                variants: [{ id: "variant_avail", manage_inventory: false, allow_backorder: false }],
              },
              {
                id: "prod_out_of_stock",
                title: "Rupture",
                variants: [{ id: "variant_oos", manage_inventory: true, allow_backorder: false }],
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

    const result = await listAllProducts(query, knex, 60)

    expect(result.map((p: any) => p.id)).toEqual(["prod_available"])
  })

  it("keeps a product if at least one of its variants is in stock", async () => {
    const knex = fakeKnex([{ id: "prod_mixed" }])
    const query = {
      graph: jest.fn().mockImplementation(async ({ entity }: any) => {
        if (entity === "product") {
          return {
            data: [
              {
                id: "prod_mixed",
                title: "Mixte",
                variants: [
                  { id: "variant_oos", manage_inventory: true, allow_backorder: false },
                  { id: "variant_ok", manage_inventory: false, allow_backorder: false },
                ],
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

    const result = await listAllProducts(query, knex, 60)

    expect(result.map((p: any) => p.id)).toEqual(["prod_mixed"])
  })

  it("returns an empty array without calling query.graph when the catalog is empty", async () => {
    const knex = fakeKnex([])
    const query = { graph: jest.fn() }

    const result = await listAllProducts(query, knex, 60)

    expect(result).toEqual([])
    expect(query.graph).not.toHaveBeenCalled()
  })
})
