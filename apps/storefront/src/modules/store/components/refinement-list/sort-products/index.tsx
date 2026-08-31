"use client"

export type SortOptions = "price_asc" | "price_desc" | "created_at"

type SortProductsProps = {
  sortBy: SortOptions
  setQueryParams: (name: string, value: string) => void
  "data-testid"?: string
}

const sortOptions: { value: SortOptions; label: string }[] = [
  { value: "created_at", label: "Plus récents" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
]

// Sélecteur de tri sous forme de menu déroulant, comme la maquette
// ("Golden Market · Catalogue" : bouton "Trier : ... v" en haut à droite),
// au lieu de la liste de boutons radio de la barre latérale du scaffold.
const SortProducts = ({
  "data-testid": dataTestId,
  sortBy,
  setQueryParams,
}: SortProductsProps) => {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-gm-border bg-white px-3.5 py-2 text-sm font-semibold text-gm-ink cursor-pointer">
      <span className="text-gm-ink-muted">Trier :</span>
      <select
        value={sortBy}
        onChange={(e) => setQueryParams("sortBy", e.target.value)}
        className="bg-transparent font-semibold text-gm-ink outline-none cursor-pointer"
        data-testid={dataTestId}
        aria-label="Trier les produits"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default SortProducts
