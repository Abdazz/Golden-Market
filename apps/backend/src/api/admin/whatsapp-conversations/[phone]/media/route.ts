import { randomBytes } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { prepareOutgoingMedia } from "../../../../../lib/whatsapp-media-prepare"

// Téléversement d'un média joint depuis l'admin (spec 2026-09-28
// whatsapp-chat-medias) : type vérifié sur le contenu, conversion, stockage
// public sous un nom aléatoire (URL non devinable, purgée après 90 jours par
// n8n). L'envoi WhatsApp se fait ensuite via /media-messages.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const file = (req as unknown as { file?: { buffer: Buffer; originalname: string } }).file
  if (!file) {
    res.status(400).json({ ok: false, error_code: "invalid_request", message: "Aucun fichier reçu." })
    return
  }
  const voice = String((req.body as Record<string, unknown> | undefined)?.voice ?? "") === "true"
  const prepared = await prepareOutgoingMedia(file.buffer, { filename: file.originalname, voice })
  if (!prepared.ok) {
    res.status(400).json({ ok: false, error_code: "invalid_request", message: prepared.message })
    return
  }
  const { media } = prepared
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          filename: `wa-media-${randomBytes(10).toString("hex")}.${media.ext}`,
          mimeType: media.mimeType,
          content: media.buffer.toString("base64"),
          access: "public",
        },
      ],
    },
  })
  res.json({
    ok: true,
    media: {
      url: result[0].url,
      kind: media.kind,
      mime_type: media.mimeType,
      filename: media.filename,
      size: media.buffer.length,
      voice: media.voice,
    },
  })
}
