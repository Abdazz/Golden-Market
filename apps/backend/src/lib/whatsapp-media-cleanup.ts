// Fichier joint depuis l'admin dont l'envoi WhatsApp a échoué (spec
// 2026-10-06 entretien-medias-whatsapp) : n8n n'a rien enregistré, aucun
// message ne le référence, la purge à 90 jours ne le trouverait jamais.

// Échecs où n8n a répondu sans enregistrer le message. "unavailable" (n8n
// injoignable, délai dépassé) est incertain : le message a pu partir.
export const CERTAIN_SEND_FAILURES = ["invalid_request", "not_found", "window_expired", "whatsapp_error"] as const

export const isCertainSendFailure = (kind: string) => (CERTAIN_SEND_FAILURES as readonly string[]).includes(kind)

// Nom donné par la route .../media (préfixé de l'horodatage par file-local).
const WA_MEDIA_KEY = /^\d+-wa-media-[0-9a-f]{20}\.[a-z0-9]+$/

export const orphanMediaFileKey = (url: string | null | undefined): string | null => {
  if (!url) return null
  let pathname: string
  try {
    const parsed = new URL(url)
    if (parsed.search || parsed.hash) return null
    pathname = parsed.pathname
  } catch {
    return null
  }
  const key = pathname.split("/").pop() ?? ""
  return WA_MEDIA_KEY.test(key) ? key : null
}
