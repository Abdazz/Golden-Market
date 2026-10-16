import { deliveredActionAt, paidActionAt, undoRefusal, undoStatus, type UndoFacts } from "../undo-rules"

const T0 = "2026-10-15T08:00:00.000Z"
const at = (hours: number) => new Date(new Date(T0).getTime() + hours * 3600 * 1000)

const facts = (over: Partial<UndoFacts> = {}): UndoFacts => ({
  canceled: false,
  paid: true,
  refunded: false,
  finalSaleAt: null,
  captureDates: [],
  deliveries: [],
  fulfillments: [],
  ...over,
})

describe("paidActionAt", () => {
  it("jamais payée : null", () => {
    expect(paidActionAt(facts())).toBeNull()
  })
  it("formulaire seul : date de la vente finale", () => {
    expect(paidActionAt(facts({ finalSaleAt: T0 }))?.toISOString()).toBe(T0)
  })
  it("payée à la fin d'une livraison : date de capture", () => {
    expect(paidActionAt(facts({ captureDates: [T0] }))?.toISOString()).toBe(T0)
  })
  it("la plus récente des deux", () => {
    const later = at(5).toISOString()
    expect(paidActionAt(facts({ finalSaleAt: T0, captureDates: [later] }))?.toISOString()).toBe(later)
    expect(paidActionAt(facts({ finalSaleAt: later, captureDates: [T0] }))?.toISOString()).toBe(later)
  })
})

describe("deliveredActionAt", () => {
  it("dernière livraison livrée / expédiée", () => {
    const d = deliveredActionAt(
      facts({
        deliveries: [
          { status: "failed", completed_at: at(10).toISOString() },
          { status: "delivered", completed_at: T0 },
        ],
        fulfillments: [{ shipped_at: at(20).toISOString(), delivered_at: null, canceled_at: null }],
      })
    )
    expect(d?.toISOString()).toBe(T0)
  })
  it("sans livraison : date de livraison (ou d'expédition) Medusa, expéditions annulées ignorées", () => {
    expect(
      deliveredActionAt(
        facts({
          fulfillments: [
            { shipped_at: T0, delivered_at: at(1).toISOString(), canceled_at: null },
            { shipped_at: at(9).toISOString(), delivered_at: null, canceled_at: at(9).toISOString() },
          ],
        })
      )?.toISOString()
    ).toBe(at(1).toISOString())
    expect(deliveredActionAt(facts({ fulfillments: [{ shipped_at: T0, delivered_at: null, canceled_at: null }] }))?.toISOString()).toBe(T0)
  })
  it("non livrée : null", () => {
    expect(deliveredActionAt(facts({ deliveries: [{ status: "assigned", completed_at: null }] }))).toBeNull()
  })
})

describe("undoStatus", () => {
  const delivered = facts({ finalSaleAt: T0, deliveries: [{ status: "delivered", completed_at: T0 }] })
  it("fenêtre ouverte jusqu'à 24 h exactement (incluse)", () => {
    expect(undoStatus(delivered, at(24))).toEqual({
      paid: { available: true, until: "2026-10-16T08:00:00.000Z" },
      delivered: { available: true, until: "2026-10-16T08:00:00.000Z" },
    })
  })
  it("au-delà de 24 h : indisponible", () => {
    const s = undoStatus(delivered, new Date(at(24).getTime() + 1000))
    expect(s.paid.available).toBe(false)
    expect(s.delivered.available).toBe(false)
  })
  it("commande annulée, non payée, remboursée ou non livrée : indisponible", () => {
    expect(undoStatus({ ...delivered, canceled: true }, at(1))).toEqual({
      paid: { available: false, until: null },
      delivered: { available: false, until: null },
    })
    expect(undoStatus({ ...delivered, paid: false }, at(1)).paid.available).toBe(false)
    expect(undoStatus({ ...delivered, refunded: true }, at(1)).paid.available).toBe(false)
    expect(undoStatus({ ...delivered, deliveries: [] }, at(1)).delivered.available).toBe(false)
  })
})

describe("undoRefusal", () => {
  const ok = facts({ finalSaleAt: T0, deliveries: [{ status: "delivered", completed_at: T0 }] })
  it("dans la fenêtre : aucun refus", () => {
    expect(undoRefusal("paid", ok, at(2))).toBeNull()
    expect(undoRefusal("delivered", ok, at(2))).toBeNull()
  })
  it("messages lisibles", () => {
    expect(undoRefusal("paid", { ...ok, canceled: true }, at(1))).toMatch(/annulée/)
    expect(undoRefusal("paid", { ...ok, paid: false }, at(1))).toMatch(/pas payée/)
    expect(undoRefusal("paid", { ...ok, refunded: true }, at(1))).toMatch(/rembours/)
    expect(undoRefusal("delivered", { ...ok, deliveries: [] }, at(1))).toMatch(/pas livrée/)
    expect(undoRefusal("paid", ok, at(25))).toMatch(/^Délai de 24 h dépassé/)
    expect(undoRefusal("delivered", ok, at(25))).toMatch(/^Délai de 24 h dépassé/)
  })
})
