import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { inventoryAdjustments, lineCosts } from "../../lib/procurement-rules"
import { PROCUREMENT_MODULE } from "../../modules/procurement"
import type ProcurementModuleService from "../../modules/procurement/service"

// Étapes de l'approvisionnement (spec 2026-09-28 approvisionnement-marges).

const procurement = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(PROCUREMENT_MODULE) as ProcurementModuleService

export type LineValues = {
  variant_id: string
  title: string
  quantity: number
  unit_price_usd: number
  freight_usd: number
  transport_xof: number
  ads_usd: number
}
export type DraftInput = {
  id?: string
  reference: string
  supplier: string | null
  exchange_rate: number
  fee_rate: number
  note: string | null
  lines: LineValues[]
}

type DraftUndo = {
  created: string | null
  previous: {
    id: string
    header: { reference: string; supplier: string | null; exchange_rate: number; fee_rate: number; note: string | null }
    lines: LineValues[]
  } | null
}

const loadOrder = async (svc: ProcurementModuleService, id: string) =>
  svc.retrieveSupplierOrder(id, { relations: ["lines"] })

const lineSnapshot = (l: any): LineValues => ({
  variant_id: l.variant_id,
  title: l.title,
  quantity: l.quantity,
  unit_price_usd: l.unit_price_usd,
  freight_usd: l.freight_usd,
  transport_xof: l.transport_xof,
  ads_usd: l.ads_usd,
})

// Création ou mise à jour d'un brouillon (les lignes sont remplacées).
export const saveDraftStep = createStep(
  "save-draft",
  async (input: DraftInput, { container }) => {
    const svc = procurement(container)
    const header = {
      reference: input.reference,
      supplier: input.supplier,
      exchange_rate: input.exchange_rate,
      fee_rate: input.fee_rate,
      note: input.note,
    }
    if (!input.id) {
      const order = await svc.createSupplierOrders(header)
      if (input.lines.length) {
        await svc.createSupplierOrderLines(input.lines.map((l) => ({ ...l, supplier_order_id: order.id })))
      }
      return new StepResponse(order, { created: order.id, previous: null } as DraftUndo)
    }
    const previous = await loadOrder(svc, input.id)
    if (previous.status !== "draft") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Seule une commande en préparation peut être modifiée.")
    }
    await svc.deleteSupplierOrderLines((previous.lines ?? []).map((l: any) => l.id))
    if (input.lines.length) {
      await svc.createSupplierOrderLines(input.lines.map((l) => ({ ...l, supplier_order_id: input.id })))
    }
    const order = await svc.updateSupplierOrders({ id: input.id, ...header })
    const undo: DraftUndo = {
      created: null,
      previous: {
        id: previous.id,
        header: {
          reference: previous.reference,
          supplier: previous.supplier,
          exchange_rate: previous.exchange_rate,
          fee_rate: previous.fee_rate,
          note: previous.note,
        },
        lines: (previous.lines ?? []).map(lineSnapshot),
      },
    }
    return new StepResponse(order, undo)
  },
  async (undo: DraftUndo | undefined, { container }) => {
    if (!undo) return
    const svc = procurement(container)
    if (undo.created) {
      await svc.deleteSupplierOrders(undo.created)
      return
    }
    if (undo.previous) {
      const current = await loadOrder(svc, undo.previous.id)
      await svc.deleteSupplierOrderLines((current.lines ?? []).map((l: any) => l.id))
      if (undo.previous.lines.length) {
        await svc.createSupplierOrderLines(undo.previous.lines.map((l) => ({ ...l, supplier_order_id: undo.previous!.id })))
      }
      await svc.updateSupplierOrders({ id: undo.previous.id, ...undo.previous.header })
    }
  }
)

