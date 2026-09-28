import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { addDays, FOLLOW_UP_DELAY_DAYS } from "../../lib/prospect-rules"
import { todayInOuaga } from "../../lib/delivery-rules"
import { PROSPECTS_MODULE } from "../../modules/prospects"
import type ProspectsModuleService from "../../modules/prospects/service"

// Étapes des prospects (spec 2026-09-28 prospects).

const prospects = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(PROSPECTS_MODULE) as ProspectsModuleService

const snapshot = (p: any) => ({
  id: p.id,
  phone: p.phone,
  name: p.name,
  variant_id: p.variant_id,
  product_label: p.product_label,
  status: p.status,
  follow_up_on: p.follow_up_on,
  last_contacted_at: p.last_contacted_at,
  follow_up_count: p.follow_up_count,
  note: p.note,
  order_id: p.order_id,
})

export type ProspectValues = {
  id?: string
  phone: string
  name: string | null
  variant_id: string | null
  product_label: string | null
  status: "to_follow_up" | "waiting_stock"
  follow_up_on: string | null
  note: string | null
}

// Création, ou mise à jour de la fiche active du même numéro (jamais de doublon).
export const saveProspectStep = createStep(
  "save-prospect",
  async (input: ProspectValues, { container }) => {
    const svc = prospects(container)
    const { id, ...values } = input
    let existing: any = null
    if (id) {
      existing = await svc.retrieveProspect(id)
    } else {
      ;[existing] = await svc.listProspects({ phone: values.phone, status: ["to_follow_up", "waiting_stock"] })
    }
    if (existing) {
      const updated = await svc.updateProspects({ id: existing.id, ...values })
      return new StepResponse(updated, { restore: snapshot(existing), created: null as string | null })
    }
    const created = await svc.createProspects(values)
    return new StepResponse(created, { restore: null as any, created: created.id as string | null })
  },
  async (undo, { container }) => {
    if (!undo) return
    const svc = prospects(container)
    if (undo.created) await svc.deleteProspects(undo.created)
    if (undo.restore) await svc.updateProspects(undo.restore)
  }
)

// "Relancé" : compteur + 1, prochaine relance dans 3 jours (ou date choisie).
export const followUpStep = createStep(
  "follow-up",
  async (input: { id: string; next_on?: string | null }, { container }) => {
    const svc = prospects(container)
    const current = await svc.retrieveProspect(input.id)
    if (current.status === "converted" || current.status === "lost") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce prospect n'est plus à relancer (converti ou perdu).")
    }
    const updated = await svc.updateProspects({
      id: current.id,
      status: "to_follow_up",
      last_contacted_at: new Date(),
      follow_up_count: (current.follow_up_count ?? 0) + 1,
      follow_up_on: input.next_on || addDays(todayInOuaga(), FOLLOW_UP_DELAY_DAYS),
    })
    return new StepResponse(updated, snapshot(current))
  },
  async (previous, { container }) => {
    if (previous) await prospects(container).updateProspects(previous)
  }
)

export const setProspectStatusStep = createStep(
  "set-prospect-status",
  async (input: { id: string; status: "to_follow_up" | "waiting_stock" | "lost" }, { container }) => {
    const svc = prospects(container)
    const current = await svc.retrieveProspect(input.id)
    const updated = await svc.updateProspects({
      id: current.id,
      status: input.status,
      follow_up_on: input.status === "to_follow_up" ? current.follow_up_on ?? addDays(todayInOuaga(), 1) : current.follow_up_on,
    })
    return new StepResponse(updated, snapshot(current))
  },
  async (previous, { container }) => {
    if (previous) await prospects(container).updateProspects(previous)
  }
)

// Conversion automatique à la commande.
export const convertProspectsStep = createStep(
  "convert-prospects",
  async (input: { ids: string[]; order_id: string }, { container }) => {
    const svc = prospects(container)
    if (!input.ids.length) return new StepResponse([], [])
    const previous = await svc.listProspects({ id: input.ids })
    const updated = await svc.updateProspects(input.ids.map((id) => ({ id, status: "converted" as const, order_id: input.order_id })))
    return new StepResponse(updated, previous.map(snapshot))
  },
  async (previous, { container }) => {
    if (previous?.length) await prospects(container).updateProspects(previous)
  }
)
