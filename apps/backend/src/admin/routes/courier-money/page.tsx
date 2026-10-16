import { useEffect, useState } from "react"
import { api, formatDay, formatOrderDate, formatXof, STATUS_BADGE, STATUS_LABELS, TYPE_LABELS } from "../../lib/deliveries"
import type { TourLine } from "../../lib/deliveries"
import { Badge, card } from "../../components/delivery-ui"

// Page « Argent à récupérer chez les livreurs » (ouverte depuis la carte du
// tableau de bord) : livreurs concernés et montants dus ; un clic sur un livreur
// déroule ses journées sans versement validé avec le détail des commandes.
// Pas dans le menu latéral (aucune defineRouteConfig). Lecture seule : le
// versement se valide dans Livraisons > Tournée du jour.

type Day = {
  day: string
  to_remit: number
  collected: number
  courier_fees: number
  transport_fees: number
  lines: TourLine[]
}
type CourierMoney = { id: string; name: string; amount: number; days: Day[] }

const LineDetail = ({ line }: { line: TourLine }) => (
  <div className="flex flex-col gap-y-0.5 border-t border-ui-border-base px-4 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/app/orders/${line.order_id}`} className="txt-compact-small-plus text-ui-fg-interactive">
        {line.order_number}
      </a>
      <Badge className="bg-ui-tag-neutral-bg text-ui-tag-neutral-text">{TYPE_LABELS[line.type]}</Badge>
      <Badge className={STATUS_BADGE[line.status]}>{STATUS_LABELS[line.status]}</Badge>
    </div>
    {line.order_created_at && (
      <span className="txt-compact-small text-ui-fg-subtle">Commandée le {formatOrderDate(line.order_created_at)}</span>
    )}
    <span className="txt-compact-small text-ui-fg-base">
      {line.customer_name} · {line.customer_phone}
    </span>
    <span className="txt-compact-small text-ui-fg-subtle">{line.place || "—"}</span>
    <span className="txt-compact-small text-ui-fg-subtle">{line.items.map((i) => `${i.quantity} x ${i.title}`).join(", ")}</span>
    <div className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1 text-ui-fg-base">
      <span>À encaisser : {formatXof(line.amount_to_collect)}</span>
      {line.amount_collected !== null && <span>Encaissé : {formatXof(line.amount_collected)}</span>}
      {line.courier_fee !== null && <span>Frais livreur : {formatXof(line.courier_fee)}</span>}
      {line.transport_fee !== null && <span>Frais Expédition : {formatXof(line.transport_fee)}</span>}
    </div>
    {line.failure_reason && <span className="txt-compact-small text-ui-fg-subtle">Motif : {line.failure_reason}</span>}
  </div>
)

const CourierRow = ({ courier }: { courier: CourierMoney }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className={card}>
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="flex flex-col">
          <span className="txt-compact-small-plus text-ui-fg-base">{courier.name}</span>
          <span className="txt-compact-small text-ui-fg-subtle">
            {courier.days.length} journée(s) sans versement validé
          </span>
        </span>
        <span className="flex items-center gap-x-3">
          <span className="txt-compact-medium-plus text-ui-fg-base">{formatXof(courier.amount)}</span>
          <span className="txt-compact-small text-ui-fg-subtle">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open &&
        courier.days.map((d) => (
          <div key={d.day}>
            <div className="txt-compact-small flex flex-wrap items-center justify-between gap-2 border-t border-ui-border-base bg-ui-bg-subtle px-4 py-2 text-ui-fg-base">
              <span className="txt-compact-small-plus">Journée du {formatDay(d.day)}</span>
              <span className="text-ui-fg-subtle">
                Encaissé {formatXof(d.collected)} − frais livreur {formatXof(d.courier_fees)} − frais Expédition {formatXof(d.transport_fees)} ={" "}
                <span className="txt-compact-small-plus text-ui-fg-base">{formatXof(d.to_remit)} à reverser</span>
              </span>
            </div>
            {d.lines.map((l) => (
              <LineDetail key={l.id} line={l} />
            ))}
          </div>
        ))}
    </div>
  )
}

const CourierMoneyPage = () => {
  const [data, setData] = useState<{ total: number; couriers: CourierMoney[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ total: number; couriers: CourierMoney[] }>("/admin/deliveries/courier-money")
      .then(setData)
      .catch((e) => setError((e as Error).message))
  }, [])

  return (
    <div className="flex flex-col gap-y-3 p-6">
      <div className={`${card} flex flex-col gap-y-1 px-4 py-3`}>
        <a href="/app/dashboard" className="txt-compact-small text-ui-fg-interactive">
          ‹ Tableau de bord
        </a>
        <h1 className="txt-large-plus text-ui-fg-base">Argent à récupérer chez les livreurs</h1>
        <p className="txt-compact-small text-ui-fg-subtle">
          Journées terminées sans versement validé. Le versement se valide dans Livraisons, onglet « Tournée du jour ».
        </p>
        {data && <p className="txt-xlarge-plus text-ui-fg-base">{formatXof(data.total)}</p>}
      </div>
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      {!data && !error && <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>}
      {data && !data.couriers.length && (
        <p className="txt-compact-small text-ui-fg-subtle">Tous les versements sont validés.</p>
      )}
      {data?.couriers.map((c) => (
        <CourierRow key={c.id} courier={c} />
      ))}
    </div>
  )
}

export default CourierMoneyPage
