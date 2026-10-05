import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/types"
import { useState } from "react"

// Frais d'expédition hors Ouagadougou du produit (spec 2026-10-04
// frais-expedition-par-produit), stockés dans product.metadata.frais_expedition_xof.
// Vide : 1 000 F par défaut. Toutes les autres métadonnées (video_url...) sont
// renvoyées telles quelles. HTML natif (conflit de types React 18/19 avec @medusajs/ui).
const KEY = "frais_expedition_xof"
const DEFAULT_FEE = 1000

const ProductShippingFeeWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const initial = product.metadata?.[KEY]
  const [saved, setSaved] = useState<string>(initial === undefined || initial === null ? "" : String(initial))
  const [value, setValue] = useState(saved)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (trimmed !== "" && !/^\d+$/.test(trimmed)) {
      setStatus("error")
      setMessage("Saisissez un montant entier en F CFA (ou laissez vide).")
      return
    }
    setStatus("saving")
    setMessage(null)
    const metadata = { ...(product.metadata ?? {}) } as Record<string, unknown>
    // Medusa fusionne les métadonnées : une clé absente n'est pas supprimée, une
    // chaîne vide la supprime (comportement natif du module produit).
    metadata[KEY] = trimmed === "" ? "" : Number(trimmed)
    const res = await fetch(`/admin/products/${product.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata }),
    })
    if (!res.ok) {
      setStatus("error")
      setMessage("Échec de l'enregistrement du produit.")
      return
    }
    // Garder la fiche à jour pour un second enregistrement sans rechargement.
    if (trimmed === "") delete metadata[KEY]
    product.metadata = metadata
    setSaved(trimmed)
    setStatus("saved")
  }

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <h2 className="txt-compact-medium-plus text-ui-fg-base">Frais d'expédition (hors Ouagadougou)</h2>
      <p className="txt-compact-small text-ui-fg-subtle mt-1">
        Livraison gratuite à Ouagadougou. Plusieurs produits : les frais les plus élevés s'appliquent.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          inputMode="numeric"
          className="txt-compact-small w-32 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
          placeholder={String(DEFAULT_FEE)}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setStatus("idle")
          }}
        />
        <span className="txt-compact-small text-ui-fg-subtle">F CFA</span>
        <button
          type="button"
          className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
          disabled={status === "saving" || value.trim() === saved}
          onClick={save}
        >
          {status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <p className="txt-compact-small mt-2 text-ui-fg-muted">
        {saved === "" ? `Vide : ${DEFAULT_FEE} F par défaut.` : `Frais actuels : ${saved} F.`}
      </p>
      {status === "saved" && <p className="txt-compact-small mt-1 text-ui-fg-interactive">Enregistré.</p>}
      {message && <p className="txt-compact-small mt-1 text-ui-fg-error">{message}</p>}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductShippingFeeWidget
