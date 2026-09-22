import {
  getConfiguredMetaCatalogConfigs,
  loadVariantCatalogData,
  resolveVariantIdsForInventoryItem,
  syncVariantToMetaCatalog,
} from "../meta-catalog-sync"

describe("loadVariantCatalogData", () => {
  it("resolves the product id from the variant, then fetches the full product", async () => {
    const graph = jest.fn()
    graph.mockImplementationOnce(async ({ entity, filters }: any) => {
      expect(entity).toBe("product_variant")
      expect(filters).toEqual({ id: "variant_1" })
      return { data: [{ id: "variant_1", product_id: "prod_1" }] }
    })
    graph.mockImplementationOnce(async ({ entity, filters, context }: any) => {
      expect(entity).toBe("product")
      expect(filters).toEqual({ id: "prod_1", status: "published" })
      expect(context).toBeDefined()
      return {
        data: [
          {
            id: "prod_1",
            title: "Produit",
            description: "Desc",
            handle: "produit",
            thumbnail: null,
            images: [],
            variants: [
              {
                id: "variant_1",
                title: "Default Title",
                manage_inventory: true,
                allow_backorder: false,
                images: [],
                calculated_price: { calculated_amount: 1000, currency_code: "xof" },
              },
              { id: "variant_2", title: "Autre" },
            ],
          },
        ],
      }
    })

    const result = await loadVariantCatalogData({ graph } as any, "variant_1")

    expect(result?.product.id).toBe("prod_1")
    expect(result?.variant.id).toBe("variant_1")
  })

  it("returns null when the variant does not exist", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    const result = await loadVariantCatalogData({ graph } as any, "missing")
    expect(result).toBeNull()
  })

  it("returns null when the product lookup comes back empty", async () => {
    const graph = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ id: "variant_1", product_id: "prod_1" }] })
      .mockResolvedValueOnce({ data: [] })
    const result = await loadVariantCatalogData({ graph } as any, "variant_1")
    expect(result).toBeNull()
  })

  it("returns null when the product is a draft (not published), even though the variant->product_id lookup succeeded", async () => {
    const graph = jest.fn()
    graph.mockImplementationOnce(async () => ({
      data: [{ id: "variant_1", product_id: "prod_1" }],
    }))
    graph.mockImplementationOnce(async ({ filters }: any) => {
      expect(filters).toEqual({ id: "prod_1", status: "published" })
      // Draft product: the status-filtered query.graph call returns nothing.
      return { data: [] }
    })

    const result = await loadVariantCatalogData({ graph } as any, "variant_1")
    expect(result).toBeNull()
  })
})

describe("resolveVariantIdsForInventoryItem", () => {
  it("returns the variant ids linked to the inventory item", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity, filters }: any) => {
      expect(entity).toBe("product_variant_inventory_item")
      expect(filters).toEqual({ inventory_item_id: "iitem_1" })
      return { data: [{ variant_id: "variant_1" }, { variant_id: "variant_2" }] }
    })

    const result = await resolveVariantIdsForInventoryItem({ graph } as any, "iitem_1")
    expect(result).toEqual(["variant_1", "variant_2"])
  })
})

