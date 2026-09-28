import { defineRouteConfig } from "@medusajs/admin-sdk"
import { UsersSolid } from "@medusajs/icons"
import { useCallback, useEffect, useState } from "react"
import { api } from "../../lib/deliveries"

// Page "Prospects" (spec 2026-09-28 prospects) : clients à relancer
// aujourd'hui, clients qui attendent un produit en rupture (retours en stock
// en premier), suivi relancé / perdu ; conversion automatique à la commande.
// HTML natif (conflit de types React 18/19).

type Prospect = {
  id: string
  phone: string
  name: string | null
  variant_id: string | null
  product_label: string | null
  product: string | null
  status: "to_follow_up" | "waiting_stock" | "converted" | "lost"
  follow_up_on: string | null
  last_contacted_at: string | null
  follow_up_count: number
  note: string | null
  order_id: string | null
  overdue?: boolean
  available?: boolean | null
}
type Lists = { today: string; due: Prospect[]; waiting: Prospect[]; all: Prospect[] }
type VariantHit = { variant_id: string; product_title: string; variant_title: string | null }
type Tab = "due" | "waiting" | "all"

const STATUS: Record<Prospect["status"], { label: string; className: string }> = {
  to_follow_up: { label: "À relancer", className: "bg-ui-tag-blue-bg text-ui-tag-blue-text" },
  waiting_stock: { label: "Attend le stock", className: "bg-ui-tag-orange-bg text-ui-tag-orange-text" },
  converted: { label: "A commandé", className: "bg-ui-tag-green-bg text-ui-tag-green-text" },
  lost: { label: "Perdu", className: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text" },
}

const inputClass =
  "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"
const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg"
const formatDay = (day: string | null) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : "—")
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`

type FormState = {
  id: string | null
  phone: string
  name: string
  status: "to_follow_up" | "waiting_stock"
  variant_id: string | null
  product_label: string
  follow_up_on: string
  note: string
}
const emptyForm = (): FormState => ({ id: null, phone: "", name: "", status: "to_follow_up", variant_id: null, product_label: "", follow_up_on: "", note: "" })

const ProspectForm = ({ initial, onSaved, onCancel }: { initial: FormState; onSaved: () => void; onCancel: () => void }) => {
  const [form, setForm] = useState(initial)
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<VariantHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

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

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(form.id ? `/admin/prospects/${form.id}` : "/admin/prospects", {
        method: "POST",
        body: {
          phone: form.phone,
          name: form.name || null,
          status: form.status,
          variant_id: form.variant_id,
          product_label: form.product_label || null,
          follow_up_on: form.status === "to_follow_up" ? form.follow_up_on || null : null,
          note: form.note || null,
        },
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
      <span className="txt-compact-small-plus text-ui-fg-base">{form.id ? "Modifier le prospect" : "Nouveau prospect"}</span>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Numéro WhatsApp</span>
          <input className={inputClass} value={form.phone} placeholder="70 00 00 00" onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Nom</span>
          <input className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Situation</span>
          <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value as FormState["status"] })}>
            <option value="to_follow_up">À relancer</option>
            <option value="waiting_stock">Attend un produit en rupture</option>
          </select>
        </label>
        <label className="relative flex flex-col gap-y-1 md:col-span-2">
          <span className="txt-compact-small text-ui-fg-subtle">Produit qui l'intéresse</span>
          {form.variant_id ? (
            <span className="txt-compact-small flex items-center justify-between rounded-md border border-ui-border-base px-2 py-1.5">
              {form.product_label}
              <button type="button" className="txt-compact-xsmall text-ui-fg-error" onClick={() => set({ variant_id: null, product_label: "" })}>
                Changer
              </button>
            </span>
          ) : (
            <input
              className={inputClass}
              value={q || form.product_label}
              placeholder="Tapez le nom d'un produit (ou un texte libre)"
              onChange={(e) => {
                setQ(e.target.value)
                set({ product_label: e.target.value })
              }}
            />
          )}
          {hits.length > 0 && !form.variant_id && (
            <div className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
              {hits.map((hit) => (
                <button
                  key={hit.variant_id}
                  type="button"
                  className="txt-compact-small block w-full px-3 py-2 text-left hover:bg-ui-bg-subtle"
                  onClick={() => {
                    set({ variant_id: hit.variant_id, product_label: `${hit.product_title}${hit.variant_title ? ` - ${hit.variant_title}` : ""}` })
                    setQ("")
                    setHits([])
                  }}
                >
                  {hit.product_title}
                  {hit.variant_title ? ` - ${hit.variant_title}` : ""}
                </button>
              ))}
            </div>
          )}
        </label>
        {form.status === "to_follow_up" && (
          <label className="flex flex-col gap-y-1">
            <span className="txt-compact-small text-ui-fg-subtle">Relancer le (demain par défaut)</span>
            <input type="date" className={inputClass} value={form.follow_up_on} onChange={(e) => set({ follow_up_on: e.target.value })} />
          </label>
        )}
        <label className="flex flex-col gap-y-1 md:col-span-3">
          <span className="txt-compact-small text-ui-fg-subtle">Note</span>
          <input className={inputClass} value={form.note} placeholder="Ex. rappeler après la paie" onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      <div className="flex gap-x-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={() => void save()}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}

const ProspectCard = ({ prospect, today, onChanged, onEdit }: { prospect: Prospect; today: string; onChanged: () => void; onEdit: () => void }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (path: string, body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/prospects/${prospect.id}/${path}`, { method: "POST", body })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const active = prospect.status === "to_follow_up" || prospect.status === "waiting_stock"
  return (
    <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="txt-compact-small-plus text-ui-fg-base">{prospect.name ?? "Sans nom"}</span>
          <span className="txt-compact-small text-ui-fg-subtle">{prospect.phone}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prospect.available === true && (
            <span className="txt-compact-xsmall-plus rounded-full bg-ui-tag-green-bg px-2 py-0.5 text-ui-tag-green-text">De nouveau disponible - à prévenir</span>
          )}
          <span className={`txt-compact-xsmall-plus rounded-full px-2 py-0.5 ${STATUS[prospect.status].className}`}>{STATUS[prospect.status].label}</span>
        </div>
      </div>
      <div className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1 text-ui-fg-subtle">
        {prospect.product && <span>Produit : {prospect.product}</span>}
        {prospect.status === "to_follow_up" && (
          <span className={prospect.follow_up_on && prospect.follow_up_on < today ? "text-ui-fg-error" : ""}>
            Relance prévue le {formatDay(prospect.follow_up_on)}
            {prospect.follow_up_on && prospect.follow_up_on < today ? " (en retard)" : ""}
          </span>
        )}
        {prospect.follow_up_count > 0 && <span>Déjà relancé {prospect.follow_up_count} fois</span>}
        {prospect.order_id && (
          <a href={`/app/orders/${prospect.order_id}`} className="text-ui-fg-interactive">
            Voir la commande
          </a>
        )}
      </div>
      {prospect.note && <span className="txt-compact-small text-ui-fg-base">{prospect.note}</span>}
      {error && <span className="txt-compact-small text-ui-fg-error">{error}</span>}
      <div className="flex flex-wrap gap-2">
        <a href={`/app/whatsapp-conversations?phone=${prospect.phone.replace(/\D/g, "")}`} className={secondaryButton}>
          Conversation
        </a>
        <a href={waLink(prospect.phone)} target="_blank" rel="noreferrer" className={secondaryButton}>
          Ouvrir WhatsApp
        </a>
        {active && (
          <button type="button" className={primaryButton} disabled={busy} onClick={() => void run("follow-up", {})}>
            Relancé (rappel dans 3 jours)
          </button>
        )}
        {active && (
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run("status", { status: "lost" })}>
            Perdu
          </button>
        )}
        {prospect.status === "lost" && (
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run("status", { status: "to_follow_up" })}>
            Remettre à relancer
          </button>
        )}
        {active && (
          <button type="button" className="txt-compact-small text-ui-fg-interactive" onClick={onEdit}>
            Modifier
          </button>
        )}
      </div>
    </div>
  )
}

const ProspectsPage = () => {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get("tab")
    return t === "waiting" || t === "all" ? t : "due"
  })
  const [lists, setLists] = useState<Lists | null>(null)
  const [q, setQ] = useState("")
  const [form, setForm] = useState<FormState | null>(null)

  const load = useCallback(() => {
    api<Lists>(`/admin/prospects${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
      .then(setLists)
      .catch(() => setLists({ today: "", due: [], waiting: [], all: [] }))
  }, [q])
  useEffect(load, [load])

  const select = (next: Tab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url.toString())
  }

  const current = lists ? lists[tab] : null
  const edit = (p: Prospect) =>
    setForm({
      id: p.id,
      phone: p.phone,
      name: p.name ?? "",
      status: p.status === "waiting_stock" ? "waiting_stock" : "to_follow_up",
      variant_id: p.variant_id,
      product_label: p.product ?? p.product_label ?? "",
      follow_up_on: p.follow_up_on ?? "",
      note: p.note ?? "",
    })

  return (
    <div className="flex flex-col gap-y-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-2 px-4 py-3`}>
        <div>
          <h1 className="txt-large-plus text-ui-fg-base">Prospects</h1>
          <p className="txt-compact-small text-ui-fg-subtle">
            Clients à relancer et clients qui attendent un produit ; un prospect qui commande passe « A commandé » tout seul.
          </p>
        </div>
        {!form && (
          <button type="button" className={primaryButton} onClick={() => setForm(emptyForm())}>
            Nouveau prospect
          </button>
        )}
      </div>

      {form && (
        <ProspectForm
          initial={form}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            load()
          }}
        />
      )}

      <div className="flex gap-x-2 overflow-x-auto" role="tablist">
        {(
          [
            ["due", `À relancer aujourd'hui${lists ? ` (${lists.due.length})` : ""}`],
            ["waiting", `En attente de stock${lists ? ` (${lists.waiting.length})` : ""}`],
            ["all", "Tous"],
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

      {tab === "all" && (
        <input className={inputClass} placeholder="Rechercher par nom ou numéro" value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {!current ? (
        <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
      ) : current.length === 0 ? (
        <p className="txt-compact-small text-ui-fg-subtle">
          {tab === "due" ? "Personne à relancer aujourd'hui." : tab === "waiting" ? "Aucun client en attente de stock." : "Aucun prospect."}
        </p>
      ) : (
        current.map((p) => <ProspectCard key={p.id} prospect={p} today={lists!.today} onChanged={load} onEdit={() => edit(p)} />)
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Prospects",
  icon: UsersSolid,
})

export default ProspectsPage
