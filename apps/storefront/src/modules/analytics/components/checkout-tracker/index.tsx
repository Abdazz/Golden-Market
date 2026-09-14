"use client"

import { useEffect } from "react"
import { trackInitiateCheckout } from "@lib/analytics/meta-pixel"

type CheckoutTrackerProps = {
  cart: {
    id: string
    items?: { id: string; variant_id?: string | null; quantity: number }[]
    total: number
  }
}

// Composant invisible monté sur la page paiement (checkout/page.tsx) :
// envoie InitiateCheckout au Pixel Meta. Pas d'équivalent Matomo (absent du
// tracking existant, décision explicite de ne pas l'y ajouter - hors
// périmètre de l'intégration Meta).
const CheckoutTracker = ({ cart }: CheckoutTrackerProps) => {
  useEffect(() => {
    trackInitiateCheckout({
      items: (cart.items ?? []).map((item) => ({
        id: item.variant_id ?? item.id,
        quantity: item.quantity,
      })),
      total: cart.total,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.id])

  return null
}

export default CheckoutTracker
