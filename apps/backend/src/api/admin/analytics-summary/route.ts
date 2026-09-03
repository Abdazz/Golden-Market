import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { fetchAnalyticsSummary } from "../../../lib/matomo-reporting"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const summary = await fetchAnalyticsSummary({
    reportingUrl: process.env.MATOMO_REPORTING_URL,
    siteId: process.env.MATOMO_SITE_ID,
    apiToken: process.env.MATOMO_API_TOKEN,
  })

  res.json(summary)
}
