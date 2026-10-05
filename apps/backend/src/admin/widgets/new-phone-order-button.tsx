import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// Bouton "Nouvelle commande" de la liste des commandes : commande prise par
// téléphone, client identifié par son numéro WhatsApp (voir
// routes/phone-orders/new/page.tsx). Pas de composant @medusajs/ui (conflit
// de types React 18/19, voir widgets/analytics-summary.tsx).
// Simple lien <a> vers l'adresse complète : ni <Link> (conflit de types
// React 18/19) ni useNavigate (sans effet depuis un widget, constaté en local
// le 2026-09-27 - le routeur de l'admin n'est pas celui des extensions).
//
// Placement : depuis Medusa 2.18, les widgets "order.list.before" sont rendus
// SOUS le tableau (dashboard-app.tsx, getWidgetsForSections ignore
// before/after) et l'en-tête "Commandes / Export" n'a pas de zone
// d'extension. Le bouton est donc inséré dans cet en-tête, à gauche
// d'"Export", et réinséré si Medusa redessine l'en-tête. Si l'en-tête est
// introuvable (structure changée par une mise à jour), il reste affiché à
// l'emplacement du widget plutôt que de disparaître.

const EXPORT_LINK_SELECTOR = 'a[href*="/orders/export"]'
const FALLBACK_DELAY_MS = 5000

const NewPhoneOrderLink = () => (
  <a
    href="/app/phone-orders/new"
    className="txt-compact-small-plus inline-flex items-center rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted hover:opacity-90"
  >
    Nouvelle commande
  </a>
)

const NewPhoneOrderButton = () => {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [attached, setAttached] = useState(false)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const mount = document.createElement("div")
    // ml-auto : l'en-tête est en "justify-between" ; la marge automatique
    // colle le bouton contre "Export" au lieu de le centrer.
    mount.className = "ml-auto mr-2"
    mountRef.current = mount

    const attach = () => {
      const exportLink = document.querySelector(EXPORT_LINK_SELECTOR)
      const header = exportLink?.parentElement
      if (!exportLink || !header || mount.parentElement === header) {
        return
      }
      header.insertBefore(mount, exportLink)
      setAttached(true)
    }

    attach()
    const observer = new MutationObserver(attach)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setTimeout(() => setFallback(!mount.isConnected), FALLBACK_DELAY_MS)

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      mount.remove()
    }
  }, [])

  if (attached && mountRef.current) {
    return createPortal(<NewPhoneOrderLink />, mountRef.current)
  }
  if (fallback) {
    return (
      <div className="flex justify-end">
        <NewPhoneOrderLink />
      </div>
    )
  }
  return null
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default NewPhoneOrderButton
