import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createCustomerGroupsWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { NewProduct, parseNewProducts } from "./parse-new-products"

// Lot ponctuel de 11 nouveaux produits (2026-09), décisions actées avec le
// propriétaire :
// - tous en collection "Vente express"
// - titre de variante = titre du produit (pas "Default Title")
// - manage_inventory: true (cohérent avec le reste du catalogue)
// - prix de détail = prix affiché ; prix de gros = groupe Grossistes,
//   inchangé par rapport à l'import d'origine
// - "Prix unitaire promo" -> vraie price list Medusa de type "sale" (pas de
//   `rules` sur la liste -> type dérivé automatiquement à "sale" par le
//   module pricing), pour que le badge -X% / prix barré du storefront
//   s'affiche sans rien inventer
// - "Livraison gratuite" -> note informationnelle réelle en metadata,
//   affichée sur la fiche produit ; pas d'automatisation panier (décision
//   explicite : hors périmètre de ce lot)
const CATEGORY_BY_PRODUCT: Record<string, string> = {
  "Aiguiseur de couteaux multifonction 4 en 1": "Maison et Cuisine",
  "Ventilateur solaire rechargeable": "Électronique et Gadgets",
  "Mini presse-agrumes portable": "Maison et Cuisine",
  "Kit nettoyant d'écran de téléphone 2 en 1": "Électronique et Gadgets",
  "Seau à roulettes pliable pour serpillière": "Maison et Cuisine",
  "Cure-oreilles souples en silicone": "Beauté et Bien-être",
  "Roue abdominale automatique avec appui-coudes": "Sport",
  "Serpillière auto-essorante à éponge": "Maison et Cuisine",
  "Pâte nettoyante inox pour ustensiles de cuisine": "Maison et Cuisine",
  "Chargeur complet USB avec câble et boîtier secteur 6A (1m)": "Électronique et Gadgets",
  "Kit cure-oreilles spirale en inox (6 pièces)": "Beauté et Bien-être",
}

const COLLECTION_TITLE = "Vente express"
const WHOLESALE_GROUP_NAME = "Grossistes"
const PRICE_LIST_TITLE = "Lancement — nouveaux produits (2026-09)"

const DEFAULT_NEW_PRODUCTS_PATH =
  process.env.NEW_PRODUCTS_PATH ?? "/app/catalog-data/Golden_Market_New_products.xlsx"

// Même correctif que import-catalog.ts : le provider file-local du module
// file construit ses URLs sur localhost:<PORT par défaut 9000> quel que
// soit le port réel du backend.
function fixImageUrl(url: string): string {
  return url.replace(/^https?:\/\/localhost:\d+/, `http://localhost:${process.env.PORT || 9000}`)
}

async function ensureCollection(container: ExecArgs["container"], title: string) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const [existing] = await productModuleService.listProductCollections({ title })
  if (existing) return existing

  const { result } = await createCollectionsWorkflow(container).run({
    input: { collections: [{ title }] },
  })
  return result[0]
}

async function ensureCustomerGroup(container: ExecArgs["container"], name: string) {
  const customerModuleService = container.resolve(Modules.CUSTOMER)
  const [existing] = await customerModuleService.listCustomerGroups({ name })
  if (existing) return existing

  const { result } = await createCustomerGroupsWorkflow(container).run({
    input: { customersData: [{ name }] },
  })
  return result[0]
}

async function ensureCategory(container: ExecArgs["container"], name: string) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const [existing] = await productModuleService.listProductCategories({ name })
  if (existing) return existing

  const { result } = await createProductCategoriesWorkflow(container).run({
    input: { product_categories: [{ name, is_active: true }] },
  })
  return result[0]
}

