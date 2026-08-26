import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import MedusaCTA from "@modules/layout/components/medusa-cta"

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full bg-gm-ivoire relative small:min-h-screen">
      <div className="h-16 bg-white border-b border-gm-border">
        <nav className="flex h-full items-center content-container justify-between">
          <LocalizedClientLink
            href="/cart"
            className="flex items-center gap-x-2 text-sm font-semibold text-gm-ink-muted hover:text-gm-ink transition-colors flex-1 basis-0"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90" size={16} />
            <span className="hidden small:block">Retour au panier</span>
            <span className="block small:hidden">Retour</span>
          </LocalizedClientLink>
          <LocalizedClientLink href="/" className="flex items-center" data-testid="store-link">
            <Image
              src="/logo/logo-color.png"
              alt="Golden Market"
              width={130}
              height={41}
              className="h-8 w-auto"
            />
          </LocalizedClientLink>
          <div className="flex-1 basis-0" />
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">
        {children}
      </div>
      <div className="py-4 w-full flex items-center justify-center">
        <MedusaCTA />
      </div>
    </div>
  )
}
