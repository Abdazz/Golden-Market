// Modification du paiement d'une commande payée (2026-10-15, demandé par le
// propriétaire) : possible 24 h après la dernière action « Marquer payée » /
// « Modifier le paiement ». La date de l'écriture de vente de la caisse est
// réécrite à chaque soumission : c'est elle qui porte l'échéance.
export const PAYMENT_EDIT_WINDOW_MS = 24 * 3600 * 1000

export const paymentEditStatus = (
  recordedAt: Date | string | null,
  now: Date = new Date()
): { recorded: boolean; editable: boolean; editable_until: string | null } => {
  if (!recordedAt) return { recorded: false, editable: false, editable_until: null }
  const until = new Date(new Date(recordedAt).getTime() + PAYMENT_EDIT_WINDOW_MS)
  // Limite incluse : exactement 24 h après, c'est encore modifiable.
  return { recorded: true, editable: now.getTime() <= until.getTime(), editable_until: until.toISOString() }
}
