import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import DeliveryModule from "../modules/delivery"

// Une commande -> plusieurs livraisons (une par tentative).
export default defineLink(OrderModule.linkable.order, {
  linkable: DeliveryModule.linkable.delivery,
  isList: true,
})
