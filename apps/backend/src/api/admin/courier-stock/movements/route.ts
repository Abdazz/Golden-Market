import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { itemLabel } from "../../../../lib/courier-stock-rules"
import { orderNumberOf } from "../../../../lib/order-number"
import { recordCourierStockWorkflow } from "../../../../workflows/courier-stock"
import type { CourierStockMovementSchema } from "../../deliveries/middlewares"

// Historique d'un livreur (200 derniers mouvements).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const courierId = req.query.courier_id
  if (typeof courierId !== "string" || !courierId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Paramètre courier_id obligatoire.")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: movements } = await query.graph({
    entity: "courier_stock_movement",
    fields: ["id", "created_at", "type", "quantity", "inventory_item_id", "order_id", "note"],
    filters: { courier_id: courierId },
    pagination: { take: 200, order: { created_at: "DESC" } },
  })
  const itemIds = [...new Set(movements.map((m: any) => m.inventory_item_id))]
  const orderIds = [...new Set(movements.map((m: any) => m.order_id).filter(Boolean))]
  const { data: items } = itemIds.length
    ? await query.graph({ entity: "inventory_item", fields: ["id", "title", "sku", "variants.title", "variants.product.title"], filters: { id: itemIds } })
    : { data: [] }
  const { data: orders } = orderIds.length
    ? await query.graph({ entity: "order", fields: ["id", "custom_display_id", "display_id"], filters: { id: orderIds } })
    : { data: [] }
  const labels = Object.fromEntries(items.map((i: any) => [i.id, itemLabel(i)]))
  const numbers = Object.fromEntries(orders.map((o: any) => [o.id, orderNumberOf(o)]))
  res.json({
    movements: movements.map((m: any) => ({
      id: m.id,
      created_at: m.created_at,
      type: m.type,
      quantity: m.quantity,
      label: labels[m.inventory_item_id] ?? "Article supprimé",
      order_number: m.order_id ? numbers[m.order_id] ?? null : null,
      note: m.note,
    })),
  })
}

// Remise / retour / correction.
export async function POST(req: AuthenticatedMedusaRequest<CourierStockMovementSchema>, res: MedusaResponse) {
  const { result } = await recordCourierStockWorkflow(req.scope).run({
    input: { ...req.validatedBody, note: req.validatedBody.note ?? null },
  })
  res.json({ movements: result })
}
