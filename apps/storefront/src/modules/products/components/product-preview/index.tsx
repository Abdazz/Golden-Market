import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Badge } from "@modules/common/components/ui"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import QuickAddButton from "./quick-add-button"

// Un produit compte comme "Nouveau" pendant ses 14 premiers jours - signal
// réel basé sur created_at, pas une valeur éditoriale inventée.
const NEW_PRODUCT_WINDOW_DAYS = 14

const isRecentlyAdded = (createdAt?: string | null) => {
  if (!createdAt) {
    return false
  }
  const ageInDays =
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  return ageInDays <= NEW_PRODUCT_WINDOW_DAYS
}

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

  const isSale = cheapestPrice?.price_type === "sale"
  const isNew = !isSale && isRecentlyAdded(product.created_at)
  // La carte ne peut ajouter au panier directement que pour un produit à
  // variante unique (pas de sélection d'option possible depuis la grille) -
  // le cas de tout le catalogue réel importé (voir import-catalog.ts).
  const singleVariantId =
    product.variants?.length === 1 ? product.variants[0].id : undefined

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="group block rounded-2xl border border-gm-border bg-white overflow-hidden transition-all hover:shadow-md hover:-translate-y-1"
      data-testid="product-wrapper"
    >
      <div className="relative">
        {isSale && (
          <Badge
            color="terracotta"
            className="absolute top-2.5 left-2.5 z-10"
          >
            -{cheapestPrice.percentage_diff}%
          </Badge>
        )}
        {isNew && (
          <Badge color="gold" className="absolute top-2.5 left-2.5 z-10">
            Nouveau
          </Badge>
        )}
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          className="rounded-none"
        />
        {singleVariantId && <QuickAddButton variantId={singleVariantId} />}
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
