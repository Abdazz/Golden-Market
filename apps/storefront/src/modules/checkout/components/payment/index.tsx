"use client"
import { RadioGroup } from "@headlessui/react"
import { isOrangeMoney, isStripeLike, paymentInfoMap } from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer, { StripeCardContainer } from "@modules/checkout/components/payment-container"
import StepHeader from "@modules/checkout/components/step-header"
import { Button, Heading } from "@modules/common/components/ui"
import { HttpTypes } from "@medusajs/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: HttpTypes.StoreCart
  availablePaymentMethods: { id: string }[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardBrand, setCardBrand] = useState<string | null>(null)
  const [cardComplete, setCardComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(activeSession?.provider_id ?? "")

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  const setPaymentMethod = async (method: string) => {
    setError(null)
    setSelectedPaymentMethod(method)
    if (isStripeLike(method) || isOrangeMoney(method)) {
      await initiatePaymentSession(cart, {
        provider_id: method,
      })
    }
  }

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 &&
    cart?.total === 0
  )

  const paymentReady = (activeSession && (cart?.shipping_methods?.length ?? 0) !== 0) || paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), { scroll: false })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const shouldInputCard = isStripeLike(selectedPaymentMethod) && !activeSession

      const checkActiveSession = activeSession?.provider_id === selectedPaymentMethod

      if (!checkActiveSession) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
      }

      if (!shouldInputCard) {
        return router.push(pathname + "?" + createQueryString("step", "review"), {
          scroll: false,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  const summary =
    !isOpen && paymentReady && activeSession
      ? `${paymentInfoMap[activeSession.provider_id]?.title || activeSession.provider_id} - ${
          isOrangeMoney(selectedPaymentMethod)
            ? String(activeSession?.data?.phone_number ?? "Orange Money")
            : isStripeLike(selectedPaymentMethod) && cardBrand
              ? cardBrand
              : "Détails à l'étape suivante"
        }`
      : !isOpen && paidByGiftcard
        ? "Carte cadeau"
        : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={3}
        title="Paiement"
        status={isOpen ? "active" : paymentReady ? "completed" : "disabled"}
        summary={summary}
        onEdit={!isOpen && paymentReady ? handleEdit : undefined}
        editTestId="edit-payment-button"
      />
      {isOpen && (
        <div className="mt-6">
          {!paidByGiftcard && availablePaymentMethods?.length && (
            <RadioGroup value={selectedPaymentMethod} onChange={(value: string) => setPaymentMethod(value)}>
              {availablePaymentMethods.map((paymentMethod) => (
                <div key={paymentMethod.id}>
                  {isStripeLike(paymentMethod.id) ? (
                    <StripeCardContainer
                      paymentProviderId={paymentMethod.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                      paymentInfoMap={paymentInfoMap}
                      setCardBrand={setCardBrand}
                      setError={setError}
                      setCardComplete={setCardComplete}
                    />
                  ) : (
                    <PaymentContainer
                      paymentInfoMap={paymentInfoMap}
                      paymentProviderId={paymentMethod.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                    />
                  )}
                </div>
              ))}
            </RadioGroup>
          )}

          {paidByGiftcard && (
            <p className="text-sm text-gm-ink-muted">Méthode de paiement : carte cadeau</p>
          )}

          {isOrangeMoney(selectedPaymentMethod) && activeSession && (
            <div
              className="mt-4 rounded-xl border-l-4 border-gm-violet bg-gm-ivoire-2 p-4 small:p-5"
              data-testid="orange-money-instructions"
            >
              <Heading level="h3" className="text-base mb-3">
                Instructions de paiement Orange Money
              </Heading>
              <div className="flex flex-col gap-1.5 text-sm text-gm-ink">
                <p>
                  Envoyez le montant total au numéro{" "}
                  <span className="font-semibold">{String(activeSession.data?.phone_number ?? "")}</span>,
                  titulaire{" "}
                  <span className="font-semibold">
                    {String(activeSession.data?.account_name ?? "Golden Market")}
                  </span>
                </p>
                <p>
                  Montant à envoyer :{" "}
                  <span className="font-display font-bold text-base text-gm-violet">
                    {convertToLocale({
                      amount: cart.total ?? 0,
                      currency_code: cart.currency_code ?? "XOF",
                    })}
                  </span>
                </p>
                <p className="text-gm-ink-muted">{String(activeSession.data?.note ?? "")}</p>
              </div>
            </div>
          )}

          <ErrorMessage error={error} data-testid="payment-method-error-message" />

          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              (isStripeLike(selectedPaymentMethod) && !cardComplete) ||
              (!selectedPaymentMethod && !paidByGiftcard)
            }
            data-testid="submit-payment-button"
          >
            {!activeSession && isStripeLike(selectedPaymentMethod)
              ? "Saisir les détails de la carte"
              : "Continuer vers le récapitulatif"}
          </Button>
        </div>
      )}
    </div>
  )
}

export default Payment
