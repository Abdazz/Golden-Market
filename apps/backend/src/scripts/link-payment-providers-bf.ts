import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

// Script one-shot, idempotent : lie les nouveaux providers de paiement
// manuels (Moov Money, paiement à la réception) à la région Burkina Faso
// existante. seed-region-bf.ts ne peut pas le faire lui-même : son garde-fou
// d'idempotence retourne dès que la région existe déjà, donc il ne
// retouchera jamais sa liste de payment_providers sur un environnement déjà
// seedé (local/staging/production). Palier 4 (paiements enrichis) du
// backlog du 2026-09-02.
const NEW_PROVIDER_IDS = [
  "pp_orange-money-manual_orange-money-manual",
  "pp_moov-money-manual_moov-money-manual",
  "pp_cash-on-delivery_cash-on-delivery",
]

export default async function linkPaymentProvidersBf({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // region.payment_providers est un lien inter-module (Region <-> Payment),
  // pas une relation native du module Region : il faut passer par le module
  // Query (graph) pour le résoudre, le service de module seul renvoie
  // toujours undefined pour ce champ.
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
    filters: { name: "Burkina Faso" },
  })
  const region = regions[0]

  if (!region) {
    logger.warn(
      "Région Burkina Faso introuvable - exécuter seed-region-bf.ts d'abord."
    )
    return
  }

  const currentIds = (region.payment_providers ?? [])
    .map((p) => p?.id)
    .filter((id): id is string => !!id)
  const missingIds = NEW_PROVIDER_IDS.filter((id) => !currentIds.includes(id))

  if (missingIds.length === 0) {
    logger.info(
      "Tous les providers de paiement sont déjà liés à la région Burkina Faso, rien à faire."
    )
    return
  }

  logger.info(
    `Liaison des providers de paiement manquants (${missingIds.join(", ")}) à la région Burkina Faso...`
  )

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: region.id },
      update: {
        payment_providers: [...currentIds, ...missingIds],
      },
    },
  })

  logger.info("Providers de paiement liés avec succès.")
}
