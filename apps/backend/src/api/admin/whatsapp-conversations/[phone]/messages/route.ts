import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { parseSendTextBody, toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = parseSendTextBody(req.body)
  if (!parsed.ok) {
    const { status, body } = toHttpResponse({ kind: "invalid_request", message: parsed.message })
    res.status(status).json(body)
    return
  }

  const { status, body } = toHttpResponse(
    await runAdminAction({ action: "send_text", phoneNumber: req.params.phone, text: parsed.text })
  )
  res.status(status).json(body)
}
