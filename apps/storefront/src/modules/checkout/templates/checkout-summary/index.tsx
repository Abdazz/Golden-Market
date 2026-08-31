import { Heading } from "@modules/common/components/ui"

import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import CartTotals from "@modules/common/components/cart-totals"
import { HttpTypes } from "@medusajs/types"

const CheckoutSummary = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  return (
    <div className="small:sticky small:top-8 h-fit rounded-2xl border border-gm-border bg-white p-5 small:p-6 flex flex-col gap-y-6">
      <Heading level="h2" className="text-xl">
        Votre commande
      </Heading>
      <ItemsPreviewTemplate cart={cart} />
      <CartTotals totals={cart} />
    </div>
  )
}

export default CheckoutSummary
