import { HttpTypes } from "@medusajs/types"
import { getFreeShippingBadgeLabel } from "@lib/util/free-shipping"
import { Badge, Heading } from "@modules/common/components/ui"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  const freeShippingBadge = getFreeShippingBadgeLabel(product)

  return (
    <div id="product-info" className="flex flex-col gap-2">
      {freeShippingBadge && (
        <Badge color="gold" className="w-fit">
          {freeShippingBadge}
        </Badge>
      )}
      <Heading
        level="h1"
        className="text-2xl small:text-3xl font-extrabold leading-tight text-gm-ink"
        data-testid="product-title"
      >
        {product.title}
      </Heading>
    </div>
  )
}

export default ProductInfo
