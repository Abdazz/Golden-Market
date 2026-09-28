import { Module } from "@medusajs/framework/utils"
import CashbookModuleService from "./service"

export const CASHBOOK_MODULE = "cashbook"

export default Module(CASHBOOK_MODULE, { service: CashbookModuleService })
