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

  return (
    <div className="flex flex-col gap-y-8" data-testid="overview-page-wrapper">
      <div className="rounded-2xl bg-gm-violet p-6 small:p-8 flex flex-col small:flex-row small:items-center small:justify-between gap-4">
        <div>
          <Heading level="h2" className="text-gm-on-violet text-2xl">
            Bonjour {customer?.first_name}
          </Heading>
          <p
            className="text-gm-on-violet-muted text-sm mt-1"
            data-testid="customer-email"
            data-value={customer?.email}
          >
            Connecté en tant que {customer?.email}
          </p>
        </div>
        <LocalizedClientLink
          href="/account/profile"
          className="shrink-0 text-sm font-semibold text-gm-on-violet border border-white/40 rounded-full px-4 py-2 hover:bg-white/10 transition-colors"
        >
          Voir mon profil
        </LocalizedClientLink>
      </div>

      <div>
        <Heading level="h3" className="text-lg mb-4">
          Commandes récentes
        </Heading>
        <ul className="flex flex-col gap-y-4" data-testid="orders-wrapper">
          {orders && orders.length > 0 ? (
            orders.slice(0, 5).map((order) => (
              <li key={order.id} data-testid="order-wrapper" data-value={order.id}>
                <OrderCard order={order} />
              </li>
            ))
          ) : (
            <li>
              <p className="text-sm text-gm-ink-muted" data-testid="no-orders-message">
                Aucune commande pour le moment.
              </p>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-gm-border bg-white p-5 flex items-center justify-between gap-4">
        <div>
          <Heading level="h3" className="text-base">
            Adresse par défaut
          </Heading>
          {defaultAddress ? (
            <p className="text-sm text-gm-ink-muted mt-1">
              {defaultAddress.address_1}, {defaultAddress.city}
            </p>
          ) : (
            <p className="text-sm text-gm-ink-muted mt-1">Aucune adresse enregistrée.</p>
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
