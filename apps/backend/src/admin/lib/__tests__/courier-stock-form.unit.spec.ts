import { parseFormLines, readableError } from "../courier-stock-form"

describe("parseFormLines", () => {
  it("correction : un champ « Compté » vide est refusé (ne vaut pas 0)", () => {
    expect(parseFormLines("adjustment", [{ inventory_item_id: "balai", quantity: " " }])).toEqual({ error: "Quantité manquante." })
  })
  it("correction : 0 saisi explicitement est accepté", () => {
    expect(parseFormLines("adjustment", [{ inventory_item_id: "balai", quantity: "0" }])).toEqual({
      lines: [{ inventory_item_id: "balai", quantity: 0 }],
    })
  })
  it("remise : 0, décimal ou négatif refusés ; lignes sans produit ignorées", () => {
    expect(parseFormLines("handover", [{ inventory_item_id: "balai", quantity: "0" }])).toEqual({ error: "Quantité invalide : nombre entier positif." })
    expect(parseFormLines("handover", [{ inventory_item_id: "balai", quantity: "1.5" }])).toEqual({ error: "Quantité invalide : nombre entier positif." })
    expect(parseFormLines("handover", [{ inventory_item_id: "", quantity: "" }, { inventory_item_id: "seau", quantity: "2" }])).toEqual({
      lines: [{ inventory_item_id: "seau", quantity: 2 }],
    })
    expect(parseFormLines("handover", [{ inventory_item_id: "", quantity: "" }])).toEqual({ error: "Ajoutez au moins un produit." })
  })
  it("correction : un produit saisi deux fois est refusé", () => {
    expect(
      parseFormLines("adjustment", [
        { inventory_item_id: "balai", quantity: "1" },
        { inventory_item_id: "balai", quantity: "3" },
      ])
    ).toEqual({ error: "Ce produit est saisi deux fois : gardez une seule ligne." })
  })
  it("correction : quantité manquante prioritaire sur le doublon", () => {
    expect(
      parseFormLines("adjustment", [
        { inventory_item_id: "balai", quantity: "" },
        { inventory_item_id: "balai", quantity: "3" },
      ])
    ).toEqual({ error: "Quantité manquante." })
  })
  it("remise : doublons acceptés (additionnés par le serveur)", () => {
    expect(
      parseFormLines("handover", [
        { inventory_item_id: "balai", quantity: "1" },
        { inventory_item_id: "balai", quantity: "2" },
      ])
    ).toEqual({ lines: [{ inventory_item_id: "balai", quantity: 1 }, { inventory_item_id: "balai", quantity: 2 }] })
  })
  it("quantité saisie sans produit choisi : refusée", () => {
    expect(parseFormLines("handover", [{ inventory_item_id: "", quantity: "2" }])).toEqual({ error: "Choisissez le produit dans la liste." })
    expect(
      parseFormLines("handover", [
        { inventory_item_id: "seau", quantity: "1" },
        { inventory_item_id: "", quantity: "2" },
      ])
    ).toEqual({ error: "Choisissez le produit dans la liste." })
  })
  it("texte tapé sans produit choisi : refusé, même sans quantité", () => {
    expect(parseFormLines("return", [{ inventory_item_id: "", quantity: "", search: "bal" }])).toEqual({ error: "Choisissez le produit dans la liste." })
    expect(
      parseFormLines("adjustment", [
        { inventory_item_id: "seau", quantity: "1", search: "Seau" },
        { inventory_item_id: "", quantity: "", search: "bal" },
      ])
    ).toEqual({ error: "Choisissez le produit dans la liste." })
  })
  it("ligne entièrement vide (texte blanc compris) : ignorée", () => {
    expect(
      parseFormLines("handover", [
        { inventory_item_id: "", quantity: " ", search: "  " },
        { inventory_item_id: "seau", quantity: "2", search: "Seau" },
      ])
    ).toEqual({ lines: [{ inventory_item_id: "seau", quantity: 2 }] })
  })
})

describe("readableError", () => {
  it("erreur réseau : message en français", () => {
    expect(readableError(new TypeError("Failed to fetch"))).toBe("Service injoignable, réessayez.")
    expect(readableError(new TypeError("NetworkError when attempting to fetch resource."))).toBe("Service injoignable, réessayez.")
  })
  it("autre erreur : message d'origine, ou texte par défaut si vide", () => {
    expect(readableError(new Error("Erreur 500"))).toBe("Erreur 500")
    expect(readableError(new Error(""))).toBe("Chargement impossible.")
  })
})
