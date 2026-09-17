import {
  hashForMeta,
  normalizePhoneForMeta,
  buildPurchaseEvent,
  type OrderForMetaConversion,
} from "../meta-conversions-mapping"

describe("hashForMeta", () => {
  it("returns the lowercase SHA-256 hex digest of the trimmed, lowercased value", () => {
    // Valeur de référence calculée indépendamment (node -e "require('crypto')
    // .createHash('sha256').update('22670123456').digest('hex')").
    expect(hashForMeta("22670123456")).toBe(
      "e93e141a26c66fc5f447db56b137509c6cd48b076e3bbb2995305e2d5feb3a1c"
    )
  })
})

describe("normalizePhoneForMeta", () => {
  it("strips spaces and non-digit characters", () => {
    expect(normalizePhoneForMeta("70 12 34 56")).toBe("22670123456")
  })

  it("prepends the Burkina Faso country code to a local 8-digit number", () => {
    expect(normalizePhoneForMeta("70123456")).toBe("22670123456")
  })

  it("leaves a number already carrying the country code untouched", () => {
    expect(normalizePhoneForMeta("22670123456")).toBe("22670123456")
  })

  it("returns null when there is no phone at all", () => {
    expect(normalizePhoneForMeta(undefined)).toBeNull()
  })
})

describe("buildPurchaseEvent", () => {
  const order: OrderForMetaConversion = {
    id: "order_1",
    currency_code: "xof",
    total: 15000,
    shipping_address: { phone: "70123456" },
    items: [{ variant_id: "variant_1", quantity: 2 }],
  }

  it("builds a Purchase event with the order id as event_id for client/server dedup", () => {
    const event = buildPurchaseEvent(order, 1700000000)

    expect(event.event_name).toBe("Purchase")
    expect(event.event_id).toBe("order_1")
    expect(event.event_time).toBe(1700000000)
    expect(event.action_source).toBe("website")
    expect(event.custom_data).toEqual({
      currency: "XOF",
      value: 15000,
      content_type: "product",
      contents: [{ id: "variant_1", quantity: 2 }],
    })
  })

  it("uses the variant id (not the product id) so contents match the catalog's retailer_id", () => {
    // Le flux /meta-catalog-feed publie une ligne par variante avec
    // id = variant.id (voir meta-catalog-mapping.ts) - envoyer product_id
    // ici casserait la correspondance catalogue/évènements dans le
    // Gestionnaire des ventes (taux de correspondance).
    const event = buildPurchaseEvent(
      { ...order, items: [{ variant_id: "variant_42", quantity: 1 }] },
      1700000000
    )

    expect(event.custom_data.contents).toEqual([
      { id: "variant_42", quantity: 1 },
    ])
  })

  it("includes a hashed phone in user_data when the order has one", () => {
    const event = buildPurchaseEvent(order, 1700000000)
    expect(event.user_data.ph).toEqual([hashForMeta("22670123456")])
  })

  it("omits ph from user_data when the order has no phone", () => {
    const event = buildPurchaseEvent({ ...order, shipping_address: {} }, 1700000000)
    expect(event.user_data.ph).toBeUndefined()
  })
})
