import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { todayInOuaga } from "../../../../lib/delivery-rules"
import { parseProspect } from "../../../../lib/prospect-rules"
import { saveProspectWorkflow } from "../../../../workflows/prospects"
import type { ProspectSchema } from "../middlewares"

export async function POST(req: AuthenticatedMedusaRequest<ProspectSchema>, res: MedusaResponse) {
  const parsed = parseProspect(req.validatedBody, todayInOuaga())
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  const { result } = await saveProspectWorkflow(req.scope).run({ input: { id: req.params.id, ...parsed.values } })
  res.json({ prospect: result })
}
