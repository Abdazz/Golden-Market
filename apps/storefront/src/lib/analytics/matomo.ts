// Cœur du tracking Matomo self-hosted (voir docs/superpowers/specs/
// 2026-09-02-statistiques-visite-design.md). Piloté par deux variables
// publiques, définies uniquement dans le build de production
// (docker-compose.prod.yml -> args du build storefront) : en dev/staging
// elles sont absentes, toutes les fonctions ci-dessous deviennent des
// no-op silencieux - la contrainte "production uniquement" découle de
// l'infra, pas d'une branche conditionnelle applicative à maintenir.
//
// Consentement fail-closed : tant que l'utilisateur n'a pas explicitement
// accepté (bandeau, voir modules/analytics/components/consent-banner),
// le tracker Matomo est configuré en requireConsent - aucun cookie posé,
// aucun appel réseau envoyé.

declare global {
  interface Window {
    _paq?: unknown[][]
  }
}

const MATOMO_URL = process.env.NEXT_PUBLIC_MATOMO_URL
const MATOMO_SITE_ID = process.env.NEXT_PUBLIC_MATOMO_SITE_ID
const CONSENT_STORAGE_KEY = "gm_matomo_consent"

export const isMatomoConfigured = (): boolean => !!MATOMO_URL && !!MATOMO_SITE_ID

const push = (...args: unknown[]) => {
  if (typeof window === "undefined") {
    return
  }
  window._paq = window._paq || []
  window._paq.push(args)
}

export const getStoredConsent = (): "granted" | "denied" | null => {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return value === "granted" || value === "denied" ? value : null
  } catch {
    // localStorage indisponible (navigation privée stricte, etc.) : on
    // retombe sur le comportement fail-closed (pas de consentement connu).
    return null
  }
}

export const storeConsent = (value: "granted" | "denied"): void => {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value)
  } catch {
    // Échec silencieux : le bandeau se réaffichera à la page suivante,
    // comportement dégradé acceptable plutôt qu'une erreur visible.
  }
}

let initialized = false

export const initMatomoTracker = (): void => {
  if (!isMatomoConfigured() || initialized || typeof document === "undefined") {
    return
  }
  initialized = true

  push("setTrackerUrl", `${MATOMO_URL}/matomo.php`)
  push("setSiteId", MATOMO_SITE_ID)
  push("requireConsent")

  if (getStoredConsent() === "granted") {
    push("setConsentGiven")
  }

  const script = document.createElement("script")
  script.async = true
  script.src = `${MATOMO_URL}/matomo.js`
  document.head.appendChild(script)
}

export const grantConsent = (): void => {
  storeConsent("granted")
  push("setConsentGiven")
}

export const denyConsent = (): void => {
  storeConsent("denied")
}

export const trackPageView = (): void => {
  if (!isMatomoConfigured()) {
    return
  }
  push("setCustomUrl", window.location.href)
  push("setDocumentTitle", document.title)
  push("trackPageView")
}

export const trackProductView = (product: {
  id: string
  name: string
  category?: string
  price: number
}): void => {
  if (!isMatomoConfigured()) {
    return
  }
  push("setEcommerceView", product.id, product.name, product.category ?? "", product.price)
  push("trackPageView")
}

export const trackAddToCart = (item: {
  id: string
  name: string
  category?: string
  price: number
  quantity: number
}): void => {
  if (!isMatomoConfigured()) {
    return
  }
  push("addEcommerceItem", item.id, item.name, item.category ?? "", item.price, item.quantity)
  push("trackEcommerceCartUpdate", item.price * item.quantity)
}

export const trackOrder = (order: {
  id: string
  items: { id: string; name: string; price: number; quantity: number }[]
  total: number
  subtotal: number
  shipping: number
}): void => {
  if (!isMatomoConfigured()) {
    return
  }
  order.items.forEach((item) => {
    push("addEcommerceItem", item.id, item.name, "", item.price, item.quantity)
  })
  push("trackEcommerceOrder", order.id, order.total, order.subtotal, undefined, order.shipping)
}
