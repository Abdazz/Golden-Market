"use client"

import { useEffect } from "react"
import { trackProductView as trackMatomoProductView } from "@lib/analytics/matomo"
import { trackProductView as trackMetaProductView } from "@lib/analytics/meta-pixel"

type ProductViewTrackerProps = {
  product: {
    id: string
    title: string
    categories?: { name: string }[] | null
    variants?: { id: string }[] | null
  }
  price: number
}

// Composant invisible monté sur la fiche produit (templates/index.tsx) :
// envoie l'événement Ecommerce setEcommerceView à Matomo et ViewContent au
// Pixel Meta. Données réelles uniquement (id/titre/catégorie/prix Medusa du
// produit affiché).
const ProductViewTracker = ({ product, price }: ProductViewTrackerProps) => {
  useEffect(() => {
    const payload = {
      id: product.id,
      name: product.title,
      category: product.categories?.[0]?.name,
      price,
    }
    trackMatomoProductView(payload)
    // Meta a besoin des ids de variante (variant.id), pas de product.id, pour
    // matcher le catalogue - voir meta-pixel.ts.
    trackMetaProductView({
      ...payload,
      variantIds: product.variants?.map((variant) => variant.id) ?? [],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  return null
}

export default ProductViewTracker
