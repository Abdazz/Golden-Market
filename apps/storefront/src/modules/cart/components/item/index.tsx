"use client"

import { updateLineItem } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
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
        <LocalizedClientLink href={`/products/${item.product_handle}`} className="shrink-0 w-14">
          <Thumbnail
            thumbnail={item.thumbnail}
            images={item.variant?.product?.images}
            size="square"
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
      <LocalizedClientLink href={`/products/${item.product_handle}`} className="shrink-0 w-20 small:w-24">
        <Thumbnail
          thumbnail={item.thumbnail}
          images={item.variant?.product?.images}
          size="square"
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
            <div className="flex items-center rounded-full border border-gm-border overflow-hidden">
              <button
                type="button"
                onClick={() => changeQuantity(Math.max(1, item.quantity - 1))}
                disabled={updating || item.quantity <= 1}
                className="w-8 h-9 bg-gm-ivoire-2 text-gm-ink text-base disabled:opacity-40"
                aria-label="Diminuer la quantité"
                data-testid="product-select-button"
              >
                −
              </button>
              <span
                className="w-8 text-center font-bold text-sm tabular-nums"
                data-testid="product-quantity"
              >
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() =>
                  changeQuantity(Math.min(maxQuantity, item.quantity + 1))
                }
                disabled={updating || item.quantity >= maxQuantity}
                className="w-8 h-9 bg-gm-ivoire-2 text-gm-ink text-base disabled:opacity-40"
                aria-label="Augmenter la quantité"
              >
                +
              </button>
            </div>
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
