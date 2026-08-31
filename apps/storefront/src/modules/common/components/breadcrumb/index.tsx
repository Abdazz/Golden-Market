import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Fil d'Ariane conforme aux maquettes (artifacts claude.ai) : liens gris,
// dernier segment en gras non cliquable, séparateur "/".
export type Crumb = {
  label: string
  href?: string
}

const Breadcrumb = ({ items }: { items: Crumb[] }) => {
  return (
    <nav
      aria-label="Fil d'Ariane"
      className="flex flex-wrap items-center gap-1.5 py-4 text-[13px] text-gm-ink-muted"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <LocalizedClientLink
                href={item.href}
                className="hover:text-gm-violet transition-colors"
              >
                {item.label}
              </LocalizedClientLink>
            ) : (
              <span
                className={isLast ? "font-semibold text-gm-ink" : undefined}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && <span aria-hidden="true">/</span>}
          </span>
        )
      })}
    </nav>
  )
}

export default Breadcrumb
