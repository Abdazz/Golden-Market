"use client"
import { Radio, RadioGroup } from "@headlessui/react"
import { setShippingMethod } from "@lib/data/cart"
import { calculatePriceForShippingOption } from "@lib/data/fulfillment"
import { convertToLocale } from "@lib/util/money"
import { Loader } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import ErrorMessage from "@modules/checkout/components/error-message"
import StepHeader from "@modules/checkout/components/step-header"
import MedusaRadio from "@modules/common/components/radio"
import { Button, clx } from "@modules/common/components/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

const PICKUP_OPTION_ON = "__PICKUP_ON"
const PICKUP_OPTION_OFF = "__PICKUP_OFF"

type ShippingProps = {
  cart: HttpTypes.StoreCart
  availableShippingMethods: HttpTypes.StoreCartShippingOption[] | null
}

function formatAddress(address: HttpTypes.StoreCartAddress) {
  if (!address) {
    return ""
  }

  let ret = ""

  if (address.address_1) {
    ret += ` ${address.address_1}`
  }

  if (address.address_2) {
    ret += `, ${address.address_2}`
  }

  if (address.postal_code) {
    ret += `, ${address.postal_code} ${address.city}`
  }

  if (address.country_code) {
    ret += `, ${address.country_code.toUpperCase()}`
  }

  return ret
}

