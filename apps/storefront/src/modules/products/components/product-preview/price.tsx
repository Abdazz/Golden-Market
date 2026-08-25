import { clx } from "@modules/common/components/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      <span
        className={clx("font-display font-bold text-base tabular-nums", {
          "text-gm-violet": price.price_type === "sale",
          "text-gm-ink": price.price_type !== "sale",
        })}
        data-testid="price"
      >
        {price.calculated_price}
      </span>
      {price.price_type === "sale" && (
        <span
          className="line-through text-gm-ink-muted text-xs tabular-nums"
          data-testid="original-price"
        >
          {price.original_price}
        </span>
      )}
    </>
  )
}
