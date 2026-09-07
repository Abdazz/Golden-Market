import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Requis par la recherche floue de /store/products-fuzzy-search (opérateur
 * `%` et fonction similarity()) - voir cette route pour le contexte.
 */
export default async function enablePgTrgm({ container }: { container: any }) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm")
}
