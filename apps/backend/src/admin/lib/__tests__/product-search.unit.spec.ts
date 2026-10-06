import { matchesSearch, normalizeSearch } from "../product-search"

describe("normalizeSearch", () => {
  it("minuscules, sans accents, ponctuation en espaces, espaces réduits", () => {
    expect(normalizeSearch("  Balai-Éponge  l'Été ")).toBe("balai eponge l ete")
  })
  it("ligatures développées et chiffres conservés", () => {
    expect(normalizeSearch("Ætna 2")).toBe("aetna 2")
    expect(normalizeSearch("Œuf")).toBe("oeuf")
  })
  it("garde les lettres non latines", () => {
    expect(normalizeSearch("Ярлык 5")).toBe("ярлык 5")
  })
})

describe("matchesSearch", () => {
  it("tous les mots, dans n'importe quel ordre, sans accents", () => {
    expect(matchesSearch("Balai-éponge à essorage", "eponge balai")).toBe(true)
    expect(matchesSearch("Balai-éponge à essorage", "BALAI-EPONGE")).toBe(true)
    expect(matchesSearch("Balai-éponge à essorage", "seau")).toBe(false)
  })
  it("cœur trouvé en tapant coeur", () => {
    expect(matchesSearch("Cœur de palmier", "coeur")).toBe(true)
    expect(matchesSearch("Coeur de palmier", "cœur")).toBe(true)
  })
  it("requête vide : tout correspond", () => {
    expect(matchesSearch("Seau", "   ")).toBe(true)
  })
})
