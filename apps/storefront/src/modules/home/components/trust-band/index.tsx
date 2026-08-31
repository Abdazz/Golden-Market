import { CONTACT } from "@lib/contact"

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

const items = [
  {
    title: "Paiement Orange Money",
    detail: "Simple et sécurisé, sans carte bancaire",
    icon: (
      <svg {...iconProps}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    title: "Livraison au Burkina Faso",
    detail: "Expédié depuis Ouagadougou",
    icon: (
      <svg {...iconProps}>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="18" cy="18" r="1.6" />
      </svg>
    ),
  },
  {
    title: "Une question ?",
    detail: `${CONTACT.whatsapp.display} sur WhatsApp`,
    icon: (
      <svg {...iconProps}>
        <path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.4A8.6 8.6 0 0 1 8 19l-4.5 1L5 15.7A8.4 8.4 0 1 1 21 11.5Z" />
      </svg>
    ),
  },
]

const TrustBand = () => {
  return (
    <div className="w-full bg-gm-ivoire-2 border-b border-gm-border">
      <div className="content-container grid grid-cols-1 small:grid-cols-3 gap-5 py-6">
        {items.map((item) => (
          <div key={item.title} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-gm-violet">{item.icon}</span>
            <div>
              <strong className="block text-sm font-semibold text-gm-ink">
                {item.title}
              </strong>
              <span className="text-[13px] text-gm-ink-muted">
                {item.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TrustBand
