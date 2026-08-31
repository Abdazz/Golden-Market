import { CONTACT } from "@lib/contact"

const iconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

// Bandeau de réassurance de la fiche produit (maquette "Golden Market ·
// Fiche produit") : contenu statique réel (paiement Orange Money manuel,
// expédition depuis Ouagadougou, assistance sur le WhatsApp de la marque).
const ProductTrust = () => {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-gm-border pt-5 mt-1 text-[13px] text-gm-ink-muted">
      <span className="inline-flex items-center gap-2 text-gm-violet">
        <svg {...iconProps}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
        <span className="text-gm-ink-muted">Orange Money</span>
      </span>
      <span className="inline-flex items-center gap-2 text-gm-violet">
        <svg {...iconProps}>
          <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="1.6" />
          <circle cx="18" cy="18" r="1.6" />
        </svg>
        <span className="text-gm-ink-muted">Livraison Burkina Faso</span>
      </span>
      <a
        href={CONTACT.whatsapp.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-gm-violet hover:underline"
      >
        <svg {...iconProps}>
          <path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.4A8.6 8.6 0 0 1 8 19l-4.5 1L5 15.7A8.4 8.4 0 1 1 21 11.5Z" />
        </svg>
        <span className="text-gm-ink-muted">Assistance WhatsApp</span>
      </a>
    </div>
  )
}

export default ProductTrust
