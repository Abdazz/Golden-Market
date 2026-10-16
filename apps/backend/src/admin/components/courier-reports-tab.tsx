import { useCallback, useEffect, useState } from "react"
import { api, formatOrderDate, formatXof, todayInOuaga, TYPE_LABELS } from "../lib/deliveries"
import type { CourierDaySummary, ReportLine, ReportState } from "../lib/deliveries"
import { Badge, card, inputClass, primaryButton, secondaryButton } from "./delivery-ui"

// Onglet « Rapports livreurs » (spec 2026-10-15 espace-livreur) : 1) livreurs du
// jour, 2) tableau des commandes d'un livreur avec Valider / Renvoyer pour
// correction. Pas de composant @medusajs/ui (conflit de types React 18/19).

type DayCourier = { courier_id: string; courier_name: string; phone: string; summary: CourierDaySummary }

const STATE_LABEL: Record<ReportState, string> = {
  todo: "Pas encore de rapport",
  submitted: "À valider",
  returned: "Renvoyé au livreur",
  validated: "Validé",
  failed: "Non livrée",
  canceled: "Annulée",
}
const STATE_BADGE: Record<ReportState, string> = {
  todo: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
  submitted: "bg-ui-tag-orange-bg text-ui-tag-orange-text",
  returned: "bg-ui-tag-red-bg text-ui-tag-red-text",
  validated: "bg-ui-tag-green-bg text-ui-tag-green-text",
  failed: "bg-ui-tag-red-bg text-ui-tag-red-text",
  canceled: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
}

const sentAt = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })

