// Surcharges des libellés de l'admin Medusa (fusionnées sur les traductions
// natives). "fields.salesChannel" : en-tête de la colonne de la liste des
// commandes qui affiche le type de livraison (voir lib/order-list-delivery.ts).
const overrides = { fields: { salesChannel: "Livraison" } }

export default {
  en: { translation: overrides },
  fr: { translation: overrides },
}
