// Recherche d'un produit par nom dans les formulaires du stock livreurs :
// insensible aux accents, aux majuscules, à la ponctuation et à l'ordre des mots.

export const normalizeSearch = (text: string) =>
  text
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

export const matchesSearch = (label: string, query: string) => {
  const haystack = normalizeSearch(label)
  return normalizeSearch(query)
    .split(" ")
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}
