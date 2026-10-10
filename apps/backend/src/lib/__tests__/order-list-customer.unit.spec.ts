import { withPhoneAsCustomerName } from "../order-list-customer"

describe("withPhoneAsCustomerName", () => {
  it("client sans prénom ni nom : son numéro WhatsApp remplace le nom affiché", () => {
    const body = { orders: [{ id: "o1", customer: { first_name: "", last_name: null, email: null, phone: "+22670000000" } }] }
    expect(withPhoneAsCustomerName(body).orders[0].customer.first_name).toBe("+22670000000")
  })

  it("client sans numéro sur sa fiche : numéro de l'adresse de livraison", () => {
    const body = { orders: [{ id: "o1", customer: { first_name: null, last_name: null, phone: null }, shipping_address: { phone: "+22671111111" } }] }
    expect(withPhoneAsCustomerName(body).orders[0].customer.first_name).toBe("+22671111111")
  })

  it("prénom ou nom renseigné, ou aucun numéro : inchangé", () => {
    const body = {
      orders: [
        { id: "o1", customer: { first_name: "Awa", last_name: "", phone: "+22670000000" } },
        { id: "o2", customer: { first_name: "", last_name: "Ouédraogo", phone: "+22670000000" } },
        { id: "o3", customer: { first_name: "", last_name: "", phone: null } },
        { id: "o4", customer: null },
      ],
    }
    const result = withPhoneAsCustomerName(body)
    expect(result.orders.map((o: any) => o.customer?.first_name ?? null)).toEqual(["Awa", "", "", null])
  })

  it("corps sans liste de commandes : renvoyé tel quel", () => {
    expect(withPhoneAsCustomerName({ message: "erreur" })).toEqual({ message: "erreur" })
    expect(withPhoneAsCustomerName(null)).toBeNull()
  })
})

describe("withGoldenMarketOrderNumber", () => {
  const { withGoldenMarketOrderNumber } = require("../order-list-customer")
  it("la colonne Commande affiche le numéro Golden Market à la place du numéro natif", () => {
    const body = { orders: [{ id: "o1", display_id: 13, custom_display_id: "20261006001" }] }
    expect(withGoldenMarketOrderNumber(body).orders[0].display_id).toBe("20261006001")
  })
  it("commande sans numéro Golden Market (non demandé ou absent) : numéro natif conservé", () => {
    const body = { orders: [{ id: "o1", display_id: 3 }, { id: "o2", display_id: 4, custom_display_id: null }] }
    expect(withGoldenMarketOrderNumber(body).orders.map((o: any) => o.display_id)).toEqual([3, 4])
  })
  it("fiche commande : l'en-tête affiche le numéro Golden Market à la place du numéro natif", () => {
    const body = { order: { id: "o1", display_id: 25, custom_display_id: "20261010012" } }
    expect(withGoldenMarketOrderNumber(body).order.display_id).toBe("20261010012")
  })
  it("fiche sans numéro Golden Market, ou corps sans commande : inchangé", () => {
    expect(withGoldenMarketOrderNumber({ order: { display_id: 1 } })).toEqual({ order: { display_id: 1 } })
    expect(withGoldenMarketOrderNumber({ message: "erreur" })).toEqual({ message: "erreur" })
    expect(withGoldenMarketOrderNumber(null)).toBeNull()
  })
})
