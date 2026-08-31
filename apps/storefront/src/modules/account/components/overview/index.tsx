import { Heading } from "@modules/common/components/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderCard from "@modules/account/components/order-card"
import { HttpTypes } from "@medusajs/types"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  orders: HttpTypes.StoreOrder[] | null
}

const Overview = ({ customer, orders }: OverviewProps) => {
  const defaultAddress =
    customer?.addresses?.find((a) => a.is_default_shipping) ??
    customer?.addresses?.find((a) => a.is_default_billing)

  const memberSince = customer?.created_at
    ? new Date(customer.created_at).toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <div className="flex flex-col gap-y-8" data-testid="overview-page-wrapper">
      <div className="rounded-2xl bg-gm-violet p-6 small:p-8 flex flex-col small:flex-row small:items-center small:justify-between gap-4">
        <div>
          <Heading
            level="h1"
            className="text-gm-on-violet text-2xl"
            data-testid="welcome-message"
            data-value={customer?.first_name}
          >
            Bonjour {customer?.first_name}
          </Heading>
          <p
            className="text-gm-on-violet-muted text-[13px] mt-1"
            data-testid="customer-email"
            data-value={customer?.email}
          >
            {memberSince && `Membre depuis ${memberSince} · `}
            {customer?.email}
          </p>
        </div>
        <LocalizedClientLink
          href="/account/profile"
          className="shrink-0 text-sm font-semibold text-gm-on-violet border border-white/40 rounded-full px-5 py-2.5 hover:bg-white/10 transition-colors"
        >
          Modifier mon profil
        </LocalizedClientLink>
      </div>

      <div>
        <span className="block text-xs font-bold uppercase tracking-wide text-gm-ink-muted mb-3.5">
          Commandes récentes
        </span>
        <ul className="flex flex-col gap-y-3" data-testid="orders-wrapper">
          {orders && orders.length > 0 ? (
            orders.slice(0, 5).map((order) => (
              <li
                key={order.id}
                data-testid="order-wrapper"
                data-value={order.id}
              >
                <OrderCard order={order} />
              </li>
            ))
          ) : (
            <li>
              <p
                className="text-sm text-gm-ink-muted"
                data-testid="no-orders-message"
              >
                Aucune commande pour le moment.
              </p>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-dashed border-gm-border p-5 flex flex-col small:flex-row small:items-center justify-between gap-3">
        <div>
          <strong className="block text-sm text-gm-ink">
            Adresse de livraison par défaut
          </strong>
          {defaultAddress ? (
            <span className="block text-[13px] text-gm-ink-muted mt-1">
              {[
                defaultAddress.address_1,
                defaultAddress.city,
                defaultAddress.phone,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : (
            <span className="block text-[13px] text-gm-ink-muted mt-1">
              Aucune adresse enregistrée.
            </span>
          )}
        </div>
        <LocalizedClientLink
          href="/account/addresses"
          className="shrink-0 text-sm font-semibold text-gm-amethyst hover:underline"
        >
          Gérer mes adresses
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default Overview
