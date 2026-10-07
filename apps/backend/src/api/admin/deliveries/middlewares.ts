import { validateAndTransformBody } from "@medusajs/framework"
import type { MiddlewareRoute } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

// Validation des corps des routes livreurs / livraisons / versements
// (spec 2026-09-28 livreurs-livraisons). Les règles qui dépendent de l'état
// (livraison déjà terminée, journée validée...) sont vérifiées dans les
// workflows.
const amount = z.number().int().min(0, "Montant invalide : nombre entier positif en F CFA.")

export const CreateCourierSchema = z.object({
  name: z.string().trim().min(1, "Le nom du livreur est obligatoire."),
  phone: z.string().min(1, "Numéro WhatsApp obligatoire."),
  notes: z.string().nullish(),
})
export type CreateCourierSchema = z.infer<typeof CreateCourierSchema>

export const UpdateCourierSchema = z.object({
  name: z.string().trim().min(1, "Le nom du livreur est obligatoire.").optional(),
  phone: z.string().min(1).optional(),
  notes: z.string().nullish(),
  active: z.boolean().optional(),
})
export type UpdateCourierSchema = z.infer<typeof UpdateCourierSchema>

export const AssignDeliveriesSchema = z.object({
  order_ids: z.array(z.string()).min(1, "Sélectionnez au moins une commande."),
  courier_id: z.string().min(1, "Choisissez un livreur."),
  type: z.enum(["express", "expedition"]).optional(),
  address: z.string().nullish(),
  transport_company: z.string().nullish(),
  destination_city: z.string().nullish(),
  // Montant à encaisser saisi par commande (sinon calculé).
  amounts: z.record(z.string(), amount.max(10_000_000, "Montant trop grand : vérifiez la saisie.")).optional(),
})
export type AssignDeliveriesSchema = z.infer<typeof AssignDeliveriesSchema>

export const CompleteDeliverySchema = z.object({
  status: z.enum(["delivered", "failed", "shipped"]),
  amount_collected: amount.nullish(),
  courier_fee: amount.nullish(),
  transport_fee: amount.nullish(),
  failure_reason: z.string().nullish(),
  redeliver: z.boolean().optional(),
})
export type CompleteDeliverySchema = z.infer<typeof CompleteDeliverySchema>

export const ValidateSettlementSchema = z.object({
  courier_id: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)."),
  received_amount: z.number().int("Montant reçu invalide : nombre entier en F CFA."),
  note: z.string().nullish(),
})
export type ValidateSettlementSchema = z.infer<typeof ValidateSettlementSchema>

export const CourierStockMovementSchema = z.object({
  courier_id: z.string().min(1, "Choisissez un livreur."),
  type: z.enum(["handover", "return", "adjustment"]),
  lines: z
    .array(z.object({ inventory_item_id: z.string().min(1), quantity: z.number().int("Quantité invalide : nombre entier.").min(0).max(10000, "Quantité trop grande (plus de 10 000).") }))
    .min(1, "Ajoutez au moins un produit."),
  note: z.string().nullish(),
})
export type CourierStockMovementSchema = z.infer<typeof CourierStockMovementSchema>

export const deliveryMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/couriers", methods: ["POST"], middlewares: [validateAndTransformBody(CreateCourierSchema)] },
  { matcher: "/admin/couriers/:id", methods: ["POST"], middlewares: [validateAndTransformBody(UpdateCourierSchema)] },
  { matcher: "/admin/deliveries", methods: ["POST"], middlewares: [validateAndTransformBody(AssignDeliveriesSchema)] },
  {
    matcher: "/admin/deliveries/:id/complete",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CompleteDeliverySchema)],
  },
  {
    matcher: "/admin/courier-settlements",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(ValidateSettlementSchema)],
  },
  {
    matcher: "/admin/courier-stock/movements",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CourierStockMovementSchema)],
  },
]
