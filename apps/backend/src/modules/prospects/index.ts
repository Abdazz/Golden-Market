import { Module } from "@medusajs/framework/utils"
import ProspectsModuleService from "./service"

export const PROSPECTS_MODULE = "prospects"

export default Module(PROSPECTS_MODULE, { service: ProspectsModuleService })
