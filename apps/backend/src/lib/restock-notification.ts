import { addDays } from "./prospect-rules"

// Retour en stock (2026-09-28) : message au client qui attendait un produit
// (modèle Meta "retour_en_stock", 4 variables) et mise à jour de sa fiche
// prospect après l'envoi.

const PRODUCT_PATH = "/bf/products/"
const RELANCE_AFTER_RESTOCK_DAYS = 2
const clean = (text: string) => text.replace(/\s+/g, " ").trim()
const formatXof = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount).replace(/ | /g, " ")} F`

export const buildRestockParams = (
  input: { customerName: string | null; productTitle: string; price: number | null; handle: string },
  storefrontUrl: string
): string[] => [
  clean(input.customerName || "Bonjour"),
  clean(input.productTitle),
  input.price !== null && input.price > 0 ? formatXof(input.price) : "voir le site",
  `${storefrontUrl.replace(/\/$/, "")}${PRODUCT_PATH}${encodeURIComponent(input.handle)}`,
]

// Après l'envoi : à relancer dans 2 jours s'il n'a pas commandé entre-temps.
export const restockNotifiedChanges = (
  prospect: { id: string; follow_up_count: number | null; note: string | null },
  today: string,
  now: Date = new Date()
) => ({
  id: prospect.id,
  status: "to_follow_up" as const,
  follow_up_on: addDays(today, RELANCE_AFTER_RESTOCK_DAYS),
  follow_up_count: (prospect.follow_up_count ?? 0) + 1,
  last_contacted_at: now,
  note: `Prévenu du retour en stock le ${today.slice(8, 10)}/${today.slice(5, 7)}.${prospect.note ? ` ${prospect.note}` : ""}`,
})
