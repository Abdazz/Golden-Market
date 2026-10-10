// Liste des commandes de l'admin : la colonne "Client" de Medusa affiche
// "prénom nom", sinon l'e-mail. Un client inscrit ou commandé par téléphone
// peut n'avoir ni nom ni e-mail (prénom facultatif depuis le 2026-10-06) : la
// réponse de GET /admin/orders porte alors son numéro WhatsApp à la place du
// prénom (affichage seulement, la fiche client n'est pas modifiée).

type CustomerLike = { first_name?: string | null; last_name?: string | null; phone?: string | null }
type OrderLike = { customer?: CustomerLike | null; shipping_address?: { phone?: string | null } | null }

export const withPhoneAsCustomerName = (body: any) => {
  if (!body || !Array.isArray(body.orders)) return body
  for (const order of body.orders as OrderLike[]) {
    const customer = order.customer
    if (!customer || customer.first_name?.trim() || customer.last_name?.trim()) continue
    const phone = customer.phone || order.shipping_address?.phone
    if (phone) customer.first_name = phone
  }
  return body
}

// Colonne "Commande" de la liste et en-tête de la fiche : Medusa affiche
// display_id (compteur natif, "#13"). Dans la réponse de GET /admin/orders
// (liste) et de GET /admin/orders/:id (fiche, titre de l'onglet), il est
// remplacé par le numéro Golden Market (custom_display_id, AAAAMMJJ + compteur
// du jour) : "#20261006001". Le tri et la recherche ne changent pas (côté
// serveur). Une commande sans numéro garde le compteur natif.
type NumberedOrder = { display_id?: unknown; custom_display_id?: string | null }

const useGoldenMarketNumber = (order: NumberedOrder) => {
  if (order.custom_display_id) order.display_id = order.custom_display_id
}

export const withGoldenMarketOrderNumber = (body: any) => {
  if (!body) return body
  if (Array.isArray(body.orders)) {
    for (const order of body.orders as NumberedOrder[]) useGoldenMarketNumber(order)
  }
  if (body.order && typeof body.order === "object") useGoldenMarketNumber(body.order as NumberedOrder)
  return body
}
