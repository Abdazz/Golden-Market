import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { Heading } from "@modules/common/components/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      fields: "*variants.calculated_price",
    },
  })

  if (!pricedProducts) {
    return null
  }

  return (
    <div className="py-10 small:py-16">
      <div className="content-container">
        <div className="flex items-baseline justify-between mb-6">
          <Heading level="h2" className="text-2xl">
            {collection.title}
          </Heading>
          <LocalizedClientLink
            href={`/collections/${collection.handle}`}
            className="text-sm font-semibold text-gm-amethyst hover:underline"
          >
            Voir tout
          </LocalizedClientLink>
        </div>
        <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-4">
          {pricedProducts &&
            pricedProducts.map((product) => (
              <li key={product.id}>
                <ProductPreview product={product} region={region} />
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
