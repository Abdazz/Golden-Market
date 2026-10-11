import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { api, formatXof } from "../lib/deliveries"
import { parseAmountInput } from "../lib/delivery-amount"
import { inputClass, NoticeText, primaryButton, secondaryButton } from "../components/delivery-ui"

// Formulaire "Marquer comme payée" de la fiche commande (2026-10-11, demandé
// par le propriétaire). Le bouton natif "Mark as paid" de Medusa est modifié
// par scripts/patch-dashboard.mjs : au lieu de sa simple confirmation, il
// envoie l'événement MARK_PAID_EVENT, qui ouvre ce formulaire. Montant
// encaissé et frais engagés par le livreur (course + compagnie de transport),
// pré-remplis et modifiables : seuls ces montants comptent pour la caisse.
// Pas de composant @medusajs/ui (conflit de types React 18/19, voir
// widgets/analytics-summary.tsx).
const MARK_PAID_EVENT = "golden-market:mark-as-paid"

type Props = { data: { id: string } }
type Defaults = {
  order_number: string
  type: "express" | "expedition"
  amount: number
  fees: number
  courier_fee: number | null
  transport_fee: number | null
}

const OrderMarkPaidWidget = ({ data }: Props) => {
  const [open, setOpen] = useState(false)
  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [amount, setAmount] = useState("")
  const [fees, setFees] = useState("")
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
          setFees(String(d.fees))
        })
        .catch((e) => setError((e as Error).message))
    }
    window.addEventListener(MARK_PAID_EVENT, onMarkPaid)
    return () => window.removeEventListener(MARK_PAID_EVENT, onMarkPaid)
  }, [data.id])

  if (!open) return null

  const parsedAmount = parseAmountInput(amount)
  const parsedFees = fees.trim() === "" ? 0 : parseAmountInput(fees)

  const submit = async () => {
    if (!parsedAmount) return setError("Montant encaissé invalide : nombre entier positif en F CFA.")
    if (parsedFees === null) return setError("Frais invalides : nombre entier en F CFA (0 si aucun).")
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/order-payments/${data.id}`, { method: "POST", body: { amount: parsedAmount, fees: parsedFees } })
      // Rechargement : la fiche native (statut de paiement, activité) se met à jour.
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const feesHint = defaults
    ? defaults.courier_fee !== null || defaults.transport_fee !== null
      ? `Saisis sur la livraison : course ${formatXof(defaults.courier_fee ?? 0)}${
          defaults.type === "expedition" ? ` + compagnie ${formatXof(defaults.transport_fee ?? 0)}` : ""
        }.`
      : defaults.type === "expedition"
      ? "Frais d'expédition des produits (la course du livreur n'est pas encore saisie)."
      : "Aucun frais saisi sur la livraison."
    : ""

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
              <span className="txt-compact-small-plus text-ui-fg-base">Frais du livreur (F CFA)</span>
              <input className={inputClass} inputMode="numeric" value={fees} onChange={(e) => setFees(e.target.value)} />
              <span className="txt-compact-small text-ui-fg-subtle">
                Course du livreur + frais payés à la compagnie de transport. {feesHint}
              </span>
            </label>
            {parsedAmount !== null && parsedFees !== null && (
              <span className="txt-compact-small text-ui-fg-base">
                Caisse : entrée {formatXof(parsedAmount)}
                {parsedFees > 0 ? `, sortie ${formatXof(parsedFees)} = net ${formatXof(parsedAmount - parsedFees)}` : ""}
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
