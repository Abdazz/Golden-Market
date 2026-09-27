import { model } from "@medusajs/framework/utils"

// Une livraison = une tentative (une reprogrammation après échec crée une
// nouvelle tentative). tour_date avance avec le report automatique nocturne.
export const Delivery = model
  .define("delivery", {
    id: model.id({ prefix: "deliv" }).primaryKey(),
    order_id: model.text(),
    courier_id: model.text(),
    tour_date: model.text(), // AAAA-MM-JJ, heure de Ouagadougou
    assigned_at: model.dateTime(),
    completed_at: model.dateTime().nullable(),
    postponed_count: model.number().default(0),
    first_tour_date: model.text(),
    type: model.enum(["express", "expedition"]),
    status: model.enum(["assigned", "delivered", "failed", "shipped", "canceled"]).default("assigned"),
    address: model.text().nullable(),
    transport_company: model.text().nullable(),
    destination_city: model.text().nullable(),
    parcel_reference: model.text().nullable(),
    failure_reason: model.text().nullable(),
    redeliver: model.boolean().default(false),
    amount_to_collect: model.number().default(0),
    amount_collected: model.number().nullable(),
    courier_fee: model.number().nullable(),
    transport_fee: model.number().nullable(),
    whatsapp_status: model.enum(["pending", "sent", "failed"]).default("pending"),
    whatsapp_error: model.text().nullable(),
    sync_warning: model.text().nullable(),
  })
  .indexes([
    { on: ["order_id"] },
    { on: ["courier_id", "tour_date"] },
    { on: ["status"] },
  ])
