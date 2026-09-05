import {
  computeAvailability,
  formatMetaPrice,
  resolveImageLink,
  buildCatalogItem,
  type CatalogProduct,
  type CatalogVariant,
} from "../meta-catalog-mapping"

describe("computeAvailability", () => {
  it("is always in stock when inventory is not managed", () => {
    expect(
      computeAvailability({ manage_inventory: false, allow_backorder: false }, 0)
    ).toBe("in stock")
  })

  it("is always in stock when backorders are allowed", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: true }, 0)
    ).toBe("in stock")
  })

  it("is in stock when managed inventory has quantity available", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: false }, 3)
    ).toBe("in stock")
  })

  it("is out of stock when managed inventory has zero quantity", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: false }, 0)
    ).toBe("out of stock")
  })

  it("treats a null availability (no inventory item linked) as out of stock", () => {
    expect(
      computeAvailability({ manage_inventory: true, allow_backorder: false }, null)
    ).toBe("out of stock")
  })
})

describe("formatMetaPrice", () => {
  it("formats a zero-decimal XOF amount as '<amount> XOF'", () => {
    expect(formatMetaPrice(15000, "xof")).toBe("15000 XOF")
  })

  it("rounds a non-integer amount", () => {
    expect(formatMetaPrice(1500.6, "xof")).toBe("1501 XOF")
  })
})

describe("resolveImageLink", () => {
  const product: CatalogProduct = {
    id: "prod_1",
    title: "Produit",
    description: "desc",
    handle: "produit",
    thumbnail: "https://example.com/thumb.jpg",
    images: [{ url: "https://example.com/product-1.jpg" }],
  }

  it("prefers the variant's own image", () => {
    const variant: Pick<CatalogVariant, "images"> = {
      images: [{ url: "https://example.com/variant-1.jpg" }],
    }
    expect(resolveImageLink(variant, product)).toBe(
      "https://example.com/variant-1.jpg"
    )
  })

  it("falls back to the product's first image when the variant has none", () => {
    expect(resolveImageLink({ images: [] }, product)).toBe(
      "https://example.com/product-1.jpg"
    )
  })

  it("falls back to the product thumbnail when there are no images at all", () => {
    expect(resolveImageLink({ images: [] }, { ...product, images: [] })).toBe(
      "https://example.com/thumb.jpg"
    )
  })
})

describe("buildCatalogItem", () => {
  const product: CatalogProduct = {
    id: "prod_1",
    title: "Serpillière auto-essorante",
    description: "Une bonne serpillière.",
    handle: "serpilliere-auto-essorante",
    thumbnail: "https://example.com/thumb.jpg",
    images: [],
  }

  it("builds a full item for a single-variant product (Default Title)", () => {
    const variant: CatalogVariant = {
      id: "variant_1",
      title: "Default Title",
      manage_inventory: true,
      allow_backorder: false,
      images: [],
      calculated_price: { calculated_amount: 15000, currency_code: "xof" },
    }

    expect(buildCatalogItem(product, variant, 5)).toEqual({
      id: "variant_1",
      item_group_id: "prod_1",
      title: "Serpillière auto-essorante",
      description: "Une bonne serpillière.",
      availability: "in stock",
      condition: "new",
      price: "15000 XOF",
      link: "https://golden-market.co/bf/products/serpilliere-auto-essorante",
      image_link: "https://example.com/thumb.jpg",
      brand: "Golden Market",
    })
  })

  it("appends the variant title for a real multi-variant option", () => {
    const variant: CatalogVariant = {
      id: "variant_2",
      title: "Rouge / L",
      manage_inventory: true,
      allow_backorder: false,
      images: [],
      calculated_price: { calculated_amount: 12000, currency_code: "xof" },
    }

    expect(buildCatalogItem(product, variant, 0).title).toBe(
      "Serpillière auto-essorante - Rouge / L"
    )
    expect(buildCatalogItem(product, variant, 0).availability).toBe(
      "out of stock"
    )
  })

  it("falls back to '0 XOF' when calculated_price could not be resolved", () => {
    const variant: CatalogVariant = {
      id: "variant_3",
      title: "Default Title",
      manage_inventory: false,
      allow_backorder: false,
      images: [],
      calculated_price: null,
    }

    expect(buildCatalogItem(product, variant, null).price).toBe("0 XOF")
  })
})
