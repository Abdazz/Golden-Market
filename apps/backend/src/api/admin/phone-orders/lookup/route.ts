import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizePhone } from "../../../../lib/normalize-phone"

// Pré-remplissage du formulaire "Nouvelle commande" : client déjà connu pour
// ce numéro WhatsApp (nom) et adresse de sa dernière commande.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let phone: string
  try {
    phone = normalizePhone(String(req.query.phone ?? ""))
  } catch {
    res.json({ found: false })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "first_name", "last_name"],
    filters: { phone },
  })
  const customer = customers[0]
  if (!customer) {
    res.json({ found: false, phone })
    return
  }
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "created_at", "shipping_address.address_1", "shipping_address.city"],
    filters: { customer_id: customer.id },
  })
  const last = [...orders].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]
  res.json({
    found: true,
    phone,
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    address: last?.shipping_address?.address_1 ?? "",
    city: last?.shipping_address?.city ?? "",
  })
}
