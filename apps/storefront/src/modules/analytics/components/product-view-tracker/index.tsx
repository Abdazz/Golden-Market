"use client"

import { useEffect } from "react"
import { trackProductView } from "@lib/analytics/matomo"

type ProductViewTrackerProps = {
  product: {
    id: string
    title: string
    categories?: { name: string }[] | null
  }
  price: number
}

// Composant invisible monté sur la fiche produit (templates/index.tsx) :
// envoie l'événement Ecommerce setEcommerceView à Matomo. Données réelles
// uniquement (id/titre/catégorie/prix Medusa du produit affiché).
const ProductViewTracker = ({ product, price }: ProductViewTrackerProps) => {
  useEffect(() => {
    trackProductView({
      id: product.id,
      name: product.title,
      category: product.categories?.[0]?.name,
      price,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  return null
}

export default ProductViewTracker
