import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { completeDeliveryWorkflow } from "../workflows/complete-delivery"
import { parseReport, reportBelongsTo, reportState, summarizeDay, wholeAmount, type DeliveryType, type LineState } from "./courier-report-rules"
import { todayInOuaga } from "./delivery-rules"
import { DELIVERY_FIELDS, loadOrders, toTourLine } from "./delivery-service-helpers"
import { finishDelivery } from "./delivery-completion"
import { paymentFormDefaults, recordedPayment, submitPaymentForm } from "./order-payment-form"

// Rapports des livreurs (spec 2026-10-15 espace-livreur) : lecture de la
// journée et écritures (envoyer, valider, renvoyer). Les écritures de fin de
// livraison passent par le code existant (échec et validation :
// completeDeliveryWorkflow + finishDelivery ; paiement : submitPaymentForm).

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

// Verrou d'une livraison : l'envoi du livreur, la validation, le renvoi et le
// changement de livreur (api/admin/deliveries/[id]/reassign) prennent la même
// clé, aucun ne s'exécute pendant un autre sur la même livraison. Le délai
// (30 s) sert aussi d'expiration du verrou dans le fournisseur en mémoire : la
// validation (caisse, paiement, clôture, synchronisation WhatsApp/Meta) peut
// dépasser 10 s.
export const withDeliveryLock = <T>(scope: any, deliveryId: string, job: () => Promise<T>): Promise<T> =>
  scope.resolve(Modules.LOCKING).execute(`courier-report:${deliveryId}`, job, { timeout: 30 }) as Promise<T>

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
  return withDeliveryLock(scope, deliveryId, () => submitLocked(scope, courierId, deliveryId, body))
}

async function submitLocked(scope: any, courierId: string, deliveryId: string, body: Record<string, unknown>) {
  const svc = svcOf(scope)
  const delivery = await svc.retrieveDelivery(deliveryId).catch(() => null)
  if (!delivery || delivery.courier_id !== courierId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Livraison introuvable.")
  if (delivery.status !== "assigned") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
  const parsed = parseReport(delivery.type as DeliveryType, body, { amountToCollect: Number(delivery.amount_to_collect ?? 0) })
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

// Validation et renvoi : le rapport est lu une première fois pour trouver sa
// livraison, puis relu (et revérifié) une fois le verrou de la livraison pris.
async function withReportLock<T>(scope: any, reportId: string, job: () => Promise<T>): Promise<T> {
  const found = await svcOf(scope).retrieveDeliveryReport(reportId).catch(() => null)
  if (!found) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Rapport introuvable.")
  return withDeliveryLock(scope, found.delivery_id, job)
}

// Validation d'un rapport « Oui ». Livraison Ouaga à encaisser : le montant du
// livreur est l'encaissement (paiement, caisse et versement du soir). Sinon le
// livreur n'a rien encaissé (amount_collected 0 sur la livraison, rien à
// reverser) :
// - expédition : le client paie l'entreprise par Mobile Money ; montant saisi
//   ici = paiement enregistré, vide ou 0 = pas encore payé (la commande
//   apparaît dans « Expéditions à faire payer ») ;
// - Ouaga déjà payée (montant à encaisser 0) : un paiement déjà enregistré
//   reste tel quel, sinon le total de la commande est enregistré.
export function validateCourierReport(scope: any, reportId: string, input: { amount_collected?: unknown }) {
  return withReportLock(scope, reportId, () => validateLocked(scope, reportId, input))
}

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim())

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
  const fees = { courier_fee: report.courier_fee ?? 0, transport_fee: report.transport_fee ?? 0 }
  const isExpedition = delivery.type === "expedition"

  if (!isExpedition && Number(delivery.amount_to_collect ?? 0) > 0) {
    const amount = report.amount_collected
    if (amount === null || amount === undefined) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Montant encaissé manquant.")
    const { warning } = await submitPaymentForm(
      scope,
      delivery.order_id,
      { amount, ...fees },
      // La validation d'un rapport remplace l'enregistrement du paiement même au-delà du délai de 24 h.
      { delivered: true, skipEditWindow: true }
    )
    await svc.updateDeliveryReports({ id: report.id, status: "validated", amount_collected: amount, validated_at: new Date() })
    return { warning }
  }

  // Vente à enregistrer (null : le paiement n'est pas touché).
  let sale: number | null = null
  if (isExpedition) {
    if (!isBlank(input.amount_collected)) {
      const typed = wholeAmount(input.amount_collected)
      if (typed === null) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Montant encaissé invalide : nombre entier en F CFA (vide si pas encore payé).")
      }
      sale = typed > 0 ? typed : null
    }
  } else if (!(await recordedPayment(scope, delivery.order_id))) {
    const amount = (await paymentFormDefaults(scope, delivery.order_id))?.amount ?? 0
    sale = amount > 0 ? amount : null
  }
  // Paiement d'abord (écritures finales de la caisse, frais compris) : les
  // frais automatiques de la livraison terminée ensuite sont alors ignorés
  // (hasFinalPaymentEntries), rien n'est inscrit deux fois.
  if (sale !== null) {
    await submitPaymentForm(scope, delivery.order_id, { amount: sale, ...fees }, { delivered: false, skipEditWindow: true })
  }
  const { result: completed } = await completeDeliveryWorkflow(scope).run({
    input: {
      id: delivery.id,
      status: "delivered",
      amount_collected: 0,
      courier_fee: fees.courier_fee,
      transport_fee: isExpedition ? fees.transport_fee : null,
    },
  })
  const { warning } = await finishDelivery(scope, completed)
  await svc.updateDeliveryReports({ id: report.id, status: "validated", amount_collected: sale ?? 0, validated_at: new Date() })
  return { warning }
}

export function returnCourierReport(scope: any, reportId: string, reason: unknown) {
  return withReportLock(scope, reportId, () => returnLocked(scope, reportId, reason))
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

// Réponse d'erreur des routes de rapport (livreur et admin) : erreurs connues
// avec leur message, toute autre erreur journalisée et masquée.
export function sendReportError(scope: any, res: any, error: unknown, context: string) {
  const known = [MedusaError.Types.NOT_FOUND, MedusaError.Types.NOT_ALLOWED, MedusaError.Types.INVALID_DATA] as string[]
  // isMedusaError : une erreur levée dans une étape de workflow revient sans sa classe.
  if (MedusaError.isMedusaError(error) && known.includes(error.type)) {
    res.status(error.type === MedusaError.Types.NOT_FOUND ? 404 : 400).json({ message: error.message })
    return
  }
  scope.resolve(ContainerRegistrationKeys.LOGGER).error(`${context} : ${(error as Error).message}`)
  res.status(500).json({ message: "Une erreur est survenue, réessayez." })
}

export { todayInOuaga }
