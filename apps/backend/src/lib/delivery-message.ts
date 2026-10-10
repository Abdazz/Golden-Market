import { sendTemplateMessage } from "./whatsapp-template-sender"

// Le message au livreur est construit dans un module pur (importé aussi par
// l'admin) ; réexporté ici pour les appelants existants.
export { buildCourierMessage } from "./courier-message-text"

export async function sendCourierMessage(
  input: { phone: string; template_name: string; params: string[] },
  deps: { url?: string; secret?: string; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendTemplateMessage(input, deps)
}
