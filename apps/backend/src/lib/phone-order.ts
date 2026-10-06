import { z } from "@medusajs/framework/zod"
import { normalizePhone } from "./normalize-phone"

// Commande prise par téléphone depuis l'admin (bouton "Nouvelle commande") :
// le client est identifié par son numéro WhatsApp, jamais par un e-mail - le
// formulaire de brouillon natif de Medusa exige un e-mail ou un client
// existant, inadapté à la clientèle Golden Market (téléphone = identifiant).
// La commande passe par les mêmes workflows que les brouillons natifs
// (createOrderWorkflow en brouillon puis convertDraftOrderWorkflow).

export const PHONE_ORDER_PAYMENT_METHODS = {
  "cash-on-delivery": "Paiement à la réception",
  "orange-money": "Orange Money",
  "moov-money": "Moov Money",
} as const

export type PhoneOrderPaymentMethod = keyof typeof PHONE_ORDER_PAYMENT_METHODS

export type PhoneOrderInput = {
  phone: string
  first_name: string
  last_name?: string
  city: string
  address: string
  payment_method: PhoneOrderPaymentMethod
  items: { variant_id: string; quantity: number }[]
}

const Body = z.object({
  phone: z.string({ message: "Numéro WhatsApp obligatoire." }),
  // Prénom facultatif (2026-10-06) : le client reste identifié par son numéro.
  first_name: z.string().trim().optional().default(""),
  last_name: z.string().trim().optional(),
  city: z.string().trim().min(1, "La ville est obligatoire.").default("Ouagadougou"),
  address: z.string().trim().min(1, "L'adresse de livraison (quartier, repère) est obligatoire."),
  payment_method: z.enum(["cash-on-delivery", "orange-money", "moov-money"], {
    message: "Choisissez le moyen de paiement convenu avec le client.",
  }),
  items: z
    .array(
      z.object({
        variant_id: z.string().min(1),
        quantity: z.number().int().min(1, "La quantité doit être d'au moins 1.").max(99, "La quantité doit être inférieure à 100."),
      })
    )
    .min(1, "Ajoutez au moins un article."),
})

export const parsePhoneOrderInput = (
  body: unknown
): { ok: true; input: PhoneOrderInput } | { ok: false; message: string } => {
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Formulaire incomplet." }
  }

  let phone: string
  try {
    phone = normalizePhone(parsed.data.phone)
  } catch {
    return { ok: false, message: "Numéro WhatsApp invalide (8 chiffres, avec ou sans +226)." }
  }

  return { ok: true, input: { ...parsed.data, phone } }
}

export const buildDraftOrderInput = ({
  input,
  customerId,
  regionId,
  currencyCode,
  salesChannelId,
  shippingOption,
}: {
  input: PhoneOrderInput
  customerId: string
  regionId: string
  currencyCode: string
  salesChannelId: string
  shippingOption: { id: string; name: string; amount: number }
}) => {
  const address = {
    first_name: input.first_name,
    last_name: input.last_name ?? "",
    address_1: input.address,
    city: input.city,
    country_code: "bf",
    // Téléphone sur l'adresse : c'est lui qui déclenche la confirmation
    // WhatsApp (order-placed-customer-whatsapp.ts) et l'évènement Meta.
    phone: input.phone,
  }

  return {
    customer_id: customerId,
    region_id: regionId,
    currency_code: currencyCode,
    sales_channel_id: salesChannelId,
    status: "draft" as const,
    is_draft_order: true,
    shipping_address: address,
    billing_address: { ...address },
    items: input.items.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })),
    shipping_methods: [
      { name: shippingOption.name, shipping_option_id: shippingOption.id, amount: shippingOption.amount },
    ],
    // source "telephone" : distingue ces commandes de celles du site et du
    // chatbot ("whatsapp") ; payment_method : moyen convenu de vive voix,
    // repris dans la confirmation WhatsApp.
    metadata: { source: "telephone", payment_method: input.payment_method },
  }
}
