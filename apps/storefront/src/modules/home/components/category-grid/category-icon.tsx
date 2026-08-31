import React from "react"

// Icônes ligne des rayons de l'accueil, style identique à la maquette
// ("Golden Market · Accueil" : cercle violet, glyphe or, trait 2px). Clé =
// handle réel des 6 catégories Golden Market ; repli générique sinon.
const PATHS: Record<string, React.ReactNode> = {
  "électronique-et-gadgets": (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M10 18h4" />
    </>
  ),
  "maison-et-cuisine": (
    <>
      <path d="M3 10 12 3l9 7" />
      <path d="M5 9v11h14V9" />
    </>
  ),
  "beauté-et-bien-être": (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  "mode-et-bagagerie": (
    <>
      <path d="M5 8h14l1 12H4z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  "jouets-et-enfants": (
    <>
      <path d="M12 3a6 6 0 0 1 6 6c0 4.2-3.1 7-6 7s-6-2.8-6-7a6 6 0 0 1 6-6Z" />
      <path d="M12 16v3l-1.5 2h3L12 19" />
    </>
  ),
  "équipement-commercial-et-boucherie": (
    <>
      <path d="M3.5 9 5 4h14l1.5 5" />
      <path d="M4 9v11h16V9" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
}

const FALLBACK = (
  <>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </>
)

const CategoryIcon: React.FC<{ handle: string; className?: string }> = ({
  handle,
  className,
}) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {PATHS[handle] ?? FALLBACK}
  </svg>
)

export default CategoryIcon
