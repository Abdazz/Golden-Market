// Pixel Meta (Facebook/Instagram) - complète la synchro catalogue déjà en
// place côté backend (docs/superpowers/specs/2026-09-05-meta-catalog-sync-design.md)
// pour permettre les pubs dynamiques/catalogue. Même forme que matomo.ts :
// piloté par une seule variable publique (NEXT_PUBLIC_META_PIXEL_ID, absente
// hors production -> no-op silencieux), même consentement fail-closed
// partagé (lib/analytics/consent.ts).
import { getStoredConsent } from "./consent"

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] }
  }
}

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

export const isMetaPixelConfigured = (): boolean => !!META_PIXEL_ID

const fbq = (...args: unknown[]) => {
  if (typeof window === "undefined" || !window.fbq) {
    return
  }
  window.fbq(...args)
}

let initialized = false

// Snippet officiel Meta (fbevents.js) - queue les appels fbq() faits avant
// que le script ne soit chargé, comme _paq le fait pour Matomo.
export const initMetaPixelTracker = (): void => {
  if (
    !isMetaPixelConfigured() ||
    initialized ||
    getStoredConsent() !== "granted" ||
    typeof document === "undefined"
  ) {
    return
  }
  initialized = true

  const stub: Window["fbq"] = ((...args: unknown[]) => {
    stub!.queue = stub!.queue || []
    stub!.queue.push(args)
  }) as Window["fbq"]
  window.fbq = window.fbq || stub

  const script = document.createElement("script")
  script.async = true
  script.src = "https://connect.facebook.net/en_US/fbevents.js"
  document.head.appendChild(script)

  fbq("init", META_PIXEL_ID)
}

export const trackPageView = (): void => {
  fbq("track", "PageView")
}

export const trackProductView = (product: {
  id: string
  name: string
  category?: string
  price: number
  variantIds: string[]
}): void => {
  // content_ids = ids de variante (variant.id), pas product.id : le flux
  // /meta-catalog-feed publie une ligne par variante avec id = variant.id
  // (meta-catalog-mapping.ts côté backend) - c'est cet identifiant que Meta
  // doit retrouver dans le catalogue pour calculer le taux de correspondance.
  fbq("track", "ViewContent", {
    content_ids: product.variantIds,
    content_name: product.name,
    content_category: product.category,
    content_type: "product",
    value: product.price,
    currency: "XOF",
  })
}

export const trackAddToCart = (item: {
  id: string
  name: string
  category?: string
  price: number
  quantity: number
}): void => {
  fbq("track", "AddToCart", {
    content_ids: [item.id],
    content_name: item.name,
    content_category: item.category,
    content_type: "product",
    value: item.price * item.quantity,
    currency: "XOF",
  })
}

export const trackInitiateCheckout = (cart: {
  items: { id: string; quantity: number }[]
  total: number
}): void => {
  fbq("track", "InitiateCheckout", {
    content_ids: cart.items.map((item) => item.id),
    content_type: "product",
    num_items: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    value: cart.total,
    currency: "XOF",
  })
}

export const trackOrder = (order: {
  id: string
  items: { id: string; price: number; quantity: number }[]
  total: number
}): void => {
  // eventID = order.id : même id que l'événement Purchase envoyé côté
  // backend par order-placed-meta-conversions-api.ts - c'est ce qui permet à
  // Meta de dédupliquer les deux plutôt que de compter la vente en double.
  fbq(
    "track",
    "Purchase",
    {
      content_ids: order.items.map((item) => item.id),
      content_type: "product",
      value: order.total,
      currency: "XOF",
    },
    { eventID: order.id }
  )
}
