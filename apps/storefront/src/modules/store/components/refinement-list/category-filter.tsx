"use client"

import { useEffect, useState } from "react"

import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"

type CategoryFilterProps = {
  selectedCategoryIds: string[]
  setCategoryIds: (categoryIds: string[]) => void
}

// Vraie taxonomie Golden Market (6 catégories réelles, plate, voir
// seed-categories-bf.ts) - remplace le filtre par option de variante
// (Size/Color) hérité du scaffold, sans rapport avec ce catalogue à
// variante unique et qui exposait en plus des valeurs orphelines restées
// en base après un ancien seed de démo jamais nettoyé.
const CategoryFilter = ({
  selectedCategoryIds,
  setCategoryIds,
}: CategoryFilterProps) => {
  const [categories, setCategories] = useState<
    HttpTypes.StoreProductCategory[]
  >([])

  useEffect(() => {
    sdk.client
      .fetch<{ product_categories?: HttpTypes.StoreProductCategory[] }>(
        "/store/product-categories",
        {
          method: "GET",
          query: {
            fields: "*products, *parent_category",
            limit: 100,
          },
        }
      )
      .then((response) =>
        setCategories(
          (response?.product_categories ?? []).filter(
            (category) => !category.parent_category
          )
        )
      )
      .catch(() => setCategories([]))
  }, [])

  const toggleCategory = (categoryId: string) => {
    if (selectedCategoryIds.includes(categoryId)) {
      setCategoryIds(selectedCategoryIds.filter((id) => id !== categoryId))
    } else {
      setCategoryIds([...selectedCategoryIds, categoryId])
    }
  }

  if (categories.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid="category-filter">
      <div className="flex items-center justify-between">
        <span className="txt-compact-small-plus text-gm-ink uppercase">
          Catégorie
        </span>
        {selectedCategoryIds.length > 0 && (
          <button
            type="button"
            onClick={() => setCategoryIds([])}
            className="text-xs font-semibold text-gm-violet hover:underline"
            data-testid="clear-category-filter"
          >
            Effacer
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-y-2">
        {categories.map((category) => (
          <li key={category.id}>
            <label className="flex items-center justify-between gap-x-2 text-sm text-gm-ink cursor-pointer">
              <span className="flex items-center gap-x-2">
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                  className="rounded border-gm-border text-gm-violet focus:ring-gm-violet"
                  data-testid="category-filter-checkbox"
                />
                {category.name}
              </span>
              <span className="text-gm-ink-muted text-xs">
                {category.products?.length ?? 0}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CategoryFilter
