"use client"

import { Button, Heading } from "@modules/common/components/ui"

import CartTotals from "@modules/common/components/cart-totals"
import DiscountCode from "@modules/checkout/components/discount-code"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

type SummaryProps = {
  cart: HttpTypes.StoreCart
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart }: SummaryProps) => {
  const step = getCheckoutStep(cart)

  return (
    <div className="flex flex-col gap-y-6 rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <Heading level="h2" className="text-xl">
        Récapitulatif
      </Heading>
      <DiscountCode cart={cart} />
      <CartTotals totals={cart} shippingCalculatedLater />
      <LocalizedClientLink href={"/checkout?step=" + step} data-testid="checkout-button">
        <Button className="w-full" size="large">
          Passer la commande
        </Button>
      </LocalizedClientLink>
      <LocalizedClientLink
        href="/store"
        className="text-center text-sm font-semibold text-gm-amethyst hover:underline"
      >
        Continuer mes achats
      </LocalizedClientLink>
    </div>
  )
}

export default Summary
