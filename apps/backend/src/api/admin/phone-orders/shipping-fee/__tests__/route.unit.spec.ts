import { GET } from "../route"

const res = () => {
  const r: any = {}
  r.status = jest.fn(() => r)
  r.json = jest.fn(() => r)
  return r
}
const req = (q: Record<string, unknown>, metadata: Record<string, unknown> = { frais_expedition_xof: 1500 }) => {
  const graph = jest.fn().mockResolvedValue({ data: [{ id: "var_1", product: { id: "p1", metadata } }] })
  return { graph, request: { query: q, scope: { resolve: () => ({ graph }) } } as any }
}

describe("GET /admin/phone-orders/shipping-fee", () => {
  it("hors Ouagadougou : frais les plus élevés des produits", async () => {
    const { request } = req({ city: "Kaya", variant_ids: "var_1,var_2" })
    const r = res()
    await GET(request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 1500, free: false })
  })
  it("Ouagadougou : 0 sans lire les produits", async () => {
    const { request, graph } = req({ city: "Ouagadougou", variant_ids: "var_1" })
    const r = res()
    await GET(request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 0, free: true })
    expect(graph).not.toHaveBeenCalled()
  })
  it("aucun article : 0", async () => {
    const r = res()
    await GET(req({ city: "Kaya", variant_ids: "" }).request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 0, free: false })
  })
  it("hors Ouagadougou, produit à 0 F : amount 0, free false", async () => {
    const { request } = req({ city: "Kaya", variant_ids: "var_1" }, { frais_expedition_xof: 0 })
    const r = res()
    await GET(request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 0, free: false })
  })
  it("ville absente : traitée comme Ouagadougou (gratuite), le formulaire ne l'appelle jamais", async () => {
    const { request } = req({ variant_ids: "var_1" })
    const r = res()
    await GET(request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 0, free: true })
  })
})
