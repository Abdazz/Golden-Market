import { model } from "@medusajs/framework/utils"
import { SupplierOrderLine } from "./supplier-order-line"

// Commande fournisseur (spec 2026-09-28 approvisionnement-marges) : remplace
// la feuille "Sourcing" du fichier Répertoir des commandes.xlsx.
export const SupplierOrder = model.define("supplier_order", {
  id: model.id({ prefix: "sord" }).primaryKey(),
  reference: model.text(),
  supplier: model.text().nullable(),
  status: model.enum(["draft", "ordered", "received", "canceled"]).default("draft"),
  ordered_at: model.dateTime().nullable(),
  received_at: model.dateTime().nullable(),
  exchange_rate: model.float().default(670),
  fee_rate: model.float().default(0.0299),
  note: model.text().nullable(),
  lines: model.hasMany(() => SupplierOrderLine, { mappedBy: "supplier_order" }),
})
