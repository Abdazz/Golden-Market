import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deliveriesToCancel } from "../lib/delivery-rules"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// Commande annulée -> ses livraisons confiées passent "Annulée" tout de suite
// (sinon elles restaient "en cours" au tableau de bord jusqu'à l'ouverture de
// la Tournée, qui garde ce contrôle en filet de sécurité). Jamais bloquant.
export default async function orderCanceledDeliveriesHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "delivery",
      fields: ["id", "status"],
      filters: { order_id: event.data.id },
    })
    const changes = deliveriesToCancel(data)
    if (changes.length) await updateDeliveryWorkflow(container).run({ input: changes })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`Livraisons de la commande ${event.data.id} non annulées (${(error as Error).message})`)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
