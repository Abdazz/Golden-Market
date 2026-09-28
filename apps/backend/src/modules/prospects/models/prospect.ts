import { model } from "@medusajs/framework/utils"

// Prospect à relancer (spec 2026-09-28 prospects) : client intéressé qui n'a
// pas encore commandé, ou qui attend un produit en rupture de stock.
export const Prospect = model
  .define("prospect", {
    id: model.id({ prefix: "pros" }).primaryKey(),
    phone: model.text(),
    name: model.text().nullable(),
    variant_id: model.text().nullable(),
    product_label: model.text().nullable(),
    status: model.enum(["to_follow_up", "waiting_stock", "converted", "lost"]).default("to_follow_up"),
    follow_up_on: model.text().nullable(), // AAAA-MM-JJ
    last_contacted_at: model.dateTime().nullable(),
    follow_up_count: model.number().default(0),
    note: model.text().nullable(),
    order_id: model.text().nullable(),
  })
  .indexes([{ on: ["phone"] }, { on: ["status"] }])
