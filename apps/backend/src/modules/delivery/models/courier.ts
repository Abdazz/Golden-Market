import { model } from "@medusajs/framework/utils"

// Livreur Golden Market : pas de compte, joint uniquement par WhatsApp
// (spec 2026-09-28 livreurs-livraisons).
export const Courier = model.define("courier", {
  id: model.id({ prefix: "cour" }).primaryKey(),
  name: model.text(),
  phone: model.text(),
  active: model.boolean().default(true),
  notes: model.text().nullable(),
})
