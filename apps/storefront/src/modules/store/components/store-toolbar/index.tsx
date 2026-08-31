"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import SortProducts, {
  SortOptions,
} from "@modules/store/components/refinement-list/sort-products"

// Barre d'outils du catalogue, conforme à la maquette
// ("Golden Market · Catalogue") : rangée encadrée sous le titre avec le
// nombre de résultats à gauche et le menu de tri à droite.
const StoreToolbar = ({
  sortBy,
  count,
  shown,
}: {
  sortBy: SortOptions
  count?: number
  shown?: number
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setQueryParams = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(name, value)
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  return (
    <div className="flex items-center justify-between gap-3 border-y border-gm-border py-3.5 mb-6">
      <span className="text-[13.5px] text-gm-ink-muted" data-testid="product-count">
        {typeof count === "number"
          ? shown !== undefined && shown < count
            ? `${shown} sur ${count} produits`
            : `${count} produit${count > 1 ? "s" : ""}`
          : " "}
      </span>
      <SortProducts
        sortBy={sortBy}
        setQueryParams={setQueryParams}
        data-testid="sort-by-container"
      />
    </div>
  )
}

export default StoreToolbar
