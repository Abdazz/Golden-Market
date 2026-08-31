"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo, useState } from "react"

import { CATEGORY_ID_QUERY_KEY, parseCategoryIds } from "@lib/util/category-filters"
import CategoryFilter from "./category-filter"

type RefinementListProps = {
  search?: boolean
  hideOptionsPicker?: boolean
  "data-testid"?: string
}

const RefinementList = ({
  hideOptionsPicker = false,
}: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateQueryParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      updater(params)

      params.delete("page")

      const queryString = params.toString()
      const currentQuery = searchParams.toString()
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      const currentPath = currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname

      if (nextPath !== currentPath) {
        router.push(nextPath)
      }
    },
    [pathname, router, searchParams]
  )

  const selectedCategoryIds = useMemo(
    () => parseCategoryIds(searchParams),
    [searchParams]
  )

  const setCategoryIds = (categoryIds: string[]) =>
    updateQueryParams((params) => {
      params.delete(CATEGORY_ID_QUERY_KEY)
      categoryIds.forEach((categoryId) =>
        params.append(CATEGORY_ID_QUERY_KEY, categoryId)
      )
    })

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Pages catégorie / collection : le périmètre est déjà fixé par l'URL,
  // pas de filtre latéral à afficher.
  if (hideOptionsPicker) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileFiltersOpen(true)}
        className="small:hidden inline-flex items-center gap-2 rounded-lg border border-gm-border bg-white px-3.5 py-2 text-sm font-semibold text-gm-ink mb-4"
        data-testid="mobile-filter-button"
      >
        Filtrer
      </button>

      <div className="hidden small:flex small:flex-col small:w-60 small:sticky small:top-24 gap-6">
        {!hideOptionsPicker && (
          <CategoryFilter
            selectedCategoryIds={selectedCategoryIds}
            setCategoryIds={setCategoryIds}
          />
        )}
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[60] small:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-lg text-gm-ink">
                Filtrer
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="text-gm-ink-muted text-sm font-semibold"
              >
                Fermer
              </button>
            </div>
            <div className="flex flex-col gap-6">
              {!hideOptionsPicker && (
                <CategoryFilter
                  selectedCategoryIds={selectedCategoryIds}
                  setCategoryIds={setCategoryIds}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default RefinementList
