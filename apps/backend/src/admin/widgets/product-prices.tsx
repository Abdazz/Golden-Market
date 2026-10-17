import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/types"
import { useEffect, useState } from "react"

// Prix standard, promotionnel et de gros de chaque variante (devise XOF), lus
// et enregistrés par /admin/product-prices/:id. Le tableau d'édition natif des
// prix ne distingue pas ces trois prix. HTML natif (conflit de types React 18/19
// avec @medusajs/ui).
type Cell = { id: string; amount: number } | null
type Row = { variant_id: string; title: string | null; standard: Cell; promo: Cell; wholesale: Cell }

const field = "txt-compact-small w-28 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
const str = (c: Cell) => (c ? String(c.amount) : "")

const VariantPrices = ({ productId, row, onSaved }: { productId: string; row: Row; onSaved: (rows: Row[]) => void }) => {
  const [standard, setStandard] = useState(str(row.standard))
  const [promo, setPromo] = useState(str(row.promo))
  const [wholesale, setWholesale] = useState(str(row.wholesale))
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)
  const dirty = standard !== str(row.standard) || promo !== str(row.promo) || wholesale !== str(row.wholesale)

  async function save() {
    setState("saving")
    setMessage(null)
    try {
      const res = await fetch(`/admin/product-prices/${productId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: row.variant_id, standard, promo, wholesale }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState("error")
        setMessage(json.message ?? "Échec de l'enregistrement.")
        return
      }
      setState("saved")
      onSaved(json.variants)
    } catch {
      setState("error")
      setMessage("Service injoignable, réessayez.")
    }
  }

  return (
    <tr className="border-t border-ui-border-base align-top">
      <td className="px-3 py-2">{row.title ?? "—"}</td>
      <td className="px-3 py-2"><input inputMode="numeric" className={field} value={standard} onChange={(e) => { setStandard(e.target.value); setState("idle") }} /></td>
      <td className="px-3 py-2"><input inputMode="numeric" className={field} placeholder="aucun" value={promo} onChange={(e) => { setPromo(e.target.value); setState("idle") }} /></td>
      <td className="px-3 py-2"><input inputMode="numeric" className={field} placeholder="aucun" value={wholesale} onChange={(e) => { setWholesale(e.target.value); setState("idle") }} /></td>
      <td className="px-3 py-2">
        <button
          type="button"
          className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
          disabled={state === "saving" || !dirty}
          onClick={save}
        >
          {state === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state === "saved" && !dirty && <div className="txt-compact-small mt-1 text-ui-fg-interactive">Enregistré.</div>}
        {message && <div className="txt-compact-small mt-1 text-ui-fg-error">{message}</div>}
      </td>
    </tr>
  )
}

const ProductPricesWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/admin/product-prices/${product.id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setRows(j.variants))
      .catch(() => setError("Prix indisponibles."))
  }, [product.id])

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <h2 className="txt-compact-medium-plus text-ui-fg-base">Prix (F CFA)</h2>
      <p className="txt-compact-small text-ui-fg-subtle mt-1">
        Standard : prix affiché barré quand il y a une promotion. Promotionnel : liste de prix « Sale » active. De gros : groupe de clients « Grossistes ».
        Laisser vide pour retirer la promotion ou le prix de gros.
      </p>
      {error && <p className="txt-compact-small mt-2 text-ui-fg-error">{error}</p>}
      {!rows && !error && <p className="txt-compact-small mt-2 text-ui-fg-subtle">Chargement…</p>}
      {rows && (
        <table className="txt-compact-small mt-3 w-full text-left text-ui-fg-base">
          <thead className="txt-compact-xsmall-plus text-ui-fg-subtle">
            <tr>{["Variante", "Standard", "Promotionnel", "De gros", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <VariantPrices key={r.variant_id + str(r.standard) + str(r.promo) + str(r.wholesale)} productId={product.id} row={r} onSaved={setRows} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductPricesWidget
