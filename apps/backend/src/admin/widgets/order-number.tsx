import { defineWidgetConfig } from "@medusajs/admin-sdk"

// Numéro de commande Golden Market (AAAAMMJJ + compteur du jour, voir
// src/lib/order-number.ts) en tête de la fiche commande : l'en-tête natif de
// l'admin affiche toujours le numéro séquentiel de Medusa (#12). Recherchable
// dans la liste des commandes. Pas de composant @medusajs/ui (conflit de types
// React 18/19, voir widgets/analytics-summary.tsx).
type Props = { data: { custom_display_id?: string | null; display_id?: number } }

const OrderNumberWidget = ({ data }: Props) => {
  if (!data?.custom_display_id) {
    return null
  }
  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex items-center justify-between rounded-lg px-6 py-4">
      <span className="txt-compact-small text-ui-fg-subtle">N° de commande</span>
      <span className="txt-large-plus text-ui-fg-base tabular-nums">{data.custom_display_id}</span>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderNumberWidget
