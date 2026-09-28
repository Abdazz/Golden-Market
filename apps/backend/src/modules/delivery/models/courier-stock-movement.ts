import { model } from "@medusajs/framework/utils"

// Mouvement du stock confié à un livreur (spec 2026-09-28 stock-livreurs) :
// solde = somme des quantités (signées). Une livraison ne déstocke qu'une
// fois un article (index unique partiel).
export const CourierStockMovement = model
  .define("courier_stock_movement", {
    id: model.id({ prefix: "cstk" }).primaryKey(),
    courier_id: model.text(),
    inventory_item_id: model.text(),
    quantity: model.number(),
    type: model.enum(["handover", "return", "delivery", "adjustment"]),
    delivery_id: model.text().nullable(),
    order_id: model.text().nullable(),
    note: model.text().nullable(),
  })
  .indexes([
    { on: ["courier_id"] },
    { on: ["delivery_id", "inventory_item_id"], unique: true, where: "delivery_id IS NOT NULL AND deleted_at IS NULL" },
  ])
