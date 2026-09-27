import { model } from "@medusajs/framework/utils"

// Versement d'un livreur pour une journée : figé à la validation, verrouille
// les livraisons terminées ce jour-là jusqu'à "Rouvrir la journée".
export const CourierSettlement = model
  .define("courier_settlement", {
    id: model.id({ prefix: "csett" }).primaryKey(),
    courier_id: model.text(),
    day: model.text(), // AAAA-MM-JJ
    expected_amount: model.number(),
    received_amount: model.number(),
    validated_at: model.dateTime(),
    note: model.text().nullable(),
  })
  .indexes([{ on: ["courier_id", "day"], unique: true, where: "deleted_at IS NULL" }])
