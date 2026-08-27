import { Suspense } from "react"
import Image from "next/image"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

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
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full text-gm-on-violet-muted [&_button]:!text-gm-on-violet-muted [&_button:hover]:!text-gm-on-violet">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="flex items-center h-full py-3"
              data-testid="nav-store-link"
            >
              <Image
                src="/logo/logo-white.png"
                alt="Golden Market"
                width={140}
                height={44}
                className="h-9 w-auto"
                priority
              />
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <div className="hidden small:flex items-center gap-x-6 h-full">
              <LocalizedClientLink
                className="text-gm-on-violet-muted hover:text-gm-on-violet transition-colors"
                href="/account"
                data-testid="nav-account-link"
              >
                Mon compte
              </LocalizedClientLink>
            </div>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="text-gm-on-violet-muted hover:text-gm-on-violet flex gap-2 transition-colors"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  Panier (0)
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
