"use client"

import { ArrowRightOnRectangle } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { useParams, usePathname } from "next/navigation"

import { signout } from "@lib/data/customer"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import MapPin from "@modules/common/icons/map-pin"
import Package from "@modules/common/icons/package"
import User from "@modules/common/icons/user"

const AccountNav = ({
  customer,
}: {
  customer: HttpTypes.StoreCustomer | null
}) => {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => {
    await signout(countryCode)
  }

  return (
    <div>
      <div className="small:hidden" data-testid="mobile-account-nav">
        {route !== `/${countryCode}/account` ? (
          <LocalizedClientLink
            href="/account"
            className="flex items-center gap-x-2 text-sm font-semibold text-gm-ink py-2"
            data-testid="account-main-link"
          >
            <ChevronDown className="transform rotate-90" />
            <span>Compte</span>
          </LocalizedClientLink>
        ) : (
          <>
            <div className="text-sm text-gm-ink">
              <ul>
                <li>
                  <LocalizedClientLink
                    href="/account/orders"
                    className="flex items-center justify-between py-4 border-b border-gm-border px-1"
                    data-testid="orders-link"
                  >
                    <div className="flex items-center gap-x-2 text-gm-ink-muted">
                      <Package size={20} />
                      <span className="text-gm-ink">Commandes</span>
                    </div>
                    <ChevronDown className="transform -rotate-90 text-gm-ink-muted" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/addresses"
                    className="flex items-center justify-between py-4 border-b border-gm-border px-1"
                    data-testid="addresses-link"
                  >
                    <div className="flex items-center gap-x-2 text-gm-ink-muted">
                      <MapPin size={20} />
                      <span className="text-gm-ink">Adresses</span>
                    </div>
                    <ChevronDown className="transform -rotate-90 text-gm-ink-muted" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/profile"
                    className="flex items-center justify-between py-4 border-b border-gm-border px-1"
                    data-testid="profile-link"
                  >
                    <div className="flex items-center gap-x-2 text-gm-ink-muted">
                      <User size={20} />
                      <span className="text-gm-ink">Profil</span>
                    </div>
                    <ChevronDown className="transform -rotate-90 text-gm-ink-muted" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <button
                    type="button"
                    className="flex items-center justify-between py-4 w-full"
                    onClick={handleLogout}
                    data-testid="logout-button"
                  >
                    <div className="flex items-center gap-x-2 text-gm-terracotta font-semibold">
                      <ArrowRightOnRectangle />
                      <span>Déconnexion</span>
                    </div>
                  </button>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
      <div className="hidden small:block" data-testid="account-nav">
        <div className="rounded-2xl border border-gm-border bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gm-ink-muted px-3 pb-3">
            Mon compte
          </h3>
          <ul className="flex flex-col gap-y-1">
            <li>
              <AccountNavLink href="/account" route={route!} data-testid="overview-link">
                Vue d&apos;ensemble
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink href="/account/orders" route={route!} data-testid="orders-link">
                Commandes
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink href="/account/addresses" route={route!} data-testid="addresses-link">
                Adresses
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink href="/account/profile" route={route!} data-testid="profile-link">
                Profil
              </AccountNavLink>
            </li>
            <li className="mt-2 pt-2 border-t border-gm-border">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold text-gm-terracotta hover:bg-gm-ivoire-2 transition-colors"
                data-testid="logout-button"
              >
                Déconnexion
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

type AccountNavLinkProps = {
  href: string
  route: string
  children: React.ReactNode
  "data-testid"?: string
}

const AccountNavLink = ({
  href,
  route,
  children,
  "data-testid": dataTestId,
}: AccountNavLinkProps) => {
  const { countryCode }: { countryCode: string } = useParams()

  const active = route.split(countryCode)[1] === href
  return (
    <LocalizedClientLink
      href={href}
      className={clx(
        "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-gm-ivoire-2 text-gm-violet font-semibold"
          : "text-gm-ink-muted hover:bg-gm-ivoire-2 hover:text-gm-ink"
      )}
      data-testid={dataTestId}
    >
      {children}
    </LocalizedClientLink>
  )
}

export default AccountNav
