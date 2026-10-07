// Lecture du « Montant à encaisser » saisi en confiant une commande (onglet
// « À confier » et encadré « Livraison » de la fiche commande) : espaces,
// points et virgules acceptés comme séparateurs de milliers ("7 000",
// "7.000", "7,000" = 7 000 F). null si la saisie n'est pas un montant valide.
export const MAX_AMOUNT_TO_COLLECT = 10_000_000

export const parseAmountInput = (text: string): number | null => {
  const digits = text.replace(/[\s.,]/g, "")
  if (!/^\d+$/.test(digits)) return null
  const value = Number(digits)
  return value <= MAX_AMOUNT_TO_COLLECT ? value : null
}
