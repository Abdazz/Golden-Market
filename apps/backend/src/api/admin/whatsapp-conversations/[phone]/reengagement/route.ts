import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { status, body } = toHttpResponse(
    await runAdminAction({ action: "send_reengagement", phoneNumber: req.params.phone })
  )
  res.status(status).json(body)
}
