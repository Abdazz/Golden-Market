import type { DeliveryType } from "./delivery-rules"

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

// Corps exacts des modèles approuvés par Meta (vérifiés le 2026-10-10) ; les
// variables {{n}} sont remplacées par les paramètres dans l'ordre. Données à
// reproduire caractère pour caractère, émojis compris.
export const COURIER_TEMPLATE_BODIES: Record<string, string> = {
  livraison_livreur_ouaga:
    "🛵 NOUVELLE COMMANDE — Golden Market\n👤 Client : {{1}}\n📞 Téléphone : {{2}}\n📍 Destination : {{3}}\n📦 Produit : {{4}}\n🔢 Quantité : {{5}}\n💰 Montant à encaisser : {{6}} F CFA",
  livraison_livreur_expedition:
    "🛵 NOUVELLE COMMANDE — Golden Market\n👤 Client : {{1}}\n📞 Téléphone : {{2}}\n📍 Expédition : {{3}}\n🚚 Compagnie de transport : {{4}}\n📦 Produit : {{5}}\n🔢 Quantité : {{6}}\n\nMerci 🙏",
}

// Texte final tel que Meta l'affiche. Paramètre manquant : chaîne vide. Modèle
// inconnu : les paramètres l'un sous l'autre, sans jamais lever d'exception.
export const renderCourierMessage = (message: { template_name: string; params: string[] }): string => {
  const body = COURIER_TEMPLATE_BODIES[message.template_name]
  if (!body) return message.params.join("\n")
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => message.params[Number(n) - 1] ?? "")
}

export const courierMessageText = (input: Parameters<typeof buildCourierMessage>[0]): string =>
  renderCourierMessage(buildCourierMessage(input))
