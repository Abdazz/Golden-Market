import { z } from "@medusajs/framework/zod"
import type { AdminActionResult } from "./whatsapp-admin-actions-client"

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
