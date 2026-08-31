import { getProductPrice } from "@lib/util/get-product-price"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

export default function ProductPrice({
  product,
  variant,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    return <div className="block w-32 h-9 bg-gm-ivoire-2 animate-pulse rounded" />
  }

  const isSale = selectedPrice.price_type === "sale"
  const saved =
    isSale && selectedPrice.original_price_number
      ? selectedPrice.original_price_number -
        selectedPrice.calculated_price_number
      : 0

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className="font-display font-extrabold text-3xl text-gm-violet tabular-nums"
        data-testid="product-price"
        data-value={selectedPrice.calculated_price_number}
      >
        {selectedPrice.calculated_price}
      </span>
      {isSale && (
        <>
          <span
            className="text-base text-gm-ink-muted line-through tabular-nums"
            data-testid="original-product-price"
            data-value={selectedPrice.original_price_number}
          >
            {selectedPrice.original_price}
          </span>
          {saved > 0 && (
            <span className="text-[12.5px] font-bold text-gm-terracotta">
              Économisez{" "}
              {convertToLocale({
                amount: saved,
                currency_code: selectedPrice.currency_code,
              })}
            </span>
          )}
        </>
      )}
    </div>
  )
}
