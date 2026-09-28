import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { recordPaymentEntries } from "../lib/cashbook-payment"
import { recordAutoEntriesWorkflow } from "../workflows/cash-entries"

// Remboursement -> sortie au journal de caisse (spec 2026-09-28 journal-de-caisse).
export default async function paymentRefundedCashbookHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await recordPaymentEntries(container, event.data.id, "refunded", (entries) =>
    recordAutoEntriesWorkflow(container).run({ input: entries })
  )
}

export const config: SubscriberConfig = {
  event: "payment.refunded",
}
