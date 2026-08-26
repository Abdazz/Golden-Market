import ItemsTemplate from "./items"
import Summary from "./summary"
import EmptyCartMessage from "../components/empty-cart-message"
import SignInPrompt from "../components/sign-in-prompt"
import { HttpTypes } from "@medusajs/types"

const CartTemplate = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  return (
    <div className="py-8 small:py-12">
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 small:grid-cols-[1fr_380px] gap-8 small:gap-10 items-start">
            <div className="flex flex-col gap-y-6">
              {!customer && <SignInPrompt />}
              <ItemsTemplate cart={cart} />
            </div>
            <div className="small:sticky small:top-8">
              {cart && cart.region && <Summary cart={cart} />}
            </div>
          </div>
        ) : (
          <EmptyCartMessage />
        )}
      </div>
    </div>
  )
}

export default CartTemplate
