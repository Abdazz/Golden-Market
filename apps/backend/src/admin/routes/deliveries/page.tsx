import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
import { useCallback, useEffect, useState } from "react"
import {
  api,
  FAILURE_REASONS,
  FEE_SHORTCUTS,
  formatDay,
  formatXof,
  parseAmount,
  STATUS_BADGE,
  STATUS_LABELS,
  todayInOuaga,
  TRANSPORT_COMPANIES,
  TYPE_LABELS,
} from "../../lib/deliveries"
import type {
  AssignResult,
  Courier,
  DeliveryType,
  OrderToAssign,
  Settlement,
  TourLine,
  UnpaidExpedition,
  ValidatedSettlement,
} from "../../lib/deliveries"

// Page "Livraisons" (spec 2026-09-28 livreurs-livraisons) : confier les
// commandes, suivre la tournée d'un livreur et vérifier son versement du
// soir, relancer les expéditions non payées, gérer les livreurs.
// Utilisable sur téléphone : cartes empilées, pas de tableau large.
// Pas de composant @medusajs/ui (conflit de types React 18/19, voir
// widgets/analytics-summary.tsx) : HTML natif + classes utilitaires Medusa.

type Tab = "to-assign" | "tour" | "unpaid" | "couriers"

const TABS: { id: Tab; label: string }[] = [
  { id: "to-assign", label: "À confier" },
  { id: "tour", label: "Tournée du jour" },
  { id: "unpaid", label: "Expéditions à faire payer" },
  { id: "couriers", label: "Livreurs" },
]

const inputClass =
  "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"
const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg"

type Notice = { kind: "error" | "warning" | "success"; text: string } | null

const NoticeText = ({ notice }: { notice: Notice }) =>
  notice ? (
    <p
      className={`txt-compact-small ${
        notice.kind === "error"
          ? "text-ui-fg-error"
          : notice.kind === "warning"
            ? "text-ui-tag-orange-text"
            : "text-ui-tag-green-text"
      }`}
    >
      {notice.text}
    </p>
  ) : null

const Badge = ({ className, children }: { className: string; children: string }) => (
  <span className={`txt-compact-xsmall-plus whitespace-nowrap rounded-full px-2 py-0.5 ${className}`}>{children}</span>
)

const useCouriers = () => {
  const [couriers, setCouriers] = useState<Courier[] | null>(null)
  const reload = useCallback(() => {
    api<{ couriers: Courier[] }>("/admin/couriers")
      .then((r) => setCouriers(r.couriers))
      .catch(() => setCouriers([]))
  }, [])
  useEffect(reload, [reload])
  return { couriers, reload }
}

const FeeInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="flex flex-col gap-y-1">
    <span className="txt-compact-small text-ui-fg-subtle">{label}</span>
    <div className="flex items-center gap-x-2">
      <input className={`${inputClass} max-w-[120px]`} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
      {FEE_SHORTCUTS.map((fee) => (
        <button key={fee} type="button" className={secondaryButton} onClick={() => onChange(String(fee))}>
          {formatXof(fee)}
        </button>
      ))}
    </div>
  </label>
)

// ---------------------------------------------------------------- À confier

