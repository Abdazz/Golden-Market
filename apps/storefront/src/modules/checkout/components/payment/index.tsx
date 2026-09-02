"use client"
import { RadioGroup } from "@headlessui/react"
import {
  isCashOnDelivery,
  isMoovMoney,
  isOrangeMoney,
  isStripeLike,
  paymentInfoMap,
} from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer, { StripeCardContainer } from "@modules/checkout/components/payment-container"
import StepHeader from "@modules/checkout/components/step-header"
import { Button, clx, Heading } from "@modules/common/components/ui"
import { HttpTypes } from "@medusajs/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

// Le paiement à la réception n'a de sens que là où Golden Market livre
// lui-même à domicile (Ouagadougou) - ailleurs, le colis passe par un
// transporteur tiers qui ne peut pas encaisser pour le marchand (même
// contrainte que le badge "Livraison gratuite" et la règle de livraison
// gratuite conditionnelle). Comparaison tolérante à la casse et aux espaces
// - le champ Ville reste une saisie libre (suggestions, pas une liste
// fermée), voir checkout/components/shipping-address.
const isOuagadougou = (city?: string | null) =>
  (city ?? "").trim().toLowerCase() === "ouagadougou"

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
    if (isStripeLike(method) || isOrangeMoney(method) || isMoovMoney(method)) {
      await initiatePaymentSession(cart, {
        provider_id: method,
      })
    }
  }

  const filteredPaymentMethods = useMemo(
    () =>
      availablePaymentMethods?.filter(
        (m) => !isCashOnDelivery(m.id) || isOuagadougou(cart.shipping_address?.city)
      ),
    [availablePaymentMethods, cart.shipping_address?.city]
  )

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
          isOrangeMoney(selectedPaymentMethod) || isMoovMoney(selectedPaymentMethod)
            ? String(activeSession?.data?.phone_number ?? paymentInfoMap[activeSession.provider_id]?.title)
            : isCashOnDelivery(selectedPaymentMethod)
              ? "À la livraison"
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
        summaryTestId="payment-method-summary"
      />
      <div className={clx("mt-6", { hidden: !isOpen })}>
        {!paidByGiftcard && filteredPaymentMethods?.length && (
          <RadioGroup value={selectedPaymentMethod} onChange={(value: string) => setPaymentMethod(value)}>
            {filteredPaymentMethods.map((paymentMethod) => (
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
          <p className="text-sm text-gm-ink-muted" data-testid="payment-method-summary">
            Méthode de paiement : carte cadeau
          </p>
        )}

        {(isOrangeMoney(selectedPaymentMethod) || isMoovMoney(selectedPaymentMethod)) &&
          activeSession && (
            <div
              className="mt-4 rounded-xl border-l-4 border-gm-violet bg-gm-ivoire-2 p-4 small:p-5"
              data-testid="mobile-money-instructions"
            >
              <Heading level="h3" className="text-base mb-3">
                Instructions de paiement{" "}
                {isOrangeMoney(selectedPaymentMethod) ? "Orange Money" : "Moov Money"}
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

        {isCashOnDelivery(selectedPaymentMethod) && (
          <div
            className="mt-4 rounded-xl border-l-4 border-gm-gold bg-gm-ivoire-2 p-4 small:p-5"
            data-testid="cash-on-delivery-instructions"
          >
            <Heading level="h3" className="text-base mb-3">
              Paiement à la réception
            </Heading>
            <p className="text-sm text-gm-ink">
              Vous payez en espèces directement au livreur, à la réception de
              votre colis. Montant à préparer :{" "}
              <span className="font-display font-bold text-base text-gm-violet">
                {convertToLocale({
                  amount: cart.total ?? 0,
                  currency_code: cart.currency_code ?? "XOF",
                })}
              </span>
              .
            </p>
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
    </div>
  )
}

export default Payment
