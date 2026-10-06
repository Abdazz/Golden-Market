import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { parseSendMediaBody, toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"
import { isCertainSendFailure, orphanMediaFileKey } from "../../../../../lib/whatsapp-media-cleanup"

// Origine de notre stockage, d'après MEDUSA_BACKEND_PUBLIC_URL. Variable absente :
// pas de contrainte (null). Variable mal formée : aucune origine ne correspond,
// donc aucune suppression.
const storageOrigin = (): string | null => {
  const configured = process.env.MEDUSA_BACKEND_PUBLIC_URL
  if (!configured) return null
  try {
    return new URL(configured).origin
  } catch {
    return "invalid-origin"
  }
}

// Envoi d'un média déjà téléversé (/media) : n8n l'envoie à WhatsApp par lien
// et l'enregistre dans l'historique (action send_media). Si l'envoi est refusé
// de façon certaine, le fichier téléversé est supprimé du stockage.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = parseSendMediaBody(req.body)
  if (!parsed.ok) {
    const { status, body } = toHttpResponse({ kind: "invalid_request", message: parsed.message })
    res.status(status).json(body)
    return
  }
  const result = await runAdminAction({
    action: "send_media",
    phoneNumber: req.params.phone,
    media: parsed.media,
    caption: parsed.caption,
  })
  // Envoi refusé de façon certaine : n8n n'a rien enregistré, le fichier
  // téléversé ne serait jamais purgé ("Réessayer" en téléverse un nouveau).
  const key = result.kind !== "ok" && isCertainSendFailure(result.kind) ? orphanMediaFileKey(parsed.media.url, storageOrigin()) : null
  if (key) {
    try {
      await req.scope.resolve(Modules.FILE).deleteFiles([key])
    } catch (error) {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`Média ${key} non supprimé après un envoi refusé (${(error as Error).message})`)
    }
  }
  const { status, body } = toHttpResponse(result)
  res.status(status).json(body)
}
