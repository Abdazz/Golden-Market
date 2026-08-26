import { Badge, Button } from "@modules/common/components/ui"
import { useMemo } from "react"

import Thumbnail from "@modules/products/components/thumbnail"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type OrderCardProps = {
  order: HttpTypes.StoreOrder
}

type OrderStatus = {
  label: string
  color: "green" | "gold" | "amethyst"
}

const getOrderStatus = (order: HttpTypes.StoreOrder): OrderStatus => {
  if (order.fulfillment_status === "delivered") {
    return { label: "Livrée", color: "green" }
  }

  if (order.payment_status === "captured" || order.payment_status === "partially_captured") {
    return { label: "Paiement reçu", color: "amethyst" }
  }

  return { label: "En cours", color: "gold" }
}

const OrderCard = ({ order }: OrderCardProps) => {
  const numberOfLines = useMemo(() => {
    return (
      order.items?.reduce((acc, item) => {
        return acc + item.quantity
      }, 0) ?? 0
    )
  }, [order])

  const numberOfProducts = useMemo(() => {
    return order.items?.length ?? 0
  }, [order])

  const status = getOrderStatus(order)

  return (
    <div
      className="rounded-2xl border border-gm-border bg-white p-4 small:p-5 flex flex-col gap-y-4"
      data-testid="order-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-gm-ink" data-testid="order-display-id">
            #{order.display_id}
          </span>
          <Badge color={status.color}>{status.label}</Badge>
        </div>
        <span className="font-display font-bold text-gm-ink" data-testid="order-amount">
          {convertToLocale({ amount: order.total, currency_code: order.currency_code })}
        </span>
      </div>
      <div className="text-sm text-gm-ink-muted">
        <span data-testid="order-created-at">{new Date(order.created_at).toDateString()}</span>
        <span className="mx-1.5">-</span>
        <span>{`${numberOfLines} ${numberOfLines > 1 ? "articles" : "article"}`}</span>
      </div>
      <div className="grid grid-cols-3 small:grid-cols-4 gap-3">
        {order.items?.slice(0, 3).map((i) => {
          return (
            <div key={i.id} className="flex flex-col gap-y-1.5" data-testid="order-item">
              <Thumbnail thumbnail={i.thumbnail} images={[]} size="square" />
              <span className="text-xs text-gm-ink-muted line-clamp-1" data-testid="item-title">
                {i.title} <span className="text-gm-ink" data-testid="item-quantity">x{i.quantity}</span>
              </span>
            </div>
          )
        })}
        {numberOfProducts > 3 && (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-gm-ivoire-2 aspect-square">
            <span className="text-sm font-semibold text-gm-ink-muted">+{numberOfProducts - 3}</span>
          </div>
        )}
      </div>
      <LocalizedClientLink href={`/account/orders/details/${order.id}`}>
        <Button data-testid="order-details-link" variant="secondary" size="small" className="w-full">
          Voir les détails
        </Button>
      </LocalizedClientLink>
    </div>
  )
}

export default OrderCard
