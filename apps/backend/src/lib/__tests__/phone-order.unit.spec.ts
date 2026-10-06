import { buildDraftOrderInput, parsePhoneOrderInput } from "../phone-order"

const validBody = {
  phone: "70 00 00 00",
  first_name: "Awa",
  last_name: "Ouédraogo",
  city: "Ouagadougou",
  address: "Pissy, près de la pharmacie",
  payment_method: "cash-on-delivery",
  items: [{ variant_id: "variant_1", quantity: 2 }],
}

describe("parsePhoneOrderInput", () => {
  it("accepte une commande valide et normalise le numéro WhatsApp", () => {
    const result = parsePhoneOrderInput(validBody)

    expect(result).toEqual({
      ok: true,
      input: expect.objectContaining({ phone: "+22670000000", first_name: "Awa", payment_method: "cash-on-delivery" }),
    })
  })

  it("n'exige pas d'e-mail ni de nom de famille", () => {
    const { last_name, ...withoutLastName } = validBody
    expect(parsePhoneOrderInput(withoutLastName).ok).toBe(true)
  })

  it("prénom facultatif : absent ou vide, la commande est acceptée", () => {
    const { first_name, ...withoutFirstName } = validBody
    const absent = parsePhoneOrderInput(withoutFirstName)
    const empty = parsePhoneOrderInput({ ...validBody, first_name: "  " })
    expect(absent.ok && absent.input.first_name).toBe("")
    expect(empty.ok && empty.input.first_name).toBe("")
  })

  it("refuse un numéro invalide avec un message clair", () => {
    expect(parsePhoneOrderInput({ ...validBody, phone: "1234" })).toEqual({
      ok: false,
      message: "Numéro WhatsApp invalide (8 chiffres, avec ou sans +226).",
    })
  })

  it.each([
    [{ items: [] }, "au moins un article"],
    [{ address: "  " }, "adresse"],
    [{ payment_method: "carte" }, "moyen de paiement"],
    [{ items: [{ variant_id: "variant_1", quantity: 0 }] }, "quantité"],
  ])("refuse un formulaire incomplet %j", (patch, expected) => {
    const result = parsePhoneOrderInput({ ...validBody, ...patch })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message.toLowerCase()).toContain(expected)
  })
})

describe("buildDraftOrderInput", () => {
  it("construit un brouillon rattaché au client, sans e-mail, marqué comme commande téléphone", () => {
    const parsed = parsePhoneOrderInput(validBody)
    if (!parsed.ok) throw new Error("fixture invalide")

    const draft = buildDraftOrderInput({
      input: parsed.input,
      customerId: "cus_1",
      regionId: "reg_bf",
      currencyCode: "xof",
      salesChannelId: "sc_1",
      shippingOption: { id: "so_1", name: "Livraison — à convenir avec le marchand", amount: 0 },
    })

    expect(draft).toEqual({
      customer_id: "cus_1",
      region_id: "reg_bf",
      currency_code: "xof",
      sales_channel_id: "sc_1",
      status: "draft",
      is_draft_order: true,
      shipping_address: {
        first_name: "Awa",
        last_name: "Ouédraogo",
        address_1: "Pissy, près de la pharmacie",
        city: "Ouagadougou",
        country_code: "bf",
        phone: "+22670000000",
      },
      billing_address: {
        first_name: "Awa",
        last_name: "Ouédraogo",
        address_1: "Pissy, près de la pharmacie",
        city: "Ouagadougou",
        country_code: "bf",
        phone: "+22670000000",
      },
      items: [{ variant_id: "variant_1", quantity: 2 }],
      shipping_methods: [{ name: "Livraison — à convenir avec le marchand", shipping_option_id: "so_1", amount: 0 }],
      metadata: { source: "telephone", payment_method: "cash-on-delivery" },
    })
    expect(draft).not.toHaveProperty("email")
  })
})
