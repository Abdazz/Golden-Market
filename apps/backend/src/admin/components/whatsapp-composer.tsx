import { useCallback, useEffect, useRef, useState } from "react"
import { clientSizeError, guessKind, sendAll } from "../lib/whatsapp-media"
import type { OutgoingMediaDto, PendingFile } from "../lib/whatsapp-media"
import { formatSize } from "./whatsapp-attachment"

// Zone de message de la page Conversations WhatsApp (spec 2026-09-28
// whatsapp-chat-medias) : texte, emojis, photos/vidéos/documents (trombone,
// glisser-déposer, Ctrl+V), légende, envoi multiple, notes vocales. Hors
// fenêtre de 24 h : seul le message de relance (modèle Meta) est proposé.
// Éléments HTML natifs (pas de @medusajs/ui, conflit de types React 18/19).

type ReplyWindow = { open: boolean; expiresAt: string | null }
type ActionResponse = { ok: true; warning: string | null } | { ok: false; error_code: string; message: string }

const EMOJIS = [
  "😀", "😂", "😊", "😍", "🙏", "👍", "👌", "👏", "🙌", "🔥", "🎉", "✅",
  "❌", "⚠️", "❤️", "💯", "😢", "😅", "🤝", "📦", "🚚", "💰", "💳", "📞",
  "📍", "⏰", "🛒", "🎁", "⭐", "✨", "👋", "🙂", "😉", "🤔", "😎", "🥰",
  "😁", "🤗", "💪", "👉", "👇", "📷", "🎥", "🎤", "📄", "✔️", "🆗", "🇧🇫",
]

const ACCEPT = "image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
const MAX_RECORDING_MS = 15 * 60 * 1000

const phonePath = (phoneNumber: string, path: string) =>
  `/admin/whatsapp-conversations/${encodeURIComponent(phoneNumber)}/${path}`

