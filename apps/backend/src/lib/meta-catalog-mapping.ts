// Mapping pur Medusa -> Meta Commerce Catalog. Aucun I/O ici (pas de
// query.graph, pas de fetch) : c'est ce qui rend ce fichier testable avec de
// simples objets, et garantit que le flux périodique (route) et les
// subscribers temps réel produisent exactement le même item pour les mêmes
// données - la cohérence entre les deux est tout l'intérêt du "filet de
// sécurité" décrit dans la spec.

export type MetaCatalogItem = {
  id: string
  item_group_id: string
  title: string
  description: string
  availability: "in stock" | "out of stock"
  condition: "new"
  price: string
  link: string
  image_link: string
  brand: string
}

export type CatalogProduct = {
  id: string
  title: string
  description: string | null
  handle: string
  thumbnail: string | null
  images?: Array<{ url: string }> | null
}

export type CatalogVariant = {
  id: string
  title: string
  manage_inventory: boolean
  allow_backorder: boolean
  images?: Array<{ url: string }> | null
  calculated_price?: { calculated_amount: number; currency_code: string } | null
}

const BRAND = "Golden Market"
const STORE_PRODUCT_BASE_URL = "https://golden-market.co/bf/products"
// Titre par défaut d'une variante unique généré par Medusa (voir
// apps/backend/src/scripts/import-catalog.ts) - pas la peine de l'accoler au
// titre du produit, il n'apporte aucune information pour un produit à une
// seule variante.
const DEFAULT_VARIANT_TITLE = "Default Title"

export function computeAvailability(
  variant: Pick<CatalogVariant, "manage_inventory" | "allow_backorder">,
  availableQuantity: number | null
): "in stock" | "out of stock" {
  if (!variant.manage_inventory) {
    return "in stock"
  }
  if (variant.allow_backorder) {
    return "in stock"
  }
  return (availableQuantity ?? 0) > 0 ? "in stock" : "out of stock"
}

export function formatMetaPrice(amount: number, currencyCode: string): string {
  return `${Math.round(amount)} ${currencyCode.toUpperCase()}`
}

export function resolveImageLink(
  variant: Pick<CatalogVariant, "images">,
  product: Pick<CatalogProduct, "thumbnail" | "images">
): string {
  return (
    variant.images?.[0]?.url ??
    product.images?.[0]?.url ??
    product.thumbnail ??
    ""
  )
}

export function buildCatalogItem(
  product: CatalogProduct,
  variant: CatalogVariant,
  availableQuantity: number | null
): MetaCatalogItem {
  const price = variant.calculated_price

  return {
    id: variant.id,
    item_group_id: product.id,
    title:
      variant.title && variant.title !== DEFAULT_VARIANT_TITLE
        ? `${product.title} - ${variant.title}`
        : product.title,
    description: product.description ?? "",
    availability: computeAvailability(variant, availableQuantity),
    condition: "new",
    price: price
      ? formatMetaPrice(price.calculated_amount, price.currency_code)
      : "0 XOF",
    link: `${STORE_PRODUCT_BASE_URL}/${product.handle}`,
    image_link: resolveImageLink(variant, product),
    brand: BRAND,
  }
}
