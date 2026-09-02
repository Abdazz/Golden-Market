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
// Fiche produit") : contenu statique réel (moyens de paiement manuels
// disponibles - Orange Money, Moov Money, paiement à la réception à Ouaga -,
// expédition depuis Ouagadougou, assistance sur le WhatsApp de la marque).
const ProductTrust = ({
  freeShippingNote,
}: {
  // Condition réelle de livraison gratuite pour CE produit (ex. "Partout à
  // Ouaga à partir de 2 achetés"), issue de metadata.free_shipping_note -
  // note d'information uniquement, pas de remise calculée automatiquement
  // au panier (décision explicite, lot de produits 2026-09).
  freeShippingNote?: string | null
}) => {
  return (
    <div className="flex flex-col gap-3">
      {freeShippingNote && (
        <div className="flex items-center gap-2.5 rounded-xl bg-gm-terracotta/[0.08] px-3.5 py-2.5 text-[13px] font-semibold text-gm-terracotta">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
            <circle cx="7" cy="18" r="1.6" />
            <circle cx="18" cy="18" r="1.6" />
          </svg>
          Livraison gratuite : {freeShippingNote}
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-gm-border pt-5 mt-1 text-[13px] text-gm-ink-muted">
        <span className="inline-flex items-center gap-2 text-gm-violet">
          <svg {...iconProps}>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </svg>
          <span className="text-gm-ink-muted">Mobile Money & à la livraison</span>
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
    </div>
  )
}

export default ProductTrust
