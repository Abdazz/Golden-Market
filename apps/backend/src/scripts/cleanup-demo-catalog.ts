import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

// Produits de démo créés par le seed initial du scaffold Medusa
// (migration-scripts/initial-data-seed.ts), jamais nettoyés depuis l'import du
// catalogue réel en Phase 1 — toujours visibles aux côtés des 29 produits réels
// dans le catalogue storefront (voir ROADMAP.md, Phase 1).
const DEMO_PRODUCT_TITLES = [
  "Medusa T-Shirt",
  "Medusa Sweatshirt",
  "Medusa Sweatpants",
  "Medusa Shorts",
]

export default async function cleanupDemoCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)

  const idsToDelete: string[] = []
  for (const title of DEMO_PRODUCT_TITLES) {
    const [existing] = await productModuleService.listProducts({ title })
    if (existing) {
      idsToDelete.push(existing.id)
    }
  }

  if (idsToDelete.length === 0) {
    logger.info("Aucun produit de démo trouvé, rien à faire.")
    return
  }

  await deleteProductsWorkflow(container).run({
    input: { ids: idsToDelete },
  })

  logger.info(`${idsToDelete.length} produit(s) de démo supprimé(s).`)
}
