"use client"

import StepHeader from "@modules/checkout/components/step-header"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 &&
    cart?.total === 0
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader step={4} title="Récapitulatif" status={isOpen ? "active" : "disabled"} />
      {isOpen && previousStepsCompleted && (
        <div className="mt-6">
          <p className="text-sm text-gm-ink-muted mb-6">
            En cliquant sur le bouton Passer la commande, vous confirmez avoir lu et accepté nos
            conditions d&apos;utilisation, conditions de vente et notre politique de retour, et
            avoir pris connaissance de notre politique de confidentialité.
          </p>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </div>
      )}
    </div>
  )
}

export default Review