describe("syncVariantToMetaCatalog", () => {
  const catalogProductGraphResponse = {
    data: [
      {
        id: "prod_1",
        title: "Produit",
        description: "Desc",
        handle: "produit",
        thumbnail: null,
        images: [],
        variants: [
          {
            id: "variant_1",
            title: "Default Title",
            manage_inventory: true,
            allow_backorder: false,
            images: [],
            calculated_price: { calculated_amount: 1000, currency_code: "xof" },
          },
        ],
      },
    ],
  }

  it("loads the variant, computes availability and pushes it to Meta", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product_variant") {
        return { data: [{ id: "variant_1", product_id: "prod_1" }] }
      }
      if (entity === "product") {
        return catalogProductGraphResponse
      }
      if (entity === "product_variant_inventory_items") {
        return {
          data: [
            {
              variant_id: "variant_1",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 4 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await syncVariantToMetaCatalog(
      { graph } as any,
      "variant_1",
      [{ catalogId: "catalog_123", accessToken: "token_abc" }],
      fetchMock as unknown as typeof fetch
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = fetchMock.mock.calls[0][1].body as FormData
    const pushedItem = JSON.parse(body.get("requests") as string)[0].data
    expect(pushedItem.id).toBe("variant_1")
    expect(pushedItem.availability).toBe("in stock")
    expect(pushedItem.price).toBe("1000 XOF")
  })

  it("pushes the same item to every configured catalog", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product_variant") {
        return { data: [{ id: "variant_1", product_id: "prod_1" }] }
      }
      if (entity === "product") {
        return catalogProductGraphResponse
      }
      if (entity === "product_variant_inventory_items") {
        return {
          data: [
            {
              variant_id: "variant_1",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 4 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })

    await syncVariantToMetaCatalog(
      { graph } as any,
      "variant_1",
      [
        { catalogId: "catalog_prod", accessToken: "token_prod" },
        { catalogId: "catalog_app", accessToken: "token_app" },
      ],
      fetchMock as unknown as typeof fetch
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const calledUrls = fetchMock.mock.calls.map((call) => call[0] as string)
    expect(calledUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("catalog_prod"),
        expect.stringContaining("catalog_app"),
      ])
    )
  })

  it("still pushes to the other catalogs and throws when only one catalog fails", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product_variant") {
        return { data: [{ id: "variant_1", product_id: "prod_1" }] }
      }
      if (entity === "product") {
        return catalogProductGraphResponse
      }
      if (entity === "product_variant_inventory_items") {
        return {
          data: [
            {
              variant_id: "variant_1",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 4 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" })

    await expect(
      syncVariantToMetaCatalog(
        { graph } as any,
        "variant_1",
        [
          { catalogId: "catalog_prod", accessToken: "token_prod" },
          { catalogId: "catalog_app", accessToken: "token_app" },
        ],
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/1\/2/)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws when the variant cannot be resolved (caller is responsible for catching)", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    const fetchMock = jest.fn()

    await expect(
      syncVariantToMetaCatalog(
        { graph } as any,
        "missing",
        [{ catalogId: "catalog_123", accessToken: "token_abc" }],
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/introuvable/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("getConfiguredMetaCatalogConfigs", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns an empty array when nothing is configured", () => {
    delete process.env.META_CATALOG_ID
    delete process.env.META_CATALOG_ACCESS_TOKEN
    delete process.env.META_CATALOG_APP_ID
    delete process.env.META_CATALOG_APP_ACCESS_TOKEN

    expect(getConfiguredMetaCatalogConfigs()).toEqual([])
  })

  it("returns only the production catalog when only it is configured", () => {
    process.env.META_CATALOG_ID = "catalog_prod"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_prod"
    delete process.env.META_CATALOG_APP_ID
    delete process.env.META_CATALOG_APP_ACCESS_TOKEN

    expect(getConfiguredMetaCatalogConfigs()).toEqual([
      { catalogId: "catalog_prod", accessToken: "token_prod" },
    ])
  })

  it("returns both catalogs when both are configured", () => {
    process.env.META_CATALOG_ID = "catalog_prod"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_prod"
    process.env.META_CATALOG_APP_ID = "catalog_app"
    process.env.META_CATALOG_APP_ACCESS_TOKEN = "token_app"

    expect(getConfiguredMetaCatalogConfigs()).toEqual([
      { catalogId: "catalog_prod", accessToken: "token_prod" },
      { catalogId: "catalog_app", accessToken: "token_app" },
    ])
  })

  it("ignores the app catalog when only one of its two env vars is set", () => {
    process.env.META_CATALOG_ID = "catalog_prod"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_prod"
    process.env.META_CATALOG_APP_ID = "catalog_app"
    delete process.env.META_CATALOG_APP_ACCESS_TOKEN

    expect(getConfiguredMetaCatalogConfigs()).toEqual([
      { catalogId: "catalog_prod", accessToken: "token_prod" },
    ])
  })
})
