import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "Espace livreur - Golden Market",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 }

// Pas d'en-tête ni de pied de page : l'espace livreur est une page d'outil.
export default function LivreurLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh w-full bg-gm-ivoire text-gm-ink">
      {/* Le bouton WhatsApp du layout racine masquerait les boutons d'action. */}
      <style>{`a[aria-label="Discuter sur WhatsApp"]{display:none!important}`}</style>
      {children}
    </div>
  )
}
