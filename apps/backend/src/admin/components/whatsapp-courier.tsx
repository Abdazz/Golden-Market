import { useEffect, useState } from "react"
import { api, type Courier } from "../lib/deliveries"
import { courierBadge, courierFor } from "../lib/courier-match"

// Repérage des livreurs dans les conversations WhatsApp : les livreurs sont
// chargés une seule fois par page (hook), puis passés à la liste et à
// l'en-tête. Un échec de chargement ne produit ni badge ni message.

export const useCouriers = (): Courier[] => {
  const [couriers, setCouriers] = useState<Courier[]>([])
  useEffect(() => {
    let cancelled = false
    api<{ couriers: Courier[] }>("/admin/couriers")
      .then((r) => {
        if (!cancelled) setCouriers(Array.isArray(r.couriers) ? r.couriers : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return couriers
}

export const WhatsappCourierBadge = ({ couriers, phoneNumber }: { couriers: Courier[]; phoneNumber: string }) => {
  const courier = courierFor(couriers, phoneNumber)
  if (!courier) return null
  return (
    <a
      href="/app/deliveries?tab=couriers"
      className="txt-compact-xsmall-plus rounded-full bg-ui-tag-green-bg px-2 py-1 text-ui-tag-green-text"
    >
      {courierBadge(courier)}
    </a>
  )
}
