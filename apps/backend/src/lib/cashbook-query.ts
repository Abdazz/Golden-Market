import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Lecture de toutes les écritures du journal (volume modeste : quelques
// milliers par an) - le solde se calcule depuis le début.
export const CASH_FIELDS = ["id", "date", "direction", "amount", "category", "label", "note", "source", "reference", "order_id"]

export async function loadAllEntries(scope: { resolve: (key: string) => any }) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "cash_entry", fields: CASH_FIELDS })
  return data as any[]
}
