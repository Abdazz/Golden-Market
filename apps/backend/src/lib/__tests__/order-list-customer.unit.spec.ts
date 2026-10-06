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
