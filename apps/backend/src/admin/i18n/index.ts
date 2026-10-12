import { installSessionExpiryRedirect } from "../lib/session-expiry"

// Surcharges des libellés de l'admin Medusa (fusionnées sur les traductions
// natives). "fields.salesChannel" : en-tête de la colonne de la liste des
// commandes qui affiche le type de livraison (voir lib/order-list-delivery.ts).
const overrides = { fields: { salesChannel: "Livraison" } }

// Ce module est chargé au démarrage de l'admin : point d'entrée de la
// redirection vers la connexion quand la session expire (lib/session-expiry.ts).
installSessionExpiryRedirect()

export default {
  en: { translation: overrides },
  fr: { translation: overrides },
}
