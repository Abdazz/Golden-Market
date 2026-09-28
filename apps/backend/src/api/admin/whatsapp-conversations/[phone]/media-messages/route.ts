import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { parseSendMediaBody, toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"

// Envoi d'un média déjà téléversé (/media) : n8n l'envoie à WhatsApp par lien
// et l'enregistre dans l'historique (action send_media).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = parseSendMediaBody(req.body)
  if (!parsed.ok) {
    const { status, body } = toHttpResponse({ kind: "invalid_request", message: parsed.message })
    res.status(status).json(body)
    return
  }
  const { status, body } = toHttpResponse(
    await runAdminAction({ action: "send_media", phoneNumber: req.params.phone, media: parsed.media, caption: parsed.caption })
  )
  res.status(status).json(body)
}
