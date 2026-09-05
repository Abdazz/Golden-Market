import type { MetaCatalogItem } from "./meta-catalog-mapping"

export type MetaCatalogConfig = {
  catalogId: string
  accessToken: string
}

// v20.0 : même version que l'intégration WhatsApp Cloud API existante côté
// n8n (n8n-workflows/*.json) - les deux intégrations Meta restent alignées.
const GRAPH_API_VERSION = "v20.0"

/**
 * POST /{catalog_id}/items_batch, méthode UPDATE (upsert par défaut côté
 * Meta - voir allow_upsert dans la doc officielle). Format confirmé dans la
 * doc Meta (Product Catalog Items Batch API reference) : multipart/form-data
 * avec access_token, item_type et requests (JSON stringifié) en champs de
 * formulaire - pas de JSON body brut, pas de query param pour le jeton.
 */
export async function upsertCatalogItem(
  item: MetaCatalogItem,
  config: MetaCatalogConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const { catalogId, accessToken } = config

  if (!catalogId) {
    throw new Error("META_CATALOG_ID non configuré")
  }
  if (!accessToken) {
    throw new Error("META_CATALOG_ACCESS_TOKEN non configuré")
  }

  const body = new FormData()
  body.append("access_token", accessToken)
  body.append("item_type", "PRODUCT_ITEM")
  body.append(
    "requests",
    JSON.stringify([{ method: "UPDATE", data: item }])
  )

  const response = await fetchImpl(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/items_batch`,
    { method: "POST", body }
  )

  if (!response.ok) {
    // Le Batch API de Meta peut renvoyer un corps d'erreur détaillé même sur
    // un statut non-ok - on le remonte tel quel (pas de parsing JSON, pas de
    // schéma supposé) pour que l'opérateur voie l'erreur réelle de Meta, pas
    // juste le code HTTP.
    const bodyText = await response.text().catch(() => "")
    throw new Error(
      `Meta Catalog API (items_batch) a répondu ${response.status}: ${bodyText}`
    )
  }
}
