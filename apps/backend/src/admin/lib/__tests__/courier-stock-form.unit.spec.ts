import { parseFormLines } from "../courier-stock-form"

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
})
