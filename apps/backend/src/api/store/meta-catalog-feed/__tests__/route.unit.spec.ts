import { GET } from "../route"

function createFakeRes() {
  const res: any = { statusCode: 200, headers: {}, sentBody: undefined }
  res.setHeader = jest.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.send = jest.fn((body: string) => {
    res.sentBody = body
    return res
  })
  return res
}

describe("GET /store/meta-catalog-feed", () => {
  it("returns a CSV row per variant, across multiple products", async () => {
    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product") {
        return {
          data: [
            {
              id: "prod_1",
              title: "Produit A",
              description: "Desc A",
              handle: "produit-a",
              thumbnail: "https://example.com/a.jpg",
              images: [],
              variants: [
                {
                  id: "variant_1",
                  title: "Default Title",
                  manage_inventory: false,
                  allow_backorder: false,
                  images: [],
                  calculated_price: { calculated_amount: 5000, currency_code: "xof" },
                },
              ],
            },
            {
              id: "prod_2",
              title: "Produit B",
              description: "Desc \"B\"",
              handle: "produit-b",
              thumbnail: null,
              images: [],
              variants: [
                {
                  id: "variant_2",
                  title: "Default Title",
                  manage_inventory: true,
                  allow_backorder: false,
                  images: [],
                  calculated_price: { calculated_amount: 12000, currency_code: "xof" },
                },
              ],
            },
          ],
        }
      }
      if (entity === "product_variant_inventory_items") {
        return {
          data: [
            {
              variant_id: "variant_2",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 0 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })

    const req: any = { scope: { resolve: jest.fn(() => ({ graph })) } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.headers["Content-Type"]).toBe("text/csv")
    const rows = (res.sentBody as string).trim().split("\n")
    expect(rows[0]).toBe(
      "id,title,description,availability,condition,price,link,image_link,brand,item_group_id"
    )
    expect(rows).toHaveLength(3) // header + 2 variants
    expect(rows[1]).toContain('"variant_1"')
    expect(rows[1]).toContain('"in stock"') // manage_inventory: false -> always available
    expect(rows[2]).toContain('"variant_2"')
    expect(rows[2]).toContain('"out of stock"') // available_quantity 0, tracked, no backorder
    expect(rows[2]).toContain('"Desc ""B"""') // embedded quote escaped per CSV convention
  })

  it("returns just the header row when there are no published products", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    const req: any = { scope: { resolve: jest.fn(() => ({ graph })) } }
    const res = createFakeRes()

    await GET(req, res)

    expect((res.sentBody as string).trim()).toBe(
      "id,title,description,availability,condition,price,link,image_link,brand,item_group_id"
    )
  })
})
