import { validateAndTransformBody } from "@medusajs/framework"
import type { MiddlewareRoute } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

// Prospects (spec 2026-09-28 prospects) : forme validée ici, contenu par
// parseProspect (numéro normalisé, date de relance).
export const ProspectSchema = z.object({
  phone: z.string().min(1, "Numéro WhatsApp obligatoire."),
  name: z.string().nullish(),
  variant_id: z.string().nullish(),
  product_label: z.string().nullish(),
  status: z.enum(["to_follow_up", "waiting_stock"]).optional(),
  follow_up_on: z.string().nullish(),
  note: z.string().nullish(),
})
export type ProspectSchema = z.infer<typeof ProspectSchema>

export const FollowUpSchema = z.object({ next_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() })
export type FollowUpSchema = z.infer<typeof FollowUpSchema>

export const StatusSchema = z.object({ status: z.enum(["to_follow_up", "waiting_stock", "lost"]) })
export type StatusSchema = z.infer<typeof StatusSchema>

export const prospectMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/prospects", methods: ["POST"], middlewares: [validateAndTransformBody(ProspectSchema)] },
  { matcher: "/admin/prospects/:id", methods: ["POST"], middlewares: [validateAndTransformBody(ProspectSchema)] },
  { matcher: "/admin/prospects/:id/follow-up", methods: ["POST"], middlewares: [validateAndTransformBody(FollowUpSchema)] },
  { matcher: "/admin/prospects/:id/status", methods: ["POST"], middlewares: [validateAndTransformBody(StatusSchema)] },
]
