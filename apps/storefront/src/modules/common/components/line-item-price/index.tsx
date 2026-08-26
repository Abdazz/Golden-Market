import { getPercentageDiff } from "@lib/util/get-percentage-diff"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"

type LineItemPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
  currencyCode: string
}

const LineItemPrice = ({ item, style = "default", currencyCode }: LineItemPriceProps) => {
  const { total, original_total } = item
  const originalPrice = original_total ?? 0
  const currentPrice = total ?? 0
  const hasReducedPrice = currentPrice < originalPrice

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      {hasReducedPrice && (
        <span className="text-xs line-through text-gm-ink-muted" data-testid="product-original-price">
          {convertToLocale({ amount: originalPrice, currency_code: currencyCode })}
        </span>
      )}
      <span
        className={clx("font-display font-bold text-sm", {
          "text-gm-violet": hasReducedPrice,
          "text-gm-ink": !hasReducedPrice,
        })}
        data-testid="product-price"
      >
        {convertToLocale({ amount: currentPrice, currency_code: currencyCode })}
      </span>
      {hasReducedPrice && style === "default" && (
        <span className="text-xs text-gm-terracotta font-semibold">
          -{getPercentageDiff(originalPrice, currentPrice || 0)}%
        </span>
      )}
    </div>
  )
}

export default LineItemPrice
