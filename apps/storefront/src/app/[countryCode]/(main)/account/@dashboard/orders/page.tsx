import { Metadata } from "next"

import OrderOverview from "@modules/account/components/order-overview"
import { retrieveCustomer } from "@lib/data/customer"
import { listOrders } from "@lib/data/orders"
import Divider from "@modules/common/components/divider"
import TransferRequestForm from "@modules/account/components/transfer-request-form"

export const metadata: Metadata = {
  title: "Commandes",
  description: "Aperçu de vos commandes précédentes.",
}

export default async function Orders() {
  // Un visiteur non connecté qui atterrit directement sur cette sous-page
  // (ex. le lien "Suivre ma commande" du pied de page) ne doit jamais voir
  // "Page not found" : le layout parent affiche déjà @login dans ce cas,
  // mais Next.js résout d'abord CE composant, et listOrders() échoue
  // silencieusement sans session (pas d'en-tête d'autorisation) - notFound()
  // ne doit donc s'appliquer qu'à un vrai échec de récupération, jamais au
  // simple fait de ne pas être connecté (confirmé en production le
  // 2026-09-19).
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer) {
    return null
  }

  const orders = await listOrders()

  if (!orders) {
    return null
  }

  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Orders</h1>
        <p className="text-base-regular">
          View your previous orders and their status. You can also create
          returns or exchanges for your orders if needed.
        </p>
      </div>
      <div>
        <OrderOverview orders={orders} />
        <Divider className="mb-8 mt-8" />
        <TransferRequestForm />
      </div>
    </div>
  )
}
