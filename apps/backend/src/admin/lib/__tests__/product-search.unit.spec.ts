import { matchesSearch, normalizeSearch } from "../product-search"

describe("normalizeSearch", () => {
  it("minuscules, sans accents, ponctuation en espaces, espaces réduits", () => {
    expect(normalizeSearch("  Balai-Éponge  l'Été ")).toBe("balai eponge l ete")
  })
})

describe("matchesSearch", () => {
  it("tous les mots, dans n'importe quel ordre, sans accents", () => {
    expect(matchesSearch("Balai-éponge à essorage", "eponge balai")).toBe(true)
    expect(matchesSearch("Balai-éponge à essorage", "BALAI-EPONGE")).toBe(true)
    expect(matchesSearch("Balai-éponge à essorage", "seau")).toBe(false)
  })
  it("requête vide : tout correspond", () => {
    expect(matchesSearch("Seau", "   ")).toBe(true)
  })
})
