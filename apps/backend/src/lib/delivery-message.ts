import type { DeliveryType } from "./delivery-rules"
import { sendTemplateMessage } from "./whatsapp-template-sender"

// Message WhatsApp au livreur quand une commande lui est confiée : modèles Meta
// au format demandé par le propriétaire le 2026-10-08 (une ligne par
// information, émojis) - "livraison_livreur_ouaga" (livraison en ville, avec le
// montant à encaisser) et "livraison_livreur_expedition" (compagnie et ville ;
// se termine par « Merci 🙏 » car Meta refuse un modèle qui finit par une
// variable). Ils remplacent "livraison_livreur". Envoyés par le webhook n8n
// générique order-confirmation (template_name + params). Les paramètres de
// modèle Meta refusent les retours à la ligne et les tabulations : espaces
// simples uniquement.
const clean = (text: string) => text.replace(/\s+/g, " ").trim()
const formatAmount = (amount: number) => new Intl.NumberFormat("fr-FR").format(amount).replace(/[\u00a0\u202f]/g, " ")

export const buildCourierMessage = (input: {
  customerName: string
  customerPhone: string
  type: DeliveryType
  address: string | null
  transportCompany: string | null
  destinationCity: string | null
  items: { title: string; quantity: number }[]
  amountToCollect: number
}): { template_name: string; params: string[] } => {
  // Un seul article : son nom ; plusieurs : quantité de chacun après le nom.
  const product =
    input.items.length === 1
      ? input.items[0].title
      : input.items.map((i) => `${i.title} (x${i.quantity})`).join(", ")
  const quantity = String(input.items.reduce((sum, i) => sum + i.quantity, 0))
  const client = [clean(input.customerName), clean(input.customerPhone.replace(/^\+/, ""))]
  return input.type === "expedition"
    ? {
        template_name: "livraison_livreur_expedition",
        params: [...client, clean(input.destinationCity ?? ""), clean(input.transportCompany ?? ""), clean(product), quantity],
      }
    : {
        template_name: "livraison_livreur_ouaga",
        params: [...client, clean(input.address ?? ""), clean(product), quantity, formatAmount(input.amountToCollect)],
      }
}

export async function sendCourierMessage(
  input: { phone: string; template_name: string; params: string[] },
  deps: { url?: string; secret?: string; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendTemplateMessage(input, deps)
}
