import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"

// La maquette "Golden Market · Paiement" présente le paiement comme une
// page normale du site (en-tête violet + fil d'Ariane + pied de page
// complet), pas avec un en-tête de tunnel réduit.
export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="w-full bg-gm-ivoire">
      <Nav />
      <div className="relative" data-testid="checkout-container">
        {children}
      </div>
      <Footer />
    </div>
  )
}
