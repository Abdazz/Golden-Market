import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Badge } from "@modules/common/components/ui"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"

export default async function ProductPreview({
  product,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({
    product,
  })

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="group block rounded-2xl border border-gm-border bg-white overflow-hidden transition-all hover:shadow-md hover:-translate-y-1"
      data-testid="product-wrapper"
    >
      <div className="relative">
        {cheapestPrice?.price_type === "sale" && (
          <Badge
            color="terracotta"
            className="absolute top-2.5 left-2.5 z-10"
          >
            Promo
          </Badge>
        )}
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          className="rounded-none"
        />
      </div>
      <div className="flex flex-col gap-2 p-3">
        <span
          className="text-sm font-semibold text-gm-ink leading-snug line-clamp-2 min-h-[2.6em]"
          data-testid="product-title"
        >
          {product.title}
        </span>
        <div className="flex items-baseline gap-2">
          {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
        </div>
      </div>
    </LocalizedClientLink>
  )
}
