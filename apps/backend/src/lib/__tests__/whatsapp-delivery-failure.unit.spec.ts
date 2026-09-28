import { deliveryFailureLabel, lastWindowFailureAt } from "../whatsapp-delivery-failure"

describe("deliveryFailureLabel", () => {
  it("rien quand le message n'a pas échoué", () => {
    expect(deliveryFailureLabel(null)).toBeNull()
  })
  it("fenêtre de 24 h dépassée (131047) : explication en clair", () => {
    expect(deliveryFailureLabel("131047: Message failed to send because more than 24 hours have passed")).toBe(
      "Non envoyé : plus de 24 h depuis le dernier message du client. Envoyez le message de relance."
    )
  })
  it("autre erreur : raison de Meta et code", () => {
    expect(deliveryFailureLabel("131053: Media upload error")).toBe("Non envoyé : Media upload error (code 131053)")
    expect(deliveryFailureLabel("erreur inconnue")).toBe("Non envoyé : erreur inconnue")
  })
})

describe("lastWindowFailureAt", () => {
  it("date du dernier refus pour fenêtre dépassée, ignore les autres erreurs", () => {
    const a = new Date("2026-09-28T20:23:22Z")
    const b = new Date("2026-09-28T20:36:55Z")
    expect(
      lastWindowFailureAt([
        { createdAt: a, deliveryError: "131047: x" },
        { createdAt: new Date("2026-09-28T21:00:00Z"), deliveryError: "131053: y" },
        { createdAt: b, deliveryError: "131047: x" },
        { createdAt: new Date("2026-09-28T22:00:00Z"), deliveryError: null },
      ])
    ).toEqual(b)
    expect(lastWindowFailureAt([{ createdAt: a, deliveryError: null }])).toBeNull()
  })
})
