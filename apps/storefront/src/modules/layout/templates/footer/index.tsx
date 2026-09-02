import Image from "next/image"

import { BRAND_TAGLINE, CONTACT } from "@lib/contact"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Footer conforme à la maquette ("Golden Market · Panier" / "Mon compte",
// artifacts claude.ai) : marque + tagline, puis colonnes Boutique / Aide /
// Contact avec les vrais numéros, et une barre inférieure copyright + liens
// légaux. "Paiement Orange Money" reste sans page dédiée, pointe vers les
// CGV qui décrivent réellement le paiement - "Livraison et retours" pointe
// désormais vers la FAQ (palier 3 du backlog 2026-09-02, item #6).
const SHOP_LINKS = [
  { label: "Toutes les catégories", href: "/store" },
  { label: "Promotions", href: "/store" },
  { label: "Nouveautés", href: "/store" },
]

const HELP_LINKS = [
  { label: "Suivre ma commande", href: "/account/orders" },
  { label: "Questions fréquentes", href: "/faq" },
  { label: "Paiement Orange Money", href: "/conditions-generales" },
  { label: "Livraison et retours", href: "/faq" },
]

export default function Footer() {
  return (
    <footer className="w-full bg-gm-violet text-gm-on-violet-muted">
      <div className="content-container flex flex-col w-full">
        <div className="grid grid-cols-1 gap-9 py-14 small:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <LocalizedClientLink href="/" className="inline-block mb-3.5">
              <Image
                src="/logo/logo-mark-white.png"
                alt="Golden Market"
                width={44}
                height={44}
                className="h-11 w-auto"
              />
            </LocalizedClientLink>
            <p className="text-sm leading-relaxed max-w-[32ch]">
              {BRAND_TAGLINE}
            </p>
          </div>

          <div className="flex flex-col gap-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wide text-gm-on-violet">
              Boutique
            </span>
            <ul className="flex flex-col gap-2.5 text-sm">
              {SHOP_LINKS.map((link) => (
                <li key={link.label}>
                  <LocalizedClientLink
                    href={link.href}
                    className="hover:text-gm-on-violet transition-colors"
                  >
                    {link.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wide text-gm-on-violet">
              Aide
            </span>
            <ul className="flex flex-col gap-2.5 text-sm">
              {HELP_LINKS.map((link) => (
                <li key={link.label}>
                  <LocalizedClientLink
                    href={link.href}
                    className="hover:text-gm-on-violet transition-colors"
                  >
                    {link.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wide text-gm-on-violet">
              Contact
            </span>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <a
                  href={CONTACT.whatsapp.href}
                  className="hover:text-gm-on-violet transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp : {CONTACT.whatsapp.display}
                </a>
              </li>
              <li>
                <a
                  href={CONTACT.phone.href}
                  className="hover:text-gm-on-violet transition-colors"
                >
                  Téléphone : {CONTACT.phone.display}
                </a>
              </li>
              <li>
                <a
                  href={CONTACT.email.href}
                  className="hover:text-gm-on-violet transition-colors"
                >
                  {CONTACT.email.display}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-gm-on-violet/15 py-[18px] text-xs small:flex-row small:justify-between">
          <span>
            © {new Date().getFullYear()} Golden Market · Burkina Faso
          </span>
          <span className="flex gap-x-4">
            <LocalizedClientLink
              href="/conditions-generales"
              className="hover:text-gm-on-violet transition-colors"
              data-testid="footer-terms-link"
            >
              Conditions générales de vente
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/politique-de-confidentialite"
              className="hover:text-gm-on-violet transition-colors"
              data-testid="footer-privacy-policy-link"
            >
              Politique de confidentialité
            </LocalizedClientLink>
          </span>
        </div>
      </div>
    </footer>
  )
}
