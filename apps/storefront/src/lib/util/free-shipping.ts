import { HttpTypes } from "@medusajs/types"

// Seuil de livraison gratuite d'un produit, paramétrable depuis l'admin
// Medusa via metadata.free_shipping_threshold (nombre d'unités du produit à
// commander pour bénéficier de la livraison gratuite). Absent/invalide ->
// pas de badge (aucune donnée inventée). Palier 2 du backlog du 2026-09-02 :
// seuil 1 -> "Livraison Gratuite", seuil > 1 -> "Livraison gratuite à partir
// de X". Indépendant de metadata.free_shipping_note (texte libre affiché
// dans le bandeau de réassurance de la fiche produit, ProductTrust).
export const getFreeShippingBadgeLabel = (
  product: Pick<HttpTypes.StoreProduct, "metadata">
): string | null => {
  const raw = product.metadata?.free_shipping_threshold
  const threshold =
    typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN

  if (!Number.isFinite(threshold) || threshold < 1) {
    return null
  }

  return threshold <= 1
    ? "Livraison Gratuite"
    : `Livraison gratuite à partir de ${threshold}`
}
