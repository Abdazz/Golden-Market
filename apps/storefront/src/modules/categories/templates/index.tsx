import { notFound } from "next/navigation"
import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import Breadcrumb, { Crumb } from "@modules/common/components/breadcrumb"
import InteractiveLink from "@modules/common/components/interactive-link"
import { Heading } from "@modules/common/components/ui"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { HttpTypes } from "@medusajs/types"

export default function CategoryTemplate({
  category,
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  category: HttpTypes.StoreProductCategory
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!category || !countryCode) notFound()

  const parents = [] as HttpTypes.StoreProductCategory[]

  const getParents = (cat: HttpTypes.StoreProductCategory) => {
    if (cat.parent_category) {
      parents.unshift(cat.parent_category)
      getParents(cat.parent_category)
    }
  }

  getParents(category)

  const crumbs: Crumb[] = [
    { label: "Accueil", href: "/" },
    ...parents.map((p) => ({
      label: p.name,
      href: `/categories/${p.handle}`,
    })),
    { label: category.name },
  ]

  return (
    <div className="content-container" data-testid="category-container">
      <Breadcrumb items={crumbs} />
      <Heading level="h1" className="text-3xl mb-1" data-testid="category-page-title">
        {category.name}
      </Heading>
      {category.description && (
        <p className="text-sm text-gm-ink-muted mb-5 max-w-2xl">
          {category.description}
        </p>
      )}
      <div className="flex flex-col small:flex-row small:items-start gap-8 pb-16">
        <RefinementList hideOptionsPicker />
        <div className="w-full">
          {category.category_children &&
            category.category_children.length > 0 && (
              <ul className="mb-6 flex flex-wrap gap-2">
                {category.category_children.map((c) => (
                  <li key={c.id}>
                    <InteractiveLink href={`/categories/${c.handle}`}>
                      {c.name}
                    </InteractiveLink>
                  </li>
                ))}
              </ul>
            )}
          <Suspense
            fallback={
              <SkeletonProductGrid
                numberOfProducts={category.products?.length ?? 8}
              />
            }
          >
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              categoryId={category.id}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
