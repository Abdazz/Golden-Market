import { useRef, useState } from "react"

// Bouton « Copier le message livreur » : copie le texte exact du message
// WhatsApp envoyé au livreur, pour le renvoyer à la main depuis un téléphone.
// Pas de composant @medusajs/ui (conflit de types React 18/19).
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"

export const CopyCourierMessage = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [preview, setPreview] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setShowFallback(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers indisponible : zone de texte à sélectionner à la main.
      setShowFallback(true)
      setTimeout(() => areaRef.current?.select(), 0)
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
        <textarea
          ref={areaRef}
          readOnly
          rows={8}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          className="txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2 text-ui-fg-base"
        />
      )}
      {preview && (
        <pre className="txt-compact-small whitespace-pre-wrap rounded-md border border-ui-border-base bg-ui-bg-subtle p-2 text-ui-fg-base">
          {text}
        </pre>
      )}
    </div>
  )
}
