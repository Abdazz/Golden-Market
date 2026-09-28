import { MedusaService } from "@medusajs/framework/utils"
import { SupplierOrder } from "./models/supplier-order"
import { SupplierOrderLine } from "./models/supplier-order-line"
import { VariantCost } from "./models/variant-cost"

export default class ProcurementModuleService extends MedusaService({
  SupplierOrder,
  SupplierOrderLine,
  VariantCost,
}) {}
