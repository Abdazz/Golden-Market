import { automaticMessageLabel } from "../whatsapp-template-labels"

describe("automaticMessageLabel", () => {
  it("message de l'agent IA : pas de libellé de modèle", () => {
    expect(automaticMessageLabel(null)).toBeNull()
  })
  it("modèles connus : nom lisible", () => {
    expect(automaticMessageLabel("order_confirmation_from_website")).toBe("Message automatique · Confirmation de commande")
    expect(automaticMessageLabel("order_confirmation_from_whatsapp")).toBe("Message automatique · Confirmation de commande")
    expect(automaticMessageLabel("retour_en_stock")).toBe("Message automatique · Retour en stock")
    expect(automaticMessageLabel("livraison_livreur")).toBe("Message automatique · Livraison")
  })
  it("modèle inconnu : nom technique", () => {
    expect(automaticMessageLabel("nouveau_modele")).toBe("Message automatique · nouveau_modele")
  })
})
