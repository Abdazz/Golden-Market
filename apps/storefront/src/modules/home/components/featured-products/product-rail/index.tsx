import { listProducts } from "@lib/data/products"
import { isProductAvailable } from "@lib/util/product"
import { HttpTypes } from "@medusajs/types"
import { Heading } from "@modules/common/components/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      // Pas de `fields` ici (volontairement) : un `fields` explicite dans
      // queryParams remplace entièrement le jeu de champs par défaut de
      // `listProducts` (spread après le défaut) au lieu de s'y ajouter -
      // bug réel trouvé en vérifiant un signalement du propriétaire
      // (produits en stock affichés "Rupture de stock" sur la page
      // d'accueil) : l'ancien `fields: "*variants.calculated_price"` ici
      // supprimait silencieusement `+variants.inventory_quantity` (utilisé
      // par `inStock` dans ProductPreview) et `+metadata` (badge livraison
      // gratuite). Le défaut de `listProducts` couvre déjà tout ce dont
      // ProductPreview a besoin.
      // /store/products ne garantit aucun ordre stable par défaut (constaté
      // en production - ni chronologique ni alphabétique). Trier côté API
      // (pas après coup côté client) est indispensable ici : ce rail limite
      // à 12 produits par défaut, une collection peut en contenir bien plus
      // (33 en local) - trier après une pagination déjà tronquée dans un
      // ordre arbitraire n'aurait pas garanti les vrais plus récents.
      order: "-created_at",
      // Assez large pour trouver 12 produits en stock dans la collection
      // avant de remplir avec ceux en rupture (voir RAIL_SIZE plus bas).
      limit: 100,
    },
  })

  if (!pricedProducts) {
    return null
  }

  // Produits en stock d'abord (2026-10-11, demandé par le propriétaire : des
  // produits en rupture s'affichaient dans "Vente express"), du plus récent au
  // plus ancien dans chaque groupe ; ceux en rupture ne complètent le rail que
  // s'il n'y a pas assez de produits en stock.
  const RAIL_SIZE = 12
  const railProducts = [
    ...pricedProducts.filter(isProductAvailable),
    ...pricedProducts.filter((product) => !isProductAvailable(product)),
  ].slice(0, RAIL_SIZE)

  return (
    <div className="py-10 small:py-16">
      <div className="content-container">
        <div className="flex items-baseline justify-between mb-6">
          <Heading level="h2" className="text-2xl">
            {collection.title}
          </Heading>
          <LocalizedClientLink
            href={`/collections/${collection.handle}`}
            className="text-sm font-semibold text-gm-amethyst hover:underline"
          >
            Voir tout
          </LocalizedClientLink>
        </div>
        <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-4">
          {railProducts.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
