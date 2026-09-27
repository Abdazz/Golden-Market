import { defineWidgetConfig } from "@medusajs/admin-sdk"

// Bouton "Nouvelle commande" au-dessus de la liste des commandes : commande
// prise par téléphone, client identifié par son numéro WhatsApp (voir
// routes/phone-orders/new/page.tsx). Pas de composant @medusajs/ui (conflit
// de types React 18/19, voir widgets/analytics-summary.tsx).
// Simple lien <a> vers l'adresse complète : ni <Link> (conflit de types
// React 18/19) ni useNavigate (sans effet depuis un widget, constaté en local
// le 2026-09-27 - le routeur de l'admin n'est pas celui des extensions).
const NewPhoneOrderButton = () => (
  <div className="flex justify-end">
    <a
      href="/app/phone-orders/new"
      className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted hover:opacity-90"
    >
      Nouvelle commande
    </a>
  </div>
)

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default NewPhoneOrderButton
