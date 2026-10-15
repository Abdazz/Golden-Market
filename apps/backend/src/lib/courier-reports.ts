import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { completeDeliveryWorkflow } from "../workflows/complete-delivery"
import { parseReport, reportBelongsTo, reportState, summarizeDay, wholeAmount, type DeliveryType, type LineState } from "./courier-report-rules"
import { todayInOuaga } from "./delivery-rules"
import { DELIVERY_FIELDS, loadOrders, toTourLine } from "./delivery-service-helpers"
import { finishDelivery } from "./delivery-completion"
import { submitPaymentForm } from "./order-payment-form"

// Rapports des livreurs (spec 2026-10-15 espace-livreur) : lecture de la
// journée et écritures (envoyer, valider, renvoyer). Les écritures de fin de
// livraison passent par le code existant (échec : completeDeliveryWorkflow ;
// validation : submitPaymentForm = marquer payée + livrée).

export type ReportView = {
  id: string
  status: string
  delivered: boolean
  failure_reason: string | null
  amount_collected: number | null
  courier_fee: number | null
  transport_fee: number | null
  return_reason: string | null
  submitted_at: string
}
export type ReportLine = ReturnType<typeof toTourLine> & { state: LineState; report: ReportView | null }

const svcOf = (scope: any) => scope.resolve(DELIVERY_MODULE) as DeliveryModuleService

// Verrou par clé : deux validations (ou une validation et un renvoi) du même
// rapport ne s'exécutent jamais en même temps. Le délai (30 s) sert aussi
// d'expiration du verrou dans le fournisseur en mémoire : la validation (caisse,
// paiement, clôture, synchronisation WhatsApp/Meta) peut dépasser 10 s.
const withLock = <T>(scope: any, key: string, job: () => Promise<T>): Promise<T> =>
  scope.resolve(Modules.LOCKING).execute(key, job, { timeout: 30 }) as Promise<T>

// Journée du livreur déjà validée : plus aucune livraison ne peut être terminée
// (même règle que prepareCompletionStep).
async function assertDayOpen(svc: DeliveryModuleService, courierId: string) {
  const [locked] = await svc.listCourierSettlements({ courier_id: courierId, day: todayInOuaga() })
  if (locked) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Journée déjà validée : rouvrez-la pour modifier.")
}

const toView = (r: any): ReportView => ({
  id: r.id,
  status: r.status,
  delivered: r.delivered,
  failure_reason: r.failure_reason ?? null,
  amount_collected: r.amount_collected ?? null,
  courier_fee: r.courier_fee ?? null,
  transport_fee: r.transport_fee ?? null,
  return_reason: r.return_reason ?? null,
  submitted_at: new Date(r.submitted_at).toISOString(),
})

// Livraisons d'un livreur pour un jour : prévues ce jour-là, encore en cours
// (le report nocturne les ramène à aujourd'hui) ou terminées ce jour-là.
export async function loadCourierDay(scope: any, courierId: string, date: string): Promise<ReportLine[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const [{ data: planned }, { data: completed }] = await Promise.all([
    query.graph({ entity: "delivery", fields: DELIVERY_FIELDS, filters: { courier_id: courierId, tour_date: date } }),
    query.graph({ entity: "delivery", fields: DELIVERY_FIELDS, filters: { courier_id: courierId, completed_at: { $gte: start, $lt: end } } }),
  ])
  const byId = new Map<string, any>()
  for (const d of [...planned, ...completed]) byId.set(d.id, d)
  const deliveries = [...byId.values()]
  if (!deliveries.length) return []
  const orders = await loadOrders(scope, deliveries.map((d) => d.order_id))
  const reports = await svcOf(scope).listDeliveryReports({ delivery_id: deliveries.map((d) => d.id) })
  const reportOf = new Map(reports.map((r) => [r.delivery_id, r]))
  return deliveries
    .map((d) => {
      const found = reportOf.get(d.id) ?? null
      const report = reportBelongsTo(d, found) ? found : null
      return { ...toTourLine(d, orders.get(d.order_id)), state: reportState(d, report), report: report ? toView(report) : null }
    })
    .sort((a, b) => String(a.assigned_at).localeCompare(String(b.assigned_at)))
}

// Livreurs à qui des commandes ont été confiées ce jour-là, avec leur synthèse.
export async function listCouriersOfDay(scope: any, date: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const [{ data: planned }, { data: completed }] = await Promise.all([
    query.graph({ entity: "delivery", fields: ["courier_id"], filters: { tour_date: date } }),
    query.graph({ entity: "delivery", fields: ["courier_id"], filters: { completed_at: { $gte: start, $lt: end } } }),
  ])
  const ids = [...new Set([...planned, ...completed].map((d: any) => d.courier_id))] as string[]
  if (!ids.length) return []
  const couriers = await svcOf(scope).listCouriers({ id: ids })
  const out: { courier_id: string; courier_name: string; phone: string; summary: ReturnType<typeof summarizeDay> }[] = []
  for (const c of couriers) {
    const lines = await loadCourierDay(scope, c.id, date)
    if (!lines.length) continue
    out.push({ courier_id: c.id, courier_name: c.name, phone: c.phone, summary: summarizeDay(lines.map((l) => l.state)) })
  }
  return out.sort((a, b) => a.courier_name.localeCompare(b.courier_name, "fr"))
}

