import { buildRestockParams, restockNotifiedChanges } from "../restock-notification"
import { sendTemplateMessage } from "../whatsapp-template-sender"

describe("buildRestockParams", () => {
  it("nom, produit, prix formaté, lien vers la fiche du site", () => {
    expect(
      buildRestockParams({ customerName: "Awa", productTitle: "Balai-éponge - Avec seau", price: 9500, handle: "balai-éponge-à-essorage" }, "https://golden-market.co")
    ).toEqual(["Awa", "Balai-éponge - Avec seau", "9 500 F", "https://golden-market.co/bf/products/balai-%C3%A9ponge-%C3%A0-essorage"])
  })
  it("sans nom : « Bonjour » ; sans prix : « voir le site »", () => {
    const params = buildRestockParams({ customerName: null, productTitle: "Seau", price: null, handle: "seau" }, "https://golden-market.co/")
    expect(params[0]).toBe("Bonjour")
    expect(params[2]).toBe("voir le site")
    expect(params[3]).toBe("https://golden-market.co/bf/products/seau")
  })
})

describe("restockNotifiedChanges", () => {
  it("passe à relancer dans 2 jours, compteur + 1, note datée", () => {
    const changes = restockNotifiedChanges({ id: "p1", follow_up_count: 1, note: "Veut le noir" }, "2026-09-28", new Date("2026-09-28T10:00:00Z"))
    expect(changes).toEqual({
      id: "p1",
      status: "to_follow_up",
      follow_up_on: "2026-09-30",
      follow_up_count: 2,
      last_contacted_at: new Date("2026-09-28T10:00:00Z"),
      note: "Prévenu du retour en stock le 28/09. Veut le noir",
    })
  })
})

describe("sendTemplateMessage", () => {
  it("envoie le modèle demandé au webhook n8n générique", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    expect(await sendTemplateMessage({ phone: "+22670000000", template_name: "retour_en_stock", params: ["a"] }, { url: "https://n8n/x", secret: "s", fetchImpl })).toEqual({ ok: true })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ phone: "+22670000000", template_name: "retour_en_stock", params: ["a"] })
  })
})
