import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import Breadcrumb from "@modules/common/components/breadcrumb"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { Heading } from "@modules/common/components/ui"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
  categoryIds,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
  categoryIds?: string[]
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="content-container" data-testid="category-container">
      <Breadcrumb
        items={[
          { label: "Accueil", href: "/" },
          { label: "Tous les produits" },
        ]}
      />
      <Heading level="h1" className="text-3xl mb-1">
        Tous les produits
      </Heading>
      <p className="text-sm text-gm-ink-muted mb-5">
        Tout le catalogue Golden Market, livré partout au Burkina Faso.
      </p>
      <div className="flex flex-col small:flex-row small:items-start gap-8 pb-16">
        <RefinementList />
        <div className="w-full">
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
              categoryIds={categoryIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default StoreTemplate
