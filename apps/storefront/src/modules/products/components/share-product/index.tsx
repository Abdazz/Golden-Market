"use client"

import { Check, Facebook, Link, Share } from "@medusajs/icons"
import { useEffect, useRef, useState } from "react"

type ShareProductProps = {
  title: string
}

// Bouton "Partager" de la fiche produit : réseaux utilisés par la clientèle
// (WhatsApp, Facebook, Telegram), copie du lien, et feuille de partage native
// du téléphone quand le navigateur la propose.
const ShareProduct = ({ title }: ShareProductProps) => {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", close)
    }
  }, [open])

  // Lien sans paramètres de suivi (fbclid, utm...) hérités de la visite en cours.
  const productUrl = () => `${window.location.origin}${window.location.pathname}`

  const shareLinks = () => {
    const url = encodeURIComponent(productUrl())
    const text = encodeURIComponent(title)
    return [
      { label: "WhatsApp", href: `https://wa.me/?text=${text}%20${url}`, icon: <WhatsappIcon /> },
      { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${url}`, icon: <Facebook /> },
      { label: "Telegram", href: `https://t.me/share/url?url=${url}&text=${text}`, icon: <TelegramIcon /> },
    ]
  }

  const copyLink = async () => {
    const url = productUrl()
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Contexte non sécurisé ou API refusée : ancienne méthode.
      const input = document.createElement("textarea")
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand("copy")
      input.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url: productUrl() })
      setOpen(false)
    } catch {
      // Partage annulé par l'utilisateur : rien à faire.
    }
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gm-ink hover:bg-gm-ivoire"

  return (
    <div ref={ref} className="relative w-fit">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-full border border-gm-border px-4 py-2 text-sm font-semibold text-gm-ink transition-colors hover:border-gm-violet hover:text-gm-violet"
        data-testid="share-product-button"
      >
        <Share />
        Partager
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-2 w-60 rounded-xl border border-gm-border bg-white p-2 shadow-lg"
        >
          {shareLinks().map((link) => (
            <a
              key={link.label}
              role="menuitem"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {link.icon}
              {link.label}
            </a>
          ))}
          <button type="button" role="menuitem" className={itemClass} onClick={copyLink}>
            {copied ? <Check className="text-green-600" /> : <Link />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          {canNativeShare && (
            <button type="button" role="menuitem" className={itemClass} onClick={nativeShare}>
              <Share />
              Autres applications
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const WhatsappIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43m8.03-17.46A11.3 11.3 0 0 0 12.05.7C5.79.7.69 5.79.69 12.06c0 2 .52 3.96 1.52 5.68L.6 23.6l6-1.57a11.3 11.3 0 0 0 5.44 1.39h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.04-1.18-5.89-3.33-8.03" />
  </svg>
)

const TelegramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.94 4.3 18.7 19.6c-.24 1.08-.88 1.35-1.79.84l-4.94-3.64-2.38 2.3c-.26.26-.48.48-.99.48l.35-5.02 9.14-8.26c.4-.35-.09-.55-.62-.2l-11.3 7.12-4.87-1.52c-1.06-.33-1.08-1.06.22-1.57l19.04-7.34c.88-.33 1.65.2 1.38 1.51" />
  </svg>
)

export default ShareProduct
