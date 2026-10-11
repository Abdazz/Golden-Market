import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { api, formatXof } from "../lib/deliveries"
import { parseAmountInput } from "../lib/delivery-amount"
import { inputClass, NoticeText, primaryButton, secondaryButton } from "../components/delivery-ui"

// Formulaire "Marquer comme payée" de la fiche commande (2026-10-11, demandé
// par le propriétaire). Le bouton natif "Mark as paid" de Medusa est modifié
// par scripts/patch-dashboard.mjs : au lieu de sa simple confirmation, il
// envoie l'événement MARK_PAID_EVENT, qui ouvre ce formulaire. Montant
// encaissé, course du livreur et frais payés à la compagnie de transport,
// pré-remplis et modifiables : seuls ces montants comptent pour la caisse.
// Pas de composant @medusajs/ui (conflit de types React 18/19, voir
// widgets/analytics-summary.tsx).
const MARK_PAID_EVENT = "golden-market:mark-as-paid"

type Props = { data: { id: string } }
type Defaults = {
  order_number: string
  type: "express" | "expedition"
  amount: number
  courier_fee: number
  transport_fee: number
  courier_fee_saved: boolean
  transport_fee_saved: boolean
}

const readFee = (text: string) => (text.trim() === "" ? 0 : parseAmountInput(text))

const OrderMarkPaidWidget = ({ data }: Props) => {
  const [open, setOpen] = useState(false)
  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [amount, setAmount] = useState("")
  const [courierFee, setCourierFee] = useState("")
  const [transportFee, setTransportFee] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onMarkPaid = (event: Event) => {
      const orderId = (event as CustomEvent<{ order_id?: string }>).detail?.order_id
      if (orderId && orderId !== data.id) return
      setOpen(true)
      setError(null)
      setDefaults(null)
      api<Defaults>(`/admin/order-payments/${data.id}`)
        .then((d) => {
          setDefaults(d)
          setAmount(String(d.amount))
          setCourierFee(String(d.courier_fee))
          setTransportFee(String(d.transport_fee))
        })
        .catch((e) => setError((e as Error).message))
    }
    window.addEventListener(MARK_PAID_EVENT, onMarkPaid)
    return () => window.removeEventListener(MARK_PAID_EVENT, onMarkPaid)
  }, [data.id])

  if (!open) return null

  const parsedAmount = parseAmountInput(amount)
  const parsedCourierFee = readFee(courierFee)
  // Livraison Ouaga : pas de compagnie de transport, champ masqué et frais à 0.
  const isExpedition = defaults?.type === "expedition"
  const parsedTransportFee = isExpedition ? readFee(transportFee) : 0

  const submit = async () => {
    if (!parsedAmount) return setError("Montant encaissé invalide : nombre entier positif en F CFA.")
    if (parsedCourierFee === null) return setError("Course du livreur invalide : nombre entier en F CFA (0 si aucune).")
    if (parsedTransportFee === null) return setError("Frais de la compagnie invalides : nombre entier en F CFA (0 si aucun).")
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/order-payments/${data.id}`, {
        method: "POST",
        body: { amount: parsedAmount, courier_fee: parsedCourierFee, transport_fee: parsedTransportFee },
      })
      // Rechargement : la fiche native (statut de paiement, activité) se met à jour.
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  // Origine des valeurs pré-remplies (même règle que expectedFees côté serveur).
  const courierHint = defaults?.courier_fee_saved ? "Saisie sur la livraison." : "Tarif habituel de la course."
  const transportHint = defaults?.transport_fee_saved
    ? "Saisis sur la livraison."
    : "Frais d'expédition payés par le client, reversés à la compagnie."
  const totalFees = (parsedCourierFee ?? 0) + (parsedTransportFee ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="bg-ui-bg-base shadow-elevation-modal flex w-full max-w-md flex-col gap-y-3 rounded-lg p-5">
        <span className="txt-compact-medium-plus text-ui-fg-base">
          Marquer comme payée{defaults ? ` · commande ${defaults.order_number}` : ""}
        </span>
        {!defaults && !error && <span className="txt-compact-small text-ui-fg-subtle">Chargement…</span>}
        {defaults && (
          <>
            <label className="flex flex-col gap-y-1">
              <span className="txt-compact-small-plus text-ui-fg-base">Montant encaissé (F CFA)</span>
              <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="flex flex-col gap-y-1">
              <span className="txt-compact-small-plus text-ui-fg-base">Course du livreur (F CFA)</span>
              <input className={inputClass} inputMode="numeric" value={courierFee} onChange={(e) => setCourierFee(e.target.value)} />
              <span className="txt-compact-small text-ui-fg-subtle">{courierHint}</span>
            </label>
            {isExpedition && (
              <label className="flex flex-col gap-y-1">
                <span className="txt-compact-small-plus text-ui-fg-base">Frais compagnie de transport (F CFA)</span>
                <input className={inputClass} inputMode="numeric" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} />
                <span className="txt-compact-small text-ui-fg-subtle">{transportHint}</span>
              </label>
            )}
            {parsedAmount !== null && parsedCourierFee !== null && parsedTransportFee !== null && (
              <span className="txt-compact-small text-ui-fg-base">
                Caisse : entrée {formatXof(parsedAmount)}
                {totalFees > 0 ? `, sorties ${formatXof(totalFees)} = net ${formatXof(parsedAmount - totalFees)}` : ""}
              </span>
            )}
          </>
        )}
        <NoticeText notice={error ? { kind: "error", text: error } : null} />
        <div className="flex justify-end gap-x-2">
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button type="button" className={primaryButton} disabled={busy || !defaults} onClick={submit}>
            {busy ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderMarkPaidWidget
