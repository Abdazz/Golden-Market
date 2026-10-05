import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import { useCallback, useEffect, useState } from "react"
import { api, formatXof } from "../../lib/deliveries"

// Page "Tableau de bord" (spec 2026-10-04 tableau-de-bord) : "À faire
// aujourd'hui" puis chiffres du jour et du mois, en lecture seule ; chaque
// ligne mène à la page qui permet d'agir. Pas de composant @medusajs/ui
// (conflit de types React 18/19) : HTML natif + classes utilitaires Medusa.

type Block<T> = ({ available: true } & T) | { available: false }
type Totals = { count: number; amount: number }
type Dashboard = {
  today: string
  month: string
  todo: {
    to_assign: Block<{ count: number; redeliver: number }>
    in_progress: Block<{ count: number; late: number }>
    courier_money: Block<{ total: number; couriers: { id: string; name: string; amount: number; days: number }[] }>
    prospects: Block<{ due: number; overdue: number; back_in_stock: number }>
    conversations: Block<{ awaiting: number }>
  }
  figures: {
    ordered: Block<{ today: Totals; month: Totals }>
    collected: Block<{ today: number; month: number }>
    cash: Block<{ balance: number; month_in: number; month_out: number }>
    margin: Block<{ revenue: number; cost: number; margin: number; orders: number; unknown_cost_items: number }>
    courier_stock: Block<{ total: number; couriers: { id: string; name: string; quantity: number }[] }>
  }
}

const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-4"
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })

const Unavailable = () => <p className="txt-compact-small text-ui-fg-muted">Indisponible pour le moment.</p>

const UnavailableFigure = ({ label }: { label: string }) => (
  <div>
    <p className="txt-compact-small text-ui-fg-subtle">{label}</p>
    <p className="txt-compact-small text-ui-fg-muted">Indisponible</p>
  </div>
)

// Ligne "À faire" : grisée quand il n'y a rien à faire.
const TodoCard = ({ title, value, empty, href, children }: { title: string; value: string; empty: boolean; href: string; children?: React.ReactNode }) => (
  <a href={href} className={`${card} block transition-colors hover:bg-ui-bg-base-hover ${empty ? "opacity-60" : ""}`}>
    <p className="txt-compact-small text-ui-fg-subtle">{title}</p>
    <p className="txt-xlarge-plus text-ui-fg-base mt-1">{value}</p>
    <div className="txt-compact-small text-ui-fg-muted mt-1">{children}</div>
  </a>
)

const TodoSection = ({ todo }: { todo: Dashboard["todo"] }) => {
  const { to_assign, in_progress, courier_money, prospects, conversations } = todo
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {to_assign.available ? (
        <TodoCard title="Commandes à confier" value={String(to_assign.count)} empty={to_assign.count === 0} href="/app/deliveries?tab=to-assign">
          {to_assign.redeliver > 0 ? `dont ${to_assign.redeliver} à relivrer` : "à donner à un livreur"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Commandes à confier</p><Unavailable /></div>
      )}
      {in_progress.available ? (
        <TodoCard title="Livraisons en cours" value={String(in_progress.count)} empty={in_progress.count === 0} href="/app/deliveries?tab=tour">
          {in_progress.late > 0 ? `dont ${in_progress.late} en retard` : "aucune en retard"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Livraisons en cours</p><Unavailable /></div>
      )}
      {courier_money.available ? (
        <TodoCard title="Argent à récupérer chez les livreurs" value={formatXof(courier_money.total)} empty={courier_money.couriers.length === 0} href="/app/deliveries?tab=tour">
          {courier_money.couriers.length === 0
            ? "tous les versements sont validés"
            : courier_money.couriers.map((c) => `${c.name} : ${formatXof(c.amount)} (${plural(c.days, "jour")})`).join(" · ")}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Argent à récupérer chez les livreurs</p><Unavailable /></div>
      )}
      {prospects.available ? (
        <TodoCard title="Prospects à relancer" value={String(prospects.due)} empty={prospects.due === 0 && prospects.back_in_stock === 0} href="/app/prospects">
          {[
            prospects.overdue > 0 ? `dont ${prospects.overdue} en retard` : null,
            prospects.back_in_stock > 0 ? `${prospects.back_in_stock} en attente : produit de retour en stock` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "rien à relancer"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Prospects à relancer</p><Unavailable /></div>
      )}
      {conversations.available ? (
        <TodoCard title="Conversations en attente" value={String(conversations.awaiting)} empty={conversations.awaiting === 0} href="/app/whatsapp-conversations">
          {conversations.awaiting > 0 ? "clients qui attendent votre réponse" : "aucun client en attente"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Conversations en attente</p><Unavailable /></div>
      )}
    </div>
  )
}

const Figure = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div>
    <p className="txt-compact-small text-ui-fg-subtle">{label}</p>
    <p className="txt-large-plus text-ui-fg-base">{value}</p>
    {sub && <p className="txt-compact-small text-ui-fg-muted">{sub}</p>}
  </div>
)

const FiguresSection = ({ figures, month }: { figures: Dashboard["figures"]; month: string }) => {
  const { ordered, collected, cash, margin, courier_stock } = figures
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className={card}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Aujourd'hui</h3>
        <div className="grid grid-cols-2 gap-3">
          {ordered.available ? <Figure label="Commandé" value={formatXof(ordered.today.amount)} sub={plural(ordered.today.count, "commande")} /> : <UnavailableFigure label="Commandé" />}
          {collected.available ? <Figure label="Encaissé" value={formatXof(collected.today)} /> : <UnavailableFigure label="Encaissé" />}
        </div>
      </div>
      <div className={card}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Ce mois ({monthLabel(month)})</h3>
        <div className="grid grid-cols-2 gap-3">
          {ordered.available ? <Figure label="Commandé" value={formatXof(ordered.month.amount)} sub={plural(ordered.month.count, "commande")} /> : <UnavailableFigure label="Commandé" />}
          {collected.available ? <Figure label="Encaissé" value={formatXof(collected.month)} /> : <UnavailableFigure label="Encaissé" />}
        </div>
      </div>
      <a href="/app/cash" className={`${card} block hover:bg-ui-bg-base-hover`}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Caisse</h3>
        {cash.available ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure label="Solde" value={formatXof(cash.balance)} />
            <Figure label="Entrées du mois" value={formatXof(cash.month_in)} />
            <Figure label="Sorties du mois" value={formatXof(cash.month_out)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <UnavailableFigure label="Solde" />
            <UnavailableFigure label="Entrées du mois" />
            <UnavailableFigure label="Sorties du mois" />
          </div>
        )}
      </a>
      <a href="/app/procurement?tab=margins" className={`${card} block hover:bg-ui-bg-base-hover`}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Marge brute du mois</h3>
        {margin.available ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure label="Marge" value={formatXof(margin.margin)} sub={plural(margin.orders, "commande encaissée")} />
              <Figure label="Ventes" value={formatXof(margin.revenue)} />
              <Figure label="Coût" value={formatXof(margin.cost)} />
            </div>
            {margin.unknown_cost_items > 0 && (
              <p className="txt-compact-small text-ui-fg-error mt-2">
                {plural(margin.unknown_cost_items, "article")} sans coût de revient : marge incomplète.
              </p>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <UnavailableFigure label="Marge" />
            <UnavailableFigure label="Ventes" />
            <UnavailableFigure label="Coût" />
          </div>
        )}
      </a>
      <a href="/app/deliveries?tab=stock" className={`${card} block hover:bg-ui-bg-base-hover`}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Stock chez les livreurs</h3>
        {courier_stock.available ? (
          <>
            <Figure label="Articles confiés" value={String(courier_stock.total)} />
            {courier_stock.couriers.length > 0 && (
              <p className="txt-compact-small text-ui-fg-muted mt-1">
                {courier_stock.couriers.map((c) => `${c.name} : ${c.quantity}`).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <Unavailable />
        )}
      </a>
    </div>
  )
}

const DashboardPage = () => {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<Dashboard>("/admin/dashboard")
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="txt-xlarge-plus text-ui-fg-base">Tableau de bord</h1>
          {data && <p className="txt-compact-small text-ui-fg-subtle first-letter:uppercase">{dayLabel(data.today)}</p>}
        </div>
        <button type="button" className={secondaryButton} onClick={load} disabled={loading}>
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </div>
      {error && (
        <div className={card}>
          <p className="txt-compact-small text-ui-fg-error">Impossible de charger le tableau de bord : {error}</p>
          <button type="button" className={`${secondaryButton} mt-2`} onClick={load}>Réessayer</button>
        </div>
      )}
      {!data && !error && <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>}
      {data && (
        <>
          <h2 className="txt-large-plus text-ui-fg-base">À faire aujourd'hui</h2>
          <TodoSection todo={data.todo} />
          <h2 className="txt-large-plus text-ui-fg-base mt-2">Chiffres</h2>
          <FiguresSection figures={data.figures} month={data.month} />
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Tableau de bord",
  icon: ChartBar,
  rank: 0,
})

export default DashboardPage
