// Fenêtre de service client WhatsApp : une réponse libre (non-template)
// n'est acceptée par Meta que dans les 24 h qui suivent le dernier message
// du client. Calculée, jamais stockée (voir spec 2026-09-27 reprise manuelle).
// Côté admin, sert uniquement à l'affichage : n8n revérifie avant tout envoi.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

// windowFailureAt : dernier message refusé par Meta pour fenêtre dépassée
// (voir whatsapp-delivery-failure) ; postérieur au dernier message client, il
// prouve que la fenêtre est fermée.
export const computeReplyWindow = (
  lastUserMessageAt: Date | string | null,
  now: Date = new Date(),
  windowFailureAt: Date | string | null = null
): { open: boolean; expiresAt: Date | null } => {
  if (!lastUserMessageAt) {
    return { open: false, expiresAt: null }
  }
  if (windowFailureAt && new Date(windowFailureAt).getTime() > new Date(lastUserMessageAt).getTime()) {
    return { open: false, expiresAt: null }
  }
  const expiresAt = new Date(new Date(lastUserMessageAt).getTime() + REPLY_WINDOW_MS)
  return { open: now.getTime() < expiresAt.getTime(), expiresAt }
}