const Shipping: React.FC<ShippingProps> = ({ cart, availableShippingMethods }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPrices, setIsLoadingPrices] = useState(true)

  const [showPickupOptions, setShowPickupOptions] = useState<string>(PICKUP_OPTION_OFF)
  const [calculatedPricesMap, setCalculatedPricesMap] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id || null
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "delivery"

  const _shippingMethods = availableShippingMethods?.filter(
    (sm) =>
      (
        sm as unknown as {
          service_zone?: {
            fulfillment_set?: { type?: string; location?: { address: HttpTypes.StoreCartAddress } }
          }
        }
      ).service_zone?.fulfillment_set?.type !== "pickup"
  )

  const _pickupMethods = availableShippingMethods?.filter(
    (sm) =>
      (
        sm as unknown as {
          service_zone?: {
            fulfillment_set?: { type?: string; location?: { address: HttpTypes.StoreCartAddress } }
          }
        }
      ).service_zone?.fulfillment_set?.type === "pickup"
  )

  const hasPickupOptions = !!_pickupMethods?.length

  useEffect(() => {
    setIsLoadingPrices(true)

    if (_shippingMethods?.length) {
      const promises = _shippingMethods
        .filter((sm) => sm.price_type === "calculated")
        .map((sm) => calculatePriceForShippingOption(sm.id, cart.id))

      if (promises.length) {
        Promise.allSettled(promises).then((res) => {
          const pricesMap: Record<string, number> = {}
          res
            .filter((r) => r.status === "fulfilled")
            .forEach((p) => {
              if (p.value?.id) {
                pricesMap[p.value.id] = p.value.amount ?? 0
              }
            })

          setCalculatedPricesMap(pricesMap)
          setIsLoadingPrices(false)
        })
      }
    }

    if (_pickupMethods?.find((m) => m.id === shippingMethodId)) {
      setShowPickupOptions(PICKUP_OPTION_ON)
    }
  }, [availableShippingMethods])

  const handleEdit = () => {
    router.push(pathname + "?step=delivery", { scroll: false })
  }

  const handleSubmit = () => {
    router.push(pathname + "?step=payment", { scroll: false })
  }

  const handleSetShippingMethod = async (id: string, variant: "shipping" | "pickup") => {
    setError(null)

    if (variant === "pickup") {
      setShowPickupOptions(PICKUP_OPTION_ON)
    } else {
      setShowPickupOptions(PICKUP_OPTION_OFF)
    }

    let currentId: string | null = null
    setIsLoading(true)
    setShippingMethodId((prev) => {
      currentId = prev
      return id
    })

    await setShippingMethod({ cartId: cart.id, shippingMethodId: id })
      .catch((err) => {
        setShippingMethodId(currentId)

        setError(err.message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  const hasMethod = (cart.shipping_methods?.length ?? 0) > 0

  const summary =
    !isOpen && hasMethod
      ? `${cart.shipping_methods!.at(-1)!.name} - ${convertToLocale({
          amount: cart.shipping_methods!.at(-1)!.amount!,
          currency_code: cart?.currency_code,
        })}`
      : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={2}
        title="Livraison"
        status={isOpen ? "active" : hasMethod ? "completed" : "disabled"}
        summary={summary}
        onEdit={
          !isOpen && cart?.shipping_address && cart?.billing_address && cart?.email
            ? handleEdit
            : undefined
        }
        editTestId="edit-delivery-button"
      />
      {isOpen && (
        <div className="mt-6">
          <div className="flex flex-col gap-1 mb-4">
            <span className="text-sm font-semibold text-gm-ink">Mode de livraison</span>
            <span className="text-sm text-gm-ink-muted">Choisissez comment vous souhaitez être livré</span>
          </div>
          <div data-testid="delivery-options-container">
            {hasPickupOptions && (
              <RadioGroup
                value={showPickupOptions}
                onChange={(_value) => {
                  const id = _pickupMethods.find((option) => !option.insufficient_inventory)?.id

                  if (id) {
                    handleSetShippingMethod(id, "pickup")
                  }
                }}
              >
                <Radio
                  value={PICKUP_OPTION_ON}
                  data-testid="delivery-option-radio"
                  className={clx(
                    "flex items-center justify-between cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
                    {
                      "border-gm-violet bg-gm-ivoire-2": showPickupOptions === PICKUP_OPTION_ON,
                    }
                  )}
                >
                  <div className="flex items-center gap-x-3">
                    <MedusaRadio checked={showPickupOptions === PICKUP_OPTION_ON} />
                    <span className="text-sm text-gm-ink">Retrait en magasin</span>
                  </div>
                </Radio>
              </RadioGroup>
            )}
            <RadioGroup
              value={shippingMethodId}
              onChange={(v) => {
                if (v) {
                  return handleSetShippingMethod(v, "shipping")
                }
              }}
            >
              {_shippingMethods?.map((option) => {
                const isDisabled =
                  option.price_type === "calculated" &&
                  !isLoadingPrices &&
                  typeof calculatedPricesMap[option.id] !== "number"

                return (
                  <Radio
                    key={option.id}
                    value={option.id}
                    data-testid="delivery-option-radio"
                    disabled={isDisabled}
                    className={clx(
                      "flex items-center justify-between cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
                      {
                        "border-gm-violet bg-gm-ivoire-2": option.id === shippingMethodId,
                        "opacity-50 cursor-not-allowed hover:border-gm-border": isDisabled,
                      }
                    )}
                  >
                    <div className="flex items-center gap-x-3">
                      <MedusaRadio checked={option.id === shippingMethodId} />
                      <span className="text-sm text-gm-ink">{option.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gm-ink">
                      {option.price_type === "flat" ? (
                        convertToLocale({ amount: option.amount!, currency_code: cart?.currency_code })
                      ) : calculatedPricesMap[option.id] ? (
                        convertToLocale({
                          amount: calculatedPricesMap[option.id],
                          currency_code: cart?.currency_code,
                        })
                      ) : isLoadingPrices ? (
                        <Loader />
                      ) : (
                        "-"
                      )}
                    </span>
                  </Radio>
                )
              })}
            </RadioGroup>
          </div>

          {showPickupOptions === PICKUP_OPTION_ON && (
            <div className="mt-6">
              <div className="flex flex-col gap-1 mb-4">
                <span className="text-sm font-semibold text-gm-ink">Point de retrait</span>
                <span className="text-sm text-gm-ink-muted">Choisissez un point près de chez vous</span>
              </div>
              <div data-testid="delivery-options-container">
                <RadioGroup
                  value={shippingMethodId}
                  onChange={(v) => {
                    if (v) {
                      return handleSetShippingMethod(v, "pickup")
                    }
                  }}
                >
                  {_pickupMethods?.map((option) => {
                    return (
                      <Radio
                        key={option.id}
                        value={option.id}
                        disabled={option.insufficient_inventory}
                        data-testid="delivery-option-radio"
                        className={clx(
                          "flex items-center justify-between cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
                          {
                            "border-gm-violet bg-gm-ivoire-2": option.id === shippingMethodId,
                            "opacity-50 cursor-not-allowed hover:border-gm-border": option.insufficient_inventory,
                          }
                        )}
                      >
                        <div className="flex items-start gap-x-3">
                          <MedusaRadio checked={option.id === shippingMethodId} />
                          <div className="flex flex-col">
                            <span className="text-sm text-gm-ink">{option.name}</span>
                            <span className="text-xs text-gm-ink-muted">
                              {formatAddress(
                                (
                                  option as unknown as {
                                    service_zone?: {
                                      fulfillment_set?: { location?: { address: HttpTypes.StoreCartAddress } }
                                    }
                                  }
                                ).service_zone?.fulfillment_set?.location?.address as HttpTypes.StoreCartAddress
                              )}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gm-ink">
                          {convertToLocale({ amount: option.amount!, currency_code: cart?.currency_code })}
                        </span>
                      </Radio>
                    )
                  })}
                </RadioGroup>
              </div>
            </div>
          )}

          <ErrorMessage error={error} data-testid="delivery-option-error-message" />
          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={!cart.shipping_methods?.[0]}
            data-testid="submit-delivery-option-button"
          >
            Continuer vers le paiement
          </Button>
        </div>
      )}
    </div>
  )
}

export default Shipping
