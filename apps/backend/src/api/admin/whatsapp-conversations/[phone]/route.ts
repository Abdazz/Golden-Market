import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getConversationMessages } from "../../../../lib/whatsapp-chat-db"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const phoneNumber = req.params.phone
  const messages = await getConversationMessages(phoneNumber)

  if (messages === null) {
    res.json({ available: false })
    return
  }

  res.json({ available: true, messages })
}
