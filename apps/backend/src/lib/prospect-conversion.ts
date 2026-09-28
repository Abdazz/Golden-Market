import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { matchProspectsForOrder } from "./prospect-rules"
import { PROSPECTS_MODULE } from "../modules/prospects"

// Conversion automatique (spec 2026-09-28 prospects) : une commande passée
// avec le numéro d'un prospect le marque "converti". Ne lève jamais.
export async function convertProspectsForOrder(
  container: { resolve: (key: string) => any },
  orderId: string,
  convert: (input: { ids: string[]; order_id: string }) => Promise<unknown>
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({ entity: "order", fields: ["id", "shipping_address.phone"], filters: { id: orderId } })
    const phone = order?.shipping_address?.phone
    if (!phone) return
    const candidates = await container.resolve(PROSPECTS_MODULE).listProspects({})
    const matches = matchProspectsForOrder(candidates, phone)
    if (matches.length) await convert({ ids: matches.map((p) => p.id), order_id: orderId })
  } catch (error) {
    logger.error(`Prospects : conversion pour la commande ${orderId} impossible (${(error as Error).message})`)
  }
}
