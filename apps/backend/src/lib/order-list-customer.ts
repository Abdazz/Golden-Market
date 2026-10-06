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

// Colonne "Commande" : la cellule de Medusa affiche display_id (compteur natif,
// "#13"). Dans la réponse de la liste, il est remplacé par le numéro Golden
// Market (custom_display_id, AAAAMMJJ + compteur du jour, déjà demandé par la
// liste) : "#20261006001". Le tri et la recherche ne changent pas (côté serveur).
export const withGoldenMarketOrderNumber = (body: any) => {
  if (!body || !Array.isArray(body.orders)) return body
  for (const order of body.orders as { display_id?: unknown; custom_display_id?: string | null }[]) {
    if (order.custom_display_id) order.display_id = order.custom_display_id
  }
  return body
}
