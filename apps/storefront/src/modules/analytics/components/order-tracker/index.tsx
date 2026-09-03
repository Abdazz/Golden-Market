"use client"

import { useEffect } from "react"
import { trackOrder } from "@lib/analytics/matomo"

type OrderTrackerProps = {
  order: {
    id: string
    items: { id: string; title: string; unit_price: number; quantity: number }[]
    total: number
    subtotal: number
    shipping_total: number
  }
}

const TRACKED_ORDERS_KEY = "gm_matomo_tracked_orders"

// Composant invisible monté sur la page de confirmation de commande :
// envoie trackEcommerceOrder à Matomo, une seule fois par commande. La page
// de confirmation peut être revisitée (rechargement, retour arrière) - un
// id de commande déjà envoyé est mémorisé en localStorage pour ne jamais
// compter deux fois la même commande dans l'entonnoir de conversion.
const OrderTracker = ({ order }: OrderTrackerProps) => {
  useEffect(() => {
    let alreadyTracked: string[] = []
    try {
      alreadyTracked = JSON.parse(
        window.localStorage.getItem(TRACKED_ORDERS_KEY) ?? "[]"
      )
    } catch {
      alreadyTracked = []
    }

    if (alreadyTracked.includes(order.id)) {
      return
    }

    trackOrder({
      id: order.id,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.title,
        price: item.unit_price,
        quantity: item.quantity,
      })),
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping_total,
    })

    try {
      window.localStorage.setItem(
        TRACKED_ORDERS_KEY,
        JSON.stringify([...alreadyTracked, order.id])
      )
    } catch {
      // Échec silencieux (localStorage indisponible) : au pire l'entonnoir
      // recomptera cette commande si la page est revisitée, jamais bloquant.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  return null
}

export default OrderTracker