const ReportRow = ({ line, onChanged }: { line: ReportLine; onChanged: () => void | Promise<unknown> }) => {
  const report = line.report
  const isExpedition = line.type === "expedition"
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const call = async (path: string, body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ warning?: string }>(path, { method: "POST", body })
      setReason(null)
      setWarning(r.warning ?? null)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-t border-ui-border-base align-top">
      <td className="px-3 py-2">
        <a href={`/app/orders/${line.order_id}`} className="text-ui-fg-interactive">{line.order_number}</a>
      </td>
      <td className="whitespace-nowrap px-3 py-2">{formatOrderDate(line.order_created_at)}</td>
      <td className="px-3 py-2">
        {line.customer_name}
        <div className="txt-compact-xsmall text-ui-fg-subtle">{line.customer_phone}</div>
      </td>
      <td className="px-3 py-2">{TYPE_LABELS[line.type]}</td>
      <td className="px-3 py-2">{line.place || "—"}</td>
      <td className="px-3 py-2">{line.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatXof(line.amount_to_collect)}</td>
      <td className="px-3 py-2">
        <Badge className={STATE_BADGE[line.state]}>{STATE_LABEL[line.state]}</Badge>
        {line.state === "returned" && report?.return_reason && (
          <div className="txt-compact-xsmall text-ui-fg-subtle">Motif du renvoi : {report.return_reason}</div>
        )}
      </td>
      <td className="px-3 py-2">
        {!report && line.state === "failed" && <span>Non livrée : {line.failure_reason ?? "—"}</span>}
        {report && (
          <div className="flex flex-col">
            <span>Livrée : {report.delivered ? "oui" : "non"}</span>
            {!report.delivered && <span>Motif : {report.failure_reason ?? "—"}</span>}
            {report.delivered && (
              <>
                {/* Expédition : montant saisi par l'équipe à la validation seulement. */}
                {(!isExpedition || line.state === "validated") && <span>Encaissé : {formatXof(report.amount_collected)}</span>}
                {!isExpedition && report.amount_collected !== line.amount_to_collect && (
                  <span className="txt-compact-xsmall text-ui-fg-error">Écart avec le montant à encaisser</span>
                )}
                <span>Course : {formatXof(report.courier_fee)}</span>
                {isExpedition && <span>Frais Expédition : {formatXof(report.transport_fee)}</span>}
              </>
            )}
            <span className="txt-compact-xsmall text-ui-fg-subtle">Envoyé à {sentAt(report.submitted_at)}</span>
          </div>
        )}
        {warning && <div className="txt-compact-xsmall text-ui-fg-error">{warning}</div>}
      </td>
      <td className="px-3 py-2">
        {line.state === "submitted" && report && (
          <div className="flex flex-col gap-y-2">
            {isExpedition && report.delivered && (
              <input
                className={`${inputClass} max-w-[260px]`}
                inputMode="numeric"
                placeholder="Montant encaissé (laisser vide si pas encore payé)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
            {reason === null ? (
              <div className="flex gap-x-2">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy}
                  onClick={() =>
                    call(`/admin/courier-reports/${report.id}/validate`, isExpedition && amount.trim() ? { amount_collected: amount.trim() } : {})
                  }
                >
                  Valider
                </button>
                <button type="button" className={secondaryButton} disabled={busy} onClick={() => setReason("")}>
                  Renvoyer pour correction
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-y-2">
                <input className={inputClass} placeholder="Motif du renvoi (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-x-2">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy || !reason.trim()}
                    onClick={() => call(`/admin/courier-reports/${report.id}/return`, { reason: reason.trim() })}
                  >
                    Envoyer le renvoi
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => setReason(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
            {error && <span className="txt-compact-small text-ui-fg-error">{error}</span>}
          </div>
        )}
      </td>
    </tr>
  )
}

const CourierLines = ({ courierId, date, onBack, onChanged }: { courierId: string; date: string; onBack: () => void; onChanged?: () => void }) => {
  const [data, setData] = useState<{ courier: { name: string }; lines: ReportLine[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Renvoie la promesse : après une action, la ligne reste occupée jusqu'à la fin du rechargement.
  const load = useCallback(
    () =>
      api<{ courier: { name: string }; lines: ReportLine[] }>(`/admin/courier-reports/${courierId}?date=${date}`)
        .then(setData)
        .catch((e) => setError((e as Error).message)),
    [courierId, date]
  )
  useEffect(() => {
    load()
  }, [load])
  const reload = useCallback(async () => {
    await load()
    onChanged?.()
  }, [load, onChanged])

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center gap-x-3">
        <button type="button" className={secondaryButton} onClick={onBack}>
          ‹ Livreurs
        </button>
        <span className="txt-compact-small-plus text-ui-fg-base">{data?.courier.name ?? "…"} · commandes du {date.slice(8, 10)}/{date.slice(5, 7)}</span>
      </div>
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      {data && !data.lines.length && <p className="txt-compact-small text-ui-fg-subtle">Aucune commande ce jour-là.</p>}
      {data && data.lines.length > 0 && (
        <div className={`${card} overflow-x-auto`}>
          <table className="txt-compact-small w-full text-left text-ui-fg-base">
            <thead className="txt-compact-xsmall-plus text-ui-fg-subtle">
              <tr>
                {["Commande", "Commandée le", "Client", "Type", "Lieu", "Produits", "À encaisser", "État", "Rapport", ""].map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <ReportRow key={line.id} line={line} onChanged={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Nombre de rapports à valider (pastille de l'onglet), tous livreurs du jour.
export const countReportsToValidate = () =>
  api<{ couriers: DayCourier[] }>("/admin/courier-reports").then((r) => r.couriers.reduce((n, c) => n + c.summary.submitted, 0))

export const CourierReportsTab = ({ onChanged }: { onChanged?: () => void }) => {
  const [couriers, setCouriers] = useState<DayCourier[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const today = todayInOuaga()
  const [date, setDate] = useState(today)
  useEffect(() => {
    if (selected) return
    setCouriers(null)
    api<{ couriers: DayCourier[] }>(`/admin/courier-reports?date=${date}`)
      .then((r) => setCouriers(r.couriers))
      .catch(() => setCouriers([]))
  }, [selected, date])

  if (selected) return <CourierLines courierId={selected} date={date} onBack={() => setSelected(null)} onChanged={onChanged} />
  const picker = (
    <div className="mb-3 flex items-center gap-x-2">
      <label className="txt-compact-small-plus text-ui-fg-base" htmlFor="reports-day">Jour</label>
      <input id="reports-day" type="date" className={`${inputClass} max-w-[180px]`} value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      {date !== today && (
        <button type="button" className={secondaryButton} onClick={() => setDate(today)}>
          Aujourd'hui
        </button>
      )}
    </div>
  )
  if (couriers === null) return <div>{picker}<p className="txt-compact-small text-ui-fg-subtle">Chargement…</p></div>
  if (!couriers.length) {
    return <div>{picker}<p className="txt-compact-small text-ui-fg-subtle">Aucune commande confiée à un livreur ce jour-là.</p></div>
  }
  return (
    <div>
    {picker}
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {couriers.map((c) => (
        <button
          key={c.courier_id}
          type="button"
          onClick={() => setSelected(c.courier_id)}
          className={`${card} flex flex-col gap-y-1 px-4 py-3 text-left`}
        >
          <span className="txt-compact-small-plus text-ui-fg-base">{c.courier_name}</span>
          <span className="txt-compact-small text-ui-fg-subtle">
            {c.summary.total} commande(s) · {c.summary.total - c.summary.todo} rapport(s) reçu(s)
          </span>
          <span className="txt-compact-small text-ui-fg-subtle">
            {c.summary.submitted} à valider · {c.summary.returned} renvoyé(s) · {c.summary.validated} validé(s) · {c.summary.failed} non livrée(s) · {c.summary.todo} sans rapport
          </span>
        </button>
      ))}
    </div>
    </div>
  )
}
