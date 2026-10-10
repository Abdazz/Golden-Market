// Libellé d'un article de commande : titre du produit, suivi de la variante
// ("Avec seau", "Sans seau"...) quand elle apporte une information.
// Les variantes génériques de Medusa ("Default Title", "Default variant") et
// celle qui répète le titre du produit sont ignorées.
const GENERIC_VARIANT_TITLES = ["Default Title", "Default variant"]

export const orderItemLabel = (item: { product_title?: string | null; variant_title?: string | null }): string => {
  const variant = item.variant_title
  return variant && !GENERIC_VARIANT_TITLES.includes(variant) && variant !== item.product_title
    ? `${item.product_title} - ${variant}`
    : (item.product_title as string)
}
