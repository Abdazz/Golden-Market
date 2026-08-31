import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import Breadcrumb from "@modules/common/components/breadcrumb"
import { Heading } from "@modules/common/components/ui"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { HttpTypes } from "@medusajs/types"

export default function CollectionTemplate({
  sortBy,
  collection,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  collection: HttpTypes.StoreCollection
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="content-container">
      <Breadcrumb
        items={[
          { label: "Accueil", href: "/" },
          { label: collection.title },
        ]}
      />
      <Heading level="h1" className="text-3xl mb-5">
        {collection.title}
      </Heading>
      <div className="flex flex-col small:flex-row small:items-start gap-8 pb-16">
        <RefinementList hideOptionsPicker />
        <div className="w-full">
          <Suspense
            fallback={
              <SkeletonProductGrid
                numberOfProducts={collection.products?.length}
              />
            }
          >
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              collectionId={collection.id}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
