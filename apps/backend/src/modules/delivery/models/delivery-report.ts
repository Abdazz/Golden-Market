import { model } from "@medusajs/framework/utils"

// Rapport du livreur sur une livraison (spec 2026-10-15 espace-livreur).
// submitted : « Oui » en attente de validation ; returned : renvoyé pour
// correction ; validated : validé par l'équipe ; applied : « Non » appliqué
// sans validation (échec de livraison enregistré).
export const DeliveryReport = model
  .define("delivery_report", {
    id: model.id({ prefix: "drep" }).primaryKey(),
    delivery_id: model.text().unique(),
    courier_id: model.text(),
    status: model.enum(["submitted", "returned", "validated", "applied"]).default("submitted"),
    delivered: model.boolean(),
    failure_reason: model.text().nullable(),
    amount_collected: model.number().nullable(),
    courier_fee: model.number().nullable(),
    transport_fee: model.number().nullable(),
    return_reason: model.text().nullable(),
    // Commentaire facultatif du livreur (rapport « Oui »).
    comment: model.text().nullable(),
    submitted_at: model.dateTime(),
    validated_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["courier_id"] }, { on: ["status"] }])
