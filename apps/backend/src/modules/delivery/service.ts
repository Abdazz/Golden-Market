import { MedusaService } from "@medusajs/framework/utils"
import { Courier } from "./models/courier"
import { CourierSettlement } from "./models/courier-settlement"
import { CourierStockMovement } from "./models/courier-stock-movement"
import { Delivery } from "./models/delivery"

export default class DeliveryModuleService extends MedusaService({
  Courier,
  Delivery,
  CourierSettlement,
  CourierStockMovement,
}) {}
