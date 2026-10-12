import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { api } from "../lib/deliveries"
import { secondaryButton } from "../components/delivery-ui"

// Bouton "Modifier la commande" de la fiche commande (2026-10-12) : ouvre le
// formulaire "Nouvelle commande" pré-rempli (routes/phone-orders/new,
// ?order_id=...). Affiché tant que la commande n'est ni payée, ni livrée /
// expédiée, ni annulée ; sinon la raison est indiquée.
// Pas de composant @medusajs/ui (conflit de types React 18/19).
type Props = { data: { id: string } }

const OrderEditButtonWidget = ({ data }: Props) => {
  const [reason, setReason] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    api<{ not_editable_reason: string | null }>(`/admin/phone-orders/${data.id}/edit`)
      .then((r) => setReason(r.not_editable_reason))
      .catch(() => setReason(undefined))
  }, [data.id])

  if (reason === undefined) return null

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex flex-wrap items-center justify-between gap-2 rounded-lg px-6 py-3">
      <span className="txt-compact-small text-ui-fg-subtle">
        {reason
          ? `${reason} Elle ne peut plus être modifiée.`
          : "Ville, adresse, articles, moyen de paiement : les frais et le total sont recalculés."}
      </span>
      {!reason && (
        <a href={`/app/phone-orders/new?order_id=${data.id}`} className={secondaryButton}>
          Modifier la commande
        </a>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderEditButtonWidget
