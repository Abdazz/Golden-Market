// Déclenche une action de reprise manuelle (prise de main, envoi, relance...)
// sur le webhook n8n "Admin - actions conversation" - n8n reste le seul
// écrivain de la base golden_market et le seul détenteur du jeton WhatsApp
// (spec docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md).
// Variables présentes en production uniquement, comme WHATSAPP_CHAT_DATABASE_URL.

export type AdminAction = "take_over" | "hand_back" | "send_text" | "send_reengagement"

export type SentMessage = { role: "human"; content: string; createdAt: string }

export type AdminActionErrorKind =
  | "window_expired"
  | "whatsapp_error"
  | "not_found"
  | "invalid_request"
  | "unavailable"

export type AdminActionResult =
  | { kind: "ok"; message: SentMessage | null; warning: string | null }
  | { kind: AdminActionErrorKind; message: string }

const BUSINESS_ERRORS: AdminActionErrorKind[] = [
  "window_expired",
  "whatsapp_error",
  "not_found",
  "invalid_request",
]

const UNAVAILABLE_MESSAGE = "Service WhatsApp injoignable pour le moment, réessayez."

export async function runAdminAction(
  input: { action: AdminAction; phoneNumber: string; text?: string },
  deps: { url?: string; secret?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<AdminActionResult> {
  // "url" in deps distingue "non fourni" (lire l'env) de "fourni à undefined"
  // (configuration absente, cas testé).
  const url = "url" in deps ? deps.url : process.env.N8N_ADMIN_ACTIONS_WEBHOOK_URL
  const secret = "secret" in deps ? deps.secret : process.env.N8N_ADMIN_ACTIONS_WEBHOOK_SECRET
  const fetchImpl = deps.fetchImpl ?? fetch

  if (!url || !secret) {
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? 20_000)

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-actions-secret": secret },
      body: JSON.stringify({ action: input.action, phone_number: input.phoneNumber, text: input.text }),
      signal: controller.signal,
    })
    const body = (await response.json()) as {
      ok?: boolean
      error_code?: string
      message?: unknown
      warning?: string | null
    }

    if (body.ok === true) {
      return {
        kind: "ok",
        message: (body.message as SentMessage | null) ?? null,
        warning: body.warning ?? null,
      }
    }
    if (body.ok === false && BUSINESS_ERRORS.includes(body.error_code as AdminActionErrorKind)) {
      return {
        kind: body.error_code as AdminActionErrorKind,
        message: typeof body.message === "string" ? body.message : "Erreur",
      }
    }
    console.error("[whatsapp-admin-actions] Réponse inattendue de n8n :", response.status, body)
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
  } catch (error) {
    console.error("[whatsapp-admin-actions] Appel du webhook n8n en échec :", error)
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
  } finally {
    clearTimeout(timeout)
  }
}
