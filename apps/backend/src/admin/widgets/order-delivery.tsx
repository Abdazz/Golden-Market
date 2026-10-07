import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"
import {
  api,
  defaultTypeForCity,
  formatDay,
  formatXof,
  STATUS_BADGE,
  STATUS_LABELS,
  TRANSPORT_COMPANIES,
  TYPE_LABELS,
} from "../lib/deliveries"
import { parseAmountInput } from "../lib/delivery-amount"
import type { AssignResult, Courier, DeliveryType, TourLine } from "../lib/deliveries"

// Encadré "Livraison" de la fiche commande (spec 2026-09-28
// livreurs-livraisons) : confier la commande à un livreur, suivre la
// tentative en cours et l'historique. Pas de composant @medusajs/ui (conflit
// de types React 18/19, voir widgets/analytics-summary.tsx).
type Props = { data: { id: string } }

type ByOrder = {
  deliveries: TourLine[]
  order: {
    id: string
    status: string
    city: string | null
    address: string | null
    amount_to_collect: Record<DeliveryType, number>
  } | null
}

const inputClass =
  "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"

const OrderDeliveryWidget = ({ data }: Props) => {
  const [info, setInfo] = useState<ByOrder | null>(null)
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [courierId, setCourierId] = useState("")
  const [type, setType] = useState<DeliveryType>("express")
  const [address, setAddress] = useState("")
  const [company, setCompany] = useState("")
  const [destination, setDestination] = useState("")
  // Montant à encaisser modifié à la main ; sinon celui proposé pour le type choisi.
  const [amount, setAmount] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: "error" | "warning" | "success"; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api<ByOrder>(`/admin/deliveries/by-order/${data.id}`)
      setInfo(result)
      setLoadError(null)
      return result
    } catch (error) {
      setLoadError((error as Error).message)
      return null
    }
  }, [data.id])

  useEffect(() => {
    load().then((result) => {
      if (!result?.order) return
      const initialType = defaultTypeForCity(result.order.city)
      setType(initialType)
      setAddress(result.order.address ?? "")
      setDestination(initialType === "expedition" ? result.order.city ?? "" : "")
    })
    api<{ couriers: Courier[] }>("/admin/couriers")
      .then((r) => setCouriers(r.couriers.filter((c) => c.active)))
      .catch(() => setCouriers([]))
  }, [load])

  if (loadError) {
    return (
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg px-6 py-4">
        <p className="txt-compact-small text-ui-fg-error">Livraison : {loadError}</p>
      </div>
    )
  }
  if (!info) {
    return (
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg px-6 py-4">
        <p className="txt-compact-small text-ui-fg-subtle">Livraison : chargement…</p>
      </div>
    )
  }

  const current = info.deliveries.find((d) => d.status === "assigned")
  const done = info.deliveries.find((d) => d.status === "delivered" || d.status === "shipped")
  const canAssign = !current && !done && info.order?.status !== "canceled"

  const proposedAmount = info.order?.amount_to_collect?.[type] ?? 0
  const amountText = amount ?? String(proposedAmount)

  const assign = async () => {
    if (!courierId) {
      setMessage({ kind: "error", text: "Choisissez un livreur." })
      return
    }
    const editedAmount = amount === null ? null : parseAmountInput(amount)
    if (amount !== null && editedAmount === null) {
      setMessage({ kind: "error", text: "Montant à encaisser invalide : nombre entier en F CFA (0 si rien)." })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await api<AssignResult>("/admin/deliveries", {
        method: "POST",
        body: {
          order_ids: [data.id],
          courier_id: courierId,
          type,
          address: type === "express" ? address : null,
          transport_company: type === "expedition" ? company : null,
          destination_city: type === "expedition" ? destination : null,
          ...(editedAmount !== null ? { amounts: { [data.id]: editedAmount } } : {}),
        },
      })
      if (!result.errors.length) setAmount(null)
      if (result.errors.length) {
        setMessage({ kind: "error", text: result.errors[0].message })
      } else if (result.deliveries[0]?.whatsapp_status === "failed") {
        setMessage({
          kind: "warning",
          text: `Commande confiée, mais le message WhatsApp n'est pas parti : ${result.deliveries[0].whatsapp_error ?? ""}`,
        })
      } else {
        setMessage({ kind: "success", text: "Commande confiée, le livreur a reçu le détail sur WhatsApp." })
      }
      await load()
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const resend = async (id: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api<{ whatsapp_status: string; whatsapp_error: string | null }>(
        `/admin/deliveries/${id}/resend`,
        { method: "POST" }
      )
      setMessage(
        result.whatsapp_status === "sent"
          ? { kind: "success", text: "Message renvoyé au livreur." }
          : { kind: "warning", text: `Message non envoyé : ${result.whatsapp_error ?? ""}` }
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex flex-col gap-y-3 rounded-lg px-6 py-4">
      <div className="flex items-center justify-between">
        <span className="txt-compact-small-plus text-ui-fg-base">Livraison</span>
        <a href="/app/deliveries" className="txt-compact-small text-ui-fg-interactive">
          Voir les livraisons
        </a>
      </div>

      {current && (
        <div className="flex flex-col gap-y-1 rounded-md border border-ui-border-base p-3">
          <div className="flex items-center justify-between gap-x-2">
            <span className="txt-compact-small-plus text-ui-fg-base">{current.courier_name ?? "Livreur"}</span>
            <span className={`txt-compact-xsmall-plus rounded-full px-2 py-0.5 ${STATUS_BADGE.assigned}`}>
              {STATUS_LABELS.assigned}
            </span>
          </div>
          <span className="txt-compact-small text-ui-fg-subtle">
            {TYPE_LABELS[current.type]} · {current.place || "—"}
          </span>
          <span className="txt-compact-small text-ui-fg-subtle">
            Tournée du {formatDay(current.tour_date)}
            {current.postponed_from ? ` (reportée depuis le ${formatDay(current.postponed_from)})` : ""}
            {current.amount_to_collect > 0 ? ` · à encaisser ${formatXof(current.amount_to_collect)}` : ""}
          </span>
          {current.whatsapp_status === "failed" ? (
            <div className="flex flex-col gap-y-1">
              <span className="txt-compact-small text-ui-fg-error">
                Message WhatsApp non envoyé : {current.whatsapp_error}
              </span>
              <button type="button" className={`${secondaryButton} self-start`} disabled={busy} onClick={() => resend(current.id)}>
                Renvoyer le message
              </button>
            </div>
          ) : (
            <span className="txt-compact-small text-ui-fg-subtle">
              {current.whatsapp_status === "sent" ? "Message WhatsApp envoyé au livreur" : "Message WhatsApp en attente"}
            </span>
          )}
          <a href="/app/deliveries?tab=tour" className="txt-compact-small text-ui-fg-interactive">
            Marquer livrée / échec depuis la tournée du jour
          </a>
        </div>
      )}

      {canAssign && couriers.length === 0 && (
        <p className="txt-compact-small text-ui-fg-subtle">
          Aucun livreur actif. <a href="/app/deliveries?tab=couriers" className="text-ui-fg-interactive">Ajouter un livreur</a>
        </p>
      )}

      {canAssign && couriers.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Livreur</span>
            <select className={inputClass} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
              <option value="">Choisir…</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Type</span>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as DeliveryType)}>
              <option value="express">Express (Ouagadougou)</option>
              <option value="expedition">Expédition (compagnie de transport)</option>
            </select>
          </label>
          {type === "express" ? (
            <label className="flex flex-col gap-y-1">
              <span className="txt-compact-small text-ui-fg-subtle">Quartier / adresse</span>
              <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-y-1">
                <span className="txt-compact-small text-ui-fg-subtle">Compagnie de transport</span>
                <input
                  className={inputClass}
                  list="gm-transport-companies"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
                <datalist id="gm-transport-companies">
                  {TRANSPORT_COMPANIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="flex flex-col gap-y-1">
                <span className="txt-compact-small text-ui-fg-subtle">Ville de destination</span>
                <input className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Montant à encaisser (F CFA)</span>
            <input className={inputClass} inputMode="numeric" value={amountText} onChange={(e) => setAmount(e.target.value)} />
            {amount !== null && parseAmountInput(amount) !== proposedAmount && (
              <button type="button" className="txt-compact-small self-start text-ui-fg-interactive" onClick={() => setAmount(null)}>
                Revenir à {formatXof(proposedAmount)}
              </button>
            )}
            {type === "expedition" && parseAmountInput(amountText) !== 0 && (
              <span className="txt-compact-small text-ui-tag-orange-text">
                Expédition : le livreur n'encaisse normalement rien (paiement avant envoi).
              </span>
            )}
          </label>
          <button type="button" className={`${primaryButton} self-start`} disabled={busy} onClick={assign}>
            {busy ? "Envoi…" : "Confier au livreur"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`txt-compact-small ${
            message.kind === "error"
              ? "text-ui-fg-error"
              : message.kind === "warning"
                ? "text-ui-tag-orange-text"
                : "text-ui-tag-green-text"
          }`}
        >
          {message.text}
        </p>
      )}

      {info.deliveries.filter((d) => d.status !== "assigned").length > 0 && (
        <div className="flex flex-col gap-y-1">
          <span className="txt-compact-small-plus text-ui-fg-subtle">Historique</span>
          {info.deliveries
            .filter((d) => d.status !== "assigned")
            .map((d) => (
              <div key={d.id} className="flex flex-col border-t border-ui-border-base pt-1">
                <div className="flex items-center justify-between gap-x-2">
                  <span className="txt-compact-small text-ui-fg-base">
                    {formatDay((d.completed_at ?? d.assigned_at).slice(0, 10))} · {d.courier_name ?? "Livreur"}
                  </span>
                  <span className={`txt-compact-xsmall-plus rounded-full px-2 py-0.5 ${STATUS_BADGE[d.status]}`}>
                    {STATUS_LABELS[d.status]}
                  </span>
                </div>
                {d.failure_reason && (
                  <span className="txt-compact-small text-ui-fg-subtle">
                    {d.failure_reason}
                    {d.redeliver ? " · à relivrer" : ""}
                  </span>
                )}
                {d.sync_warning && <span className="txt-compact-small text-ui-tag-orange-text">{d.sync_warning}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderDeliveryWidget
