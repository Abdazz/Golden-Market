import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Receipt } from "@medusajs/icons"
import { useCallback, useEffect, useState } from "react"
import { api, formatXof } from "../../lib/deliveries"

// Page "Approvisionnement" (spec 2026-09-28 approvisionnement-marges) :
// commandes fournisseurs avec le prix de revient de la feuille "Sourcing"
// (P. T. Achat = (qté x P.U.A. + fret) x (1 + frais) ; P. R. total =
// (P. T. Achat + pub) x taux + transport), réception = stock Medusa mis à
// jour, et onglet "Marges". HTML natif (conflit de types React 18/19).

type Line = {
  id?: string
  variant_id: string
  title: string
  quantity: string
  unit_price_usd: string
  freight_usd: string
  transport_xof: string
  ads_usd: string
  price_xof?: number | null
}
type OrderSummary = {
  id: string
  reference: string
  supplier: string | null
  status: "draft" | "ordered" | "received" | "canceled"
  created_at: string
  ordered_at: string | null
  received_at: string | null
  line_count: number
  totals: { quantity: number; cost_total_xof: number; cash_out_xof: number }
}
type VariantHit = { variant_id: string; product_title: string; variant_title: string | null; price: number | null }
type MarginRow = {
  variant_id: string
  product_title: string
  variant_title: string | null
  price: number | null
  unit_cost_xof: number | null
  margin_xof: number | null
  margin_percent: number | null
}

const STATUS: Record<OrderSummary["status"], { label: string; className: string }> = {
  draft: { label: "En préparation", className: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text" },
  ordered: { label: "Commandée", className: "bg-ui-tag-blue-bg text-ui-tag-blue-text" },
  received: { label: "Réceptionnée", className: "bg-ui-tag-green-bg text-ui-tag-green-text" },
  canceled: { label: "Annulée", className: "bg-ui-tag-red-bg text-ui-tag-red-text" },
}

const inputClass =
  "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base disabled:opacity-60"
const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"
const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg"

const toNumber = (value: string) => {
  const n = Number(String(value).replace(",", ".").replace(/\s/g, ""))
  return Number.isFinite(n) ? n : 0
}
// Mêmes formules que src/lib/procurement-rules.ts (calcul en direct).
const lineCosts = (line: Line, rate: number, fee: number) => {
  const quantity = toNumber(line.quantity)
  const purchaseUsd = (quantity * toNumber(line.unit_price_usd) + toNumber(line.freight_usd)) * (1 + fee)
  const costTotal = (purchaseUsd + toNumber(line.ads_usd)) * rate + toNumber(line.transport_xof)
  return { purchaseUsd, costTotal, unitCost: quantity > 0 ? costTotal / quantity : 0 }
}
const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`)
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—")

const Badge = ({ status }: { status: OrderSummary["status"] }) => (
  <span className={`txt-compact-xsmall-plus whitespace-nowrap rounded-full px-2 py-0.5 ${STATUS[status].className}`}>
    {STATUS[status].label}
  </span>
)

const VariantSearch = ({ onPick }: { onPick: (hit: VariantHit) => void }) => {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<VariantHit[]>([])
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    const t = window.setTimeout(() => {
      api<{ variants: VariantHit[] }>(`/admin/phone-orders/variants?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.variants))
        .catch(() => setHits([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [q])
  return (
    <div className="relative">
      <input className={inputClass} placeholder="Ajouter un produit : tapez son nom…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          {hits.map((hit) => (
            <button
              key={hit.variant_id}
              type="button"
              className="txt-compact-small flex w-full justify-between px-3 py-2 text-left hover:bg-ui-bg-subtle"
              onClick={() => {
                onPick(hit)
                setQ("")
                setHits([])
              }}
            >
              <span>
                {hit.product_title}
                {hit.variant_title ? ` - ${hit.variant_title}` : ""}
              </span>
              <span className="text-ui-fg-subtle">{hit.price !== null ? formatXof(hit.price) : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const OrderEditor = ({ id, onBack }: { id: string | null; onBack: () => void }) => {
  const [orderId, setOrderId] = useState<string | null>(id)
  const [status, setStatus] = useState<OrderSummary["status"]>("draft")
  const [reference, setReference] = useState("")
  const [supplier, setSupplier] = useState("")
  const [rate, setRate] = useState("670")
  const [fee, setFee] = useState("2,99")
  const [note, setNote] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  const load = useCallback(async (orderIdToLoad: string) => {
    const { order } = await api<{ order: any }>(`/admin/supplier-orders/${orderIdToLoad}`)
    setStatus(order.status)
    setReference(order.reference)
    setSupplier(order.supplier ?? "")
    setRate(String(order.exchange_rate))
    setFee(String(Math.round(order.fee_rate * 10000) / 100).replace(".", ","))
    setNote(order.note ?? "")
    setLines(
      order.lines.map((l: any) => ({
        id: l.id,
        variant_id: l.variant_id,
        title: l.title,
        quantity: String(l.quantity),
        unit_price_usd: String(l.unit_price_usd).replace(".", ","),
        freight_usd: String(l.freight_usd).replace(".", ","),
        transport_xof: String(l.transport_xof),
        ads_usd: String(l.ads_usd).replace(".", ","),
        price_xof: l.price_xof,
      }))
    )
  }, [])

  useEffect(() => {
    if (id) load(id).catch((e) => setNotice({ kind: "error", text: (e as Error).message }))
  }, [id, load])

  const editable = status === "draft"
  const rateNumber = toNumber(rate)
  const feeNumber = toNumber(fee) / 100
  const computed = lines.map((l) => lineCosts(l, rateNumber, feeNumber))
  const totalCost = computed.reduce((s, c) => s + c.costTotal, 0)
  const setLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const save = async (): Promise<string | null> => {
    setBusy(true)
    setNotice(null)
    try {
      const body = {
        reference,
        supplier: supplier || null,
        exchange_rate: rate,
        fee_rate: String(feeNumber),
        note: note || null,
        lines: lines.map((l) => ({
          variant_id: l.variant_id,
          title: l.title,
          quantity: l.quantity,
          unit_price_usd: l.unit_price_usd,
          freight_usd: l.freight_usd,
          transport_xof: l.transport_xof,
          ads_usd: l.ads_usd,
        })),
      }
      const { order } = await api<{ order: { id: string } }>(orderId ? `/admin/supplier-orders/${orderId}` : "/admin/supplier-orders", {
        method: "POST",
        body,
      })
      setOrderId(order.id)
      await load(order.id)
      setNotice({ kind: "success", text: "Commande enregistrée." })
      return order.id
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message })
      return null
    } finally {
      setBusy(false)
    }
  }

  const action = async (name: "place" | "receive" | "cancel", success: string) => {
    let targetId = orderId
    if (name === "place") targetId = await save()
    if (!targetId) return
    setBusy(true)
    setNotice(null)
    try {
      await api(`/admin/supplier-orders/${targetId}/${name}`, { method: "POST" })
      await load(targetId)
      setNotice({ kind: "success", text: success })
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="txt-compact-small text-ui-fg-interactive" onClick={onBack}>
          ‹ Toutes les commandes
        </button>
        <Badge status={status} />
      </div>

      <div className={`${card} grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-4`}>
        <label className="flex flex-col gap-y-1 md:col-span-2">
          <span className="txt-compact-small text-ui-fg-subtle">Nom de la commande</span>
          <input className={inputClass} disabled={!editable} value={reference} placeholder="Ex. Alibaba 28/09" onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1 md:col-span-2">
          <span className="txt-compact-small text-ui-fg-subtle">Fournisseur</span>
          <input className={inputClass} disabled={!editable} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Taux (F CFA pour 1 $)</span>
          <input className={inputClass} disabled={!editable} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Frais de transaction (%)</span>
          <input className={inputClass} disabled={!editable} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1 md:col-span-2">
          <span className="txt-compact-small text-ui-fg-subtle">Note</span>
          <input className={inputClass} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
        <span className="txt-compact-small-plus text-ui-fg-base">Produits commandés</span>
        {lines.length === 0 && <p className="txt-compact-small text-ui-fg-subtle">Aucun produit pour l'instant.</p>}
        {lines.map((line, index) => {
          const c = computed[index]
          const marginUnit = line.price_xof != null && c.unitCost > 0 ? line.price_xof - c.unitCost : null
          return (
            <div key={`${line.variant_id}-${index}`} className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="txt-compact-small-plus text-ui-fg-base">{line.title}</span>
                {editable && (
                  <button type="button" className="txt-compact-xsmall text-ui-fg-error" onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}>
                    Retirer
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {(
                  [
                    ["quantity", "Quantité"],
                    ["unit_price_usd", "P. U. A. ($)"],
                    ["freight_usd", "Fret ($)"],
                    ["transport_xof", "Transport (F)"],
                    ["ads_usd", "Pub ($)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-y-1">
                    <span className="txt-compact-xsmall text-ui-fg-subtle">{label}</span>
                    <input className={inputClass} disabled={!editable} inputMode="decimal" value={line[key]} onChange={(e) => setLine(index, { [key]: e.target.value })} />
                  </label>
                ))}
              </div>
              <div className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1 text-ui-fg-subtle">
                <span>P. T. Achat : {c.purchaseUsd.toFixed(2).replace(".", ",")} $</span>
                <span>P. R. total : {formatXof(Math.round(c.costTotal))}</span>
                <span className="txt-compact-small-plus text-ui-fg-base">P. R. unitaire : {formatXof(Math.round(c.unitCost))}</span>
                <span>Prix de vente : {line.price_xof != null ? formatXof(line.price_xof) : "—"}</span>
                <span className={marginUnit !== null && marginUnit < 0 ? "text-ui-fg-error" : "text-ui-tag-green-text"}>
                  Marge : {marginUnit !== null ? `${formatXof(Math.round(marginUnit))} (${percent(marginUnit / c.unitCost)})` : "—"}
                </span>
              </div>
            </div>
          )
        })}
        {editable && (
          <VariantSearch
            onPick={(hit) =>
              setLines((ls) => [
                ...ls,
                {
                  variant_id: hit.variant_id,
                  title: `${hit.product_title}${hit.variant_title ? ` - ${hit.variant_title}` : ""}`,
                  quantity: "1",
                  unit_price_usd: "",
                  freight_usd: "0",
                  transport_xof: "0",
                  ads_usd: "0",
                  price_xof: hit.price,
                },
              ])
            }
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ui-border-base pt-2">
          <span className="txt-compact-small-plus text-ui-fg-base">Coût de revient total : {formatXof(Math.round(totalCost))}</span>
        </div>
      </div>

      {notice && <p className={`txt-compact-small ${notice.kind === "error" ? "text-ui-fg-error" : "text-ui-tag-green-text"}`}>{notice.text}</p>}

      <div className="flex flex-wrap gap-2">
        {editable && (
          <>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => void save()}>
              Enregistrer
            </button>
            <button type="button" className={primaryButton} disabled={busy || lines.length === 0} onClick={() => void action("place", "Commande passée : achat inscrit au journal de caisse.")}>
              Commander
            </button>
          </>
        )}
        {status === "ordered" && (
          <button type="button" className={primaryButton} disabled={busy} onClick={() => void action("receive", "Commande réceptionnée : stock mis à jour, coûts de revient enregistrés.")}>
            Réceptionner
          </button>
        )}
        {(status === "draft" || status === "ordered") && orderId && (
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => void action("cancel", "Commande annulée.")}>
            Annuler la commande
          </button>
        )}
      </div>
    </div>
  )
}

const OrdersTab = () => {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const load = useCallback(() => {
    api<{ orders: OrderSummary[] }>("/admin/supplier-orders").then((r) => setOrders(r.orders)).catch(() => setOrders([]))
  }, [])
  useEffect(load, [load])

  if (editing) {
    return (
      <OrderEditor
        id={editing === "new" ? null : editing}
        onBack={() => {
          setEditing(null)
          load()
        }}
      />
    )
  }
  return (
    <div className="flex flex-col gap-y-3">
      <button type="button" className={`${primaryButton} self-start`} onClick={() => setEditing("new")}>
        Nouvelle commande fournisseur
      </button>
      {orders === null ? (
        <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
      ) : orders.length === 0 ? (
        <p className="txt-compact-small text-ui-fg-subtle">Aucune commande fournisseur.</p>
      ) : (
        orders.map((o) => (
          <button key={o.id} type="button" onClick={() => setEditing(o.id)} className={`${card} flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-ui-bg-subtle`}>
            <div className="flex flex-col">
              <span className="txt-compact-small-plus text-ui-fg-base">{o.reference}</span>
              <span className="txt-compact-xsmall text-ui-fg-subtle">
                {o.supplier ? `${o.supplier} · ` : ""}
                {o.line_count} produit(s), {o.totals.quantity} unité(s) · créée le {formatDate(o.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-x-3">
              <span className="txt-compact-small-plus text-ui-fg-base">{formatXof(Math.round(o.totals.cost_total_xof))}</span>
              <Badge status={o.status} />
            </div>
          </button>
        ))
      )}
    </div>
  )
}

// Coût de revient modifiable à la main (stock acheté avant l'outil).
const CostCell = ({ row, onSaved }: { row: MarginRow; onSaved: () => void }) => {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.unit_cost_xof !== null ? String(Math.round(row.unit_cost_xof)) : "")
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const cost = toNumber(value)
    if (!(cost > 0)) {
      setError("Coût invalide")
      return
    }
    try {
      await api("/admin/margins/costs", { method: "POST", body: { variant_id: row.variant_id, unit_cost_xof: cost } })
      setEditing(false)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  if (!editing) {
    return (
      <button type="button" className="text-right tabular-nums text-ui-fg-base hover:text-ui-fg-interactive" title="Modifier le coût de revient" onClick={() => setEditing(true)}>
        {row.unit_cost_xof !== null ? formatXof(Math.round(row.unit_cost_xof)) : <span className="text-ui-fg-interactive">coût inconnu - saisir</span>}
      </button>
    )
  }
  return (
    <span className="flex items-center justify-end gap-x-1">
      <input
        className={`${inputClass} max-w-[110px]`}
        inputMode="numeric"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save()
          if (e.key === "Escape") setEditing(false)
        }}
      />
      <button type="button" className="txt-compact-xsmall-plus text-ui-fg-interactive" onClick={() => void save()}>
        OK
      </button>
      {error && <span className="txt-compact-xsmall text-ui-fg-error">{error}</span>}
    </span>
  )
}

const MarginsTab = () => {
  const [data, setData] = useState<{
    variants: MarginRow[]
    month_margin: { revenue: number; cost: number; margin: number; orders: number; unknown_cost_items: number }
  } | null>(null)
  const [onlyKnown, setOnlyKnown] = useState(false)
  const load = useCallback(() => {
    api<any>("/admin/margins").then(setData).catch(() => setData(null))
  }, [])
  useEffect(load, [load])
  if (!data) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
  const m = data.month_margin
  const rows = onlyKnown ? data.variants.filter((v) => v.unit_cost_xof !== null) : data.variants
  return (
    <div className="flex flex-col gap-y-3">
      <div className={`${card} flex flex-col gap-y-1 px-4 py-3`}>
        <span className="txt-compact-small text-ui-fg-subtle">Marge brute du mois (commandes encaissées)</span>
        <span className={`txt-xlarge-plus ${m.margin < 0 ? "text-ui-fg-error" : "text-ui-tag-green-text"}`}>{formatXof(Math.round(m.margin))}</span>
        <span className="txt-compact-small text-ui-fg-subtle">
          Ventes {formatXof(Math.round(m.revenue))} − coût {formatXof(Math.round(m.cost))} · {m.orders} commande(s)
          {m.unknown_cost_items > 0 ? ` · ${m.unknown_cost_items} article(s) sans coût connu non comptés` : ""}
        </span>
      </div>
      <label className="flex items-center gap-x-2">
        <input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} />
        <span className="txt-compact-small text-ui-fg-base">Seulement les produits dont le coût est connu</span>
      </label>
      <p className="txt-compact-small text-ui-fg-subtle">
        Le coût de revient se met à jour à chaque réception de commande fournisseur ; cliquez sur un coût pour le saisir à la main (stock déjà acheté).
      </p>
      <div className={`${card} flex flex-col`}>
        <div className="txt-compact-xsmall grid grid-cols-4 gap-2 border-b border-ui-border-base px-4 py-2 text-ui-fg-subtle">
          <span>Produit</span>
          <span className="text-right">Coût de revient</span>
          <span className="text-right">Prix de vente</span>
          <span className="text-right">Marge</span>
        </div>
        {rows.map((v) => (
          <div key={v.variant_id} className="txt-compact-small grid grid-cols-4 gap-2 border-b border-ui-border-base px-4 py-2 last:border-b-0">
            <span className="text-ui-fg-base">
              {v.product_title}
              {v.variant_title ? <span className="text-ui-fg-subtle"> - {v.variant_title}</span> : null}
            </span>
            <CostCell row={v} onSaved={load} />
            <span className="text-right tabular-nums text-ui-fg-base">{v.price !== null ? formatXof(v.price) : "—"}</span>
            <span className={`text-right tabular-nums ${v.margin_xof !== null && v.margin_xof < 0 ? "text-ui-fg-error" : "text-ui-tag-green-text"}`}>
              {v.margin_xof !== null ? `${formatXof(Math.round(v.margin_xof))} (${percent(v.margin_percent)})` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const ProcurementPage = () => {
  const [tab, setTab] = useState<"orders" | "margins">(() =>
    new URLSearchParams(window.location.search).get("tab") === "margins" ? "margins" : "orders"
  )
  const select = (next: "orders" | "margins") => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url.toString())
  }
  return (
    <div className="flex flex-col gap-y-4">
      <div className={`${card} px-4 py-3`}>
        <h1 className="txt-large-plus text-ui-fg-base">Approvisionnement</h1>
        <p className="txt-compact-small text-ui-fg-subtle">
          Commandes fournisseurs, prix de revient (formules de votre feuille Sourcing) et marges.
        </p>
      </div>
      <div className="flex gap-x-2" role="tablist">
        {(
          [
            ["orders", "Commandes fournisseurs"],
            ["margins", "Marges"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => select(id)}
            className={`txt-compact-small-plus whitespace-nowrap rounded-full border px-4 py-2 ${
              tab === id
                ? "border-transparent bg-ui-button-inverted text-ui-fg-on-inverted"
                : "border-ui-border-base bg-ui-bg-base text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "orders" ? <OrdersTab /> : <MarginsTab />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Approvisionnement",
  icon: Receipt,
})

export default ProcurementPage
