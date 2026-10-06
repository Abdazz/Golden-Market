// Mapping pur commande Medusa -> événement Meta Conversions API (Purchase
// uniquement ; sources website, phone_call, chat et business_messaging, voir
// docs/superpowers/specs/2026-10-06-meta-evenements-achat-design.md ; voir docs/superpowers/specs/2026-09-05-meta-catalog-sync-design.md
// pour l'intégration Meta soeur - synchro catalogue). Aucun I/O ici, comme
// meta-catalog-mapping.ts : le hash et la construction du payload sont
// testables avec de simples objets, sans mocker fetch.
import { createHash } from "crypto"

export type MetaActionSource = "website" | "phone_call" | "chat" | "business_messaging"

export type MetaConversionEvent = {
  event_name: "Purchase"
  event_time: number
  event_id: string
  action_source: MetaActionSource
  event_source_url?: string
  messaging_channel?: "whatsapp"
  user_data: {
    ph?: string[]
    client_user_agent?: string
    client_ip_address?: string
    fbp?: string
    fbc?: string
    whatsapp_business_account_id?: string
    ctwa_clid?: string
  }
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
  shipping_address?: { phone?: string | null; country_code?: string | null }
  metadata?: Record<string, unknown> | null
  items?: Array<{ variant_id?: string | null; quantity: number; unit_price?: number | null }>
  shipping_methods?: Array<{ amount?: number | null }>
}

// order.total peut valoir 0 juste après order.placed (commandes prises par
// téléphone, 2026-09-27) : valeur recalculée depuis les articles et la
// livraison dans ce cas, pour ne pas envoyer un achat à 0 F à Meta.
const purchaseValue = (order: OrderForMetaConversion): number => {
  if (Number(order.total) > 0) return Number(order.total)
  const items = (order.items ?? []).reduce((sum, i) => sum + Number(i.unit_price ?? 0) * Number(i.quantity ?? 0), 0)
  const shipping = (order.shipping_methods ?? []).reduce((sum, m) => sum + Number(m.amount ?? 0), 0)
  return items + shipping
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

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined

// Source Meta d'une commande (spec 2026-10-06 meta-evenements-achat) :
// téléphone -> phone_call ; WhatsApp venue d'une pub (ctwa_clid) avec la
// configuration WhatsApp -> business_messaging ; autre WhatsApp -> chat ;
// site -> website.
export const actionSourceFor = (
  metadata: Record<string, unknown> | null | undefined,
  options: { whatsappEventsConfigured: boolean }
): MetaActionSource => {
  if (metadata?.source === "telephone") return "phone_call"
  if (metadata?.source === "whatsapp") {
    return options.whatsappEventsConfigured && nonEmpty(metadata.ctwa_clid) ? "business_messaging" : "chat"
  }
  return "website"
}

export type PurchaseEventOptions = {
  storefrontUrl?: string | null
  whatsappBusinessAccountId?: string | null
  whatsappEventsConfigured?: boolean
  forceActionSource?: MetaActionSource
}

export function buildPurchaseEvent(
  order: OrderForMetaConversion,
  eventTime: number,
  options: PurchaseEventOptions = {}
): MetaConversionEvent {
  const phone = normalizePhoneForMeta(order.shipping_address?.phone)
  const actionSource =
    options.forceActionSource ??
    actionSourceFor(order.metadata, { whatsappEventsConfigured: !!options.whatsappEventsConfigured })

  const userData: MetaConversionEvent["user_data"] = phone ? { ph: [hashForMeta(phone)] } : {}
  const extra: Pick<MetaConversionEvent, "event_source_url" | "messaging_channel"> = {}

  if (actionSource === "website") {
    const browser = order.metadata?.meta_browser
    if (browser && typeof browser === "object") {
      const b = browser as Record<string, unknown>
      const userAgent = nonEmpty(b.user_agent)
      const clientIp = nonEmpty(b.client_ip)
      const fbp = nonEmpty(b.fbp)
      const fbc = nonEmpty(b.fbc)
      if (userAgent) userData.client_user_agent = userAgent
      if (clientIp) userData.client_ip_address = clientIp
      if (fbp) userData.fbp = fbp
      if (fbc) userData.fbc = fbc
    }
    const storefrontUrl = nonEmpty(options.storefrontUrl)
    const countryCode = nonEmpty(order.shipping_address?.country_code)
    if (storefrontUrl && countryCode) {
      extra.event_source_url = `${storefrontUrl.replace(/\/+$/, "")}/${countryCode.toLowerCase()}/order/${order.id}/confirmed`
    }
  } else if (actionSource === "business_messaging") {
    extra.messaging_channel = "whatsapp"
    const wabaId = nonEmpty(options.whatsappBusinessAccountId)
    const ctwaClid = nonEmpty(order.metadata?.ctwa_clid)
    if (wabaId) userData.whatsapp_business_account_id = wabaId
    if (ctwaClid) userData.ctwa_clid = ctwaClid
  }

  return {
    event_name: "Purchase",
    event_time: eventTime,
    // Même id que fbq('track', 'Purchase', ..., { eventID: order.id }) côté
    // client (order-tracker) - c'est ce qui permet à Meta de dédupliquer les
    // deux événements plutôt que de compter la vente deux fois.
    event_id: order.id,
    action_source: actionSource,
    ...extra,
    user_data: userData,
    custom_data: {
      currency: order.currency_code.toUpperCase(),
      value: purchaseValue(order),
      content_type: "product",
      // id = variant.id, pas product_id : le flux /meta-catalog-feed publie
      // une ligne par variante avec id = variant.id (meta-catalog-mapping.ts)
      // - c'est cet identifiant que Meta doit retrouver dans le catalogue
      // pour calculer le taux de correspondance des évènements.
      contents: (order.items ?? []).map((item) => ({
        id: item.variant_id ?? "",
        quantity: item.quantity,
      })),
    },
  }
}
