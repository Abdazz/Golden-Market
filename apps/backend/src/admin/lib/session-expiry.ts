// Session expirée (2026-10-12, demandé par le propriétaire) : nos écrans
// (caisse, livraisons, stock, formulaires...) affichaient « Unauthorized ».
// Toute réponse 401 d'un appel /admin/... renvoie désormais vers la page de
// connexion, comme les pages natives de Medusa. Installé une seule fois, au
// chargement de l'admin (importé par i18n/index.ts, toujours chargé).
const LOGIN_PATH = "/app/login"

export function installSessionExpiryRedirect() {
  if (typeof window === "undefined" || (window as any).__gmSessionGuard) return
  ;(window as any).__gmSessionGuard = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)
    if (response.status === 401 && !window.location.pathname.startsWith(LOGIN_PATH)) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const path = new URL(url, window.location.origin).pathname
      if (path.startsWith("/admin/")) window.location.assign(LOGIN_PATH)
    }
    return response
  }
}
