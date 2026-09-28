// Pièce jointe d'un message dans la page Conversations WhatsApp (spec
// 2026-09-28 whatsapp-chat-medias) : photo, vidéo, note vocale / audio,
// document - envoyée par le client ou depuis l'admin. Éléments HTML natifs
// (pas de @medusajs/ui, conflit de types React 18/19).

export type ChatAttachment = {
  type: "image" | "video" | "audio" | "document"
  url: string | null
  mime_type?: string
  filename?: string
  size?: number
  voice?: boolean
  expired?: boolean
  unavailable?: boolean
}

export const formatSize = (bytes: number | undefined): string => {
  if (!bytes && bytes !== 0) return ""
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1).replace(".", ",")} Ko`
  return `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo`
}

const extensionOf = (attachment: ChatAttachment): string => {
  const fromName = attachment.filename?.split(".").pop()
  if (fromName && fromName !== attachment.filename) return fromName.toUpperCase().slice(0, 4)
  return (attachment.mime_type?.split("/").pop() ?? "FICHIER").toUpperCase().slice(0, 4)
}

const Placeholder = ({ text }: { text: string }) => (
  <span className="txt-compact-xsmall flex h-20 w-40 items-center justify-center rounded-md bg-ui-bg-subtle p-2 text-center text-ui-fg-muted">
    {text}
  </span>
)

// compact : vignette réduite quand plusieurs photos sont affichées en grille.
export const WhatsappAttachment = ({ attachment, compact = false }: { attachment: ChatAttachment; compact?: boolean }) => {
  if (!attachment.url) {
    if (attachment.unavailable) return <Placeholder text="Média indisponible" />
    if (attachment.type === "image" && !attachment.expired) return <Placeholder text="Photo supprimée (90 jours)" />
    return <Placeholder text="Média expiré (conservé 90 jours)" />
  }

  switch (attachment.type) {
    case "image":
      return (
        <a href={attachment.url} target="_blank" rel="noreferrer">
          <img
            src={attachment.url}
            alt=""
            loading="lazy"
            className={`${compact ? "h-24 w-24" : "h-40 w-40"} rounded-md object-cover`}
          />
        </a>
      )
    case "video":
      return <video controls preload="metadata" src={attachment.url} className="max-h-64 w-64 rounded-md bg-black" />
    case "audio":
      return (
        <div className="flex flex-col gap-y-1">
          {attachment.voice && <span className="txt-compact-xsmall opacity-70">Note vocale</span>}
          <audio controls preload="metadata" src={attachment.url} className="w-64 max-w-full" />
        </div>
      )
    case "document":
    default:
      return (
        <div className="flex w-64 max-w-full items-center gap-x-2 rounded-md border border-ui-border-base bg-ui-bg-base p-2 text-ui-fg-base">
          <span className="txt-compact-xsmall-plus flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ui-tag-red-bg text-ui-tag-red-text">
            {extensionOf(attachment)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="txt-compact-small truncate" title={attachment.filename}>
              {attachment.filename ?? "Document"}
            </span>
            <span className="txt-compact-xsmall text-ui-fg-subtle">{formatSize(attachment.size)}</span>
          </div>
          <a
            href={attachment.url}
            download={attachment.filename}
            target="_blank"
            rel="noreferrer"
            className="txt-compact-xsmall-plus shrink-0 text-ui-fg-interactive"
          >
            Télécharger
          </a>
        </div>
      )
  }
}
