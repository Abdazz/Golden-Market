import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"

type LineItemUnitPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
  currencyCode: string
}

const LineItemUnitPrice = ({ item, style = "default", currencyCode }: LineItemUnitPriceProps) => {
  const total = item.total ?? 0
  const original_total = item.original_total ?? 0
  const hasReducedPrice = total < original_total
  const percentage_diff = Math.round(((original_total - total) / original_total) * 100)

  return (
    <span className="inline-flex items-center gap-1">
      {hasReducedPrice && style === "default" && (
        <span className="text-gm-ink-muted line-through text-xs" data-testid="product-unit-original-price">
          {convertToLocale({
            amount: original_total / item.quantity,
            currency_code: currencyCode,
          })}
        </span>
      )}
      <span
        className={clx("text-xs", {
          "text-gm-terracotta font-semibold": hasReducedPrice,
          "text-gm-ink-muted": !hasReducedPrice,
        })}
        data-testid="product-unit-price"
      >
        {convertToLocale({ amount: total / item.quantity, currency_code: currencyCode })}
      </span>
      {hasReducedPrice && style === "default" && (
        <span className="text-gm-terracotta text-xs font-semibold">-{percentage_diff}%</span>
      )}
    </span>
  )
}

export default LineItemUnitPrice
