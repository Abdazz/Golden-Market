import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import type { Category, Direction, NewEntry } from "../../lib/cashbook-rules"
import { CASHBOOK_MODULE } from "../../modules/cashbook"
import type CashbookModuleService from "../../modules/cashbook/service"

// Étapes du journal de caisse (spec 2026-09-28 journal-de-caisse).

const cashbook = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(CASHBOOK_MODULE) as CashbookModuleService

// Écritures automatiques : celles dont la référence existe déjà sont ignorées
// (événement rejoué, capture déjà inscrite).
export const recordAutoEntriesStep = createStep(
  "record-auto-entries",
  async (entries: NewEntry[], { container }) => {
    const svc = cashbook(container)
    const references = entries.map((e) => e.reference).filter((r): r is string => !!r)
    const existing = references.length ? await svc.listCashEntries({ reference: references }) : []
    const known = new Set(existing.map((e) => e.reference))
    const missing = entries.filter((e) => !e.reference || !known.has(e.reference))
    const created = missing.length ? await svc.createCashEntries(missing) : []
    return new StepResponse(created, created.map((e) => e.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await cashbook(container).deleteCashEntries(ids)
  }
)

export type ManualEntryInput = {
  direction: Direction
  category: Category
  amount: number
  label: string
  note: string | null
  date: Date
}

export const createManualEntryStep = createStep(
  "create-manual-entry",
  async (input: ManualEntryInput, { container }) => {
    const entry = await cashbook(container).createCashEntries({ ...input, source: "manual", reference: null, order_id: null })
    return new StepResponse(entry, entry.id)
  },
  async (id, { container }) => {
    if (id) await cashbook(container).deleteCashEntries(id)
  }
)

const assertManual = async (svc: CashbookModuleService, id: string) => {
  const entry = await svc.retrieveCashEntry(id)
  if (entry.source !== "manual") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Écriture automatique : elle suit sa source (vente, livraison) et ne se modifie pas ici."
    )
  }
  return entry
}

export const updateManualEntryStep = createStep(
  "update-manual-entry",
  async (input: ManualEntryInput & { id: string }, { container }) => {
    const svc = cashbook(container)
    const previous = await assertManual(svc, input.id)
    const entry = await svc.updateCashEntries(input)
    return new StepResponse(entry, {
      id: previous.id,
      direction: previous.direction,
      category: previous.category,
      amount: previous.amount,
      label: previous.label,
      note: previous.note,
      date: previous.date,
    })
  },
  async (previous, { container }) => {
    if (previous) await cashbook(container).updateCashEntries(previous)
  }
)

export const deleteManualEntryStep = createStep(
  "delete-manual-entry",
  async (input: { id: string }, { container }) => {
    const svc = cashbook(container)
    await assertManual(svc, input.id)
    await svc.softDeleteCashEntries(input.id)
    return new StepResponse({ id: input.id }, input.id)
  },
  async (id, { container }) => {
    if (id) await cashbook(container).restoreCashEntries(id)
  }
)

// "Marquer comme payée" avec le formulaire de la fiche commande (2026-10-11) :
// les montants saisis sont les seuls retenus par la caisse pour la commande.
// Les écritures automatiques de la commande (vente, frais livreur, frais
// compagnie) et un éventuel formulaire précédent sont mis de côté (suppression
// réversible), puis les écritures du formulaire sont créées.
export const REPLACEABLE_CATEGORIES: Category[] = ["sale", "courier_fee", "transport_fee"]

export const replaceOrderEntriesStep = createStep(
  "replace-order-entries",
  async (input: { order_id: string; entries: NewEntry[] }, { container }) => {
    const svc = cashbook(container)
    const previous = await svc.listCashEntries({
      order_id: input.order_id,
      source: "auto",
      category: REPLACEABLE_CATEGORIES,
    })
    const previousIds = previous.map((e) => e.id)
    if (previousIds.length) await svc.softDeleteCashEntries(previousIds)
    const created = input.entries.length ? await svc.createCashEntries(input.entries) : []
    return new StepResponse(created, { created: created.map((e) => e.id), previous: previousIds })
  },
  async (state, { container }) => {
    if (!state) return
    const svc = cashbook(container)
    if (state.created.length) await svc.deleteCashEntries(state.created)
    if (state.previous.length) await svc.restoreCashEntries(state.previous)
  }
)
