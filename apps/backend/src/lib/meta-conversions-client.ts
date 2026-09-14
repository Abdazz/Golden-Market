import type { MetaConversionEvent } from "./meta-conversions-mapping"

export type MetaConversionsConfig = {
  pixelId: string
  accessToken: string
}

// v20.0 : même version que la synchro catalogue Meta (meta-catalog-client.ts)
// et l'intégration WhatsApp Cloud API existante.
const GRAPH_API_VERSION = "v20.0"

/**
 * POST /{pixel_id}/events (Conversions API) - contrairement à l'API Batch du
 * catalogue, ici le corps est du JSON classique (pas de multipart/form-data),
 * et le jeton passe en paramètre de requête plutôt qu'en champ de formulaire
 * (format confirmé par la documentation officielle Meta Conversions API).
 */
export async function sendConversionEvent(
  event: MetaConversionEvent,
  config: MetaConversionsConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const { pixelId, accessToken } = config

  if (!pixelId) {
    throw new Error("META_PIXEL_ID non configuré")
  }
  if (!accessToken) {
    throw new Error("META_CONVERSIONS_API_ACCESS_TOKEN non configuré")
  }

  const response = await fetchImpl(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
    }
  )

  if (!response.ok) {
    throw new Error(`Meta Conversions API a répondu ${response.status}`)
  }
}
