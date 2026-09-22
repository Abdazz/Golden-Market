"use client"

import { useParams } from "next/navigation"
import { useState } from "react"

import { addToCart } from "@lib/data/cart"
import { trackAddToCart as trackMatomoAddToCart } from "@lib/analytics/matomo"
import { trackAddToCart as trackMetaAddToCart } from "@lib/analytics/meta-pixel"
import Spinner from "@modules/common/icons/spinner"

// Ajout rapide au panier depuis la grille produits (maquette "Golden Market
// · Catalogue") - uniquement pour les produits à variante unique (le cas de
// tout le catalogue réel importé, voir import-catalog.ts) : un produit à
// options (taille/couleur) doit passer par la fiche produit pour choisir la
// variante, pas de sélection possible depuis la carte. C'est donc le seul
// chemin d'ajout au panier réellement emprunté par les visiteurs tant que le
// catalogue reste mono-variante - product-actions/index.tsx (fiche produit)
// suit déjà Matomo/Meta mais n'est quasiment jamais utilisé pour "Ajouter au
// panier" dans ce cas, d'où le "Aucun évènement AjoutAuPanier reçu" observé
// côté Meta malgré un code de tracking par ailleurs correct.
const QuickAddButton = ({
  variantId,
  name,
  category,
  price,
}: {
  variantId: string
  name: string
  category?: string
  price: number
}) => {
  const countryCode = useParams().countryCode as string
  const [isAdding, setIsAdding] = useState(false)

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (isAdding) {
      return
    }

    setIsAdding(true)

    await addToCart({
      variantId,
      quantity: 1,
      countryCode,
    }).finally(() => setIsAdding(false))

    const trackedItem = { id: variantId, name, category, price, quantity: 1 }
    trackMatomoAddToCart(trackedItem)
    trackMetaAddToCart(trackedItem)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isAdding}
      aria-label="Ajouter au panier"
      data-testid="quick-add-button"
      className="absolute bottom-2.5 right-2.5 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gm-violet text-gm-on-violet shadow-md hover:bg-gm-violet-hover transition-colors disabled:opacity-70"
    >
      {isAdding ? (
        <Spinner />
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  )
}

export default QuickAddButton
