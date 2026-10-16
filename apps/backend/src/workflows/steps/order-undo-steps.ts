import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { cancelOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { feeEntriesFromDelivery, finalReferences } from "../../lib/cashbook-rules"
import { orderNumberOf } from "../../lib/order-number"
import { dayOf, todayInOuaga } from "../../lib/delivery-rules"
import { loadUndoContext } from "../../lib/order-undo"
import { undoRefusal } from "../../lib/undo-rules"
import { CASHBOOK_MODULE } from "../../modules/cashbook"
import type CashbookModuleService from "../../modules/cashbook/service"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"

// Étapes de « Marquer non payée » / « Marquer non livrée » (2026-10-16, voir
// lib/order-undo.ts). Les écritures réversibles (caisse, transactions,
// mouvements du livreur, livraison, rapport) sont compensées ; les étapes
// Medusa sans retour simple (paiement, expédition) sont exécutées en dernier.

type Resolver = { resolve: (key: string) => any }
const cashbook = (c: Resolver) => c.resolve(CASHBOOK_MODULE) as CashbookModuleService
const deliveries = (c: Resolver) => c.resolve(DELIVERY_MODULE) as DeliveryModuleService

const SYSTEM_PROVIDER = "pp_system_default"
export const UNDONE_REPORT_REASON = "Livraison annulée par l'équipe : à renseigner de nouveau"

export type UndoInput = { order_id: string; user_id: string | null }

const refuse = (message: string): never => {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message)
}

const loadOrRefuse = async (container: Resolver, kind: "paid" | "delivered", orderId: string) => {
  const ctx = await loadUndoContext(container, orderId)
  if (!ctx) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Commande introuvable.")
  const refusal = undoRefusal(kind, ctx.facts)
  if (refusal) refuse(refusal)
  // Versement du livreur déjà validé pour le jour de clôture : il serait faussé.
  const done = ctx.doneDelivery
  if (done?.completed_at) {
    const [settled] = await deliveries(container).listCourierSettlements({ courier_id: done.courier_id, day: dayOf(done.completed_at) })
    if (settled) refuse("Journée du livreur déjà validée : rouvrez-la pour annuler.")
  }
  return ctx
}

