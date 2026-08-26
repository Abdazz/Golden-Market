"use client"
import { setAddresses } from "@lib/data/cart"
import useToggleState from "@lib/hooks/use-toggle-state"
import compareAddresses from "@lib/util/compare-addresses"
import { HttpTypes } from "@medusajs/types"
import StepHeader from "@modules/checkout/components/step-header"
import { Heading } from "@modules/common/components/ui"
import Spinner from "@modules/common/icons/spinner"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
import BillingAddress from "../billing_address"
import ErrorMessage from "../error-message"
import ShippingAddress from "../shipping-address"
import { SubmitButton } from "../submit-button"

const Addresses = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "address"

  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true
  )

  const handleEdit = () => {
    router.push(pathname + "?step=address")
  }

  const [message, formAction] = useActionState(setAddresses, null)

  const summary =
    !isOpen && cart?.shipping_address
      ? `${cart.shipping_address.first_name} ${cart.shipping_address.last_name} - ${cart.shipping_address.address_1}, ${cart.shipping_address.city}`
      : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={1}
        title="Adresse"
        status={isOpen ? "active" : cart?.shipping_address ? "completed" : "disabled"}
        summary={summary}
        onEdit={!isOpen && cart?.shipping_address ? handleEdit : undefined}
        editTestId="edit-address-button"
        summaryTestId="shipping-address-summary"
      />
      {isOpen && (
        <form action={formAction} className="mt-6">
          <ShippingAddress
            customer={customer}
            checked={sameAsBilling}
            onChange={toggleSameAsBilling}
            cart={cart}
          />

          {!sameAsBilling && (
            <div>
              <Heading level="h3" className="text-lg pb-4 pt-8">
                Adresse de facturation
              </Heading>

              <BillingAddress cart={cart} />
            </div>
          )}
          <SubmitButton className="mt-6" data-testid="submit-address-button">
            Continuer vers la livraison
          </SubmitButton>
          <ErrorMessage error={message} data-testid="address-error-message" />
        </form>
      )}
      {!isOpen && !cart?.shipping_address && (
        <div className="mt-4">
          <Spinner />
        </div>
      )}
    </div>
  )
}

export default Addresses
