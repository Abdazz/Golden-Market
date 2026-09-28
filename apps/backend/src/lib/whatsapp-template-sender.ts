// Envoi d'un modèle WhatsApp approuvé par Meta via le webhook n8n générique
// order-confirmation (template_name + params) - n8n reste le seul détenteur du
// jeton WhatsApp. Utilisé pour le message au livreur et le retour en stock.
// Ne lève jamais : renvoie l'erreur.
export async function sendTemplateMessage(
  input: { phone: string; template_name: string; params: string[] },
  deps: { url?: string; secret?: string; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = "url" in deps ? deps.url : process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
  const secret = "secret" in deps ? deps.secret : process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET
  const fetchImpl = deps.fetchImpl ?? fetch
  if (!url) return { ok: false, error: "Envoi WhatsApp non configuré (N8N_ORDER_CONFIRMATION_WEBHOOK_URL)" }
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { "x-webhook-secret": secret } : {}) },
      body: JSON.stringify({ phone: input.phone, template_name: input.template_name, params: input.params }),
    })
    return response.ok ? { ok: true } : { ok: false, error: `Webhook n8n a répondu ${response.status}` }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
