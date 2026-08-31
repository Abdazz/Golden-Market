import { Suspense } from "react"
import Image from "next/image"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Account from "@modules/common/icons/account"
import ShoppingBag from "@modules/common/icons/shopping-bag"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

// Maquette validée (docs/superpowers/specs, artifact "Golden Market · Accueil") :
// nav desktop générique, pas de lien par catégorie - /store porte déjà le
// filtre par catégorie (refinement-list) et /store est déjà la cible de
// "Voir les promotions" ailleurs sur le site (pas de module promotions
// dédié dans ce catalogue).
const DESKTOP_NAV_LINKS = [
  { label: "Accueil", href: "/" },
  { label: "Catégories", href: "/store" },
  { label: "Promotions", href: "/store" },
  { label: "Suivre ma commande", href: "/account/orders" },
]

export default async function Nav() {
  const [regions, locales, currentLocale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
  ])

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto bg-gm-violet text-gm-on-violet shadow-sm">
        <nav className="content-container flex items-center justify-between w-full h-full text-sm">
          <div className="flex items-center gap-x-6 h-full">
            <LocalizedClientLink
              href="/"
              className="flex items-center h-full py-3"
              data-testid="nav-store-link"
            >
              <Image
                src="/logo/logo-mark-white.png"
                alt="Golden Market"
                width={44}
                height={44}
                className="h-[42px] w-auto"
                priority
              />
            </LocalizedClientLink>

            <div className="h-full text-gm-on-violet-muted [&_button]:!text-gm-on-violet-muted [&_button:hover]:!text-gm-on-violet">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
            </div>

            {/* Navigation desktop : masquée en dessous de `small`, remplacée
                par le panneau "Menu" de SideMenu sur mobile. */}
            <ul className="hidden small:flex items-center gap-x-7 h-full">
              {DESKTOP_NAV_LINKS.map((link) => (
                <li key={link.label} className="h-full flex items-center">
                  <LocalizedClientLink
                    href={link.href}
                    className="text-gm-on-violet-muted hover:text-gm-on-violet transition-colors"
                    data-testid="nav-desktop-link"
                  >
                    {link.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-x-3.5 h-full">
            <LocalizedClientLink
              href="/account"
              data-testid="nav-account-link"
              aria-label="Mon compte"
              className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-full bg-gm-on-violet/10 border border-gm-on-violet/20 text-gm-on-violet hover:bg-gm-on-violet/20 transition-colors"
            >
              <Account size="18" />
            </LocalizedClientLink>
            <Suspense
              fallback={
                <LocalizedClientLink
                  href="/cart"
                  data-testid="nav-cart-link"
                  aria-label="Panier"
                  className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-full bg-gm-on-violet/10 border border-gm-on-violet/20 text-gm-on-violet hover:bg-gm-on-violet/20 transition-colors"
                >
                  <ShoppingBag size="18" />
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
