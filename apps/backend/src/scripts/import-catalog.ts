import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createCustomerGroupsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  DEFAULT_CATALOG_PATH,
  ParsedProduct,
  parseCatalog,
} from "./catalog-import/parse-catalog"

const COLLECTION_TITLES: Record<ParsedProduct["collection"], string> = {
  express: "Vente express",
  "sur-commande": "Vente sur commande",
}

const WHOLESALE_GROUP_NAME = "Grossistes"

// Le provider par défaut du module file (file-local) construit ses URLs avec
// "http://localhost:9000/static" en dur, quelle que soit la variable PORT
// (vérifié dans @medusajs/file-local : options?.backend_url || "http://localhost:9000/static").
// Ce projet tourne sur le port 9001 (convention documentée dans AGENTS.md), donc les URLs
// renvoyées par uploadFilesWorkflow pointent vers un port où rien ne sert /static
// et les images des produits seraient cassées. On corrige l'origine ici plutôt que
// dans medusa-config.ts pour rester dans le périmètre de ce script.
function fixImageUrl(url: string): string {
  return url.replace(/^https?:\/\/localhost:\d+/, `http://localhost:${process.env.PORT || 9000}`)
}

async function ensureCollection(container: ExecArgs["container"], title: string) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const [existing] = await productModuleService.listProductCollections({ title })

  if (existing) {
    return existing
  }

  const { result } = await createCollectionsWorkflow(container).run({
    input: { collections: [{ title }] },
  })

  return result[0]
}

async function ensureCustomerGroup(container: ExecArgs["container"], name: string) {
  const customerModuleService = container.resolve(Modules.CUSTOMER)
  const [existing] = await customerModuleService.listCustomerGroups({ name })

  if (existing) {
    return existing
  }

  const { result } = await createCustomerGroupsWorkflow(container).run({
    input: { customersData: [{ name }] },
  })

  return result[0]
}

export default async function importCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const storeModuleService = container.resolve(Modules.STORE)

  logger.info(`Lecture du catalogue depuis ${DEFAULT_CATALOG_PATH}`)
  const parsedProducts = await parseCatalog(DEFAULT_CATALOG_PATH)
  logger.info(`${parsedProducts.length} produits trouvés dans le fichier`)

  const collections = {
    express: await ensureCollection(container, COLLECTION_TITLES.express),
    "sur-commande": await ensureCollection(
      container,
      COLLECTION_TITLES["sur-commande"]
    ),
  }
  const wholesaleGroup = await ensureCustomerGroup(container, WHOLESALE_GROUP_NAME)

  const [store] = await storeModuleService.listStores()
  const defaultSalesChannelId = store.default_sales_channel_id!

  let created = 0
  let skipped = 0
  let failed = 0

  for (const product of parsedProducts) {
    const [existing] = await productModuleService.listProducts({
      title: product.name,
    })

    if (existing) {
      logger.info(`Produit déjà existant, ignoré : "${product.name}"`)
      skipped += 1
      continue
    }

    try {
      const { result: uploadedFiles } = await uploadFilesWorkflow(container).run({
        input: {
          files: [
            {
              filename: `${product.name}.${product.imageExtension}`,
              mimeType: `image/${
                product.imageExtension === "jpg" ? "jpeg" : product.imageExtension
              }`,
              content: product.imageBuffer.toString("base64"),
              access: "public",
            },
          ],
        },
      })
      const imageUrl = fixImageUrl(uploadedFiles[0].url)

      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: product.name,
              description: product.description,
              status: ProductStatus.PUBLISHED,
              collection_id: collections[product.collection].id,
              images: [{ url: imageUrl }],
              thumbnail: imageUrl,
              sales_channels: [{ id: defaultSalesChannelId }],
              options: [{ title: "Title", values: ["Default Title"] }],
              variants: [
                {
                  title: "Default Title",
                  options: { Title: "Default Title" },
                  manage_inventory: false,
                  prices: [
                    { amount: product.retailPrice, currency_code: "xof" },
                    {
                      amount: product.wholesalePrice,
                      currency_code: "xof",
                      rules: { "customer.groups.id": wholesaleGroup.id },
                    },
                  ],
                },
              ],
            },
          ],
        },
      })

      logger.info(`Produit créé : "${product.name}"`)
      created += 1
    } catch (error) {
      logger.error(`Échec de la création du produit "${product.name}"`, error as Error)
      failed += 1
    }
  }

  logger.info(
    `Import terminé : ${created} créés, ${skipped} ignorés (déjà existants), ${failed} en erreur`
  )
}
