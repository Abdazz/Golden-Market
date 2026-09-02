import { getProductPrice } from "@lib/util/get-product-price"
import { getFreeShippingBadgeLabel } from "@lib/util/free-shipping"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Badge } from "@modules/common/components/ui"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import QuickAddButton from "./quick-add-button"

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
  const freeShippingBadge = getFreeShippingBadgeLabel(product)
  // La carte ne peut ajouter au panier directement que pour un produit à
  // variante unique (pas de sélection d'option possible depuis la grille) -
  // le cas de tout le catalogue réel importé (voir import-catalog.ts).
  const singleVariant =
    product.variants?.length === 1 ? product.variants[0] : undefined

  // Même règle de disponibilité que la fiche produit (product-actions) :
  // pas de suivi -> toujours disponible ; suivi + réappro autorisé ->
  // toujours disponible ; suivi sans réappro -> dépend du stock réel.
  const inStock = !singleVariant
    ? false
    : !singleVariant.manage_inventory
    ? true
    : singleVariant.allow_backorder
    ? true
    : (singleVariant.inventory_quantity ?? 0) > 0

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
        {!inStock && singleVariant && (
          <Badge color="grey" className="absolute top-2.5 left-2.5 z-10">
            Rupture de stock
          </Badge>
        )}
        {freeShippingBadge && (
          <Badge color="gold" className="absolute top-2.5 right-2.5 z-10">
            {freeShippingBadge}
          </Badge>
        )}
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          className={inStock ? "rounded-none" : "rounded-none opacity-60"}
        />
        {singleVariant && inStock && (
          <QuickAddButton variantId={singleVariant.id} />
        )}
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
