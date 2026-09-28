import { MedusaService } from "@medusajs/framework/utils"
import { CashEntry } from "./models/cash-entry"

export default class CashbookModuleService extends MedusaService({ CashEntry }) {}
