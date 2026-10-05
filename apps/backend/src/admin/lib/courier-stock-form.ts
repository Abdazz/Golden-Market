// Lecture du formulaire Remettre / Retour / Corriger (spec 2026-09-28
// stock-livreurs). Un champ vide n'est jamais lu comme 0 : en correction,
// 0 enregistrerait une perte de tout le stock du livreur. Un produit tapé mais
// non choisi dans la liste n'est jamais ignoré en silence.

type Mode = "handover" | "return" | "adjustment"
// search : texte tapé dans la recherche produit de la ligne.
export type FormLine = { inventory_item_id: string; quantity: string; search?: string }

export const parseFormLines = (
  mode: Mode,
  lines: FormLine[]
): { lines: { inventory_item_id: string; quantity: number }[] } | { error: string } => {
  if (lines.some((l) => !l.inventory_item_id && (l.quantity.trim() || l.search?.trim()))) {
    return { error: "Choisissez le produit dans la liste." }
  }
  const chosen = lines.filter((l) => l.inventory_item_id)
  if (!chosen.length) return { error: "Ajoutez au moins un produit." }
  if (chosen.some((l) => !l.quantity.trim())) return { error: "Quantité manquante." }
  if (mode === "adjustment" && new Set(chosen.map((l) => l.inventory_item_id)).size !== chosen.length) {
    return { error: "Ce produit est saisi deux fois : gardez une seule ligne." }
  }
  const parsed = chosen.map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: Number(l.quantity.trim()) }))
  const min = mode === "adjustment" ? 0 : 1
  if (parsed.some((l) => !Number.isInteger(l.quantity) || l.quantity < min)) {
    return { error: "Quantité invalide : nombre entier positif." }
  }
  return { lines: parsed }
}

// Erreur lue par l'onglet Stock livreurs : une erreur réseau (fetch impossible)
// est dite en français au lieu du message brut du navigateur.
export const readableError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) {
    return "Service injoignable, réessayez."
  }
  return message || "Chargement impossible."
}
