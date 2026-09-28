import { balances, deliveryTakes, itemLabel } from "./courier-stock-rules"

// Lectures du stock livreur (spec 2026-09-28 stock-livreurs).

export const loadCourierBalance = async (query: any, courierId: string) => {
  const { data } = await query.graph({
    entity: "courier_stock_movement",
    fields: ["courier_id", "inventory_item_id", "quantity"],
    filters: { courier_id: courierId },
  })
  return balances(data)[courierId] ?? {}
}

export const loadStockItems = async (query: any) => {
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const locationId: string | null = locations[0]?.id ?? null
  const { data } = await query.graph({
    entity: "inventory_item",
    fields: [
      "id",
      "title",
      "sku",
      "location_levels.location_id",
      "location_levels.stocked_quantity",
      "variants.title",
      "variants.product.title",
    ],
  })
  const items = data.map((item: any) => ({
    id: item.id as string,
    label: itemLabel(item),
    stocked: Number((item.location_levels ?? []).find((l: any) => l.location_id === locationId)?.stocked_quantity ?? 0),
  }))
  return { locationId, items }
}

export const prepareDeliveryTakes = (input: {
  existingCount: number
  needs: Record<string, number>
  balance: Record<string, number>
}) => (input.existingCount > 0 ? [] : deliveryTakes(input.needs, input.balance))
