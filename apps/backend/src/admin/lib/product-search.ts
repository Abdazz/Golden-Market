// Recherche d'un produit par nom dans les formulaires du stock livreurs :
// insensible aux accents, aux majuscules, à la ponctuation et à l'ordre des mots.

export const normalizeSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

export const matchesSearch = (label: string, query: string) => {
  const haystack = normalizeSearch(label)
  return normalizeSearch(query)
    .split(" ")
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}
