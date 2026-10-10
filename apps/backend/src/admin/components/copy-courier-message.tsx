import { useEffect, useRef, useState } from "react"

// Bouton « Copier le message livreur » : copie le texte exact du message
// WhatsApp envoyé au livreur, pour le renvoyer à la main depuis un téléphone.
// Pas de composant @medusajs/ui (conflit de types React 18/19).
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base"

export const CopyCourierMessage = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [preview, setPreview] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fn, ms)
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setShowFallback(false)
      setCopied(true)
      later(() => setCopied(false), 3000)
    } catch {
      // Presse-papiers indisponible : zone de texte à sélectionner à la main.
      setCopied(false)
      setShowFallback(true)
      later(() => areaRef.current?.select(), 0)
    }
  }

  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex items-center gap-x-3">
        <button type="button" className={secondaryButton} onClick={copy}>
          {copied ? "Message copié" : "Copier le message livreur"}
        </button>
        <button type="button" className="txt-compact-small text-ui-fg-interactive" onClick={() => setPreview((v) => !v)}>
          {preview ? "Masquer le message" : "Voir le message"}
        </button>
      </div>
      {showFallback && (
        <>
          <span className="txt-compact-small text-ui-fg-subtle">Copiez le texte ci-dessous</span>
          <textarea
            ref={areaRef}
            readOnly
            rows={10}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
          className="txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2 text-ui-fg-base"
          />
        </>
      )}
      {preview && (
        <pre className="txt-compact-small whitespace-pre-wrap rounded-md border border-ui-border-base bg-ui-bg-subtle p-2 text-ui-fg-base">
          {text}
        </pre>
      )}
    </div>
  )
}
