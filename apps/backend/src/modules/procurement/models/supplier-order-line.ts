import { model } from "@medusajs/framework/utils"
import { SupplierOrder } from "./supplier-order"

// Ligne de commande fournisseur : colonnes de la feuille (P. U. A. et fret en
// dollars, transport en F CFA, pub en dollars). unit_cost_xof est figé à la
// réception.
export const SupplierOrderLine = model.define("supplier_order_line", {
  id: model.id({ prefix: "sline" }).primaryKey(),
  variant_id: model.text(),
  title: model.text(),
  quantity: model.number(),
  unit_price_usd: model.float(),
  freight_usd: model.float().default(0),
  transport_xof: model.float().default(0),
  ads_usd: model.float().default(0),
  unit_cost_xof: model.float().nullable(),
  supplier_order: model.belongsTo(() => SupplierOrder, { mappedBy: "lines" }),
})
