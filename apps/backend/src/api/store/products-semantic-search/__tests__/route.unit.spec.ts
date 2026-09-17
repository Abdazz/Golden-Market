import { GET } from "../route"
import * as embeddingClient from "../../../../lib/product-embedding-client"
import * as embeddingStore from "../../../../lib/product-embedding-store"

jest.mock("../../../../lib/product-embedding-client")
jest.mock("../../../../lib/product-embedding-store")

function createFakeRes() {
  const res: any = { statusCode: 200, jsonBody: undefined }
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = jest.fn((body: unknown) => {
    res.jsonBody = body
    return res
  })
  return res
}

describe("GET /store/products-semantic-search", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    jest.clearAllMocks()
  })

  it("returns products ordered by vector similarity with binary availability", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    jest.spyOn(embeddingClient, "embedText").mockResolvedValue([0.1, 0.2])
    jest
      .spyOn(embeddingStore, "findNearestProductIds")
      .mockResolvedValue(["prod_2", "prod_1"])

    const graph = jest.fn().mockImplementation(async ({ entity }: any) => {
      if (entity === "product") {
        return {
          data: [
            {
              id: "prod_1",
              title: "Serpillière auto-essorante",
              handle: "serpilliere",
              variants: [
                {
                  id: "variant_1",
                  manage_inventory: true,
                  allow_backorder: false,
                  calculated_price: { calculated_amount: 3000, currency_code: "xof" },
                },
              ],
            },
            {
              id: "prod_2",
              title: "Balai à franges",
              handle: "balai",
              variants: [
                {
                  id: "variant_2",
                  manage_inventory: false,
                  allow_backorder: false,
                  calculated_price: { calculated_amount: 1500, currency_code: "xof" },
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
              variant_id: "variant_1",
              required_quantity: 1,
              variant: { manage_inventory: true, allow_backorder: false },
              inventory: { location_levels: [{ location_id: "loc_1", available_quantity: 0 }] },
            },
          ],
        }
      }
      throw new Error(`Unexpected entity in test: ${entity}`)
    })

    const req: any = {
      query: { q: "balai serpillière" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "__pg_connection__") return {}
          if (key === "query") return { graph }
          throw new Error(`Unexpected resolve: ${key}`)
        }),
      },
    }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(200)
    // Ordre pgvector préservé (prod_2 avant prod_1) même si query.graph les
    // renvoie dans l'ordre inverse.
    expect(res.jsonBody.products.map((p: any) => p.id)).toEqual(["prod_2", "prod_1"])
    expect(res.jsonBody.products[1].variants[0].availability).toBe("out of stock")
    expect(res.jsonBody.products[0].variants[0].availability).toBe("in stock")
  })

  it("returns 400 when q is missing", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const req: any = { query: {}, scope: { resolve: jest.fn() } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(400)
  })

  it("returns 400 when q is whitespace only", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const req: any = { query: { q: "   " }, scope: { resolve: jest.fn() } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(400)
  })

  it("returns 503 when OPENAI_API_KEY is not configured", async () => {
    delete process.env.OPENAI_API_KEY
    const req: any = { query: { q: "balai" }, scope: { resolve: jest.fn() } }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.statusCode).toBe(503)
  })

  it("returns an empty list when no embedding matches", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    jest.spyOn(embeddingClient, "embedText").mockResolvedValue([0.1, 0.2])
    jest.spyOn(embeddingStore, "findNearestProductIds").mockResolvedValue([])

    const req: any = {
      query: { q: "produit inexistant" },
      scope: { resolve: jest.fn(() => ({})) },
    }
    const res = createFakeRes()

    await GET(req, res)

    expect(res.jsonBody).toEqual({ products: [], count: 0 })
  })
})
