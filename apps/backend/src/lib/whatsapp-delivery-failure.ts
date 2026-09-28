// Messages refusés par Meta après coup : l'API accepte l'envoi (identifiant
// wamid rendu) puis envoie quelques secondes plus tard un accusé "failed".
// n8n l'inscrit dans messages.delivery_error sous la forme "code: raison".

// Fenêtre de 24 h dépassée (message libre hors fenêtre de service client).
export const WINDOW_EXPIRED_CODE = "131047"

const codeOf = (error: string) => /^(\d+)\s*:/.exec(error)?.[1] ?? null

export const deliveryFailureLabel = (error: string | null): string | null => {
  if (!error) return null
  const code = codeOf(error)
  if (code === WINDOW_EXPIRED_CODE) {
    return "Non envoyé : plus de 24 h depuis le dernier message du client. Envoyez le message de relance."
  }
  if (!code) return `Non envoyé : ${error}`
  return `Non envoyé : ${error.slice(error.indexOf(":") + 1).trim()} (code ${code})`
}

// Dernier refus pour fenêtre dépassée : ferme la fenêtre côté admin même si
// le calcul (24 h après le dernier message client) la croit encore ouverte.
export const lastWindowFailureAt = (messages: { createdAt: Date; deliveryError: string | null }[]): Date | null =>
  messages.reduce<Date | null>((latest, m) => {
    if (!m.deliveryError || codeOf(m.deliveryError) !== WINDOW_EXPIRED_CODE) return latest
    return !latest || m.createdAt > latest ? m.createdAt : latest
  }, null)
