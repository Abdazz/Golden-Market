import { validateAndTransformBody } from "@medusajs/framework"
import type { MiddlewareRoute } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

// Saisie manuelle du journal de caisse (spec 2026-09-28 journal-de-caisse) :
// forme validée ici, cohérence sens / catégorie dans parseManualEntry.
export const ManualEntrySchema = z.object({
  direction: z.enum(["in", "out"]),
  category: z.enum(["purchase", "advertising", "other_out", "opening_balance", "other_in"]),
  amount: z.number().int("Montant invalide : nombre entier en F CFA.").positive("Le montant doit être positif."),
  label: z.string().trim().min(1, "Indiquez un libellé."),
  note: z.string().nullish(),
  date: z.string().nullish(),
})
export type ManualEntrySchema = z.infer<typeof ManualEntrySchema>

export const cashEntryMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/cash-entries", methods: ["POST"], middlewares: [validateAndTransformBody(ManualEntrySchema)] },
  { matcher: "/admin/cash-entries/:id", methods: ["POST"], middlewares: [validateAndTransformBody(ManualEntrySchema)] },
]
