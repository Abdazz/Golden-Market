import { model } from "@medusajs/framework/utils"

// Écriture du journal de caisse (spec 2026-09-28 journal-de-caisse) : entrée
// ou sortie d'argent, automatique (vente encaissée, remboursement, frais de
// livraison) ou saisie à la main (achats, publicité, solde initial, divers).
// reference : identifiant de la source d'une écriture automatique, unique -
// un événement rejoué ne crée jamais de doublon.
export const CashEntry = model
  .define("cash_entry", {
    id: model.id({ prefix: "cash" }).primaryKey(),
    date: model.dateTime(),
    direction: model.enum(["in", "out"]),
    amount: model.number(),
    category: model.enum([
      "sale",
      "refund",
      "courier_fee",
      "transport_fee",
      "purchase",
      "advertising",
      "opening_balance",
      "other_in",
      "other_out",
    ]),
    label: model.text(),
    note: model.text().nullable(),
    source: model.enum(["auto", "manual"]),
    reference: model.text().nullable(),
    order_id: model.text().nullable(),
  })
  .indexes([
    { on: ["date"] },
    { on: ["reference"], unique: true, where: "reference IS NOT NULL AND deleted_at IS NULL" },
  ])
