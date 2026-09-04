import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

// Doublon trouvé le 2026-09-04 (signalé par le propriétaire, confirmé
// visuellement par comparaison des deux photos produit - même moulage, même
// charnière orange) : "Balais éponse (serpière) à essorage automatique"
// (handle balais-éponse-serpière-à-essorage-automatique, ancien import du
// 30 août, jamais réapprovisionné, manage_inventory=true stock=0 depuis
// l'alignement staging/production du 2026-09-03) est le même produit que
// "Serpillière auto-essorante à éponge" (import du 2 septembre, 100 en
// stock réel). On garde le second (vraie donnée de stock), on supprime le
// premier. Idempotent : ne fait rien si le handle n'existe déjà plus.
const DUPLICATE_HANDLE = "balais-éponse-serpière-à-essorage-automatique"

export default async function deleteDuplicateBalaisEponge({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)

  const [product] = await productModuleService.listProducts({
    handle: DUPLICATE_HANDLE,
  })

  if (!product) {
    logger.info(`Produit "${DUPLICATE_HANDLE}" déjà absent, rien à faire.`)
    return
  }

  await deleteProductsWorkflow(container).run({
    input: { ids: [product.id] },
  })

  logger.info(`Produit doublon "${product.title}" (${product.id}) supprimé.`)
}
