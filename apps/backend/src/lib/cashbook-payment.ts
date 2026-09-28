import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { NewEntry } from "./cashbook-rules"
import { refundEntriesFromPayment, saleEntriesFromPayment } from "./cashbook-rules"
import { orderNumberOf } from "./order-number"

// Inscrit au journal de caisse les encaissements et remboursements d'un
// paiement (abonnés payment.captured / payment.refunded, spec 2026-09-28
// journal-de-caisse). Ne lève jamais : un échec n'empêche pas le paiement.
export async function recordPaymentEntries(
  container: { resolve: (key: string) => any },
  paymentId: string,
  kind: "captured" | "refunded",
  record: (entries: NewEntry[]) => Promise<unknown>
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [payment],
    } = await query.graph({
      entity: "payment",
      fields: [
        "id",
        "captures.*",
        "refunds.*",
        "payment_collection.order.id",
        "payment_collection.order.custom_display_id",
        "payment_collection.order.display_id",
      ],
      filters: { id: paymentId },
    })
    if (!payment) return
    const order = payment.payment_collection?.order
    const ref = { orderId: order?.id ?? null, orderNumber: order ? orderNumberOf(order) : null }
    const entries = kind === "captured" ? saleEntriesFromPayment(payment, ref) : refundEntriesFromPayment(payment, ref)
    if (entries.length) await record(entries)
  } catch (error) {
    logger.error(`Journal de caisse : paiement ${paymentId} non inscrit (${(error as Error).message})`)
  }
}
