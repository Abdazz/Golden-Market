import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { balances, courierTotals, inventoryByManagedVariant, orderItemNeeds, parseMovementLines } from "../../lib/courier-stock-rules"
import { loadCourierBalance, loadStockItems, prepareDeliveryTakes } from "../../lib/courier-stock-query"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"

// Étapes du stock confié aux livreurs (spec 2026-09-28 stock-livreurs).

const deliveryService = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(DELIVERY_MODULE) as DeliveryModuleService

export type NewMovement = {
  courier_id: string
  inventory_item_id: string
  quantity: number
  type: "handover" | "return" | "delivery" | "adjustment"
  delivery_id?: string | null
  order_id?: string | null
  note?: string | null
}

export type ManualMovementInput = {
  courier_id: string
  type: "handover" | "return" | "adjustment"
  lines: { inventory_item_id: string; quantity: number }[]
  note: string | null
}

// Contrôles (dépôt, solde du livreur) et calcul des mouvements.
export const prepareManualMovementsStep = createStep(
  "prepare-manual-movements",
  async (input: ManualMovementInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const courier = await deliveryService(container).retrieveCourier(input.courier_id)
    if (input.type === "handover" && !courier.active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce livreur est désactivé.")
    }
    if (input.type === "adjustment" && !input.note?.trim()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Indiquez la raison de la correction (note).")
    }
    const { data: all } = await query.graph({
      entity: "courier_stock_movement",
      fields: ["courier_id", "inventory_item_id", "quantity"],
    })
    const b = balances(all)
    const totals = courierTotals(b)
    const { locationId, items } = await loadStockItems(query)
    const warehouse = Object.fromEntries(items.map((i: any) => [i.id, i.stocked - (totals[i.id] ?? 0)]))
    const parsed = parseMovementLines(input.type, input.lines, { balance: b[input.courier_id] ?? {}, warehouse })
    if (parsed.stockAdjustments.length && !locationId) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Aucun emplacement de stock configuré.")
    }
    const movements: NewMovement[] = parsed.movements.map((m) => ({
      ...m,
      courier_id: input.courier_id,
      type: input.type,
      note: input.note?.trim() || null,
    }))
    const adjustments = parsed.stockAdjustments.map((a) => ({ ...a, location_id: locationId as string }))
    return new StepResponse({ movements, adjustments })
  }
)

// Déstockage automatique d'une livraison terminée.
export const prepareDeliveryTakesStep = createStep(
  "prepare-delivery-takes",
  async (input: { delivery_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const delivery = await deliveryService(container).retrieveDelivery(input.delivery_id)
    if (delivery.status !== "delivered" && delivery.status !== "shipped") return new StepResponse([] as NewMovement[])
    const { data: existing } = await query.graph({
      entity: "courier_stock_movement",
      fields: ["id"],
      filters: { delivery_id: delivery.id },
    })
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: ["id", "items.*"],
      filters: { id: delivery.order_id },
    })
    const variantIds = [...new Set((order?.items ?? []).map((i: any) => i.variant_id).filter(Boolean))]
    const { data: variants } = variantIds.length
      ? await query.graph({
          entity: "product_variant",
          fields: ["id", "manage_inventory", "inventory_items.inventory_item_id", "inventory_items.required_quantity"],
          filters: { id: variantIds },
        })
      : { data: [] }
    const inventoryByVariant = inventoryByManagedVariant(variants as any[])
    const needs = orderItemNeeds(
      (order?.items ?? []).map((i: any) => ({ variant_id: i.variant_id, quantity: Number(i.quantity) })),
      inventoryByVariant
    )
    const balance = await loadCourierBalance(query, delivery.courier_id)
    const takes = prepareDeliveryTakes({ existingCount: existing.length, needs, balance })
    return new StepResponse(
      takes.map((t) => ({
        courier_id: delivery.courier_id,
        inventory_item_id: t.inventory_item_id,
        quantity: -t.quantity,
        type: "delivery" as const,
        delivery_id: delivery.id,
        order_id: delivery.order_id,
        note: null,
      }))
    )
  }
)

export const createCourierStockMovementsStep = createStep(
  "create-courier-stock-movements",
  async (movements: NewMovement[], { container }) => {
    if (!movements.length) return new StepResponse([], [] as string[])
    const created = await deliveryService(container).createCourierStockMovements(movements)
    return new StepResponse(created, created.map((m: any) => m.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await deliveryService(container).deleteCourierStockMovements(ids)
  }
)