const postJson = async (phoneNumber: string, path: string, body?: unknown): Promise<ActionResponse> => {
  try {
    const res = await fetch(phonePath(phoneNumber, path), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return (await res.json()) as ActionResponse
  } catch {
    return { ok: false, error_code: "unavailable", message: "Service injoignable, réessayez." }
  }
}

const uploadFile = async (
  phoneNumber: string,
  pending: PendingFile
): Promise<{ ok: true; media: OutgoingMediaDto } | { ok: false; message: string }> => {
  const form = new FormData()
  form.append("file", pending.file, pending.file.name)
  form.append("voice", pending.voice ? "true" : "false")
  try {
    const res = await fetch(phonePath(phoneNumber, "media"), { method: "POST", credentials: "include", body: form })
    const body = (await res.json()) as { ok?: boolean; media?: OutgoingMediaDto; message?: string }
    if (body.ok && body.media) return { ok: true, media: body.media }
    return { ok: false, message: body.message ?? `Téléversement impossible (${res.status}).` }
  } catch {
    return { ok: false, message: "Téléversement impossible, vérifiez la connexion." }
  }
}

const recorderMimeType = (): string => {
  const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"]
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? ""
}

const extensionForRecording = (mimeType: string) =>
  mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm"

const formatDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

const iconButton =
  "txt-compact-small flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-subtle hover:text-ui-fg-base disabled:opacity-50"
const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted disabled:opacity-50"

const FilePreview = ({
  pending,
  previewUrl,
  onRemove,
  onRetry,
  disabled,
}: {
  pending: PendingFile
  previewUrl: string | undefined
  onRemove: () => void
  onRetry: () => void
  disabled: boolean
}) => {
  const kind = pending.voice ? "audio" : guessKind(pending.file)
  return (
    <div className="flex w-36 shrink-0 flex-col gap-y-1 rounded-md border border-ui-border-base bg-ui-bg-base p-1.5">
      <div className="relative">
        {kind === "image" && previewUrl ? (
          <img src={previewUrl} alt="" className="h-20 w-full rounded object-cover" />
        ) : kind === "video" && previewUrl ? (
          <video src={previewUrl} muted className="h-20 w-full rounded bg-black object-cover" />
        ) : (
          <div className="txt-compact-xsmall flex h-20 w-full flex-col items-center justify-center rounded bg-ui-bg-subtle p-1 text-center text-ui-fg-subtle">
            <span className="txt-compact-small-plus">{pending.voice ? "Note vocale" : kind === "audio" ? "Audio" : "Document"}</span>
            <span className="w-full truncate">{pending.voice ? "" : pending.file.name}</span>
          </div>
        )}
        {pending.status !== "sending" && (
          <button
            type="button"
            aria-label="Retirer"
            onClick={onRemove}
            disabled={disabled}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ui-bg-base text-ui-fg-subtle shadow"
          >
            ×
          </button>
        )}
      </div>
      <span className="txt-compact-xsmall text-ui-fg-subtle">
        {pending.status === "sending" ? "Envoi…" : formatSize(pending.file.size)}
      </span>
      {pending.status === "error" && (
        <>
          <span className="txt-compact-xsmall text-ui-fg-error">{pending.error}</span>
          <button type="button" onClick={onRetry} disabled={disabled} className="txt-compact-xsmall-plus self-start text-ui-fg-interactive">
            Réessayer
          </button>
        </>
      )}
    </div>
  )
}

export const WhatsappComposer = ({
  phoneNumber,
  replyWindow,
  onSent,
}: {
  phoneNumber: string
  replyWindow: ReplyWindow
  onSent: (warning: string | null) => void
}) => {
  const [text, setText] = useState("")
  const [files, setFiles] = useState<PendingFile[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [recordingMs, setRecordingMs] = useState<number | null>(null)
  // Si n8n signale la fenêtre expirée (409) alors que l'affichage la croyait
  // ouverte, on bascule sur la relance sans attendre le prochain rafraîchissement.
  const [windowClosed, setWindowClosed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previews = useRef(new Map<string, string>())
  const recorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; cancelled: boolean; timer: number; startedAt: number } | null>(null)

  const clearPreviews = useCallback(() => {
    previews.current.forEach((url) => URL.revokeObjectURL(url))
    previews.current.clear()
  }, [])

  // Réinitialise la zone de saisie uniquement au changement de conversation,
  // jamais sur un rafraîchissement périodique.
  useEffect(() => {
    setText("")
    setFiles([])
    setError(null)
    setWindowClosed(false)
    setEmojiOpen(false)
    clearPreviews()
  }, [phoneNumber, clearPreviews])

  useEffect(
    () => () => {
      clearPreviews()
      const current = recorderRef.current
      if (current) {
        current.cancelled = true
        window.clearInterval(current.timer)
        current.stream.getTracks().forEach((track) => track.stop())
      }
    },
    [clearPreviews]
  )

  const updateFile = useCallback((id: string, patch: Partial<PendingFile>) => {
    setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }, [])

  const removeFile = (id: string) => {
    const url = previews.current.get(id)
    if (url) URL.revokeObjectURL(url)
    previews.current.delete(id)
    setFiles((current) => current.filter((f) => f.id !== id))
  }

  const addFiles = (list: File[], voice = false): PendingFile[] => {
    const added: PendingFile[] = []
    const refused: string[] = []
    for (const file of list) {
      const tooBig = clientSizeError(file, voice)
      if (tooBig) {
        refused.push(`${file.name} : ${tooBig}`)
        continue
      }
      const pending: PendingFile = { id: newId(), file, voice, status: "ready", error: null }
      const kind = guessKind(file)
      if (!voice && (kind === "image" || kind === "video")) {
        previews.current.set(pending.id, URL.createObjectURL(file))
      }
      added.push(pending)
    }
    setError(refused.length ? refused.join(" ") : null)
    if (added.length) setFiles((current) => [...current, ...added])
    return added
  }

  const run = async (path: string, body?: unknown) => {
    setSending(true)
    setError(null)
    const result = await postJson(phoneNumber, path, body)
    setSending(false)
    if (result.ok) {
      if (path === "messages") setText("")
      onSent(result.warning)
      return
    }
    if (result.error_code === "window_expired") setWindowClosed(true)
    setError(result.message)
  }

  const sendFiles = async (queue: PendingFile[], caption: string) => {
    setSending(true)
    setError(null)
    const result = await sendAll(queue, caption, {
      upload: (pending) => uploadFile(phoneNumber, pending),
      send: async (media, mediaCaption) => {
        const response = await postJson(phoneNumber, "media-messages", { ...media, caption: mediaCaption })
        return response.ok ? { ok: true } : { ok: false, message: response.message, errorCode: response.error_code }
      },
      sendText: async (message) => {
        const response = await postJson(phoneNumber, "messages", { text: message })
        return response.ok ? { ok: true } : { ok: false, message: response.message, errorCode: response.error_code }
      },
      onUpdate: updateFile,
    })
    setSending(false)
    // Fichiers partis : retirés de l'aperçu (leurs vignettes sont libérées).
    setFiles((current) => {
      current.filter((f) => f.status === "sent").forEach((f) => {
        const url = previews.current.get(f.id)
        if (url) URL.revokeObjectURL(url)
        previews.current.delete(f.id)
      })
      return current.filter((f) => f.status !== "sent")
    })
    if (result.textSent) setText("")
    if (result.windowExpired) setWindowClosed(true)
    onSent(null)
  }

  const send = () => {
    if (files.length === 0) {
      if (text.trim()) void run("messages", { text })
      return
    }
    void sendFiles(files, text)
  }

  const insertEmoji = (emoji: string) => {
    const area = textareaRef.current
    const start = area?.selectionStart ?? text.length
    const end = area?.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      if (!area) return
      area.focus()
      area.selectionStart = area.selectionEnd = start + emoji.length
    })
  }

  const stopRecording = (cancel: boolean) => {
    const current = recorderRef.current
    if (!current) return
    current.cancelled = cancel
    window.clearInterval(current.timer)
    if (current.recorder.state !== "inactive") current.recorder.stop()
  }

  const startRecording = async () => {
    setError(null)
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("L'enregistrement vocal n'est pas pris en charge par ce navigateur.")
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError("Autorisez le micro pour enregistrer un vocal.")
      return
    }
    const mimeType = recorderMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    const startedAt = Date.now()
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const current = recorderRef.current
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      setRecordingMs(null)
      if (!current || current.cancelled || chunks.length === 0) return
      const type = recorder.mimeType || mimeType || "audio/webm"
      const file = new File(chunks, `vocal.${extensionForRecording(type)}`, { type })
      const added = addFiles([file], true)
      // Vocal envoyé aussitôt, seul : le texte en cours de saisie n'est pas consommé.
      if (added.length) void sendFiles(added, "")
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      setRecordingMs(elapsed)
      if (elapsed >= MAX_RECORDING_MS) stopRecording(false)
    }, 250)
    recorderRef.current = { recorder, stream, cancelled: false, timer, startedAt }
    setRecordingMs(0)
    recorder.start()
  }

  const open = replyWindow.open && !windowClosed
  const maxLength = files.length ? 1024 : 4096
  const canSend = !sending && recordingMs === null && (files.length > 0 || text.trim().length > 0)

  if (!open) {
    return (
      <div className="border-t border-ui-border-base p-3">
        {error && <p className="txt-compact-small mb-2 text-ui-fg-error">{error}</p>}
        <div className="flex flex-col gap-y-2">
          <p className="txt-compact-small text-ui-fg-subtle">
            Le client n'a pas écrit depuis plus de 24 h : WhatsApp n'autorise plus de réponse libre.
            Envoyez le message de relance ; dès que le client répond, vous pourrez de nouveau lui écrire.
          </p>
          <button type="button" disabled={sending} onClick={() => void run("reengagement")} className={`${primaryButton} self-start`}>
            {sending ? "Envoi…" : "Envoyer le message de relance"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative border-t border-ui-border-base p-3 ${dragOver ? "bg-ui-bg-highlight" : ""}`}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        if (event.dataTransfer.files.length) addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {dragOver && (
        <p className="txt-compact-small-plus mb-2 text-center text-ui-fg-interactive">Déposez vos fichiers ici</p>
      )}
      {error && <p className="txt-compact-small mb-2 text-ui-fg-error">{error}</p>}

      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {files.map((pending) => (
            <FilePreview
              key={pending.id}
              pending={pending}
              previewUrl={previews.current.get(pending.id)}
              disabled={sending}
              onRemove={() => removeFile(pending.id)}
              onRetry={() => void sendFiles(files, text)}
            />
          ))}
        </div>
      )}

      {emojiOpen && (
        <div className="mb-2 grid grid-cols-8 gap-1 rounded-md border border-ui-border-base bg-ui-bg-base p-2 sm:grid-cols-12">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-ui-bg-subtle"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {recordingMs !== null ? (
        <div className="flex items-center gap-x-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-ui-tag-red-icon" />
          <span className="txt-compact-small-plus text-ui-fg-base tabular-nums">Enregistrement {formatDuration(recordingMs)}</span>
          <div className="flex-1" />
          <button type="button" onClick={() => stopRecording(true)} className="txt-compact-small rounded-md border border-ui-border-base px-3 py-2">
            Annuler
          </button>
          <button type="button" onClick={() => stopRecording(false)} className={primaryButton}>
            Envoyer
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-x-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) addFiles(Array.from(event.target.files))
              event.target.value = ""
            }}
          />
          <button type="button" aria-label="Joindre des fichiers" title="Joindre des photos, vidéos ou documents" disabled={sending} onClick={() => fileInputRef.current?.click()} className={iconButton}>
            📎
          </button>
          <button type="button" aria-label="Emojis" title="Emojis" onClick={() => setEmojiOpen((value) => !value)} className={iconButton}>
            😊
          </button>
          <div className="flex flex-1 flex-col">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => {
                const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"))
                if (images.length) {
                  event.preventDefault()
                  addFiles(images)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canSend) {
                  event.preventDefault()
                  send()
                }
              }}
              rows={2}
              maxLength={maxLength}
              placeholder={files.length ? "Ajouter une légende…" : "Votre réponse au client…"}
              className="txt-compact-small w-full resize-none rounded-md border border-ui-border-base px-3 py-2"
            />
            {text.length > 900 && (
              <span className="txt-compact-xsmall self-end text-ui-fg-subtle">
                {text.length} / {maxLength}
              </span>
            )}
          </div>
          {canSend || files.length > 0 || text.trim() ? (
            <button type="button" disabled={!canSend} onClick={send} className={primaryButton}>
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          ) : (
            <button type="button" aria-label="Enregistrer un vocal" title="Enregistrer une note vocale" disabled={sending} onClick={() => void startRecording()} className={iconButton}>
              🎤
            </button>
          )}
        </div>
      )}
    </div>
  )
}
