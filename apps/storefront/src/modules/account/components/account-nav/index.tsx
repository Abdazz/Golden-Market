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
              <AccountNavLink
                href="/account"
                route={route!}
                icon={<NavIcon paths={NAV_ICONS.overview} />}
                data-testid="overview-link"
              >
                Vue d&apos;ensemble
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink
                href="/account/orders"
                route={route!}
                icon={<NavIcon paths={NAV_ICONS.orders} />}
                data-testid="orders-link"
              >
                Commandes
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink
                href="/account/addresses"
                route={route!}
                icon={<NavIcon paths={NAV_ICONS.addresses} />}
                data-testid="addresses-link"
              >
                Adresses
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink
                href="/account/profile"
                route={route!}
                icon={<NavIcon paths={NAV_ICONS.profile} />}
                data-testid="profile-link"
              >
                Profil
              </AccountNavLink>
            </li>
            <li className="mt-2 pt-2 border-t border-gm-border">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gm-terracotta hover:bg-gm-ivoire-2 transition-colors"
                data-testid="logout-button"
              >
                <NavIcon paths={NAV_ICONS.logout} />
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
  icon?: React.ReactNode
  children: React.ReactNode
  "data-testid"?: string
}

const AccountNavLink = ({
  href,
  route,
  icon,
  children,
  "data-testid": dataTestId,
}: AccountNavLinkProps) => {
  const { countryCode }: { countryCode: string } = useParams()

  const active = route.split(countryCode)[1] === href
  return (
    <LocalizedClientLink
      href={href}
      className={clx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-gm-violet text-gm-on-violet font-semibold"
          : "text-gm-ink-muted hover:bg-gm-ivoire-2 hover:text-gm-ink"
      )}
      data-testid={dataTestId}
    >
      {icon}
      {children}
    </LocalizedClientLink>
  )
}

// Icônes de la nav latérale du compte (maquette "Golden Market · Mon
// compte"), trait 2px, 16px.
const NAV_ICONS = {
  overview: [
    "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  ],
  orders: ["M3 7h11v9H3zM14 10h4l3 3v3h-7z", "M7 20a1.4 1.4 0 100-2.8", "M17 20a1.4 1.4 0 100-2.8"],
  addresses: ["M12 21s-7-5.2-7-11a7 7 0 0114 0c0 5.8-7 11-7 11z", "M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"],
  profile: ["M12 12a4 4 0 100-8 4 4 0 000 8z", "M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"],
  logout: ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"],
}

const NavIcon = ({ paths }: { paths: string[] }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
    aria-hidden="true"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
)

export default AccountNav
