import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getConversation } from "../../../../lib/whatsapp-chat-db"
import { deliveryFailureLabel, lastWindowFailureAt } from "../../../../lib/whatsapp-delivery-failure"
import { computeReplyWindow } from "../../../../lib/whatsapp-reply-window"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const conversation = await getConversation(req.params.phone)

  if (conversation === null) {
    res.json({ available: false })
    return
  }
  if (conversation === "not_found") {
    res.status(404).json({ available: true, found: false })
    return
  }

  const replyWindow = computeReplyWindow(conversation.lastUserMessageAt, new Date(), lastWindowFailureAt(conversation.messages))
  res.json({
    available: true,
    found: true,
    conversation: {
      ...conversation,
      messages: conversation.messages.map((m) => ({ ...m, deliveryFailure: deliveryFailureLabel(m.deliveryError) })),
      replyWindow: { open: replyWindow.open, expiresAt: replyWindow.expiresAt?.toISOString() ?? null },
    },
  })
}
