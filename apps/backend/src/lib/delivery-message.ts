import type { DeliveryType } from "./delivery-rules"

// Message WhatsApp au livreur quand une commande lui est confiée : modèle Meta
// "nouvelle_livraison" (5 variables) envoyé par le webhook n8n générique
// order-confirmation (template_name + params), déjà utilisé pour les
// confirmations de commande. Les paramètres de modèle Meta refusent les
// retours à la ligne et les tabulations : espaces simples uniquement.
const clean = (text: string) => text.replace(/\s+/g, " ").trim()
const formatXof = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount).replace(/ | /g, " ")} F`

export const buildCourierMessageParams = (input: {
  orderNumber: string
  customerName: string
  customerPhone: string
  type: DeliveryType
  address: string | null
  transportCompany: string | null
  destinationCity: string | null
  items: { title: string; quantity: number }[]
  amountToCollect: number
}): string[] => [
  clean(input.orderNumber),
  clean(`${input.customerName}, ${input.customerPhone}`),
  clean(
    input.type === "expedition"
      ? `Expédition ${input.transportCompany ?? ""} vers ${input.destinationCity ?? ""}`
      : input.address ?? ""
  ),
  clean(input.items.map((i) => `${i.quantity} x ${i.title}`).join(", ")),
  input.amountToCollect > 0 ? `À encaisser : ${formatXof(input.amountToCollect)}` : "Rien à encaisser",
]

export async function sendCourierMessage(
  input: { phone: string; params: string[] },
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
      body: JSON.stringify({ phone: input.phone, template_name: "nouvelle_livraison", params: input.params }),
    })
    return response.ok ? { ok: true } : { ok: false, error: `Webhook n8n a répondu ${response.status}` }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
