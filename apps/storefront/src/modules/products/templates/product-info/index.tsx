import { HttpTypes } from "@medusajs/types"
import { Heading } from "@modules/common/components/ui"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  return (
    <div id="product-info">
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
