import { validateAndTransformBody } from "@medusajs/framework"
import type { MiddlewareRoute } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

// Commande fournisseur (spec 2026-09-28 approvisionnement-marges) : forme
// validée ici, contenu des lignes par parseLine (virgule décimale acceptée).
const amount = z.union([z.number(), z.string()]).nullish()

export const DraftSchema = z.object({
  reference: z.string().trim().min(1, "Donnez un nom à la commande (ex. Alibaba 28/09)."),
  supplier: z.string().nullish(),
  exchange_rate: z.union([z.number(), z.string()]).nullish(),
  fee_rate: z.union([z.number(), z.string()]).nullish(),
  note: z.string().nullish(),
  lines: z.array(
    z.object({
      variant_id: z.string(),
      title: z.string().nullish(),
      quantity: amount,
      unit_price_usd: amount,
      freight_usd: amount,
      transport_xof: amount,
      ads_usd: amount,
    })
  ),
})
export type DraftSchema = z.infer<typeof DraftSchema>

export const VariantCostSchema = z.object({
  variant_id: z.string().min(1),
  unit_cost_xof: z.number().positive("Coût invalide : nombre positif en F CFA."),
})
export type VariantCostSchema = z.infer<typeof VariantCostSchema>

export const supplierOrderMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/margins/costs", methods: ["POST"], middlewares: [validateAndTransformBody(VariantCostSchema)] },
  { matcher: "/admin/supplier-orders", methods: ["POST"], middlewares: [validateAndTransformBody(DraftSchema)] },
  { matcher: "/admin/supplier-orders/:id", methods: ["POST"], middlewares: [validateAndTransformBody(DraftSchema)] },
]
