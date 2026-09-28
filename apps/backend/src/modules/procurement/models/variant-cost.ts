import { model } from "@medusajs/framework/utils"

// Coût de revient courant d'une variante = coût de la dernière réception
// (hypothèse 2 de la spec 2026-09-28 approvisionnement-marges).
export const VariantCost = model
  .define("variant_cost", {
    id: model.id({ prefix: "vcost" }).primaryKey(),
    variant_id: model.text(),
    unit_cost_xof: model.float(),
    source_line_id: model.text().nullable(),
  })
  .indexes([{ on: ["variant_id"], unique: true, where: "deleted_at IS NULL" }])
