import {
  cancelCashEntry,
  inventoryAdjustments,
  lineCosts,
  margin,
  orderCashEntry,
  parseLine,
} from "../procurement-rules"

const params = { exchange_rate: 670, fee_rate: 0.0299 }

describe("lineCosts (formules de la feuille Sourcing)", () => {
  it("Détendeur musculaire : 20 x 1,32 $, transport 6 000 F, pub 36 $", () => {
    const c = lineCosts({ quantity: 20, unit_price_usd: 1.32, freight_usd: 0, transport_xof: 6000, ads_usd: 36 }, params)
    expect(c.purchaseUsd).toBeCloseTo(27.18936, 5)
    expect(c.costTotal).toBeCloseTo(48336.8712, 3)
    expect(c.unitCost).toBeCloseTo(2416.84356, 4)
    // Caisse : achat + transport, sans la pub (suivie à part au journal).
    expect(c.cashOut).toBeCloseTo(27.18936 * 670 + 6000, 3)
  })

  it("Kit montre connectée : fret inclus dans les frais de transaction", () => {
    const c = lineCosts({ quantity: 5, unit_price_usd: 9, freight_usd: 5, transport_xof: 27500, ads_usd: 8 }, params)
    expect(c.purchaseUsd).toBeCloseTo(51.495, 5)
    expect(c.costTotal).toBeCloseTo(67361.65, 2)
    expect(c.unitCost).toBeCloseTo(13472.33, 2)
  })
})

describe("margin", () => {
  it("marge unitaire et pourcentage sur le prix de revient", () => {
    const m = margin(2416.84356, 6500)
    expect(m.unit).toBeCloseTo(4083.15644, 4)
    expect(m.percent).toBeCloseTo(1.6894, 3)
  })
  it("sans coût ou sans prix : null", () => {
    expect(margin(null, 6500)).toEqual({ unit: null, percent: null })
    expect(margin(1000, null)).toEqual({ unit: null, percent: null })
  })
})

describe("parseLine", () => {
  it("accepte une ligne valide (virgule décimale acceptée)", () => {
    expect(parseLine({ variant_id: "variant_1", title: "Balai", quantity: "20", unit_price_usd: "1,32", freight_usd: "", transport_xof: "6000", ads_usd: "36" })).toEqual({
      ok: true,
      values: { variant_id: "variant_1", title: "Balai", quantity: 20, unit_price_usd: 1.32, freight_usd: 0, transport_xof: 6000, ads_usd: 36 },
    })
  })
  it("refuse quantité nulle ou décimale, prix négatif, variante absente", () => {
    expect(parseLine({ variant_id: "v", title: "x", quantity: 0, unit_price_usd: 1 }).ok).toBe(false)
    expect(parseLine({ variant_id: "v", title: "x", quantity: 1.5, unit_price_usd: 1 }).ok).toBe(false)
    expect(parseLine({ variant_id: "v", title: "x", quantity: 2, unit_price_usd: -1 }).ok).toBe(false)
    expect(parseLine({ variant_id: "", title: "x", quantity: 2, unit_price_usd: 1 }).ok).toBe(false)
  })
})

describe("inventoryAdjustments", () => {
  it("kit : chaque article d'inventaire augmente de quantité x quantité requise", () => {
    const adjustments = inventoryAdjustments(
      [
        { variant_id: "v_kit", quantity: 10 },
        { variant_id: "v_simple", quantity: 5 },
      ],
      {
        v_kit: [
          { inventory_item_id: "iitem_balai", required_quantity: 1 },
          { inventory_item_id: "iitem_seau", required_quantity: 1 },
        ],
        v_simple: [{ inventory_item_id: "iitem_balai", required_quantity: 1 }],
      },
      "sloc_1"
    )
    expect(adjustments).toEqual([
      { inventory_item_id: "iitem_balai", location_id: "sloc_1", adjustment: 15 },
      { inventory_item_id: "iitem_seau", location_id: "sloc_1", adjustment: 10 },
    ])
  })
  it("variante sans article d'inventaire : erreur claire", () => {
    expect(() => inventoryAdjustments([{ variant_id: "v_x", quantity: 1 }], {}, "sloc_1")).toThrow("Variante introuvable ou sans stock suivi")
  })
})

describe("écritures de caisse", () => {
  const order = { id: "sord_1", reference: "Alibaba 28/09", ordered_at: "2026-09-28T10:00:00Z", ...params }
  const lines = [{ quantity: 20, unit_price_usd: 1.32, freight_usd: 0, transport_xof: 6000, ads_usd: 36 }]
  it("commander : sortie « Achat de marchandises » arrondie, sans la pub", () => {
    expect(orderCashEntry(order, lines)).toEqual({
      date: new Date("2026-09-28T10:00:00Z"),
      direction: "out",
      amount: Math.round(27.18936 * 670 + 6000),
      category: "purchase",
      label: "Commande fournisseur Alibaba 28/09",
      source: "auto",
      reference: "supplier_order:sord_1",
      order_id: null,
    })
  })
  it("annulation : entrée qui contrepasse", () => {
    const entry = cancelCashEntry(order, lines, new Date("2026-09-29T10:00:00Z"))
    expect(entry).toMatchObject({ direction: "in", category: "other_in", reference: "supplier_order:sord_1:cancel", amount: Math.round(27.18936 * 670 + 6000) })
  })
})
