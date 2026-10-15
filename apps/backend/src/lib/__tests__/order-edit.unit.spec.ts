jest.mock("@medusajs/medusa/core-flows", () => ({}))
jest.mock("../../workflows/update-delivery", () => ({}))
import { itemChanges, notDeletableReason, notEditableReason } from "../order-edit"

describe("itemChanges", () => {
  const existing = [
    { id: "li_1", variant_id: "var_a", quantity: 1 },
    { id: "li_2", variant_id: "var_b", quantity: 2 },
  ]

  it("quantité changée, article retiré (0) et nouvel article", () => {
    expect(
      itemChanges(existing, [
        { variant_id: "var_a", quantity: 3 },
        { variant_id: "var_c", quantity: 1 },
      ])
    ).toEqual({ updates: [{ id: "li_1", quantity: 3 }, { id: "li_2", quantity: 0 }], additions: [{ variant_id: "var_c", quantity: 1 }] })
  })

  it("rien de changé : aucune modification", () => {
    expect(
      itemChanges(existing, [
        { variant_id: "var_a", quantity: 1 },
        { variant_id: "var_b", quantity: 2 },
      ])
    ).toEqual({ updates: [], additions: [] })
  })

  it("deux lignes pour la même variante : la seconde est retirée", () => {
    expect(
      itemChanges(
        [
          { id: "li_1", variant_id: "var_a", quantity: 1 },
          { id: "li_2", variant_id: "var_a", quantity: 1 },
        ],
        [{ variant_id: "var_a", quantity: 1 }]
      )
    ).toEqual({ updates: [{ id: "li_2", quantity: 0 }], additions: [] })
  })
})

describe("notEditableReason", () => {
  const unpaid = { status: "pending", total: 9500, summary: { pending_difference: 9500 }, fulfillments: [] }

  it("commande non payée, non livrée : modifiable", () => {
    expect(notEditableReason(unpaid, [{ status: "assigned" }])).toBeNull()
  })
  it("annulée, payée, livrée ou expédiée : bloquée", () => {
    expect(notEditableReason({ ...unpaid, status: "canceled" }, [])).toBe("Commande annulée.")
    expect(notEditableReason({ ...unpaid, summary: { pending_difference: 0 } }, [])).toBe("Commande déjà payée.")
    expect(notEditableReason(unpaid, [{ status: "delivered" }])).toBe("Commande déjà livrée ou expédiée.")
    expect(notEditableReason({ ...unpaid, fulfillments: [{ shipped_at: "2026-10-12" }] }, [])).toBe("Commande déjà livrée ou expédiée.")
  })
})

describe("notDeletableReason", () => {
  const manual = { status: "pending", total: 1000, summary: { pending_difference: 1000 }, metadata: { source: "telephone" } }
  it("commande saisie à la main, non payée, non livrée : supprimable", () => {
    expect(notDeletableReason(manual, [{ status: "assigned" }])).toBeNull()
  })
  it("commande du site ou de WhatsApp : refusée", () => {
    expect(notDeletableReason({ ...manual, metadata: { source: "whatsapp" } }, [])).toMatch(/saisie à la main/)
  })
  it("payée : refusée", () => {
    expect(notDeletableReason({ ...manual, summary: { pending_difference: 0 } }, [])).toMatch(/payée/)
  })
  it("livrée : refusée", () => {
    expect(notDeletableReason(manual, [{ status: "delivered" }])).toMatch(/livrée/)
  })
})
