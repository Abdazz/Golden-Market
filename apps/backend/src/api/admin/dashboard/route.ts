import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthOf } from "../../../lib/cashbook-rules"
import { settleBlocks } from "../../../lib/dashboard-rules"
import {
  loadCashFigures,
  loadConversations,
  loadCourierMoney,
  loadCourierStock,
  loadInProgress,
  loadMargin,
  loadOrdered,
  loadProspects,
  loadToAssign,
} from "../../../lib/dashboard-query"
import { todayInOuaga } from "../../../lib/delivery-rules"

// Tableau de bord (spec 2026-10-04 tableau-de-bord) : "À faire aujourd'hui"
// et chiffres du jour / du mois. Chaque bloc est indépendant : un bloc en
// échec est renvoyé { available: false } sans empêcher les autres.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const today = todayInOuaga()
  const month = monthOf(new Date())
  const scope = req.scope
  const blocks = await settleBlocks({
    to_assign: () => loadToAssign(scope),
    in_progress: () => loadInProgress(scope, today),
    courier_money: () => loadCourierMoney(scope),
    prospects: () => loadProspects(scope, today),
    conversations: () => loadConversations(),
    ordered: () => loadOrdered(scope, today, month),
    cash_figures: () => loadCashFigures(scope, today, month),
    margin: () => loadMargin(scope, month),
    courier_stock: () => loadCourierStock(scope),
  })
  const cash = blocks.cash_figures
  res.json({
    today,
    month,
    todo: {
      to_assign: blocks.to_assign,
      in_progress: blocks.in_progress,
      courier_money: blocks.courier_money,
      prospects: blocks.prospects,
      conversations: blocks.conversations,
    },
    figures: {
      ordered: blocks.ordered,
      collected: cash.available ? { available: true, ...cash.collected } : { available: false },
      cash: cash.available ? { available: true, ...cash.cash } : { available: false },
      margin: blocks.margin,
      courier_stock: blocks.courier_stock,
    },
  })
}
