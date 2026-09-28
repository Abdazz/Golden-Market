import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, getTotalVariantAvailability } from "@medusajs/framework/utils"
import { todayInOuaga } from "../../../../../lib/delivery-rules"
import { computeAvailability } from "../../../../../lib/meta-catalog-mapping"
import { loadVariantInfos } from "../../../../../lib/procurement-query"
import { buildRestockParams, restockNotifiedChanges } from "../../../../../lib/restock-notification"
import { sendTemplateMessage } from "../../../../../lib/whatsapp-template-sender"
import { PROSPECTS_MODULE } from "../../../../../modules/prospects"
import { applyProspectChangesWorkflow } from "../../../../../workflows/prospects"

// "Prévenir" un client que le produit qu'il attendait est de retour en stock
// (modèle Meta retour_en_stock), puis fiche passée "à relancer" dans 2 jours.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const prospect = await (req.scope.resolve(PROSPECTS_MODULE) as any).retrieveProspect(req.params.id)
  if (prospect.status !== "waiting_stock" || !prospect.variant_id) {
    res.status(400).json({ message: "Ce client n'attend pas un produit précis." })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "manage_inventory", "allow_backorder", "product.handle"],
    filters: { id: prospect.variant_id },
  })
  if (!variant?.product?.handle) {
    res.status(400).json({ message: "Produit introuvable : il a peut-être été supprimé." })
    return
  }
  const stock = await getTotalVariantAvailability(query, { variant_ids: [variant.id] })
  if (computeAvailability(variant, stock[variant.id]?.availability ?? null) !== "in stock") {
    res.status(409).json({ message: "Ce produit est toujours en rupture de stock." })
    return
  }
  const info = (await loadVariantInfos(req.scope)).get(variant.id)
  const productTitle = info ? `${info.product_title}${info.variant_title ? ` - ${info.variant_title}` : ""}` : prospect.product_label ?? "votre produit"
  const sent = await sendTemplateMessage({
    phone: prospect.phone,
    template_name: "retour_en_stock",
    params: buildRestockParams(
      { customerName: prospect.name, productTitle, price: info?.price ?? null, handle: variant.product.handle },
      process.env.STOREFRONT_URL || "https://golden-market.co"
    ),
  })
  if (!sent.ok) {
    res.status(502).json({ message: `Message non envoyé : ${sent.error}` })
    return
  }
  const { result } = await applyProspectChangesWorkflow(req.scope).run({ input: restockNotifiedChanges(prospect, todayInOuaga()) })
  res.json({ prospect: result })
}
