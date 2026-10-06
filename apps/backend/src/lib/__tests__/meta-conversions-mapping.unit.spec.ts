import {
  hashForMeta,
  normalizePhoneForMeta,
  buildPurchaseEvent,
  actionSourceFor,
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

describe("actionSourceFor", () => {
  const off = { whatsappEventsConfigured: false }
  const on = { whatsappEventsConfigured: true }
  it("téléphone : phone_call", () => {
    expect(actionSourceFor({ source: "telephone" }, off)).toBe("phone_call")
  })
  it("WhatsApp avec ctwa_clid et configuration : business_messaging", () => {
    expect(actionSourceFor({ source: "whatsapp", ctwa_clid: "ARxx" }, on)).toBe("business_messaging")
  })
  it("WhatsApp sans ctwa_clid ou sans configuration : chat", () => {
    expect(actionSourceFor({ source: "whatsapp" }, on)).toBe("chat")
    expect(actionSourceFor({ source: "whatsapp", ctwa_clid: "ARxx" }, off)).toBe("chat")
    expect(actionSourceFor({ source: "whatsapp", ctwa_clid: "" }, on)).toBe("chat")
  })
  it("site ou métadonnées absentes : website", () => {
    expect(actionSourceFor({}, on)).toBe("website")
    expect(actionSourceFor(null, on)).toBe("website")
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

  it("recalcule la valeur depuis les articles et la livraison quand order.total vaut encore 0", () => {
    // Juste après order.placed, order.total peut valoir 0 (constaté sur les
    // commandes prises par téléphone le 2026-09-27) : Meta recevait un achat à 0 F.
    const event = buildPurchaseEvent(
      {
        ...order,
        total: 0,
        items: [{ variant_id: "variant_1", quantity: 2, unit_price: 6500 }],
        shipping_methods: [{ amount: 500 }],
      },
      1700000000
    )

    expect(event.custom_data.value).toBe(13500)
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

  it("buildPurchaseEvent : action_source phone_call pour une commande par téléphone", () => {
    const event = buildPurchaseEvent({ ...order, metadata: { source: "telephone" } }, 1700000000)
    expect(event.action_source).toBe("phone_call")
  })
})

describe("buildPurchaseEvent - sources", () => {
  const base: OrderForMetaConversion = {
    id: "order_1",
    currency_code: "xof",
    total: 9500,
    shipping_address: { phone: "70123456", country_code: "bf" },
    items: [{ variant_id: "variant_1", quantity: 1 }],
  }

  it("site : URL de la page de confirmation et données navigateur", () => {
    const event = buildPurchaseEvent(
      { ...base, metadata: { meta_browser: { user_agent: "Mozilla/5.0", client_ip: "102.1.2.3", fbp: "fb.1.1.1", fbc: "fb.1.1.abc" } } },
      1700000000,
      { storefrontUrl: "https://golden-market.co/" }
    )
    expect(event.action_source).toBe("website")
    expect(event.event_source_url).toBe("https://golden-market.co/bf/order/order_1/confirmed")
    expect(event.user_data).toEqual(
      expect.objectContaining({ client_user_agent: "Mozilla/5.0", client_ip_address: "102.1.2.3", fbp: "fb.1.1.1", fbc: "fb.1.1.abc" })
    )
    expect(event.user_data.ph).toHaveLength(1)
  })

  it("site sans données navigateur ni URL de boutique : champs omis, jamais vides", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { meta_browser: { user_agent: "", fbp: "fb.1" } } }, 1700000000, {})
    expect(event.event_source_url).toBeUndefined()
    expect(event.user_data).not.toHaveProperty("client_user_agent")
    expect(event.user_data).not.toHaveProperty("client_ip_address")
    expect(event.user_data.fbp).toBe("fb.1")
  })

  it("site : meta_browser non objet (texte, null) ignoré sans exception", () => {
    for (const meta_browser of ["texte", null]) {
      const event = buildPurchaseEvent({ ...base, metadata: { meta_browser } }, 1700000000, {})
      expect(event.action_source).toBe("website")
      expect(event.user_data).not.toHaveProperty("client_user_agent")
      expect(event.user_data).not.toHaveProperty("client_ip_address")
      expect(event.user_data).not.toHaveProperty("fbp")
      expect(event.user_data).not.toHaveProperty("fbc")
    }
  })

  it("site : slash final de l'URL et pays en majuscules normalisés", () => {
    const event = buildPurchaseEvent(
      { ...base, shipping_address: { phone: "70123456", country_code: "BF" } },
      1700000000,
      { storefrontUrl: "https://golden-market.co/" }
    )
    expect(event.event_source_url).toBe("https://golden-market.co/bf/order/order_1/confirmed")
  })

  it("WhatsApp attribuée : business_messaging avec compte et ctwa_clid, sans champ web", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { source: "whatsapp", ctwa_clid: "ARclid" } }, 1700000000, {
      storefrontUrl: "https://golden-market.co",
      whatsappBusinessAccountId: "waba_1",
      whatsappEventsConfigured: true,
    })
    expect(event.action_source).toBe("business_messaging")
    expect(event.messaging_channel).toBe("whatsapp")
    expect(event.user_data).toEqual(expect.objectContaining({ whatsapp_business_account_id: "waba_1", ctwa_clid: "ARclid" }))
    expect(event.event_source_url).toBeUndefined()
  })

  it("source forcée (renvoi après refus) : chat sans champ business_messaging", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { source: "whatsapp", ctwa_clid: "ARclid" } }, 1700000000, {
      whatsappBusinessAccountId: "waba_1",
      whatsappEventsConfigured: true,
      forceActionSource: "chat",
    })
    expect(event.action_source).toBe("chat")
    expect(event).not.toHaveProperty("messaging_channel")
    expect(event.user_data).not.toHaveProperty("ctwa_clid")
    expect(event.user_data).not.toHaveProperty("whatsapp_business_account_id")
  })

  it("téléphone : phone_call, pas d'URL de page", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { source: "telephone" } }, 1700000000, { storefrontUrl: "https://golden-market.co" })
    expect(event.action_source).toBe("phone_call")
    expect(event.event_source_url).toBeUndefined()
  })
})
