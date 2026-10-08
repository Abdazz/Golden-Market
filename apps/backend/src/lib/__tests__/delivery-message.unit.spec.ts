import { buildCourierMessage, sendCourierMessage } from "../delivery-message"

describe("buildCourierMessage", () => {
  it("livraison à Ouaga : destination, produit, quantité et montant à encaisser", () => {
    expect(
      buildCourierMessage({
        customerName: "Marina",
        customerPhone: "+22670305367",
        type: "express",
        address: "Tampouy,\nvers la station SOGELB",
        transportCompany: null,
        destinationCity: null,
        items: [{ title: "Balai éponge avec seau", quantity: 1 }],
        amountToCollect: 9500,
      })
    ).toEqual({
      template_name: "livraison_livreur_ouaga",
      params: ["Marina", "22670305367", "Tampouy, vers la station SOGELB", "Balai éponge avec seau", "1", "9 500"],
    })
  })

  it("expédition : ville et compagnie, sans montant", () => {
    expect(
      buildCourierMessage({
        customerName: "Marina", customerPhone: "22670305367", type: "expedition",
        address: null, transportCompany: "Rahimo", destinationCity: "Bobo",
        items: [{ title: "Balai éponge avec seau", quantity: 1 }], amountToCollect: 0,
      })
    ).toEqual({
      template_name: "livraison_livreur_expedition",
      params: ["Marina", "22670305367", "Bobo", "Rahimo", "Balai éponge avec seau", "1"],
    })
  })

  it("plusieurs articles : quantité de chacun dans le produit, total en quantité", () => {
    const { params } = buildCourierMessage({
      customerName: "Ali", customerPhone: "+22676000000", type: "express", address: "Pissy",
      transportCompany: null, destinationCity: null,
      items: [{ title: "Balai", quantity: 1 }, { title: "Seau", quantity: 2 }], amountToCollect: 0,
    })
    expect(params.slice(3)).toEqual(["Balai (x1), Seau (x2)", "3", "0"])
  })
})

describe("sendCourierMessage", () => {
  it("appelle le webhook n8n générique avec le modèle choisi", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await sendCourierMessage({ phone: "+22670000000", template_name: "livraison_livreur_ouaga", params: ["a", "b"] }, { url: "https://n8n/x", secret: "s", fetchImpl })
    expect(result).toEqual({ ok: true })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ phone: "+22670000000", template_name: "livraison_livreur_ouaga", params: ["a", "b"] })
    expect(fetchImpl.mock.calls[0][1].headers["x-webhook-secret"]).toBe("s")
  })

  it("renvoie l'erreur sans lever si n8n refuse ou si la configuration manque", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 502 })
    expect(await sendCourierMessage({ phone: "+226", template_name: "t", params: [] }, { url: "https://n8n/x", secret: "s", fetchImpl })).toEqual({ ok: false, error: "Webhook n8n a répondu 502" })
    expect((await sendCourierMessage({ phone: "+226", template_name: "t", params: [] }, { url: undefined, secret: undefined, fetchImpl })).ok).toBe(false)
  })
})
