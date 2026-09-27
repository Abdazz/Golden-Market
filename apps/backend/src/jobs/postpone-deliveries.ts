import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../modules/delivery"
import { postponeUpdates, todayInOuaga } from "../lib/delivery-rules"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// Chaque nuit (00 h 05, heure de Ouagadougou = UTC) : les livraisons encore
// "Confiées" d'un jour passé sont reportées à la tournée du jour. Lecture
// directe du module, écriture via workflow (règle Medusa). Ne lève jamais :
// un échec est journalisé et retenté la nuit suivante.
export default async function postponeDeliveries(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const svc = container.resolve(DELIVERY_MODULE) as any
    const assigned = await svc.listDeliveries({ status: "assigned" })
    const updates = postponeUpdates(assigned, todayInOuaga())
    if (updates.length) {
      await updateDeliveryWorkflow(container).run({ input: updates })
    }
    logger.info(`Livraisons reportées au ${todayInOuaga()} : ${updates.length}`)
  } catch (error) {
    logger.error(`Report des livraisons échoué : ${(error as Error).message}`)
  }
}

export const config = {
  name: "postpone-deliveries",
  schedule: "5 0 * * *",
}