// Changement de statut contrôlé (double clic, deux onglets : la seconde
// requête échoue).
export const setStatusStep = createStep(
  "set-status",
  async (input: { id: string; from: string[]; to: "ordered" | "received" | "canceled" }, { container }) => {
    const svc = procurement(container)
    const order = await loadOrder(svc, input.id)
    if (!input.from.includes(order.status)) {
      const messages: Record<string, string> = {
        ordered: "Seule une commande en préparation peut être commandée.",
        received: "Seule une commande commandée peut être réceptionnée.",
        canceled: "Une commande réceptionnée ne peut plus être annulée.",
      }
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, messages[input.to])
    }
    if (input.to === "ordered" && !(order.lines ?? []).length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ajoutez au moins une ligne avant de commander.")
    }
    const now = new Date()
    await svc.updateSupplierOrders({
      id: order.id,
      status: input.to,
      ...(input.to === "ordered" ? { ordered_at: now } : {}),
      ...(input.to === "received" ? { received_at: now } : {}),
    })
    const updated = await loadOrder(svc, order.id)
    return new StepResponse(
      { order: updated, previousStatus: order.status },
      { id: order.id, status: order.status, ordered_at: order.ordered_at, received_at: order.received_at }
    )
  },
  async (previous, { container }) => {
    if (previous) await procurement(container).updateSupplierOrders(previous)
  }
)

// Ajustements de stock de la réception (articles d'inventaire des variantes,
// kits compris) dans l'emplacement de stock unique.
export const prepareReceptionStep = createStep(
  "prepare-reception",
  async (input: { order: any }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const lines = (input.order.lines ?? []) as { variant_id: string; quantity: number }[]
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "inventory_items.inventory_item_id", "inventory_items.required_quantity"],
      filters: { id: lines.map((l) => l.variant_id) },
    })
    const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
    if (!locations[0]) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Aucun emplacement de stock configuré.")
    const byVariant = Object.fromEntries(
      variants.map((v: any) => [
        v.id,
        (v.inventory_items ?? []).map((i: any) => ({ inventory_item_id: i.inventory_item_id, required_quantity: Number(i.required_quantity) })),
      ])
    )
    try {
      return new StepResponse(inventoryAdjustments(lines, byVariant, locations[0].id))
    } catch (error) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, (error as Error).message)
    }
  }
)

// Coûts de revient figés sur les lignes et coût courant des variantes.
export const recordCostsStep = createStep(
  "record-costs",
  async (input: { order: any }, { container }) => {
    const svc = procurement(container)
    const order = input.order
    const previousCosts: any[] = []
    const createdCosts: string[] = []
    for (const line of order.lines ?? []) {
      const unitCost = lineCosts(line, order).unitCost
      await svc.updateSupplierOrderLines({ id: line.id, unit_cost_xof: unitCost })
      const [existing] = await svc.listVariantCosts({ variant_id: line.variant_id })
      if (existing) {
        previousCosts.push({ id: existing.id, unit_cost_xof: existing.unit_cost_xof, source_line_id: existing.source_line_id })
        await svc.updateVariantCosts({ id: existing.id, unit_cost_xof: unitCost, source_line_id: line.id })
      } else {
        const created = await svc.createVariantCosts({ variant_id: line.variant_id, unit_cost_xof: unitCost, source_line_id: line.id })
        createdCosts.push(created.id)
      }
    }
    return new StepResponse(null, { previousCosts, createdCosts, lineIds: (order.lines ?? []).map((l: any) => l.id) })
  },
  async (undo, { container }) => {
    if (!undo) return
    const svc = procurement(container)
    if (undo.createdCosts.length) await svc.deleteVariantCosts(undo.createdCosts)
    for (const previous of undo.previousCosts) await svc.updateVariantCosts(previous)
    for (const id of undo.lineIds) await svc.updateSupplierOrderLines({ id, unit_cost_xof: null })
  }
)

// Coût de revient saisi à la main (stock existant, déjà acheté avant l'outil).
export const setVariantCostStep = createStep(
  "set-variant-cost",
  async (input: { variant_id: string; unit_cost_xof: number }, { container }) => {
    const svc = procurement(container)
    const [existing] = await svc.listVariantCosts({ variant_id: input.variant_id })
    if (existing) {
      const updated = await svc.updateVariantCosts({ id: existing.id, unit_cost_xof: input.unit_cost_xof, source_line_id: null })
      return new StepResponse(updated, { restore: { id: existing.id, unit_cost_xof: existing.unit_cost_xof, source_line_id: existing.source_line_id }, created: null as string | null })
    }
    const created = await svc.createVariantCosts({ variant_id: input.variant_id, unit_cost_xof: input.unit_cost_xof, source_line_id: null })
    return new StepResponse(created, { restore: null as any, created: created.id as string | null })
  },
  async (undo, { container }) => {
    if (!undo) return
    const svc = procurement(container)
    if (undo.created) await svc.deleteVariantCosts(undo.created)
    if (undo.restore) await svc.updateVariantCosts(undo.restore)
  }
)
