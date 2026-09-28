// Logique pure de la zone de message de la page Conversations WhatsApp (spec
// 2026-09-28 whatsapp-chat-medias) : contrôles avant envoi et envoi
// séquentiel des fichiers joints (téléversement puis envoi, un par un).

export type OutgoingMediaDto = {
  kind: "image" | "video" | "audio" | "document"
  url: string
  mime_type: string
  filename: string
  size: number
  voice: boolean
}
export type PendingFile = { id: string; file: File; voice: boolean; status: "ready" | "sending" | "sent" | "error"; error: string | null }
type Outcome = { ok: true } | { ok: false; message: string; errorCode?: string }

const MB = 1048576
// Photo : 20 Mo tolérés avant conversion (le serveur vérifie les 5 Mo WhatsApp
// après conversion en JPEG).
const LIMITS = { image: 20 * MB, video: 16 * MB, audio: 16 * MB, document: 100 * MB }
const LABELS = {
  image: "Photo trop lourde : 20 Mo maximum.",
  video: "Vidéo trop lourde : 16 Mo maximum pour WhatsApp.",
  audio: "Audio trop lourd : 16 Mo maximum pour WhatsApp.",
  document: "Document trop lourd : 100 Mo maximum pour WhatsApp.",
}

export const guessKind = (file: File): OutgoingMediaDto["kind"] =>
  file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document"

export const clientSizeError = (file: File, voice: boolean): string | null => {
  const kind = voice ? "audio" : guessKind(file)
  return file.size > LIMITS[kind] ? LABELS[kind] : null
}

export const captionFor = (index: number, text: string): string => (index === 0 ? text.trim() : "")

export async function sendAll(
  files: PendingFile[],
  text: string,
  deps: {
    upload: (f: PendingFile) => Promise<{ ok: true; media: OutgoingMediaDto } | { ok: false; message: string; errorCode?: string }>
    send: (media: OutgoingMediaDto, caption: string) => Promise<Outcome>
    sendText: (text: string) => Promise<Outcome>
    onUpdate: (id: string, patch: Partial<PendingFile>) => void
  }
): Promise<{ ok: boolean; windowExpired: boolean; textSent: boolean }> {
  const queue = files.filter((f) => f.status !== "sent")
  let captionUsed = false
  for (const [index, pending] of queue.entries()) {
    deps.onUpdate(pending.id, { status: "sending", error: null })
    const uploaded = await deps.upload(pending)
    if (!uploaded.ok) {
      deps.onUpdate(pending.id, { status: "error", error: uploaded.message })
      return { ok: false, windowExpired: false, textSent: captionUsed }
    }
    // WhatsApp refuse une légende sur un audio : le texte partira à part.
    const caption = uploaded.media.kind === "audio" ? "" : captionFor(index, text)
    const sent = await deps.send(uploaded.media, caption)
    if (!sent.ok) {
      deps.onUpdate(pending.id, { status: "error", error: sent.message })
      // Légende déjà partie avec un fichier précédent : textSent vrai, pour que
      // la zone de texte soit vidée et que le réessai ne la renvoie pas.
      return { ok: false, windowExpired: sent.errorCode === "window_expired", textSent: captionUsed }
    }
    if (caption) captionUsed = true
    deps.onUpdate(pending.id, { status: "sent", error: null })
  }
  if (text.trim() && !captionUsed) {
    const sent = await deps.sendText(text.trim())
    if (!sent.ok) return { ok: false, windowExpired: sent.errorCode === "window_expired", textSent: false }
    return { ok: true, windowExpired: false, textSent: true }
  }
  return { ok: true, windowExpired: false, textSent: captionUsed }
}
