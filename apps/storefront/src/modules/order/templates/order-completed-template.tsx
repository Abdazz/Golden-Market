import { Heading } from "@modules/common/components/ui"
import { cookies as nextCookies } from "next/headers"

import Breadcrumb from "@modules/common/components/breadcrumb"
import CartTotals from "@modules/common/components/cart-totals"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderDetails from "@modules/order/components/order-details"
import OrderTracker from "@modules/analytics/components/order-tracker"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default async function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const cookies = await nextCookies()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"

  return (
    <div className="content-container py-6 min-h-[calc(100vh-64px)]">
      <OrderTracker
        order={{
          id: order.id,
          items: (order.items ?? []).map((item) => ({
            id: item.id,
            title: item.product_title ?? item.title,
            unit_price: item.unit_price,
            quantity: item.quantity,
          })),
          total: order.total,
          subtotal: order.subtotal ?? 0,
          shipping_total: order.shipping_total ?? 0,
        }}
      />
      <Breadcrumb
        items={[
          { label: "Accueil", href: "/" },
          { label: "Commande confirmée" },
        ]}
      />
      <div className="flex flex-col justify-center items-center gap-y-10 max-w-4xl mx-auto w-full">
        {isOnboarding && <OnboardingCta orderId={order.id} />}
        <div
          className="flex flex-col gap-4 max-w-4xl w-full rounded-2xl border border-gm-border bg-white py-10 px-6 small:px-10"
          data-testid="order-complete-container"
        >
          <Heading
            level="h1"
            className="flex flex-col gap-y-3 text-gm-ink text-3xl mb-4"
          >
            <span>Merci !</span>
            <span>Votre commande a été enregistrée avec succès.</span>
          </Heading>
          <OrderDetails order={order} />
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            Récapitulatif
          </Heading>
          <Items order={order} />
          <CartTotals totals={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
          <Help />
        </div>
      </div>
    </div>
  )
}
