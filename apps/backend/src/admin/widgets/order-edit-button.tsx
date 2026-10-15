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
  const [deleteReason, setDeleteReason] = useState<string | null>("")
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ not_editable_reason: string | null; not_deletable_reason: string | null }>(`/admin/phone-orders/${data.id}/edit`)
      .then((r) => {
        setReason(r.not_editable_reason)
        setDeleteReason(r.not_deletable_reason)
      })
      .catch(() => setReason(undefined))
  }, [data.id])

  if (reason === undefined) return null

  const remove = async () => {
    try {
      await api(`/admin/phone-orders/${data.id}/delete`, { method: "POST" })
      window.location.href = "/app/orders"
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex flex-wrap items-center justify-between gap-2 rounded-lg px-6 py-3">
      <span className="txt-compact-small text-ui-fg-subtle">
        {reason
          ? `${reason} Elle ne peut plus être modifiée.`
          : "Ville, adresse, articles, moyen de paiement : les frais et le total sont recalculés."}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {!reason && (
          <a href={`/app/phone-orders/new?order_id=${data.id}`} className={secondaryButton}>
            Modifier la commande
          </a>
        )}
        {deleteReason === null && !confirm && (
          <button type="button" className={secondaryButton} onClick={() => setConfirm(true)}>
            Supprimer la commande
          </button>
        )}
        {deleteReason === null && confirm && (
          <>
            <span className="txt-compact-small text-ui-fg-error">Supprimer définitivement cette commande ?</span>
            <button type="button" className={secondaryButton} onClick={remove}>
              Oui, supprimer
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirm(false)}>
              Non
            </button>
          </>
        )}
      </div>
      {error && <span className="txt-compact-small text-ui-fg-error w-full">{error}</span>}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderEditButtonWidget
