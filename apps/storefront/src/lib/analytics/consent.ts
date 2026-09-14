// Consentement au tracking, partagé entre Matomo (matomo.ts) et le Pixel
// Meta (meta-pixel.ts) - un seul bandeau, un seul choix (voir
// modules/analytics/components/consent-banner). Fail-closed par conception :
// tant qu'aucun choix n'est enregistré, aucun des deux trackers n'envoie
// quoi que ce soit.
//
// Anciennement gm_matomo_consent (Matomo seul) - renommé maintenant que
// cette clé couvre aussi Meta ; conséquence assumée : un visiteur ayant déjà
// répondu au bandeau le reverra une fois après ce déploiement.
const CONSENT_STORAGE_KEY = "gm_analytics_consent"

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
