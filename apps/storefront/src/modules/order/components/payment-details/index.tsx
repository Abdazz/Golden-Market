import { Container, Heading, Text } from "@modules/common/components/ui"

import { isOrangeMoney, isStripeLike, paymentInfoMap } from "@lib/constants"
import Divider from "@modules/common/components/divider"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const payment = order.payment_collections?.[0].payments?.[0]

  return (
    <div>
      <Heading level="h2" className="flex flex-row text-3xl-regular my-6">
        Payment
      </Heading>
      <div>
        {payment && (
          <div className="flex items-start gap-x-1 w-full">
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
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
                Payment details
              </Text>
              <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                  {paymentInfoMap[payment.provider_id].icon}
                </Container>
                <Text data-testid="payment-amount">
                  {isStripeLike(payment.provider_id) && payment.data?.card_last4
                    ? `**** **** **** ${payment.data.card_last4}`
                    : isOrangeMoney(payment.provider_id)
                      ? `${convertToLocale({
                          amount: payment.amount,
                          currency_code: order.currency_code,
                        })} en attente de confirmation`
                      : `${convertToLocale({
                          amount: payment.amount,
                          currency_code: order.currency_code,
                        })} paid at ${new Date(
                          payment.created_at ?? ""
                        ).toLocaleString()}`}
                </Text>
              </div>
            </div>
          </div>
        )}

        {payment && isOrangeMoney(payment.provider_id) && (
          <div
            className="mt-4 rounded-lg border border-brand-primary p-4 bg-brand-secondary"
            data-testid="orange-money-instructions"
          >
            <Text className="txt-medium-plus text-ui-fg-base mb-2">
              Paiement par Orange Money
            </Text>
            <Text className="mb-2">
              Envoyez le montant total au numéro{" "}
              <span className="font-semibold">
                {String(payment.data?.phone_number ?? "")}
              </span>{" "}
              —{" "}
              <span className="font-semibold">
                {String(payment.data?.account_name ?? "Golden Market")}
              </span>
            </Text>
            <Text className="text-ui-fg-subtle">
              {String(payment.data?.note ?? "")}
            </Text>
          </div>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default PaymentDetails
