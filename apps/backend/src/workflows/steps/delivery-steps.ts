import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { canAssign, computeSettlement, parseCourierInput, todayInOuaga, validateCompletion } from "../../lib/delivery-rules"
import type { DeliveryType } from "../../lib/delivery-rules"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"

// Étapes des workflows de livraison (spec 2026-09-28 livreurs-livraisons) :
// une écriture par étape, validation métier dans l'étape (MedusaError),
// compensation qui restaure l'état précédent en cas d'échec du workflow.

const deliveryModule = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(DELIVERY_MODULE) as DeliveryModuleService

export type CourierInput = { name?: string; phone?: string; notes?: string | null }

export const createCourierStep = createStep(
  "create-courier",
  async (input: CourierInput, { container }) => {
    const parsed = parseCourierInput(input)
    if (!parsed.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.message)
    const courier = await deliveryModule(container).createCouriers(parsed.values)
    return new StepResponse(courier, courier.id)
  },
  async (id, { container }) => {
    if (id) await deliveryModule(container).deleteCouriers(id)
  }
)

export const updateCourierStep = createStep(
  "update-courier",
  async (input: CourierInput & { id: string; active?: boolean }, { container }) => {
    const svc = deliveryModule(container)
    const previous = await svc.retrieveCourier(input.id)
    const parsed = parseCourierInput({
      name: input.name ?? previous.name,
      phone: input.phone ?? previous.phone,
      notes: input.notes === undefined ? previous.notes : input.notes,
    })
    if (!parsed.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.message)
    const courier = await svc.updateCouriers({
      id: input.id,
      ...parsed.values,
      active: input.active ?? previous.active,
    })
    return new StepResponse(courier, {
      id: previous.id,
      name: previous.name,
      phone: previous.phone,
      notes: previous.notes,
      active: previous.active,
    })
  },
  async (previous, { container }) => {
    if (previous) await deliveryModule(container).updateCouriers(previous)
  }
)

export const assertCanAssignStep = createStep(
  "assert-can-assign-delivery",
  async (input: { order_id: string; courier_id: string; order_canceled: boolean }, { container }) => {
    const svc = deliveryModule(container)
    if (input.order_canceled) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Commande annulée : elle ne peut plus être confiée.")
    }
    const courier = await svc.retrieveCourier(input.courier_id)
    if (!courier.active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Le livreur ${courier.name} est désactivé.`)
    }
    const existing = await svc.listDeliveries({ order_id: input.order_id })
    if (!canAssign(existing)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette commande a déjà une livraison en cours.")
    }
    return new StepResponse(courier)
  }
)

export type NewDelivery = {
  order_id: string
  courier_id: string
  type: DeliveryType
  address: string | null
  transport_company: string | null
  destination_city: string | null
  amount_to_collect: number
}

export const createDeliveryStep = createStep(
  "create-delivery",
  async (input: NewDelivery, { container }) => {
    const today = todayInOuaga()
    const delivery = await deliveryModule(container).createDeliveries({
      ...input,
      tour_date: today,
      first_tour_date: today,
      assigned_at: new Date(),
    })
    return new StepResponse(delivery, delivery.id)
  },
  async (id, { container }) => {
    if (id) await deliveryModule(container).deleteDeliveries(id)
  }
)

export type CompletionInput = {
  id: string
  status: "delivered" | "failed" | "shipped"
  amount_collected?: number | null
  courier_fee?: number | null
  transport_fee?: number | null
  failure_reason?: string | null
  redeliver?: boolean
}

// Refus si la livraison n'est plus "Confiée" (double clic, deux onglets : la
// seconde requête échoue) ou si la journée du livreur est déjà validée.
export const prepareCompletionStep = createStep(
  "prepare-delivery-completion",
  async (input: CompletionInput, { container }) => {
    const svc = deliveryModule(container)
    const delivery = await svc.retrieveDelivery(input.id)
    if (delivery.status !== "assigned") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
    }
    const [locked] = await svc.listCourierSettlements({ courier_id: delivery.courier_id, day: todayInOuaga() })
    if (locked) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Journée déjà validée : rouvrez-la pour modifier.")
    }
    const check = validateCompletion({ ...input, type: delivery.type })
    if (!check.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, check.message)
    return new StepResponse({
      id: delivery.id,
      status: input.status,
      redeliver: input.status === "failed" ? Boolean(input.redeliver) : false,
      completed_at: new Date(),
      ...check.values,
    })
  }
)

export type DeliveryChanges = { id: string } & Record<string, unknown>

export const updateDeliveryStep = createStep(
  "update-delivery",
  async (input: DeliveryChanges | DeliveryChanges[], { container }) => {
    const svc = deliveryModule(container)
    const list = Array.isArray(input) ? input : [input]
    const previous = await svc.listDeliveries({ id: list.map((d) => d.id) })
    const updated = await svc.updateDeliveries(list as any)
    // Seuls les champs modifiés sont restaurés par la compensation.
    const restore = previous.map((p) => {
      const changed = list.find((d) => d.id === p.id) ?? { id: p.id }
      return Object.fromEntries(Object.keys(changed).map((k) => [k, (p as Record<string, unknown>)[k]]))
    })
    return new StepResponse(updated, restore)
  },
  async (restore, { container }) => {
    if (restore?.length) await deliveryModule(container).updateDeliveries(restore as any)
  }
)

// Montant attendu recalculé côté serveur au moment de la validation.
export const computeSettlementStep = createStep(
  "compute-courier-settlement",
  async (input: { courier_id: string; day: string }, { container }) => {
    const svc = deliveryModule(container)
    const [existing] = await svc.listCourierSettlements({ courier_id: input.courier_id, day: input.day })
    if (existing) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Versement déjà validé pour cette journée.")
    }
    const start = new Date(`${input.day}T00:00:00Z`)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const deliveries = await svc.listDeliveries({
      courier_id: input.courier_id,
      completed_at: { $gte: start, $lt: end },
    })
    return new StepResponse(computeSettlement(deliveries, input.day).toRemit)
  }
)

export const createSettlementStep = createStep(
  "create-courier-settlement",
  async (
    input: { courier_id: string; day: string; expected_amount: number; received_amount: number; note?: string | null },
    { container }
  ) => {
    const settlement = await deliveryModule(container).createCourierSettlements({
      ...input,
      note: input.note ?? null,
      validated_at: new Date(),
    })
    return new StepResponse(settlement, settlement.id)
  },
  async (id, { container }) => {
    if (id) await deliveryModule(container).deleteCourierSettlements(id)
  }
)

export const deleteSettlementStep = createStep(
  "delete-courier-settlement",
  async (input: { id: string }, { container }) => {
    const svc = deliveryModule(container)
    const previous = await svc.retrieveCourierSettlement(input.id)
    await svc.deleteCourierSettlements(input.id)
    return new StepResponse({ id: input.id }, previous)
  },
  async (previous, { container }) => {
    if (!previous) return
    await deliveryModule(container).createCourierSettlements({
      id: previous.id,
      courier_id: previous.courier_id,
      day: previous.day,
      expected_amount: previous.expected_amount,
      received_amount: previous.received_amount,
      validated_at: previous.validated_at,
      note: previous.note,
    })
  }
)
