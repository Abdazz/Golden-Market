import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { convertProspectsForOrder } from "../lib/prospect-conversion"
import { convertProspectsWorkflow } from "../workflows/prospects"

// Commande passée par un prospect -> "converti" (spec 2026-09-28 prospects).
export default async function orderPlacedProspectsHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await convertProspectsForOrder(container, event.data.id, (input) => convertProspectsWorkflow(container).run({ input }))
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
