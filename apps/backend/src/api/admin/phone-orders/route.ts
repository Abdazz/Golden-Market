import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  convertDraftOrderWorkflow,
  createCustomersWorkflow,
  createOrUpdateOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import { buildDraftOrderInput, parsePhoneOrderInput } from "../../../lib/phone-order"
import { shippingFeeForVariants } from "../../../lib/shipping-fee-query"

// Bouton "Nouvelle commande" de l'admin (commande prise par téléphone) :
// retrouve ou crée le client par son numéro WhatsApp, crée un brouillon avec
// les mêmes workflows que les brouillons natifs de Medusa, puis le convertit
// en commande (order.placed -> confirmation WhatsApp, réservation du stock).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = parsePhoneOrderInput(req.body)
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  const input = parsed.input
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Store mono-région (Burkina Faso, XOF), un seul canal de vente, un seul
  // mode de livraison (« Livraison », prix calculé) : résolus dynamiquement.
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "countries.iso_2"],
  })
  const region = regions.find((r: any) => (r.countries ?? []).some((c: any) => c.iso_2 === "bf"))
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "rules.attribute", "rules.value"],
  })
  const shipping = options.find(
    (o: any) => !(o.rules ?? []).some((r: any) => r.attribute === "is_return" && r.value === "true")
  )
  if (!region || !channels[0] || !shipping) {
    res.status(500).json({ message: "Configuration de la boutique incomplète (région, canal de vente ou livraison)." })
    return
  }
  // Frais d'expédition calculés comme pour le site et l'agent WhatsApp
  // (spec 2026-10-04 frais-expedition-par-produit).
  const shippingAmount = await shippingFeeForVariants(
    query,
    input.city,
    input.items.map((item) => item.variant_id)
  )

  const { data: existing } = await query.graph({
    entity: "customer",
    fields: ["id"],
    filters: { phone: input.phone },
  })
  let customerId = existing[0]?.id as string | undefined
  if (!customerId) {
    const { result } = await createCustomersWorkflow(req.scope).run({
      input: {
        customersData: [{ first_name: input.first_name, last_name: input.last_name ?? "", phone: input.phone }],
      },
    })
    customerId = result[0].id
  }

  const { result: draft } = await createOrderWorkflow(req.scope).run({
    input: buildDraftOrderInput({
      input,
      customerId,
      regionId: region.id,
      currencyCode: region.currency_code,
      salesChannelId: channels[0].id,
      shippingOption: { id: shipping.id, name: shipping.name, amount: shippingAmount },
    }) as any,
  })
  await convertDraftOrderWorkflow(req.scope).run({ input: { id: draft.id } })
  // La conversion d'un brouillon ne crée aucune collecte de paiement : sans
  // elle, l'admin ne propose pas "Mark as paid" (constaté le 2026-09-27).
  // Montant = reste dû de la commande (valeur par défaut du workflow).
  await createOrUpdateOrderPaymentCollectionWorkflow(req.scope).run({ input: { order_id: draft.id } })

  const {
    data: [order],
  } = await query.graph({ entity: "order", fields: ["id", "display_id", "custom_display_id"], filters: { id: draft.id } })
  res.status(200).json({ order_id: order.id, display_id: order.display_id, order_number: order.custom_display_id })
}
