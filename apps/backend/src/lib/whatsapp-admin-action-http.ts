import { z } from "@medusajs/framework/zod"
import type { AdminActionResult, OutgoingMedia } from "./whatsapp-admin-actions-client"

// Traduction des résultats du webhook n8n en réponses HTTP des routes admin
// de reprise manuelle - la page admin s'appuie sur ces statuts pour choisir
// le message à afficher (409 -> proposer la relance, 503 -> réessayer...).
const STATUS_BY_KIND: Record<AdminActionResult["kind"], number> = {
  ok: 200,
  invalid_request: 400,
  not_found: 404,
  window_expired: 409,
  whatsapp_error: 502,
  unavailable: 503,
}

export const toHttpResponse = (
  result: AdminActionResult
): { status: number; body: Record<string, unknown> } =>
  result.kind === "ok"
    ? { status: 200, body: { ok: true, message: result.message, warning: result.warning } }
    : {
        status: STATUS_BY_KIND[result.kind],
        body: { ok: false, error_code: result.kind, message: result.message },
      }

// 4096 caractères : limite d'un message texte WhatsApp Cloud API.
const SendTextBody = z.object({ text: z.string().trim().min(1).max(4096) })

export const parseSendTextBody = (
  body: unknown
): { ok: true; text: string } | { ok: false; message: string } => {
  const parsed = SendTextBody.safeParse(body)
  return parsed.success
    ? { ok: true, text: parsed.data.text }
    : { ok: false, message: "Message vide ou trop long (4 096 caractères maximum)." }
}

// Envoi d'un média téléversé : légende de 1 024 caractères maximum (limite
// WhatsApp des légendes de média).
const SendMediaBody = z.object({
  kind: z.enum(["image", "video", "audio", "document"]),
  url: z.string().startsWith("https://"),
  mime_type: z.string().min(1),
  filename: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
  voice: z.boolean(),
  caption: z.string().trim().max(1024).optional(),
})

export const parseSendMediaBody = (
  body: unknown
): { ok: true; media: OutgoingMedia; caption: string } | { ok: false; message: string } => {
  const parsed = SendMediaBody.safeParse(body)
  if (!parsed.success) {
    return { ok: false, message: "Média invalide ou légende trop longue (1 024 caractères maximum)." }
  }
  const { caption, ...media } = parsed.data
  return { ok: true, media, caption: caption ?? "" }
}