// Le livreur envoie (ou corrige) son rapport. « Non » : échec enregistré tout de
// suite (la commande revient à confier, rien à valider). « Oui » : en attente de
// validation de l'équipe.
export function submitCourierReport(scope: any, courierId: string, deliveryId: string, body: Record<string, unknown>) {
  return withLock(scope, `courier-report:${deliveryId}`, () => submitLocked(scope, courierId, deliveryId, body))
}

async function submitLocked(scope: any, courierId: string, deliveryId: string, body: Record<string, unknown>) {
  const svc = svcOf(scope)
  const delivery = await svc.retrieveDelivery(deliveryId).catch(() => null)
  if (!delivery || delivery.courier_id !== courierId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Livraison introuvable.")
  if (delivery.status !== "assigned") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
  const parsed = parseReport(delivery.type as DeliveryType, body)
  if (!parsed.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.message)
  const values = parsed.values
  const [existing] = await svc.listDeliveryReports({ delivery_id: deliveryId })
  if (existing && existing.status !== "submitted" && existing.status !== "returned") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport est déjà traité.")
  }
  let warning: string | null = null
  if (!values.delivered) {
    const { result: completed } = await completeDeliveryWorkflow(scope).run({
      input: { id: deliveryId, status: "failed", failure_reason: values.failure_reason, redeliver: true },
    })
    ;({ warning } = await finishDelivery(scope, completed))
  }
  const data = {
    delivery_id: deliveryId,
    courier_id: courierId,
    status: values.delivered ? "submitted" : "applied",
    delivered: values.delivered,
    failure_reason: values.failure_reason,
    amount_collected: values.amount_collected,
    courier_fee: values.courier_fee,
    transport_fee: values.transport_fee,
    return_reason: null,
    submitted_at: new Date(),
  } as const
  const report = existing ? await svc.updateDeliveryReports({ id: existing.id, ...data }) : await svc.createDeliveryReports(data)
  return { report: toView(report), warning }
}

// Validation d'un rapport « Oui » : tout est figé sauf le montant encaissé d'une
// expédition (le client a payé l'entreprise par Mobile Money, saisi ici).
export function validateCourierReport(scope: any, reportId: string, input: { amount_collected?: unknown }) {
  return withLock(scope, `validate-report:${reportId}`, () => validateLocked(scope, reportId, input))
}

// Le rapport est relu après la prise du verrou.
async function validateLocked(scope: any, reportId: string, input: { amount_collected?: unknown }) {
  const svc = svcOf(scope)
  const report = await svc.retrieveDeliveryReport(reportId).catch(() => null)
  if (!report) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Rapport introuvable.")
  if (report.status !== "submitted" || !report.delivered) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport n'est pas en attente de validation.")
  }
  const delivery = await svc.retrieveDelivery(report.delivery_id)
  if (!reportBelongsTo(delivery, report)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport appartient à un autre livreur.")
  if (delivery.status !== "assigned") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
  await assertDayOpen(svc, delivery.courier_id)
  let amount = report.amount_collected
  if (delivery.type === "expedition") {
    const typed = wholeAmount(input.amount_collected)
    if (typed === null || typed <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Indiquez le montant encaissé (nombre entier positif en F CFA).")
    }
    amount = typed
  }
  if (amount === null || amount === undefined) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Montant encaissé manquant.")
  const { warning } = await submitPaymentForm(
    scope,
    delivery.order_id,
    { amount, courier_fee: report.courier_fee ?? 0, transport_fee: report.transport_fee ?? 0 },
    { delivered: true }
  )
  await svc.updateDeliveryReports({ id: report.id, status: "validated", amount_collected: amount, validated_at: new Date() })
  return { warning }
}

export function returnCourierReport(scope: any, reportId: string, reason: unknown) {
  return withLock(scope, `validate-report:${reportId}`, () => returnLocked(scope, reportId, reason))
}

async function returnLocked(scope: any, reportId: string, reason: unknown) {
  const svc = svcOf(scope)
  const text = typeof reason === "string" ? reason.trim() : ""
  if (!text) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Indiquez le motif du renvoi.")
  const report = await svc.retrieveDeliveryReport(reportId).catch(() => null)
  if (!report) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Rapport introuvable.")
  if (report.status !== "submitted") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport n'est pas en attente de validation.")
  const delivery = await svc.retrieveDelivery(report.delivery_id)
  if (!reportBelongsTo(delivery, report)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport appartient à un autre livreur.")
  if (delivery.status !== "assigned") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
  await svc.updateDeliveryReports({ id: report.id, status: "returned", return_reason: text })
}

export { todayInOuaga }
