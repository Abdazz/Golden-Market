import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

// Ces 4 catégories viennent de initial-data-seed.ts (données de démo Medusa :
// Shirts/Sweatshirts/Merch/Pants pour un catalogue de vêtements). Elles ne
// correspondent à rien dans le vrai catalogue Golden Market. On ne les
// supprime que si elles sont encore vides, par sécurité.
const DEMO_CATEGORY_NAMES = ["Shirts", "Sweatshirts", "Merch", "Pants"]

const CATEGORIES: { name: string; productHandles: string[] }[] = [
  {
    name: "Électronique et Gadgets",
    productHandles: [
      "montre-connectée",
      "batterie-lithium-aa-rechargeable-intégrée-à-lusb-15-v",
      "lampe-intelligente-sunrise-chargeur-sans-fil-rapide-multifonctionnel-réveil-haut-parleur-bluetooth-lampe-de-nuit-contrôlée-par-app",
      "support-de-téléphone-mobile-et-flexible-à-360",
      "extracteur-de-jus-sans-fil-portable-et-créatif-avec-technologie-dextraction-lente",
    ],
  },
  {
    name: "Maison et Cuisine",
    productHandles: [
      "diffuser-deau-de-cuisine",
      "extension-de-robinet-de-lavabo-à-rotation-de-1080-dégrés",
      "support-roulant-et-presseur-pour-tube-de-dentifrice",
      "mousse-nettoyante-à-multi-usages",
      "balais-éponse-serpière-à-essorage-automatique",
      "lampe-de-table-en-cristal-rechargeable-avec-contrôle-tactile",
      "oreiller-cervical-orthopédique-en-mousse",
      "règle-géométrique-rotative-multifonctionnelle",
    ],
  },
  {
    name: "Beauté et Bien-être",
    productHandles: [
      "coupe-ongles-électrique-automatique",
      "mini-rasoir-électrique-rechargeable-par-usb",
      "détendeur-musculaire-pour-la-colonne-vertébrale-avec-massage-des-épaules",
      "echarpe-chauffante-intelligente",
    ],
  },
  {
    name: "Mode et Bagagerie",
    productHandles: [
      "sac-bandoulière-antivol-permettant-de-recharger-les-téléphones-portables-par-usb",
      "sac-de-voyage-2-en-1-pour-vêtements-et-sac-de-sport",
      "sac-de-voyage-pliable",
    ],
  },
  {
    name: "Jouets et Enfants",
    productHandles: [
      "tablettes-de-jouet-pour-enfants",
      "balle-volante-contrôlée-à-la-main",
    ],
  },
  {
    name: "Équipement commercial et Boucherie",
    productHandles: [
      "caisse-enregistreuse",
      "vitrine-de-boucherie",
      "machine-hachoire-de-viande",
      "machine-de-saucisse",
      "machine-découpeuse-de-saucisse",
      "machine-scie-à-viande",
      "congélateur-commercial",
    ],
  },
]

export default async function seedCategoriesBf({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = container.resolve(Modules.PRODUCT)

  logger.info("Nettoyage des catégories de démo (si toujours vides)...")
  for (const name of DEMO_CATEGORY_NAMES) {
    const [category] = await productModuleService.listProductCategories({ name })
    if (!category) {
      continue
    }

    const { data } = await query.graph({
      entity: "product_category",
      filters: { id: category.id },
      fields: ["id", "products.id"],
    })

    if ((data[0]?.products?.length ?? 0) > 0) {
      logger.warn(
        `Catégorie de démo "${name}" contient des produits, suppression ignorée par sécurité.`
      )
      continue
    }

    await productModuleService.deleteProductCategories([category.id])
    logger.info(`Catégorie de démo "${name}" supprimée.`)
  }

  let linked = 0
  let missing = 0

  for (const { name, productHandles } of CATEGORIES) {
    let [category] = await productModuleService.listProductCategories({ name })

    if (!category) {
      const { result } = await createProductCategoriesWorkflow(container).run({
        input: { product_categories: [{ name, is_active: true }] },
      })
      category = result[0]
      logger.info(`Catégorie créée : "${name}"`)
    } else {
      logger.info(`Catégorie déjà existante, réutilisée : "${name}"`)
    }

    for (const handle of productHandles) {
      const [product] = await productModuleService.listProducts({ handle })

      if (!product) {
        logger.error(`Produit introuvable pour le handle "${handle}", ignoré.`)
        missing += 1
        continue
      }

      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: product.id },
          update: { category_ids: [category.id] },
        },
      })
      linked += 1
    }
  }

  logger.info(
    `Catégorisation terminée : ${linked} produits liés, ${missing} handles introuvables.`
  )
}
