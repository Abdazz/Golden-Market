import { useEffect, useState } from "react"
import { api } from "../lib/deliveries"
import { card, inputClass, primaryButton, secondaryButton } from "./delivery-ui"

// Formulaire d'ajout / modification d'un prospect (spec 2026-09-28
// prospects), partagé par la page Prospects et le chat WhatsApp (« Suivre
// comme prospect »). Un numéro déjà suivi n'est pas dupliqué (côté API).

type VariantHit = { variant_id: string; product_title: string; variant_title: string | null }

export type FormState = {
  id: string | null
  phone: string
  name: string
  status: "to_follow_up" | "waiting_stock"
  variant_id: string | null
  product_label: string
  follow_up_on: string
  note: string
}
export const emptyForm = (): FormState => ({ id: null, phone: "", name: "", status: "to_follow_up", variant_id: null, product_label: "", follow_up_on: "", note: "" })

export const ProspectForm = ({ initial, onSaved, onCancel }: { initial: FormState; onSaved: () => void; onCancel: () => void }) => {
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