const ToAssignTab = () => {
  const { couriers } = useCouriers()
  const [orders, setOrders] = useState<OrderToAssign[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [courierId, setCourierId] = useState("")
  const [type, setType] = useState<"auto" | DeliveryType>("auto")
  const [company, setCompany] = useState("")
  const [destination, setDestination] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(() => {
    api<{ orders: OrderToAssign[] }>("/admin/deliveries/to-assign")
      .then((r) => setOrders(r.orders))
      .catch((e) => setNotice({ kind: "error", text: (e as Error).message }))
  }, [])
  useEffect(load, [load])

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const assign = async () => {
    if (!courierId || !selected.length) {
      setNotice({ kind: "error", text: "Choisissez un livreur et au moins une commande." })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const result = await api<AssignResult>("/admin/deliveries", {
        method: "POST",
        body: {
          order_ids: selected,
          courier_id: courierId,
          ...(type === "auto" ? {} : { type }),
          ...(type === "expedition" ? { transport_company: company || null, destination_city: destination || null } : {}),
        },
      })
      const failedMessages = result.deliveries.filter((d) => d.whatsapp_status === "failed").length
      const parts = [`${result.deliveries.length} commande(s) confiée(s).`]
      if (failedMessages) parts.push(`${failedMessages} message(s) WhatsApp non envoyé(s) : renvoyez-les depuis la tournée.`)
      result.errors.forEach((e) => parts.push(e.message))
      setNotice({ kind: result.errors.length || failedMessages ? "warning" : "success", text: parts.join(" ") })
      setSelected([])
      load()
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const activeCouriers = (couriers ?? []).filter((c) => c.active)

  return (
    <div className="flex flex-col gap-y-3">
      <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Livreur</span>
            <select className={inputClass} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
              <option value="">Choisir…</option>
              {activeCouriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Type</span>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as "auto" | DeliveryType)}>
              <option value="auto">Selon la ville (Ouagadougou = express)</option>
              <option value="express">Express</option>
              <option value="expedition">Expédition</option>
            </select>
          </label>
          {type === "expedition" && (
            <label className="flex flex-col gap-y-1">
              <span className="txt-compact-small text-ui-fg-subtle">Compagnie de transport</span>
              <input className={inputClass} list="gm-companies" value={company} onChange={(e) => setCompany(e.target.value)} />
              <datalist id="gm-companies">
                {TRANSPORT_COMPANIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          )}
          {type === "expedition" && (
            <label className="flex flex-col gap-y-1">
              <span className="txt-compact-small text-ui-fg-subtle">Ville de destination (sinon celle de la commande)</span>
              <input className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)} />
            </label>
          )}
        </div>
        {couriers && activeCouriers.length === 0 && (
          <p className="txt-compact-small text-ui-fg-subtle">Aucun livreur actif : ajoutez-en un dans l'onglet « Livreurs ».</p>
        )}
        <div className="flex items-center gap-x-3">
          <button type="button" className={primaryButton} disabled={busy} onClick={assign}>
            {busy ? "Envoi…" : `Confier (${selected.length})`}
          </button>
          <NoticeText notice={notice} />
        </div>
      </div>

      {orders === null ? (
        <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
      ) : orders.length === 0 ? (
        <p className="txt-compact-small text-ui-fg-subtle">Aucune commande à confier.</p>
      ) : (
        orders.map((o) => (
          <label key={o.id} className={`${card} flex cursor-pointer items-start gap-x-3 px-4 py-3`}>
            <input type="checkbox" className="mt-1" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            <div className="flex flex-1 flex-col gap-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/app/orders/${o.id}`} className="txt-compact-small-plus text-ui-fg-interactive">
                  {o.order_number}
                </a>
                {o.redeliver && <Badge className={STATUS_BADGE.failed}>À relivrer</Badge>}
                <Badge className={o.paid ? STATUS_BADGE.delivered : "bg-ui-tag-orange-bg text-ui-tag-orange-text"}>
                  {o.paid ? "Payée" : `À encaisser ${formatXof(o.total)}`}
                </Badge>
              </div>
              <span className="txt-compact-small text-ui-fg-base">
                {o.customer_name} · {o.customer_phone}
              </span>
              <span className="txt-compact-small text-ui-fg-subtle">
                {[o.address, o.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
              </span>
            </div>
          </label>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Tournée

type ActionKind = "delivered" | "failed" | "shipped"

const LineAction = ({
  line,
  kind,
  onDone,
  onCancel,
}: {
  line: TourLine
  kind: ActionKind
  onDone: (notice: Notice) => void
  onCancel: () => void
}) => {
  const [collected, setCollected] = useState(String(line.amount_to_collect))
  const [courierFee, setCourierFee] = useState(kind === "shipped" ? "1000" : "")
  const [transportFee, setTransportFee] = useState("")
  const [reason, setReason] = useState(FAILURE_REASONS[0])
  const [otherReason, setOtherReason] = useState("")
  const [redeliver, setRedeliver] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const amounts = {
      amount_collected: kind === "delivered" ? parseAmount(collected) : null,
      courier_fee: parseAmount(courierFee),
      transport_fee: kind === "shipped" ? parseAmount(transportFee) : null,
    }
    if (Object.values(amounts).some((v) => Number.isNaN(v) || (v !== null && v < 0))) {
      setError("Montants invalides : nombres entiers positifs en F CFA.")
      return
    }
    if (kind === "delivered" && amounts.amount_collected === null) {
      setError("Indiquez le montant encaissé (0 si rien n'a été encaissé).")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ sync_warning: string | null }>(`/admin/deliveries/${line.id}/complete`, {
        method: "POST",
        body: {
          status: kind,
          ...amounts,
          ...(kind === "failed" ? { failure_reason: reason === "Autre" ? otherReason : reason, redeliver } : {}),
        },
      })
      onDone(
        result.sync_warning
          ? { kind: "warning", text: `Commande ${line.order_number} enregistrée. ${result.sync_warning}` }
          : { kind: "success", text: `Commande ${line.order_number} : ${STATUS_LABELS[kind].toLowerCase()}.` }
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-2 rounded-md bg-ui-bg-subtle p-3">
      {kind === "delivered" && (
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Montant encaissé</span>
          <input className={`${inputClass} max-w-[160px]`} inputMode="numeric" value={collected} onChange={(e) => setCollected(e.target.value)} />
        </label>
      )}
      {kind === "failed" && (
        <>
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Motif</span>
            <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {[...FAILURE_REASONS, "Autre"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {reason === "Autre" && (
            <input className={inputClass} placeholder="Précisez le motif" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
          )}
          <label className="flex items-center gap-x-2">
            <input type="checkbox" checked={redeliver} onChange={(e) => setRedeliver(e.target.checked)} />
            <span className="txt-compact-small text-ui-fg-base">À relivrer (la commande revient dans « À confier »)</span>
          </label>
        </>
      )}
      <FeeInput
        label={kind === "failed" ? "Frais du livreur pour le déplacement (facultatif)" : "Frais du livreur"}
        value={courierFee}
        onChange={setCourierFee}
      />
      {kind === "shipped" && <FeeInput label="Frais de la compagnie" value={transportFee} onChange={setTransportFee} />}
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      <div className="flex gap-x-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={submit}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}

const TourLineCard = ({ line, locked, onChanged }: { line: TourLine; locked: boolean; onChanged: (n: Notice) => void }) => {
  const [action, setAction] = useState<ActionKind | null>(null)
  const [busy, setBusy] = useState(false)

  const resend = async () => {
    setBusy(true)
    try {
      const r = await api<{ whatsapp_status: string; whatsapp_error: string | null }>(`/admin/deliveries/${line.id}/resend`, {
        method: "POST",
      })
      onChanged(
        r.whatsapp_status === "sent"
          ? { kind: "success", text: `Message renvoyé pour la commande ${line.order_number}.` }
          : { kind: "warning", text: `Message non envoyé : ${r.whatsapp_error ?? ""}` }
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/app/orders/${line.order_id}`} className="txt-compact-small-plus text-ui-fg-interactive">
          {line.order_number}
        </a>
        <Badge className="bg-ui-tag-neutral-bg text-ui-tag-neutral-text">{TYPE_LABELS[line.type]}</Badge>
        <Badge className={STATUS_BADGE[line.status]}>{STATUS_LABELS[line.status]}</Badge>
        {line.postponed_from && line.status === "assigned" && (
          <Badge className="bg-ui-tag-orange-bg text-ui-tag-orange-text">{`Reportée (depuis le ${formatDay(line.postponed_from)})`}</Badge>
        )}
      </div>
      <span className="txt-compact-small text-ui-fg-base">
        {line.customer_name} · {line.customer_phone}
      </span>
      <span className="txt-compact-small text-ui-fg-subtle">{line.place || "—"}</span>
      <span className="txt-compact-small text-ui-fg-subtle">
        {line.items.map((i) => `${i.quantity} x ${i.title}`).join(", ")}
      </span>
      <div className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1 text-ui-fg-base">
        <span>À encaisser : {formatXof(line.status === "canceled" ? 0 : line.amount_to_collect)}</span>
        {line.amount_collected !== null && <span>Encaissé : {formatXof(line.amount_collected)}</span>}
        {line.courier_fee !== null && <span>Frais livreur : {formatXof(line.courier_fee)}</span>}
        {line.transport_fee !== null && <span>Frais compagnie : {formatXof(line.transport_fee)}</span>}
      </div>
      {line.amount_collected !== null && line.amount_collected !== line.amount_to_collect && (
        <span className="txt-compact-small text-ui-fg-error">
          Écart d'encaissement : {formatXof(line.amount_collected - line.amount_to_collect)}
        </span>
      )}
      {line.failure_reason && (
        <span className="txt-compact-small text-ui-fg-subtle">
          Motif : {line.failure_reason}
          {line.redeliver ? " · à relivrer" : ""}
        </span>
      )}
      {line.sync_warning && <span className="txt-compact-small text-ui-tag-orange-text">{line.sync_warning}</span>}
      {line.whatsapp_status === "failed" && line.status === "assigned" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="txt-compact-small text-ui-fg-error">Message WhatsApp non envoyé : {line.whatsapp_error}</span>
          <button type="button" className={secondaryButton} disabled={busy} onClick={resend}>
            Renvoyer le message
          </button>
        </div>
      )}
      {line.status === "assigned" && !locked && !action && (
        <div className="flex flex-wrap gap-2">
          {line.type === "express" ? (
            <button type="button" className={primaryButton} onClick={() => setAction("delivered")}>
              Livrée
            </button>
          ) : (
            <button type="button" className={primaryButton} onClick={() => setAction("shipped")}>
              Déposée à la gare
            </button>
          )}
          <button type="button" className={secondaryButton} onClick={() => setAction("failed")}>
            Échec
          </button>
        </div>
      )}
      {action && (
        <LineAction
          line={line}
          kind={action}
          onCancel={() => setAction(null)}
          onDone={(n) => {
            setAction(null)
            onChanged(n)
          }}
        />
      )}
    </div>
  )
}

const TourTab = () => {
  const { couriers } = useCouriers()
  const [courierId, setCourierId] = useState("")
  const [date, setDate] = useState(todayInOuaga())
  const [tour, setTour] = useState<{ lines: TourLine[]; settlement: Settlement; validated: ValidatedSettlement | null } | null>(null)
  const [received, setReceived] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    if (!courierId && couriers?.length) {
      setCourierId((couriers.find((c) => c.active) ?? couriers[0]).id)
    }
  }, [couriers, courierId])

  const load = useCallback(() => {
    if (!courierId) return
    api<{ lines: TourLine[]; settlement: Settlement; validated: ValidatedSettlement | null }>(
      `/admin/deliveries/tour?courier_id=${courierId}&date=${date}`
    )
      .then((r) => {
        setTour(r)
        setReceived(String(r.settlement.toRemit))
      })
      .catch((e) => setNotice({ kind: "error", text: (e as Error).message }))
  }, [courierId, date])
  useEffect(load, [load])

  const refreshWith = (n: Notice) => {
    setNotice(n)
    load()
  }

  const validate = async () => {
    const amount = parseAmount(received)
    if (amount === null || Number.isNaN(amount)) {
      setNotice({ kind: "error", text: "Indiquez le montant reçu du livreur." })
      return
    }
    setBusy(true)
    try {
      await api("/admin/courier-settlements", { method: "POST", body: { courier_id: courierId, day: date, received_amount: amount } })
      refreshWith({ kind: "success", text: "Versement validé : la journée est verrouillée." })
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const reopen = async () => {
    if (!tour?.validated) return
    setBusy(true)
    try {
      await api(`/admin/courier-settlements/${tour.validated.id}/reopen`, { method: "POST" })
      refreshWith({ kind: "success", text: "Journée rouverte : les livraisons sont de nouveau modifiables." })
    } finally {
      setBusy(false)
    }
  }

  const s = tour?.settlement
  const validated = tour?.validated
  const gap = validated ? validated.received_amount - validated.expected_amount : 0

  return (
    <div className="flex flex-col gap-y-3">
      <div className={`${card} grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-2`}>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Livreur</span>
          <select className={inputClass} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
            {(couriers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? "" : " (désactivé)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Jour</span>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value || todayInOuaga())} />
        </label>
      </div>
      <NoticeText notice={notice} />

      {couriers && couriers.length === 0 ? (
        <p className="txt-compact-small text-ui-fg-subtle">Aucun livreur : ajoutez-en un dans l'onglet « Livreurs ».</p>
      ) : !tour ? (
        <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
      ) : (
        <>
          {tour.lines.length === 0 && <p className="txt-compact-small text-ui-fg-subtle">Aucune livraison ce jour-là.</p>}
          {tour.lines.map((line) => (
            <TourLineCard key={line.id} line={line} locked={Boolean(validated)} onChanged={refreshWith} />
          ))}

          {s && (
            <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
              <div className="txt-compact-small grid grid-cols-2 gap-1 text-ui-fg-base md:grid-cols-4">
                <span>Terminées : {s.completedCount}</span>
                <span>Encaissé : {formatXof(s.collected)}</span>
                <span>Frais livreur : {formatXof(s.courierFees)}</span>
                <span>Frais compagnie : {formatXof(s.transportFees)}</span>
              </div>
              {s.toRemit >= 0 ? (
                <span className="txt-xlarge-plus text-ui-fg-base">À reverser : {formatXof(s.toRemit)}</span>
              ) : (
                <span className="txt-xlarge-plus text-ui-fg-error">Vous devez {formatXof(-s.toRemit)} au livreur</span>
              )}
              {validated ? (
                <div className="flex flex-col gap-y-1">
                  <span className="txt-compact-small text-ui-fg-base">
                    Versement validé le {new Date(validated.validated_at).toLocaleString("fr-FR")} : attendu{" "}
                    {formatXof(validated.expected_amount)}, reçu {formatXof(validated.received_amount)}
                  </span>
                  <span className={`txt-compact-small-plus ${gap === 0 ? "text-ui-tag-green-text" : "text-ui-fg-error"}`}>
                    {gap === 0 ? "Aucun écart" : `Écart : ${gap > 0 ? "+" : ""}${formatXof(gap)}`}
                  </span>
                  <button type="button" className={`${secondaryButton} self-start`} disabled={busy} onClick={reopen}>
                    Rouvrir la journée
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-y-1">
                    <span className="txt-compact-small text-ui-fg-subtle">Montant reçu du livreur</span>
                    <input className={`${inputClass} max-w-[160px]`} inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} />
                  </label>
                  <button type="button" className={primaryButton} disabled={busy} onClick={validate}>
                    Valider le versement
                  </button>
                  {parseAmount(received) !== null && parseAmount(received) !== s.toRemit && !Number.isNaN(parseAmount(received)) && (
                    <span className="txt-compact-small text-ui-fg-error">
                      Écart : {formatXof((parseAmount(received) ?? 0) - s.toRemit)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Expéditions à faire payer

const UnpaidTab = () => {
  const [lines, setLines] = useState<UnpaidExpedition[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ lines: UnpaidExpedition[] }>("/admin/deliveries/unpaid-expeditions")
      .then((r) => setLines(r.lines))
      .catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <p className="txt-compact-small text-ui-fg-error">{error}</p>
  if (!lines) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
  if (!lines.length) return <p className="txt-compact-small text-ui-fg-subtle">Aucune expédition en attente de paiement.</p>
  return (
    <div className="flex flex-col gap-y-3">
      <p className="txt-compact-small text-ui-fg-subtle">
        Une fois le paiement Orange / Moov Money reçu, ouvrez la commande et utilisez « Marquer comme payé ».
      </p>
      {lines.map((l) => (
        <div key={l.order_id} className={`${card} flex flex-col gap-y-0.5 px-4 py-3`}>
          <a href={`/app/orders/${l.order_id}`} className="txt-compact-small-plus text-ui-fg-interactive">
            {l.order_number}
          </a>
          <span className="txt-compact-small text-ui-fg-base">
            {l.customer_name} · <a href={`https://wa.me/${l.customer_phone.replace(/\D/g, "")}`} className="text-ui-fg-interactive">{l.customer_phone}</a>
          </span>
          <span className="txt-compact-small text-ui-fg-subtle">
            {l.transport_company ?? ""} → {l.destination_city ?? ""} · déposée le {formatDay(l.shipped_at.slice(0, 10))}
          </span>
          <span className="txt-compact-small-plus text-ui-fg-base">Reste à payer : {formatXof(l.outstanding)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Livreurs

const CourierForm = ({ courier, onSaved, onCancel }: { courier?: Courier; onSaved: () => void; onCancel?: () => void }) => {
  const [name, setName] = useState(courier?.name ?? "")
  const [phone, setPhone] = useState(courier?.phone ?? "")
  const [notes, setNotes] = useState(courier?.notes ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(courier ? `/admin/couriers/${courier.id}` : "/admin/couriers", {
        method: "POST",
        body: { name, phone, notes: notes || null },
      })
      if (!courier) {
        setName("")
        setPhone("")
        setNotes("")
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <input className={inputClass} placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} placeholder="Numéro WhatsApp (ex. 70 00 00 00)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={inputClass} placeholder="Notes (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      <div className="flex gap-x-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={save}>
          {courier ? "Enregistrer" : "Ajouter le livreur"}
        </button>
        {onCancel && (
          <button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}

const CouriersTab = () => {
  const { couriers, reload } = useCouriers()
  const [editing, setEditing] = useState<string | null>(null)

  const toggleActive = async (c: Courier) => {
    await api(`/admin/couriers/${c.id}`, { method: "POST", body: { active: !c.active } })
    reload()
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
        <span className="txt-compact-small-plus text-ui-fg-base">Nouveau livreur</span>
        <CourierForm onSaved={reload} />
      </div>
      {couriers === null ? (
        <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
      ) : (
        couriers.map((c) => (
          <div key={c.id} className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
            {editing === c.id ? (
              <CourierForm
                courier={c}
                onSaved={() => {
                  setEditing(null)
                  reload()
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="txt-compact-small-plus text-ui-fg-base">
                    {c.name} {!c.active && <Badge className={STATUS_BADGE.canceled}>Désactivé</Badge>}
                  </span>
                  <span className="txt-compact-small text-ui-fg-subtle">
                    {c.phone}
                    {c.notes ? ` · ${c.notes}` : ""}
                  </span>
                </div>
                <div className="flex gap-x-2">
                  <button type="button" className={secondaryButton} onClick={() => setEditing(c.id)}>
                    Modifier
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => toggleActive(c)}>
                    {c.active ? "Désactiver" : "Réactiver"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Page

const readTab = (): Tab => {
  const tab = new URLSearchParams(window.location.search).get("tab")
  return TABS.some((t) => t.id === tab) ? (tab as Tab) : "to-assign"
}

const DeliveriesPage = () => {
  const [tab, setTab] = useState<Tab>(readTab)

  const selectTab = (next: Tab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url.toString())
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className={`${card} px-4 py-3`}>
        <h1 className="txt-large-plus text-ui-fg-base">Livraisons</h1>
        <p className="txt-compact-small text-ui-fg-subtle">
          Confiez les commandes aux livreurs, suivez leur tournée et vérifiez le versement du soir.
        </p>
      </div>
      {/* Onglet courant en fond foncé : un fond blanc + ombre ne se distinguait
          pas assez (retour du propriétaire, 2026-09-27). */}
      <div className="flex gap-x-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
            className={`txt-compact-small-plus whitespace-nowrap rounded-full border px-4 py-2 ${
              tab === t.id
                ? "border-transparent bg-ui-button-inverted text-ui-fg-on-inverted"
                : "border-ui-border-base bg-ui-bg-base text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "to-assign" && <ToAssignTab />}
      {tab === "tour" && <TourTab />}
      {tab === "unpaid" && <UnpaidTab />}
      {tab === "couriers" && <CouriersTab />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Livraisons",
  icon: TruckFast,
})

export default DeliveriesPage
