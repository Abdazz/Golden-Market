import { normalizePhone } from "../normalize-phone"

describe("normalizePhone", () => {
  it("garde un numéro déjà au format +226XXXXXXXX inchangé", () => {
    expect(normalizePhone("+22670000000")).toBe("+22670000000")
  })

  it("ajoute le préfixe +226 à un numéro local à 8 chiffres", () => {
    expect(normalizePhone("70000000")).toBe("+22670000000")
  })

  it("retire les espaces et tirets avant de normaliser", () => {
    expect(normalizePhone("70 00 00 00")).toBe("+22670000000")
    expect(normalizePhone("226-70-00-00-00")).toBe("+22670000000")
  })

  it("retire un préfixe international 00226", () => {
    expect(normalizePhone("0022670000000")).toBe("+22670000000")
  })

  it("retire un préfixe 226 sans le +", () => {
    expect(normalizePhone("22670000000")).toBe("+22670000000")
  })

  it("lève une erreur si la chaîne ne contient aucun chiffre", () => {
    expect(() => normalizePhone("abc")).toThrow("Numéro de téléphone invalide")
  })

  it("lève une erreur sur une chaîne vide", () => {
    expect(() => normalizePhone("")).toThrow("Numéro de téléphone invalide")
  })

  it("lève une erreur si le numéro local est trop court", () => {
    expect(() => normalizePhone("7000")).toThrow("Numéro de téléphone invalide")
  })

  it("lève une erreur si le numéro local est trop long", () => {
    expect(() => normalizePhone("7000000000")).toThrow("Numéro de téléphone invalide")
  })

  it("lève une erreur pour un numéro à 9 chiffres avec un zéro initial (habitude de saisie locale) plutôt que de produire un identifiant différent de la même personne", () => {
    expect(() => normalizePhone("070000000")).toThrow("Numéro de téléphone invalide")
  })
})
