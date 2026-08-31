"use client"

import { Badge, Heading, Input, Label } from "@modules/common/components/ui"
import React from "react"

import { applyPromotions } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import Trash from "@modules/common/icons/trash"
import ErrorMessage from "../error-message"
import { SubmitButton } from "../submit-button"

type DiscountCodeProps = {
  cart: HttpTypes.StoreCart
}

const DiscountCode: React.FC<DiscountCodeProps> = ({ cart }) => {
  const [isOpen, setIsOpen] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState("")

  const { promotions = [] } = cart
  const removePromotionCode = async (code: string) => {
    const validPromotions = promotions.filter((promotion) => promotion.code !== code)

    await applyPromotions(
      validPromotions.filter((p) => p.code !== undefined).map((p) => p.code!)
    )
  }

  const addPromotionCode = async (formData: FormData) => {
    setErrorMessage("")

    const code = formData.get("code")
    if (!code) {
      return
    }
    const input = document.getElementById("promotion-input") as HTMLInputElement
    const codes = promotions.filter((p) => p.code !== undefined).map((p) => p.code!)
    codes.push(code.toString())

    try {
      await applyPromotions(codes)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }

    if (input) {
      input.value = ""
    }
  }

  return (
    <div className="w-full flex flex-col">
      <form action={(a) => addPromotionCode(a)} className="w-full">
        <Label className="flex gap-x-1 mb-2 items-center">
          <button
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            className="text-sm font-semibold text-gm-amethyst hover:underline"
            data-testid="add-discount-button"
          >
            Ajouter un code promo
          </button>
        </Label>

        {isOpen && (
          <>
            <div className="flex w-full gap-x-2">
              <Input
                className="w-full"
                id="promotion-input"
                name="code"
                type="text"
                autoFocus={false}
                data-testid="discount-input"
                placeholder="Code promo"
              />
              <SubmitButton variant="secondary" data-testid="discount-apply-button">
                Appliquer
              </SubmitButton>
            </div>

            <ErrorMessage error={errorMessage} data-testid="discount-error-message" />
          </>
        )}
      </form>

      {promotions.length > 0 && (
        <div className="w-full mt-4">
          <Heading level="h3" className="text-sm mb-2">
            Codes promo appliqués :
          </Heading>

          {promotions.map((promotion) => {
            return (
              <div
                key={promotion.id}
                className="flex items-center justify-between w-full mb-2"
                data-testid="discount-row"
              >
                <span className="flex items-baseline gap-1 text-sm truncate" data-testid="discount-code">
                  <Badge color={promotion.is_automatic ? "green" : "gold"}>{promotion.code}</Badge>
                  <span className="text-gm-ink-muted">
                    (
                    {promotion.application_method?.value !== undefined &&
                      promotion.application_method.currency_code !== undefined && (
                        <>
                          {promotion.application_method.type === "percentage"
                            ? `${promotion.application_method.value}%`
                            : convertToLocale({
                                amount: +promotion.application_method.value,
                                currency_code: promotion.application_method.currency_code,
                              })}
                        </>
                      )}
                    )
                  </span>
                </span>
                {!promotion.is_automatic && (
                  <button
                    className="flex items-center text-gm-ink-muted hover:text-gm-terracotta"
                    onClick={() => {
                      if (!promotion.code) {
                        return
                      }

                      removePromotionCode(promotion.code)
                    }}
                    data-testid="remove-discount-button"
                  >
                    <Trash size={14} />
                    <span className="sr-only">Retirer le code promo de la commande</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DiscountCode
