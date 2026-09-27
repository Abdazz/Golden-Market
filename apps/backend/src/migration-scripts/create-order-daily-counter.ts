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

  // Les commandes sans numéro reprennent APRÈS le plus grand numéro déjà
  // attribué ce jour-là (numéros existants et compteur) : ce script sert aussi
  // de rattrapage après un déploiement (commandes créées entre la migration et
  // le redémarrage du serveur) - repartir de 001 heurtait l'index unique
  // (constaté sur staging le 2026-09-27).
  await knex.raw(`
    WITH missing AS (
      SELECT id,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDD') AS day,
             row_number() OVER (
               PARTITION BY to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDD')
               ORDER BY created_at, display_id
             ) AS n
      FROM "order"
      WHERE custom_display_id IS NULL
    ),
    base AS (
      SELECT d.day,
             GREATEST(
               COALESCE((SELECT c.last_value FROM order_daily_counter c WHERE c.day = d.day), 0),
               COALESCE((
                 SELECT max(substr(o.custom_display_id, 9)::integer)
                 FROM "order" o
                 WHERE o.custom_display_id ~ '^[0-9]{11,}$'
                   AND substr(o.custom_display_id, 1, 8) = d.day
               ), 0)
             ) AS start
      FROM (SELECT DISTINCT day FROM missing) d
    )
    UPDATE "order" o
    SET custom_display_id = missing.day ||
        CASE WHEN base.start + missing.n < 1000
             THEN lpad((base.start + missing.n)::text, 3, '0')
             ELSE (base.start + missing.n)::text END
    FROM missing JOIN base ON base.day = missing.day
    WHERE o.id = missing.id
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
