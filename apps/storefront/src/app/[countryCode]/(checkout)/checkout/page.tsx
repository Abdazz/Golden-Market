import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import Breadcrumb from "@modules/common/components/breadcrumb"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Heading } from "@modules/common/components/ui"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Paiement | Golden Market",
}

export default async function Checkout() {
  const cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  const customer = await retrieveCustomer()

  return (
    <div className="content-container pb-16">
      <Breadcrumb
        items={[
          { label: "Accueil", href: "/" },
          { label: "Panier", href: "/cart" },
          { label: "Paiement" },
        ]}
      />
      <Heading level="h1" className="text-2xl small:text-3xl mb-6">
        Finaliser ma commande
      </Heading>
      <div className="grid grid-cols-1 gap-8 small:grid-cols-[1fr_360px] small:gap-10 small:items-start">
        <PaymentWrapper cart={cart}>
          <CheckoutForm cart={cart} customer={customer} />
        </PaymentWrapper>
        <CheckoutSummary cart={cart} />
      </div>
    </div>
  )
}
