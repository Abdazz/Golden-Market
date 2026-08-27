"use client"

import { convertToLocale } from "@lib/util/money"
import React from "react"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    tax_total?: number | null
    currency_code: string
    item_subtotal?: number | null
    shipping_subtotal?: number | null
    discount_subtotal?: number | null
  }
  shippingCalculatedLater?: boolean
}

const CartTotals: React.FC<CartTotalsProps> = ({ totals, shippingCalculatedLater = false }) => {
  const { currency_code, total, tax_total, item_subtotal, shipping_subtotal, discount_subtotal } =
    totals

  return (
    <div className="flex flex-col gap-y-2 text-sm text-gm-ink-muted">
      <div className="flex items-center justify-between">
        <span>Sous-total (hors livraison et taxes)</span>
        <span className="text-gm-ink font-medium" data-testid="cart-subtotal" data-value={item_subtotal || 0}>
          {convertToLocale({ amount: item_subtotal ?? 0, currency_code })}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span>Livraison</span>
        {shippingCalculatedLater ? (
          <span
            className="italic text-right"
            data-testid="cart-shipping"
            data-value={shipping_subtotal || 0}
          >
            Calculée à l&apos;étape suivante
          </span>
        ) : (
          <span
            className="text-gm-ink font-medium"
            data-testid="cart-shipping"
            data-value={shipping_subtotal || 0}
          >
            {convertToLocale({ amount: shipping_subtotal ?? 0, currency_code })}
          </span>
        )}
      </div>
      {!!discount_subtotal && (
        <div className="flex items-center justify-between">
          <span>Réduction</span>
          <span
            className="text-gm-terracotta font-medium"
            data-testid="cart-discount"
            data-value={discount_subtotal || 0}
          >
            - {convertToLocale({ amount: discount_subtotal ?? 0, currency_code })}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span>Taxes</span>
        <span className="text-gm-ink font-medium" data-testid="cart-taxes" data-value={tax_total || 0}>
          {convertToLocale({ amount: tax_total ?? 0, currency_code })}
        </span>
      </div>
      <div className="h-px w-full bg-gm-border my-2" />
      <div className="flex items-center justify-between text-gm-ink">
        <span className="font-semibold">Total</span>
        <span className="font-display font-bold text-lg" data-testid="cart-total" data-value={total || 0}>
          {convertToLocale({ amount: total ?? 0, currency_code })}
        </span>
      </div>
    </div>
  )
}

export default CartTotals
