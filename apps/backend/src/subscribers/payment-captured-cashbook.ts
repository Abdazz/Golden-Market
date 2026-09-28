import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { recordPaymentEntries } from "../lib/cashbook-payment"
import { recordAutoEntriesWorkflow } from "../workflows/cash-entries"

// Vente encaissée (livraison marquée livrée, "Marquer comme payé", paiement
// en ligne) -> entrée au journal de caisse (spec 2026-09-28 journal-de-caisse).
export default async function paymentCapturedCashbookHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await recordPaymentEntries(container, event.data.id, "captured", (entries) =>
    recordAutoEntriesWorkflow(container).run({ input: entries })
  )
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
