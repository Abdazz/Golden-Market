import { model } from "@medusajs/framework/utils"

// Livreur Golden Market : joint par WhatsApp ; se connecte à /livreur avec téléphone + PIN (pin_hash, spec 2026-10-15).
export const Courier = model.define("courier", {
  id: model.id({ prefix: "cour" }).primaryKey(),
  name: model.text(),
  phone: model.text(),
  active: model.boolean().default(true),
  notes: model.text().nullable(),
  pin_hash: model.text().nullable(),
  // PIN chiffré (AES-GCM) : l'équipe doit pouvoir le remettre dans le message d'accès. Jamais exposé au livreur.
  pin_cipher: model.text().nullable(),
})