// Méthodes Medusa hors interface publique (enquête) : vérifiées avant toute
// écriture, pour qu'une mise à jour de Medusa échoue franchement et pas à mi-chemin.
const assertMethods = (service: any, names: string[], moduleName: string) => {
  const missing = names.filter((n) => typeof service?.[n] !== "function")
  if (missing.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Annulation impossible : méthodes Medusa absentes (${moduleName} : ${missing.join(", ")}). Vérifier la version de Medusa.`
    )
  }
}

const auditMetadata = (ctx: { order: any }, key: string, userId: string | null) => ({
  ...(ctx.order.metadata ?? {}),
  [key]: new Date().toISOString(),
  undone_by: userId,
})

export const prepareUndoPaidStep = createStep("prepare-undo-paid", async (input: UndoInput, { container }) => {
  const ctx = await loadOrRefuse(container, "paid", input.order_id)
  assertMethods(
    container.resolve(Modules.PAYMENT),
    ["deleteCaptures", "deletePayments", "deletePaymentSessions", "updatePayment", "maybeUpdatePaymentCollection_"],
    "paiement"
  )
  assertMethods(
    container.resolve(Modules.ORDER),
    ["listOrderTransactions", "updateOrderTransactions", "softDeleteOrderTransactions", "restoreOrderTransactions", "retrieveOrder", "updateOrders"],
    "commande"
  )
  const refs = finalReferences(input.order_id)
  const finalRefs = [refs.sale, refs.courierFee, refs.transportFee]
  const entries = await cashbook(container).listCashEntries({ order_id: input.order_id })
  const captureIds: string[] = ctx.captures.map((c: any) => c.id)
  const transactions = captureIds.length
    ? await container.resolve(Modules.ORDER).listOrderTransactions({ order_id: input.order_id, reference: "capture", reference_id: captureIds })
    : []
  const done = ctx.doneDelivery
  // Commande qui reste livrée : les frais de sa livraison (course, compagnie)
  // restent dus. Ceux du formulaire sont retirés avec la vente ; les écritures
  // automatiques de la livraison (delivery:<id>:*) sont donc (ré)inscrites.
  let feeEntries: ReturnType<typeof feeEntriesFromDelivery> = []
  if (done) {
    const courier = await deliveries(container).retrieveCourier(done.courier_id).catch(() => null)
    feeEntries = feeEntriesFromDelivery(done, courier?.name ?? null, orderNumberOf(ctx.order))
  }
  return new StepResponse({
    fee_entries: feeEntries,
    // Vente et frais du formulaire, ventes automatiques des captures.
    cash_ids: entries
      .filter((e) => finalRefs.includes(e.reference ?? "") || (e.category === "sale" && (e.reference ?? "").startsWith("capture:")))
      .map((e) => e.id),
    transaction_ids: transactions.map((t: any) => t.id) as string[],
    collections: (ctx.order.payment_collections ?? []).map((pc: any) => ({
      id: pc.id as string,
      payments: (pc.payments ?? [])
        .filter((p: any) => (p.captures ?? []).length)
        .map((p: any) => ({
          id: p.id as string,
          system: p.provider_id === SYSTEM_PROVIDER,
          session_id: (p.payment_session_id ?? null) as string | null,
          capture_ids: (p.captures ?? []).map((c: any) => c.id) as string[],
        })),
    })),
    // Livraison terminée encaissée : le livreur n'a plus rien à reverser.
    delivery: done && Number(done.amount_collected ?? 0) > 0 ? { id: done.id as string, amount_collected: 0 } : null,
    metadata: auditMetadata(ctx, "payment_undone_at", input.user_id),
  })
})

export const prepareUndoDeliveredStep = createStep("prepare-undo-delivered", async (input: UndoInput, { container }) => {
  const ctx = await loadOrRefuse(container, "delivered", input.order_id)
  assertMethods(container.resolve(Modules.ORDER), ["retrieveOrder", "listOrderItems", "updateOrderItems", "updateOrders"], "commande")
  assertMethods(container.resolve(Modules.FULFILLMENT), ["retrieveFulfillment", "updateFulfillment", "deleteFulfillment"], "expédition")
  const done = ctx.doneDelivery
  const fulfillments = (ctx.order.fulfillments ?? []).filter((f: any) => !f.canceled_at)
  // Emplacement où remettre le stock : celui de l'expédition s'il a un niveau
  // de stock pour chaque article, sinon le seul emplacement qui en a un
  // (commande téléphone sur une option de livraison d'un autre entrepôt), sinon refus.
  const plan: { id: string; location_id: string | null }[] = []
  for (const f of fulfillments) {
    const itemIds = [...new Set((f.items ?? []).map((i: any) => i.inventory_item_id).filter(Boolean))] as string[]
    if (!itemIds.length) {
      plan.push({ id: f.id, location_id: null })
      continue
    }
    const levels = await container.resolve(Modules.INVENTORY).listInventoryLevels({ inventory_item_id: itemIds })
    const covering = [...new Set(levels.map((l: any) => l.location_id as string))].filter((loc) =>
      itemIds.every((item) => levels.some((l: any) => l.location_id === loc && l.inventory_item_id === item))
    )
    if (covering.includes(f.location_id)) plan.push({ id: f.id, location_id: null })
    else if (covering.length === 1) plan.push({ id: f.id, location_id: covering[0] })
    else refuse("Emplacement de stock introuvable pour remettre les articles : annulation impossible.")
  }
  let report: { id: string; status: string; return_reason: string } | null = null
  let movementIds: string[] = []
  let cashIds: string[] = []
  if (done) {
    const svc = deliveries(container)
    const [found] = await svc.listDeliveryReports({ delivery_id: done.id })
    if (found?.status === "validated") report = { id: found.id, status: "returned", return_reason: UNDONE_REPORT_REASON }
    movementIds = (await svc.listCourierStockMovements({ delivery_id: done.id, type: "delivery" })).map((m) => m.id)
    cashIds = (
      await cashbook(container).listCashEntries({ reference: [`delivery:${done.id}:courier_fee`, `delivery:${done.id}:transport_fee`] })
    ).map((e) => e.id)
  }
  return new StepResponse({
    delivery: done
      ? {
          id: done.id as string,
          status: "assigned",
          completed_at: null,
          amount_collected: null,
          courier_fee: null,
          transport_fee: null,
          sync_warning: null,
          // Revient dans la tournée du jour.
          tour_date: todayInOuaga(),
        }
      : null,
    report,
    movement_ids: movementIds,
    cash_ids: cashIds,
    fulfillments: plan,
    metadata: auditMetadata(ctx, "delivery_undone_at", input.user_id),
  })
})

// Suppression réversible des écritures de caisse.
export const softDeleteCashEntriesStep = createStep(
  "undo-soft-delete-cash-entries",
  async (ids: string[], { container }) => {
    if (ids.length) await cashbook(container).softDeleteCashEntries(ids)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) await cashbook(container).restoreCashEntries(ids)
  }
)

// Suppression réversible des mouvements « livraison » du livreur : son solde
// remonte (on retire une sortie, il ne peut pas devenir négatif) et l'index
// unique partiel laisse une nouvelle livraison déstocker à nouveau.
export const softDeleteCourierMovementsStep = createStep(
  "undo-soft-delete-courier-movements",
  async (ids: string[], { container }) => {
    if (ids.length) await deliveries(container).softDeleteCourierStockMovements(ids)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) await deliveries(container).restoreCourierStockMovements(ids)
  }
)

export const updateDeliveryReportStep = createStep(
  "undo-update-delivery-report",
  async (input: { id: string; status: string; return_reason: string }, { container }) => {
    const svc = deliveries(container)
    const previous = await svc.retrieveDeliveryReport(input.id)
    await svc.updateDeliveryReports(input as any)
    return new StepResponse(input, { id: previous.id, status: previous.status, return_reason: previous.return_reason })
  },
  async (previous, { container }) => {
    if (previous) await deliveries(container).updateDeliveryReports(previous as any)
  }
)

export const updateOrderMetadataStep = createStep(
  "undo-update-order-metadata",
  async (input: { order_id: string; metadata: Record<string, unknown> }, { container }) => {
    const orders = container.resolve(Modules.ORDER)
    const previous = await orders.retrieveOrder(input.order_id, { select: ["id", "metadata"] })
    await orders.updateOrders(input.order_id, { metadata: input.metadata })
    return new StepResponse(input, { id: previous.id, metadata: previous.metadata ?? {} })
  },
  async (previous, { container }) => {
    if (previous) await container.resolve(Modules.ORDER).updateOrders(previous.id, { metadata: previous.metadata })
  }
)

// Transactions de commande des captures. Medusa recalcule le résumé de la
// version de la transaction, pas de la version courante : une commande payée
// puis livrée a changé de version, la transaction y est d'abord déplacée
// (sinon « non payée » avec 0 F à payer, constaté dans l'enquête).
export const removeOrderTransactionsStep = createStep(
  "undo-remove-order-transactions",
  async (input: { order_id: string; ids: string[] }, { container }) => {
    if (!input.ids.length) return new StepResponse([], [] as string[])
    // Méthodes générées du module (absentes de l'interface publique), comme dans l'enquête.
    const orders = container.resolve(Modules.ORDER) as any
    const { version } = await orders.retrieveOrder(input.order_id, { select: ["id", "version"] })
    await orders.updateOrderTransactions(input.ids.map((id) => ({ id, version })))
    await orders.softDeleteOrderTransactions(input.ids)
    return new StepResponse(input.ids, input.ids)
  },
  async (ids, { container }) => {
    if (ids?.length) await container.resolve(Modules.ORDER).restoreOrderTransactions(ids)
  }
)

type CollectionPlan = { id: string; payments: { id: string; system: boolean; session_id: string | null; capture_ids: string[] }[] }

// Paiement remis comme avant : captures supprimées ; paiement créé par
// « Marquer payée » (fournisseur système) supprimé avec sa session -> « Non
// payée » ; paiement autorisé du site (paiement à la livraison) dé-capturé ->
// « Autorisée ». Sans compensation : dernière étape du workflow.
export const resetPaymentsStep = createStep("undo-reset-payments", async (collections: CollectionPlan[], { container }) => {
  // deletePayments / deleteCaptures : méthodes générées du module (hors interface publique).
  const payments = container.resolve(Modules.PAYMENT) as any
  for (const pc of collections) {
    for (const p of pc.payments) {
      if (p.capture_ids.length) await payments.deleteCaptures(p.capture_ids)
      if (p.system) {
        await payments.deletePayments([p.id])
        if (p.session_id) await payments.deletePaymentSessions([p.session_id])
      } else {
        await payments.updatePayment({ id: p.id, captured_at: null } as any)
      }
    }
    // Statut et montants de la collecte recalculés comme Medusa le fait lui-même
    // (méthode interne du module paiement, épinglée par la vérification).
    await payments.maybeUpdatePaymentCollection_(pc.id)
  }
  return new StepResponse(collections.length)
})

// Compteurs expédié / livré des articles (version courante) : sans remise à 0,
// une nouvelle expédition serait refusée (« Cannot ship more items… »).
const resetItemCounters = async (container: Resolver, orderId: string) => {
  const orders = container.resolve(Modules.ORDER) as any
  const { version } = await orders.retrieveOrder(orderId, { select: ["id", "version"] })
  const items = await orders.listOrderItems({ order_id: orderId, version })
  if (items.length) {
    await orders.updateOrderItems(items.map((i: any) => ({ id: i.id, shipped_quantity: 0, delivered_quantity: 0 })))
  }
}

// Expédition annulée par le workflow natif (stock remis, réservation recréée),
// puis effacée : la fiche revient à « Non traitée », sans trace. Medusa refuse
// d'annuler une expédition expédiée / livrée : ces dates sont d'abord effacées
// (remises si l'annulation échoue). Sans compensation : dernière étape.
// Compteurs remis à 0 juste après l'annulation ; l'effacement est au mieux
// (une expédition annulée restante est ignorée par delivery-order-sync).
export const eraseFulfillmentsStep = createStep(
  "undo-erase-fulfillments",
  async (input: { order_id: string; fulfillments: { id: string; location_id: string | null }[] }, { container }) => {
    if (!input.fulfillments.length) return new StepResponse(0)
    const fm = container.resolve(Modules.FULFILLMENT)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    for (const f of input.fulfillments) {
      const previous = await fm.retrieveFulfillment(f.id, { select: ["id", "shipped_at", "delivered_at", "location_id"] })
      await fm.updateFulfillment(f.id, { shipped_at: null, delivered_at: null, ...(f.location_id ? { location_id: f.location_id } : {}) } as any)
      try {
        await cancelOrderFulfillmentWorkflow(container).run({
          input: { order_id: input.order_id, fulfillment_id: f.id, no_notification: true },
        })
      } catch (error) {
        await fm.updateFulfillment(f.id, {
          shipped_at: previous.shipped_at,
          delivered_at: previous.delivered_at,
          location_id: previous.location_id,
        } as any)
        throw error
      }
      await resetItemCounters(container, input.order_id)
      try {
        await link.dismiss({ [Modules.ORDER]: { order_id: input.order_id }, [Modules.FULFILLMENT]: { fulfillment_id: f.id } })
        await fm.deleteFulfillment(f.id)
      } catch (error) {
        logger.error(`Marquer non livrée : expédition annulée ${f.id} non effacée (${(error as Error).message})`)
      }
    }
    return new StepResponse(input.fulfillments.length)
  }
)
