import { buildCourierMessage, courierMessageText, renderCourierMessage } from "../courier-message-text"

describe("courier-message-text", () => {
  it("rend le modèle livraison_livreur_ouaga avec les paramètres", () => {
    expect(
      renderCourierMessage({
        template_name: "livraison_livreur_ouaga",
        params: ["Marina", "22670305367", "Tampouy, vers la station SOGELB", "Balai éponge avec seau", "1", "9 500"],
      })
    ).toBe(
      [
        "🛵 NOUVELLE COMMANDE — Golden Market",
        "👤 Client : Marina",
        "📞 Téléphone : 22670305367",
        "📍 Destination : Tampouy, vers la station SOGELB",
        "📦 Produit : Balai éponge avec seau",
        "🔢 Quantité : 1",
        "💰 Montant à encaisser : 9 500 F CFA",
      ].join("\n")
    )
  })

  it("rend le modèle livraison_livreur_expedition et finit par Merci", () => {
    const text = renderCourierMessage({
      template_name: "livraison_livreur_expedition",
      params: ["Marina", "22670305367", "Bobo-Dioulasso", "STAF", "Balai éponge avec seau", "2"],
    })
    expect(text).toBe(
      [
        "🛵 NOUVELLE COMMANDE — Golden Market",
        "👤 Client : Marina",
        "📞 Téléphone : 22670305367",
        "📍 Expédition : Bobo-Dioulasso",
        "🚚 Compagnie de transport : STAF",
        "📦 Produit : Balai éponge avec seau",
        "🔢 Quantité : 2",
        "",
        "Merci 🙏",
      ].join("\n")
    )
    expect(text.endsWith("\n\nMerci 🙏")).toBe(true)
  })

  it("remplace un paramètre manquant par une chaîne vide", () => {
    const text = renderCourierMessage({ template_name: "livraison_livreur_ouaga", params: ["Marina"] })
    expect(text).toContain("👤 Client : Marina")
    expect(text).toContain("📞 Téléphone : \n")
    expect(text).toContain("💰 Montant à encaisser :  F CFA")
    expect(text).not.toContain("{{")
  })

  it("renvoie les paramètres l'un sous l'autre pour un modèle inconnu, sans exception", () => {
    expect(renderCourierMessage({ template_name: "inconnu", params: ["a", "b"] })).toBe("a\nb")
  })

  it("courierMessageText est le rendu de buildCourierMessage", () => {
    const input = {
      customerName: "Marina",
      customerPhone: "+22670305367",
      type: "express" as const,
      address: "Tampouy",
      transportCompany: null,
      destinationCity: null,
      items: [{ title: "Balai éponge avec seau", quantity: 1 }],
      amountToCollect: 9500,
    }
    expect(courierMessageText(input)).toBe(renderCourierMessage(buildCourierMessage(input)))
    expect(courierMessageText(input)).toContain("💰 Montant à encaisser : 9 500 F CFA")
  })
})
