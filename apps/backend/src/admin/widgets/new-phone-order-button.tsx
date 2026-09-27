import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useNavigate } from "react-router-dom"

// Bouton "Nouvelle commande" au-dessus de la liste des commandes : commande
// prise par téléphone, client identifié par son numéro WhatsApp (voir
// routes/phone-orders/new/page.tsx). Pas de composant @medusajs/ui (conflit
// de types React 18/19, voir widgets/analytics-summary.tsx).
// useNavigate plutôt que <Link> : même conflit de types React 18/19 que
// @medusajs/ui dès qu'un composant react-router est rendu en JSX.
const NewPhoneOrderButton = () => {
  const navigate = useNavigate()
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => navigate("/phone-orders/new")}
        className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted hover:opacity-90"
      >
        Nouvelle commande
      </button>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default NewPhoneOrderButton
