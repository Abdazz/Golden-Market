import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { HttpTypes } from "@medusajs/types"
import Product from "../product-preview"

type RelatedProductsProps = {
  product: HttpTypes.StoreProduct
  countryCode: string
}

const RELATED_PRODUCTS_LIMIT = 8
// Couvre large la plus grosse catégorie du catalogue (12 articles pour
// "Maison et Cuisine" au 2026-09-17) et le repli catalogue entier, pour
// filtrer le stock côté client sans perdre de candidats à cause d'un
// `limit` trop juste appliqué avant filtrage.
const CANDIDATES_LIMIT = 30

// Même règle de disponibilité que product-preview/product-actions : pas de
// suivi de stock -> toujours disponible ; suivi + réappro autorisé ->
// toujours disponible ; suivi sans réappro -> dépend du stock réel.
const isVariantAvailable = (variant: HttpTypes.StoreProductVariant) => {
  if (!variant.manage_inventory) {
    return true
  }
  if (variant.allow_backorder) {
    return true
  }
  return (variant.inventory_quantity ?? 0) > 0
}

const isProductAvailable = (product: HttpTypes.StoreProduct) =>
  (product.variants ?? []).some(isVariantAvailable)

export default async function RelatedProducts({
  product,
  countryCode,
}: RelatedProductsProps) {
  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const fetchAvailableProducts = (
    queryParams: HttpTypes.StoreProductListParams
  ) =>
    listProducts({
      queryParams: {
        region_id: region.id,
        is_giftcard: false,
        limit: CANDIDATES_LIMIT,
        ...queryParams,
      },
      countryCode,
    }).then(({ response }) =>
      response.products
        .filter((relatedProduct) => relatedProduct.id !== product.id)
        .filter(isProductAvailable)
    )

  // Catégorie (pas collection_id/tag_id : la collection ne code que le mode
  // de livraison "express"/"sur commande", et les tags ne sont jamais
  // renseignés sur ce catalogue, voir seed-categories-bf.ts) : seule
  // taxonomie qui reflète une vraie similarité de produit ici.
  const categoryIds = (product.categories ?? [])
    .map((category) => category.id)
    .filter(Boolean)

  const products = categoryIds.length
    ? await fetchAvailableProducts({ category_id: categoryIds })
    : []

  // La section ne doit jamais rester vide ou incomplète faute de produits
  // dans la catégorie : on complète avec d'autres produits disponibles du
  // catalogue (jamais un produit en rupture) plutôt que de raccourcir la
  // liste ou de la masquer.
  if (products.length < RELATED_PRODUCTS_LIMIT) {
    const excludeIds = new Set(products.map((p) => p.id))
    const fallback = await fetchAvailableProducts({})

    for (const candidate of fallback) {
      if (products.length >= RELATED_PRODUCTS_LIMIT) {
        break
      }
      if (excludeIds.has(candidate.id)) {
        continue
      }
      products.push(candidate)
      excludeIds.add(candidate.id)
    }
  } else {
    products.length = RELATED_PRODUCTS_LIMIT
  }

  if (!products.length) {
    return null
  }

  return (
    <div className="product-page-constraint">
      <div className="flex flex-col items-center text-center mb-16">
        <span className="text-sm text-gm-ink-muted mb-6">
          Produits similaires
        </span>
        <p className="font-display text-2xl font-semibold text-gm-ink max-w-lg">
          Vous pourriez aussi aimer ces produits.
        </p>
      </div>

      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
        {products.map((product) => (
          <li key={product.id}>
            <Product region={region} product={product} />
          </li>
        ))}
      </ul>
    </div>
  )
}
