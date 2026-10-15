import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { api, formatXof } from "../lib/deliveries"
import { secondaryButton } from "../components/delivery-ui"

// Section "Paiement enregistré" en haut de la fiche commande (2026-10-15,
// demandé par le propriétaire) : montants réellement saisis dans « Marquer
// payée », relus dans la caisse (GET /admin/order-payments/:id). Le bouton
// « Modifier le paiement » rouvre le formulaire (widgets/order-mark-paid.tsx)
// tant que les 24 h suivant la dernière action ne sont pas écoulées.
// Pas de composant @medusajs/ui (conflit de types React 18/19).
const MARK_PAID_EVENT = "golden-market:mark-as-paid"

type Props = { data: { id: string } }
type Info = {
  type: "express" | "expedition"
  payment_method: string | null
  delivered: boolean
  recorded: {
    amount: number
    courier_fee: number
    transport_fee: number
    recorded_at: string
    editable: boolean
    editable_until: string | null
  } | null
}

const METHODS: Record<string, string> = {
  "cash-on-delivery": "Paiement à la livraison",
  "orange-money": "Orange Money",
  "moov-money": "Moov Money",
}

// Ouagadougou = UTC : "2026-10-15T08:05:00.000Z" -> "15/10/2026" / "08:05".
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const time = (iso: string) => iso.slice(11, 16)

const OrderPaymentRecordedWidget = ({ data }: Props) => {
  const [info, setInfo] = useState<Info | null>(null)

  useEffect(() => {
    api<Info>(`/admin/order-payments/${data.id}`)
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [data.id])

  const recorded = info?.recorded
  if (!info || !recorded) return null

  const rows: [string, string][] = [
    ["Montant encaissé", formatXof(recorded.amount)],
    ["Course du livreur", formatXof(recorded.courier_fee)],
    ...(info.type === "expedition" ? ([["Frais Expédition", formatXof(recorded.transport_fee)]] as [string, string][]) : []),
    ["Moyen de paiement", (info.payment_method && METHODS[info.payment_method]) || "Non renseigné"],
    ["Enregistré le", `${day(recorded.recorded_at)}/${recorded.recorded_at.slice(0, 4)} à ${time(recorded.recorded_at)}`],
    ["Commande livrée", info.delivered ? "oui" : "non"],
  ]

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex flex-col gap-y-3 rounded-lg px-6 py-4">
      <span className="txt-compact-medium-plus text-ui-fg-base">Paiement enregistré</span>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-x-3">
            <dt className="txt-compact-small text-ui-fg-subtle">{label}</dt>
            <dd className="txt-compact-small-plus text-ui-fg-base">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {recorded.editable && recorded.editable_until ? (
          <>
            <span className="txt-compact-small text-ui-fg-subtle">
              Modifiable jusqu'au {day(recorded.editable_until)} à {time(recorded.editable_until)}
            </span>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => window.dispatchEvent(new CustomEvent(MARK_PAID_EVENT, { detail: { order_id: data.id } }))}
            >
              Modifier le paiement
            </button>
          </>
        ) : (
          <span className="txt-compact-small text-ui-fg-subtle">Modification impossible après 24 h.</span>
        )}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderPaymentRecordedWidget
