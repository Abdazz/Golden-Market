// Numéro de commande Golden Market : AAAAMMJJ + compteur du jour sur 3
// chiffres (ex. 20260927001), demandé par le propriétaire le 2026-09-27.
// Stocké dans le champ natif order.custom_display_id (Medusa 2.18) : unique,
// inclus dans la recherche de la liste des commandes de l'admin. Généré à la
// création de chaque commande par l'option generateCustomDisplayId du module
// order (medusa-config.ts) - site, agent WhatsApp, brouillons, "Nouvelle commande".

// Burkina Faso : UTC+0 toute l'année (pas d'heure d'été).
const TIME_ZONE = "Africa/Ouagadougou"

export const formatOrderDay = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}${get("month")}${get("day")}`
}

export const formatOrderNumber = (day: string, counter: number): string =>
  `${day}${String(counter).padStart(3, "0")}`

export type SqlExecutor = {
  execute: (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>
}

// Upsert atomique : deux commandes simultanées ne peuvent jamais recevoir le
// même compteur (le verrou de ligne de l'upsert les sérialise). Doit
// s'exécuter dans la transaction de création de la commande, pour qu'un
// échec de création annule aussi l'incrément. Table créée par
// src/migration-scripts/create-order-daily-counter.ts.
const NEXT_COUNTER_SQL = `
  INSERT INTO order_daily_counter (day, last_value) VALUES (?, 1)
  ON CONFLICT (day) DO UPDATE SET last_value = order_daily_counter.last_value + 1
  RETURNING last_value
`

export const nextOrderNumber = async (executor: SqlExecutor, now: Date = new Date()): Promise<string> => {
  const day = formatOrderDay(now)
  const rows = await executor.execute(NEXT_COUNTER_SQL, [day])
  return formatOrderNumber(day, Number(rows[0].last_value))
}

// Numéro à montrer au client et dans nos écrans : le numéro Golden Market, ou
// le numéro natif pour une commande antérieure non encore renumérotée.
export const orderNumberOf = (order: {
  custom_display_id?: string | null
  display_id?: number | string | null
}): string => order.custom_display_id || String(order.display_id ?? "")
