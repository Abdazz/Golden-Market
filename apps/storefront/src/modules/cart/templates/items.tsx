import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Heading } from "@modules/common/components/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart
}

const ItemsTemplate = ({ cart }: ItemsTemplateProps) => {
  const items = cart?.items
  const itemCount = items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <Heading level="h1" className="text-xl mb-4">
        Panier
        {itemCount > 0 && (
          <span className="text-gm-ink-muted font-normal"> ({itemCount})</span>
        )}
      </Heading>
      <div>
        {items
          ? items
              .sort((a, b) => {
                return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
              })
              .map((item) => {
                return <Item key={item.id} item={item} currencyCode={cart?.currency_code} />
              })
          : repeat(5).map((i) => {
              return <SkeletonLineItem key={i} />
            })}
      </div>
    </div>
  )
}

export default ItemsTemplate
