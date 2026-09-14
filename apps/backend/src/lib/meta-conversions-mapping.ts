// Mapping pur commande Medusa -> événement Meta Conversions API (Purchase
// uniquement, voir docs/superpowers/specs/2026-09-05-meta-catalog-sync-design.md
// pour l'intégration Meta soeur - synchro catalogue). Aucun I/O ici, comme
// meta-catalog-mapping.ts : le hash et la construction du payload sont
// testables avec de simples objets, sans mocker fetch.
import { createHash } from "crypto"

export type MetaConversionEvent = {
  event_name: "Purchase"
  event_time: number
  event_id: string
  action_source: "website"
  user_data: { ph?: string[] }
  custom_data: {
    currency: string
    value: number
    content_type: "product"
    contents: Array<{ id: string; quantity: number }>
  }
}

export type OrderForMetaConversion = {
  id: string
  currency_code: string
  total: number
  shipping_address?: { phone?: string | null }
  items?: Array<{ product_id?: string | null; quantity: number }>
}

const BURKINA_FASO_COUNTRY_CODE = "226"
// Numéro local Burkina Faso : 8 chiffres, sans indicatif (voir champ
// "Téléphone (WhatsApp)" du formulaire de livraison, apps/storefront/src/
// modules/checkout/components/shipping-address/index.tsx - aucun masque de
// saisie, le client tape librement).
const LOCAL_PHONE_LENGTH = 8

export function hashForMeta(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

export function normalizePhoneForMeta(
  phone: string | null | undefined
): string | null {
  if (!phone) {
    return null
  }

  const digits = phone.replace(/\D/g, "")

  if (digits.length === LOCAL_PHONE_LENGTH) {
    return `${BURKINA_FASO_COUNTRY_CODE}${digits}`
  }

  return digits
}

export function buildPurchaseEvent(
  order: OrderForMetaConversion,
  eventTime: number
): MetaConversionEvent {
  const phone = normalizePhoneForMeta(order.shipping_address?.phone)

  return {
    event_name: "Purchase",
    event_time: eventTime,
    // Même id que fbq('track', 'Purchase', ..., { eventID: order.id }) côté
    // client (order-tracker) - c'est ce qui permet à Meta de dédupliquer les
    // deux événements plutôt que de compter la vente deux fois.
    event_id: order.id,
    action_source: "website",
    user_data: phone ? { ph: [hashForMeta(phone)] } : {},
    custom_data: {
      currency: order.currency_code.toUpperCase(),
      value: order.total,
      content_type: "product",
      contents: (order.items ?? []).map((item) => ({
        id: item.product_id ?? "",
        quantity: item.quantity,
      })),
    },
  }
}
