import { buildCourierMessageParams, sendCourierMessage } from "../delivery-message"

describe("buildCourierMessageParams", () => {
  it("livraison express : adresse et montant à encaisser", () => {
    expect(
      buildCourierMessageParams({
        orderNumber: "20260928001",
        customerName: "Awa Ouédraogo",
        customerPhone: "+22670000000",
        type: "express",
        address: "Pissy,\nprès de la pharmacie",
        transportCompany: null,
        destinationCity: null,
        items: [{ title: "Balai-éponge (Avec seau)", quantity: 1 }, { title: "Seau", quantity: 2 }],
        amountToCollect: 9500,
      })
    ).toEqual([
      "20260928001",
      "Awa Ouédraogo, +22670000000",
      "Pissy, près de la pharmacie",
      "1 x Balai-éponge (Avec seau), 2 x Seau",
      "À encaisser : 9 500 F",
    ])
  })

  it("expédition : compagnie et destination, rien à encaisser", () => {
    const params = buildCourierMessageParams({
      orderNumber: "20260928002", customerName: "Ali", customerPhone: "+22676000000", type: "expedition",
      address: null, transportCompany: "STAF", destinationCity: "Bobo-Dioulasso",
      items: [{ title: "Ventilateur", quantity: 1 }], amountToCollect: 0,
    })
    expect(params[2]).toBe("Expédition STAF vers Bobo-Dioulasso")
    expect(params[4]).toBe("Rien à encaisser")
  })
})

describe("sendCourierMessage", () => {
  it("appelle le webhook n8n générique avec le modèle livraison_livreur", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await sendCourierMessage({ phone: "+22670000000", params: ["a", "b", "c", "d", "e"] }, { url: "https://n8n/x", secret: "s", fetchImpl })
    expect(result).toEqual({ ok: true })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ phone: "+22670000000", template_name: "livraison_livreur", params: ["a", "b", "c", "d", "e"] })
    expect(fetchImpl.mock.calls[0][1].headers["x-webhook-secret"]).toBe("s")
  })

  it("renvoie l'erreur sans lever si n8n refuse ou si la configuration manque", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 502 })
    expect(await sendCourierMessage({ phone: "+226", params: [] }, { url: "https://n8n/x", secret: "s", fetchImpl })).toEqual({ ok: false, error: "Webhook n8n a répondu 502" })
    expect((await sendCourierMessage({ phone: "+226", params: [] }, { url: undefined, secret: undefined, fetchImpl })).ok).toBe(false)
  })
})
