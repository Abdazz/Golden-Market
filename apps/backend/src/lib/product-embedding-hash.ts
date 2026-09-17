import { createHash } from "crypto"

// Sert à ne ré-embedder un produit que si son titre/description a
// réellement changé (pas à chaque mise à jour de prix/stock) - voir le
// subscriber product-upserted-embedding.ts.
export function computeProductContentHash(
  title: string,
  description: string | null | undefined
): string {
  return createHash("sha256")
    .update(`${title}\n${description ?? ""}`)
    .digest("hex")
}
