import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Numéro de commande Golden Market (AAAAMMJJ + compteur du jour, voir
 * src/lib/order-number.ts) :
 * 1. table du compteur quotidien, incrémentée atomiquement à chaque commande ;
 * 2. numérotation rétroactive des commandes existantes (date puis ordre de
 *    création, heure de Ouagadougou = UTC) ;
 * 3. compteurs repositionnés après le plus grand numéro de chaque jour, pour
 *    que les nouvelles commandes ne réutilisent jamais un numéro existant
 *    (custom_display_id est unique).
 * Exécuté une seule fois par environnement (migration script Medusa).
 */
export default async function createOrderDailyCounter({ container }: { container: any }) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS order_daily_counter (
      day text PRIMARY KEY,
      last_value integer NOT NULL
    )
  `)

  await knex.raw(`
    WITH numbered AS (
      SELECT id,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDD') AS day,
             row_number() OVER (
               PARTITION BY to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDD')
               ORDER BY created_at, display_id
             ) AS n
      FROM "order"
      WHERE custom_display_id IS NULL
    )
    UPDATE "order" o
    SET custom_display_id = numbered.day ||
        CASE WHEN numbered.n < 1000 THEN lpad(numbered.n::text, 3, '0') ELSE numbered.n::text END
    FROM numbered
    WHERE o.id = numbered.id
  `)

  await knex.raw(`
    INSERT INTO order_daily_counter (day, last_value)
    SELECT substr(custom_display_id, 1, 8), max(substr(custom_display_id, 9)::integer)
    FROM "order"
    WHERE custom_display_id ~ '^[0-9]{11,}$'
    GROUP BY 1
    ON CONFLICT (day) DO UPDATE
      SET last_value = GREATEST(order_daily_counter.last_value, EXCLUDED.last_value)
  `)
}
