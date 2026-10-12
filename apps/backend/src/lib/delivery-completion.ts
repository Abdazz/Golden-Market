import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { feeEntriesFromDelivery } from "./cashbook-rules"
import { orderNumberOf } from "./order-number"
import { recordAutoEntriesWorkflow } from "../workflows/cash-entries"
import { hasFinalPaymentEntries } from "./order-payment-form"
import { combineWarnings, itemLabel, STOCK_WARNING } from "./courier-stock-rules"
import { takeDeliveryStockWorkflow } from "../workflows/courier-stock"
import { syncOrderAfterDelivery } from "./delivery-order-sync"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// Suites d'une livraison terminée (Livrée / Échec / Déposée à la gare) :
// répercussion sur la commande (paiement, "Fulfillment"), déstockage du
// livreur, frais au journal de caisse. Partagé par la tournée du jour
// (POST /admin/deliveries/:id/complete) et le formulaire "Marquer comme payée"
// coché "Livrée" (lib/order-payment-form.ts). Jamais bloquant : un échec est
// enregistré comme avertissement sur la livraison.
export async function finishDelivery(scope: any, delivery: any) {
  let syncWarning: string | null = null
  if (delivery.status === "delivered" || delivery.status === "shipped") {
    syncWarning = await syncOrderAfterDelivery(scope, {
      orderId: delivery.order_id,
      status: delivery.status,
      collected: delivery.amount_collected ?? 0,
    })
  }

  // Stock confié au livreur (spec 2026-09-28 stock-livreurs) : il déstocke ce
  // qu'il détient. Jamais bloquant ; une seconde exécution ne déstocke rien.
  let stockWarning: string | null = null
  let stockTaken: { label: string; quantity: number }[] = []
  if (delivery.status === "delivered" || delivery.status === "shipped") {
    let taken: { inventory_item_id: string; quantity: number }[] = []
    try {
      const { result } = await takeDeliveryStockWorkflow(scope).run({ input: { delivery_id: delivery.id } })
      taken = result as any[]
    } catch (error) {
      stockWarning = STOCK_WARNING
      scope.resolve(ContainerRegistrationKeys.LOGGER).error(
        `Stock livreur : livraison ${delivery.id} non déstockée (${(error as Error).message})`
      )
    }
    // Libellés des articles déstockés : le déstockage a eu lieu, un échec de
    // lecture ne donne que le libellé « Article », sans avertissement de stock.
    let labels: Record<string, string> = {}
    if (taken.length) {
      try {
        const query = scope.resolve(ContainerRegistrationKeys.QUERY)
        const { data: items } = await query.graph({
          entity: "inventory_item",
          fields: ["id", "title", "sku", "variants.title", "variants.product.title"],
          filters: { id: taken.map((m) => m.inventory_item_id) },
        })
        labels = Object.fromEntries(items.map((i: any) => [i.id, itemLabel(i)]))
      } catch (error) {
        scope.resolve(ContainerRegistrationKeys.LOGGER).error(
          `Stock livreur : libellés des articles de la livraison ${delivery.id} illisibles (${(error as Error).message})`
        )
      }
    }
    stockTaken = taken.map((m) => ({ label: labels[m.inventory_item_id] ?? "Article", quantity: -m.quantity }))
  }

  // La livraison est déjà terminée : un échec d'inscription de l'avertissement
  // est journalisé, sans erreur 500 ni journal de caisse sauté.
  const warning = combineWarnings(syncWarning, stockWarning)
  if (warning) {
    try {
      await updateDeliveryWorkflow(scope).run({ input: { id: delivery.id, sync_warning: warning } })
    } catch (error) {
      scope.resolve(ContainerRegistrationKeys.LOGGER).error(
        `Livraison ${delivery.id} : avertissement non enregistré (${(error as Error).message})`
      )
    }
  }

  // Frais livreur / compagnie -> sorties du journal de caisse (spec
  // 2026-09-28 journal-de-caisse). Jamais bloquant pour la livraison.
  let courierName: string | null = null
  try {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [courier],
    } = await query.graph({ entity: "courier", fields: ["name"], filters: { id: delivery.courier_id } })
    const {
      data: [order],
    } = await query.graph({ entity: "order", fields: ["id", "custom_display_id", "display_id"], filters: { id: delivery.order_id } })
    courierName = courier?.name ?? null
    // Commande déjà marquée payée avec le formulaire : ses frais font foi.
    const entries = (await hasFinalPaymentEntries(scope, delivery.order_id))
      ? []
      : feeEntriesFromDelivery(delivery, courier?.name ?? null, order ? orderNumberOf(order) : null)
    if (entries.length) await recordAutoEntriesWorkflow(scope).run({ input: entries })
  } catch (error) {
    scope.resolve(ContainerRegistrationKeys.LOGGER).error(
      `Journal de caisse : frais de la livraison ${delivery.id} non inscrits (${(error as Error).message})`
    )
  }

  return { warning, stockWarning, stockTaken, courierName }
}
