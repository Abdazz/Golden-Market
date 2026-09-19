"use client"

import {
  isCashOnDelivery,
  isMoovMoney,
  isOrangeMoney,
  paymentInfoMap,
} from "@lib/constants"
import { convertToLocale } from "@lib/util/money"
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

  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession) => paymentSession.status === "pending"
  )

  // Même logique que components/payment (résumé du step 3), rejouée ici à
  // partir du seul cart (pas de state client type cardBrand) - un résumé
  // générique par fournisseur suffit à ce stade de relecture finale.
  const paymentSummary = activeSession
    ? [
        paymentInfoMap[activeSession.provider_id]?.title || activeSession.provider_id,
        (isOrangeMoney(activeSession.provider_id) || isMoovMoney(activeSession.provider_id)) &&
        activeSession.data?.phone_number
          ? String(activeSession.data.phone_number)
          : isCashOnDelivery(activeSession.provider_id)
            ? "à la livraison"
            : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : paidByGiftcard
      ? "Carte cadeau"
      : undefined

  const shippingMethod = cart.shipping_methods?.at(-1)

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader step={4} title="Récapitulatif" status={isOpen ? "active" : "disabled"} />
      {isOpen && previousStepsCompleted && (
        <div className="mt-6">
          <div className="flex flex-col gap-y-3 text-sm mb-6">
            <div className="flex items-start justify-between gap-4">
              <span className="text-gm-ink-muted shrink-0">Adresse de livraison</span>
              <span className="text-gm-ink text-right font-medium">
                {cart.shipping_address?.first_name} {cart.shipping_address?.last_name}
                <br />
                {cart.shipping_address?.address_1}, {cart.shipping_address?.city}
              </span>
            </div>
            {shippingMethod && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gm-ink-muted">Mode de livraison</span>
                <span className="text-gm-ink font-medium">
                  {shippingMethod.name} ·{" "}
                  {convertToLocale({
                    amount: shippingMethod.amount ?? 0,
                    currency_code: cart.currency_code,
                  })}
                </span>
              </div>
            )}
            {paymentSummary && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gm-ink-muted">Moyen de paiement</span>
                <span className="text-gm-ink font-medium">{paymentSummary}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-gm-border">
              <span className="text-gm-ink font-semibold">Total à payer</span>
              <span className="text-gm-ink font-semibold">
                {convertToLocale({ amount: cart.total ?? 0, currency_code: cart.currency_code })}
              </span>
            </div>
          </div>
          <p className="text-xs text-gm-ink-muted mb-6">
            En cliquant sur Passer la commande, vous confirmez avoir lu et accepté nos conditions
            d&apos;utilisation, conditions de vente et notre politique de retour, et avoir pris
            connaissance de notre politique de confidentialité.
          </p>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </div>
      )}
    </div>
  )
}

export default Review
