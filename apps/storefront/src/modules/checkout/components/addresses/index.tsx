"use client"
import { setAddresses } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import StepHeader from "@modules/checkout/components/step-header"
import Spinner from "@modules/common/icons/spinner"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
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

  const step = searchParams.get("step")
  // Une adresse n'est "renseignée" que si les champs clés sont réellement
  // remplis - Medusa attache un objet shipping_address vide au panier, qui
  // sinon faisait passer l'étape en "terminée" avec un résumé "null null".
  const addressComplete = !!(
    cart?.shipping_address?.first_name &&
    cart?.shipping_address?.address_1 &&
    cart?.shipping_address?.city
  )
  const isOpen =
    step === "address" || (step === null && !addressComplete)

  const handleEdit = () => {
    router.push(pathname + "?step=address")
  }

  const [message, formAction] = useActionState(setAddresses, null)

  const summary =
    !isOpen && addressComplete
      ? [
          `${cart!.shipping_address!.first_name} ${cart!.shipping_address!.last_name}`.trim(),
          cart!.shipping_address!.address_1,
          cart!.shipping_address!.city,
          cart!.shipping_address!.phone,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={1}
        title="Adresse de livraison"
        status={isOpen ? "active" : addressComplete ? "completed" : "disabled"}
        summary={summary}
        onEdit={!isOpen && addressComplete ? handleEdit : undefined}
        editTestId="edit-address-button"
        summaryTestId="shipping-address-summary"
      />
      {isOpen && (
        <form action={formAction} className="mt-6">
          <ShippingAddress customer={customer} cart={cart} />

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
