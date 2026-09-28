import type { DeliveryType } from "./delivery-rules"
import { sendTemplateMessage } from "./whatsapp-template-sender"

// Message WhatsApp au livreur quand une commande lui est confiée : modèle Meta
// "livraison_livreur" (5 variables, une information par ligne ; remplace
// "nouvelle_livraison", tout sur une ligne, jugé illisible le 2026-09-27)
// envoyé par le webhook n8n générique order-confirmation (template_name +
// params), déjà utilisé pour les confirmations de commande. Les paramètres de modèle Meta refusent les
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
  return sendTemplateMessage({ phone: input.phone, template_name: "livraison_livreur", params: input.params }, deps)
}
