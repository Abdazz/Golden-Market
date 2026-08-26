"use client"

import { updateLineItem } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import CartItemSelect from "@modules/cart/components/cart-item-select"
import ErrorMessage from "@modules/checkout/components/error-message"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LineItemUnitPrice from "@modules/common/components/line-item-unit-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Spinner from "@modules/common/icons/spinner"
import Thumbnail from "@modules/products/components/thumbnail"
import { useState } from "react"

type ItemProps = {
  item: HttpTypes.StoreCartLineItem
  type?: "full" | "preview"
  currencyCode: string
}

const Item = ({ item, type = "full", currencyCode }: ItemProps) => {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changeQuantity = async (quantity: number) => {
    setError(null)
    setUpdating(true)

    await updateLineItem({
      lineId: item.id,
      quantity,
    })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => {
        setUpdating(false)
      })
  }

  // TODO: Update this to grab the actual max inventory
  const maxQtyFromInventory = 10
  const maxQuantity = item.variant?.manage_inventory ? 10 : maxQtyFromInventory

  if (type === "preview") {
    return (
      <div
        className="flex items-center gap-3 py-3 border-b border-gm-border last:border-0"
        data-testid="product-row"
      >
        <LocalizedClientLink href={`/products/${item.product_handle}`} className="shrink-0">
          <Thumbnail
            thumbnail={item.thumbnail}
            images={item.variant?.product?.images}
            size="square"
            className="w-14"
          />
        </LocalizedClientLink>
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-sm font-semibold text-gm-ink line-clamp-1" data-testid="product-title">
            {item.product_title}
          </span>
          <LineItemOptions variant={item.variant} data-testid="product-variant" />
          <span className="flex items-center gap-1 text-xs text-gm-ink-muted mt-0.5">
            {item.quantity} x
            <LineItemUnitPrice item={item} style="tight" currencyCode={currencyCode} />
          </span>
        </div>
        <LineItemPrice item={item} style="tight" currencyCode={currencyCode} />
      </div>
    )
  }

  return (
    <div className="flex gap-4 py-4 border-b border-gm-border last:border-0" data-testid="product-row">
      <LocalizedClientLink href={`/products/${item.product_handle}`} className="shrink-0">
        <Thumbnail
          thumbnail={item.thumbnail}
          images={item.variant?.product?.images}
          size="square"
          className="w-20 small:w-24"
        />
      </LocalizedClientLink>

      <div className="flex flex-1 flex-col min-w-0 gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <LocalizedClientLink href={`/products/${item.product_handle}`}>
              <span className="text-sm font-semibold text-gm-ink line-clamp-2" data-testid="product-title">
                {item.product_title}
              </span>
            </LocalizedClientLink>
            <LineItemOptions variant={item.variant} data-testid="product-variant" />
          </div>
          <LineItemPrice item={item} style="tight" currencyCode={currencyCode} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CartItemSelect
              value={item.quantity}
              onChange={(value) => changeQuantity(parseInt(value.target.value))}
              className="w-16 h-10"
              data-testid="product-select-button"
            >
              {/* TODO: Update this with the v2 way of managing inventory */}
              {Array.from({ length: Math.min(maxQuantity, 10) }, (_, i) => (
                <option value={i + 1} key={i}>
                  {i + 1}
                </option>
              ))}

              <option value={1} key={1}>
                1
              </option>
            </CartItemSelect>
            {updating && <Spinner />}
          </div>
          <DeleteButton id={item.id} data-testid="product-delete-button">
            Retirer
          </DeleteButton>
        </div>
        <ErrorMessage error={error} data-testid="product-error-message" />
      </div>
    </div>
  )
}

export default Item
