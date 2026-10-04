import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadAllEntries } from "./cashbook-query"
import { summarizeMonth } from "./cashbook-rules"
import { balances } from "./courier-stock-rules"
import { collectedTotals, countInProgress, orderedTotals, unremittedByCourier } from "./dashboard-rules"
import { loadOrdersToAssign } from "./delivery-to-assign"
import { DELIVERY_FIELDS } from "./delivery-service-helpers"
import { computeMonthMargin, loadVariantCosts } from "./procurement-margin"
import { loadVariantSummaries } from "./prospect-query"
import { dueToday, sortWaiting } from "./prospect-rules"
import { listConversations } from "./whatsapp-chat-db"
import { PROSPECTS_MODULE } from "../modules/prospects"

// Lectures du tableau de bord (spec 2026-10-04 tableau-de-bord) : un chargeur
// par bloc, les calculs restent dans les règles partagées avec les pages détaillées.

type Scope = { resolve: (key: string) => any }
const queryOf = (scope: Scope) => scope.resolve(ContainerRegistrationKeys.QUERY)

const courierNames = async (scope: Scope) => {
  const { data } = await queryOf(scope).graph({ entity: "courier", fields: ["id", "name"] })
  return new Map<string, string>(data.map((c: any) => [c.id, c.name]))
}

export const loadToAssign = async (scope: Scope) => {
  const orders = await loadOrdersToAssign(scope)
  return { count: orders.length, redeliver: orders.filter((o) => o.redeliver).length }
}

export const loadInProgress = async (scope: Scope, today: string) => {
  const { data } = await queryOf(scope).graph({
    entity: "delivery",
    fields: ["id", "status", "tour_date"],
    filters: { status: "assigned" },
  })
  return countInProgress(data, today)
}

export const loadCourierMoney = async (scope: Scope) => {
  const query = queryOf(scope)
  const { data: deliveries } = await query.graph({
    entity: "delivery",
    fields: DELIVERY_FIELDS,
    filters: { status: ["delivered", "failed", "shipped"] },
  })
  const { data: settlements } = await query.graph({ entity: "courier_settlement", fields: ["courier_id", "day"] })
  const names = await courierNames(scope)
  const couriers = unremittedByCourier(deliveries, settlements)
    .map((c) => ({ id: c.courier_id, name: names.get(c.courier_id) ?? "Livreur supprimé", amount: c.amount, days: c.days }))
    .sort((a, b) => b.amount - a.amount)
  return { total: couriers.reduce((s, c) => s + c.amount, 0), couriers }
}

export const loadProspects = async (scope: Scope, today: string) => {
  const svc = scope.resolve(PROSPECTS_MODULE) as any
  const all = await svc.listProspects({})
  const waitingIds = [
    ...new Set(all.filter((p: any) => p.status === "waiting_stock" && p.variant_id).map((p: any) => p.variant_id)),
  ] as string[]
  const { availability } = await loadVariantSummaries(queryOf(scope), waitingIds)
  const due = dueToday(all, today)
  return {
    due: due.length,
    overdue: due.filter((p) => p.overdue).length,
    back_in_stock: sortWaiting(all, availability).filter((p) => p.available === true).length,
  }
}

export const loadConversations = async () => {
  const conversations = await listConversations()
  if (!conversations) throw new Error("base du chat indisponible")
  return { awaiting: conversations.filter((c) => c.awaitingReply).length }
}

export const loadOrdered = async (scope: Scope, today: string, month: string) => {
  const { data } = await queryOf(scope).graph({
    entity: "order",
    // items / summary / shipping_methods en entier, sinon total vaut 0 (piège connu).
    fields: ["id", "status", "created_at", "total", "items.*", "summary.*", "shipping_methods.*"],
    filters: { created_at: { $gte: new Date(`${month}-01T00:00:00Z`) } },
  })
  return orderedTotals(data, today, month)
}

export const loadCashFigures = async (scope: Scope, today: string, month: string) => {
  const entries = await loadAllEntries(scope)
  const summary = summarizeMonth(entries, month)
  const balance = entries.reduce((s: number, e: any) => s + (e.direction === "in" ? e.amount : -e.amount), 0)
  return {
    collected: collectedTotals(entries, today, month),
    cash: { balance, month_in: summary.income, month_out: summary.expenses },
  }
}

export const loadMargin = async (scope: Scope, month: string) =>
  computeMonthMargin(scope, month, await loadVariantCosts(scope))

export const loadCourierStock = async (scope: Scope) => {
  const { data } = await queryOf(scope).graph({
    entity: "courier_stock_movement",
    fields: ["courier_id", "inventory_item_id", "quantity"],
  })
  const names = await courierNames(scope)
  const couriers = Object.entries(balances(data))
    .map(([id, items]) => ({ id, name: names.get(id) ?? "Livreur supprimé", quantity: Object.values(items).reduce((s, q) => s + q, 0) }))
    .filter((c) => c.quantity !== 0)
    .sort((a, b) => b.quantity - a.quantity)
  return { total: couriers.reduce((s, c) => s + c.quantity, 0), couriers }
}
