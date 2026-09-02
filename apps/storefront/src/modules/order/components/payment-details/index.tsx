import { Container, Heading, Text } from "@modules/common/components/ui"

import {
  isCashOnDelivery,
  isMoovMoney,
  isOrangeMoney,
  isStripeLike,
  paymentInfoMap,
} from "@lib/constants"
import Divider from "@modules/common/components/divider"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

// Un seul et même provider "mobile money manuel" côté affichage : Orange
// Money et Moov Money partagent exactement la même mécanique (numéro,
// titulaire, note) - seul le titre change.
const isMobileMoneyManual = (providerId?: string) =>
  isOrangeMoney(providerId) || isMoovMoney(providerId)

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const payment = order.payment_collections?.[0].payments?.[0]

  return (
    <div>
      <Heading level="h2" className="flex flex-row text-3xl-regular my-6">
        Paiement
      </Heading>
      <div>
        {payment && (
          <div className="flex items-start gap-x-1 w-full">
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Moyen de paiement
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method"
              >
                {paymentInfoMap[payment.provider_id].title}
              </Text>
            </div>
            <div className="flex flex-col w-2/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Détails du paiement
              </Text>
              <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                  {paymentInfoMap[payment.provider_id].icon}
                </Container>
                <Text data-testid="payment-amount">
                  {isStripeLike(payment.provider_id) && payment.data?.card_last4
                    ? `**** **** **** ${payment.data.card_last4}`
                    : isMobileMoneyManual(payment.provider_id)
                      ? `${convertToLocale({
                          amount: payment.amount,
                          currency_code: order.currency_code,
                        })} en attente de confirmation`
                      : isCashOnDelivery(payment.provider_id)
                        ? `${convertToLocale({
                            amount: payment.amount,
                            currency_code: order.currency_code,
                          })} à régler à la livraison`
                        : `${convertToLocale({
                            amount: payment.amount,
                            currency_code: order.currency_code,
                          })} payé le ${new Date(
                            payment.created_at ?? ""
                          ).toLocaleString("fr-FR")}`}
                </Text>
              </div>
            </div>
          </div>
        )}

        {payment && isMobileMoneyManual(payment.provider_id) && (
          <div
            className="mt-4 rounded-lg border border-brand-primary p-4 bg-brand-secondary"
            data-testid="mobile-money-instructions"
          >
            <Text className="txt-medium-plus text-ui-fg-base mb-2">
              Paiement par {isOrangeMoney(payment.provider_id) ? "Orange Money" : "Moov Money"}
            </Text>
            <Text className="mb-2">
              Envoyez le montant total au numéro{" "}
              <span className="font-semibold">
                {String(payment.data?.phone_number ?? "")}
              </span>
              , titulaire{" "}
              <span className="font-semibold">
                {String(payment.data?.account_name ?? "Golden Market")}
              </span>
            </Text>
            <Text className="text-ui-fg-subtle">
              {String(payment.data?.note ?? "")}
            </Text>
          </div>
        )}

        {payment && isCashOnDelivery(payment.provider_id) && (
          <div
            className="mt-4 rounded-lg border border-brand-primary p-4 bg-brand-secondary"
            data-testid="cash-on-delivery-instructions"
          >
            <Text className="txt-medium-plus text-ui-fg-base mb-2">
              Paiement à la réception
            </Text>
            <Text className="text-ui-fg-subtle">
              {String(
                payment.data?.note ??
                  "Vous payez en espèces directement à la réception de votre colis."
              )}
            </Text>
          </div>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default PaymentDetails
