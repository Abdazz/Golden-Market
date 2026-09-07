import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listConversations } from "../../../lib/whatsapp-chat-db"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const search = typeof req.query.q === "string" ? req.query.q : undefined
  const conversations = await listConversations(search)

  if (conversations === null) {
    res.json({ available: false })
    return
  }

  res.json({ available: true, conversations })
}