export default async function importNewProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const storeModuleService = container.resolve(Modules.STORE)

  logger.info(`Lecture du fichier depuis ${DEFAULT_NEW_PRODUCTS_PATH}`)
  const products: NewProduct[] = await parseNewProducts(DEFAULT_NEW_PRODUCTS_PATH)
  logger.info(`${products.length} produits trouvés dans le fichier`)

  const collection = await ensureCollection(container, COLLECTION_TITLE)
  const wholesaleGroup = await ensureCustomerGroup(container, WHOLESALE_GROUP_NAME)

  const categoryCache = new Map<string, Awaited<ReturnType<typeof ensureCategory>>>()
  for (const categoryName of new Set(Object.values(CATEGORY_BY_PRODUCT))) {
    categoryCache.set(categoryName, await ensureCategory(container, categoryName))
  }

  const [store] = await storeModuleService.listStores()
  const defaultSalesChannelId = store.default_sales_channel_id!

  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfileResult[0]

  let created = 0
  let skipped = 0
  let failed = 0

  // Variantes à traiter par le script séparé de liaison inventaire (créé
  // manuellement après coup, avec les vraies quantités - voir HANDOFF.md).
  const variantsForPriceList: { variantId: string; amount: number }[] = []
  const stockSummary: { product: string; variantId: string; stock: number }[] = []

  for (const product of products) {
    const categoryName = CATEGORY_BY_PRODUCT[product.name]
    if (!categoryName) {
      logger.error(`Aucune catégorie mappée pour "${product.name}", produit ignoré.`)
      failed += 1
      continue
    }
    const category = categoryCache.get(categoryName)!

    const [existing] = await productModuleService.listProducts({ title: product.name })

    if (existing) {
      logger.info(`Produit déjà existant, ignoré : "${product.name}"`)
      skipped += 1

      const [existingVariant] = await productModuleService.listProductVariants({
        product_id: existing.id,
      })
      if (existingVariant) {
        variantsForPriceList.push({ variantId: existingVariant.id, amount: product.promoPrice })
        stockSummary.push({
          product: product.name,
          variantId: existingVariant.id,
          stock: product.stock,
        })
      }
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

      const { result: createdProducts } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: product.name,
              description: product.description,
              status: ProductStatus.PUBLISHED,
              collection_id: collection.id,
              category_ids: [category.id],
              shipping_profile_id: shippingProfile.id,
              images: [{ url: imageUrl }],
              thumbnail: imageUrl,
              sales_channels: [{ id: defaultSalesChannelId }],
              metadata: product.freeShippingNote
                ? { free_shipping_note: product.freeShippingNote }
                : undefined,
              options: [{ title: "Title", values: [product.name] }],
              variants: [
                {
                  title: product.name,
                  options: { Title: product.name },
                  manage_inventory: true,
                  prices: [
                    { amount: product.retailPrice, currency_code: "xof" },
                    {
                      amount: product.wholesalePrice,
                      currency_code: "xof",
                      // @ts-expect-error rules n'apparaît plus dans le type exposé par ce
                      // workflow (@medusajs/framework 2.18.0) mais reste appliqué à
                      // l'exécution - voir le même commentaire dans import-catalog.ts.
                      rules: { "customer.groups.id": wholesaleGroup.id },
                    },
                  ],
                },
              ],
            },
          ],
        },
      })

      const createdVariant = createdProducts[0].variants![0]
      variantsForPriceList.push({ variantId: createdVariant.id, amount: product.promoPrice })
      stockSummary.push({
        product: product.name,
        variantId: createdVariant.id,
        stock: product.stock,
      })

      logger.info(`Produit créé : "${product.name}" (catégorie "${categoryName}")`)
      created += 1
    } catch (error) {
      logger.error(`Échec de la création du produit "${product.name}"`, error as Error)
      failed += 1
    }
  }

  if (variantsForPriceList.length > 0) {
    // FilterablePriceListProps ne filtre pas par titre exact : `q` fait une
    // recherche titre/description, suffisant vu le libellé unique choisi.
    const existingPriceLists = await container
      .resolve(Modules.PRICING)
      .listPriceLists({ q: PRICE_LIST_TITLE })
    const existingPriceList = existingPriceLists.find((pl) => pl.title === PRICE_LIST_TITLE)

    if (existingPriceList) {
      logger.info(
        `Price list "${PRICE_LIST_TITLE}" déjà existante, non recréée (ré-exécution du script).`
      )
    } else {
      await createPriceListsWorkflow(container).run({
        input: {
          price_lists_data: [
            {
              title: PRICE_LIST_TITLE,
              description: "Prix promotionnel de lancement des nouveaux produits",
              status: "active" as any,
              prices: variantsForPriceList.map(({ variantId, amount }) => ({
                variant_id: variantId,
                currency_code: "xof",
                amount,
              })),
            },
          ],
        },
      })
      logger.info(
        `Price list "${PRICE_LIST_TITLE}" créée avec ${variantsForPriceList.length} prix.`
      )
    }
  }

  logger.info(
    `Import terminé : ${created} créés, ${skipped} ignorés (déjà existants), ${failed} en erreur`
  )
  logger.info(
    `Stock réel à lier manuellement (article d'inventaire + emplacement) :\n` +
      stockSummary.map((s) => `  ${s.product} (${s.variantId}) -> ${s.stock}`).join("\n")
  )
}
