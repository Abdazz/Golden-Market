import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import type { HeroFeatured } from "@modules/home/components/hero"
import TrustBand from "@modules/home/components/trust-band"
import CategoryGrid from "@modules/home/components/category-grid"
import { listCollections } from "@lib/data/collections"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getProductPrice } from "@lib/util/get-product-price"

export const metadata: Metadata = {
  title: "Golden Market",
  description:
    "Golden Market : la marketplace des bonnes affaires au Burkina Faso.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const [{ collections }, featuredList] = await Promise.all([
    listCollections({ fields: "id, handle, title" }),
    listProducts({
      countryCode,
      queryParams: { limit: 1, fields: "*variants.calculated_price" },
    }),
  ])

  if (!collections || !region) {
    return null
  }

  // L'API /store/collections ne garantit aucun ordre stable (ni par date de
  // création, ni alphabétique - constaté en production) : "Vente express"
  // doit toujours précéder "Vente sur commande" sur la page d'accueil,
  // donc on l'impose explicitement plutôt que de dépendre de l'ordre reçu.
  // Les autres collections éventuelles gardent leur ordre relatif d'origine.
  const COLLECTION_HANDLE_PRIORITY: Record<string, number> = {
    "vente-express": 0,
    "vente-sur-commande": 1,
  }
  const sortedCollections = [...collections].sort((a, b) => {
    const priorityA = COLLECTION_HANDLE_PRIORITY[a.handle] ?? Infinity
    const priorityB = COLLECTION_HANDLE_PRIORITY[b.handle] ?? Infinity
    return priorityA - priorityB
  })

  const featuredProduct = featuredList.response.products[0]
  let featured: HeroFeatured | null = null
  if (featuredProduct) {
    const { cheapestPrice } = getProductPrice({ product: featuredProduct })
    featured = {
      title: featuredProduct.title,
      handle: featuredProduct.handle!,
      thumbnail: featuredProduct.thumbnail,
      price: cheapestPrice?.calculated_price ?? null,
      discountLabel:
        cheapestPrice?.price_type === "sale"
          ? `-${cheapestPrice.percentage_diff}%`
          : null,
    }
  }

  return (
    <>
      <Hero featured={featured} />
      <TrustBand />
      <CategoryGrid />
      {sortedCollections.length > 0 && (
        <ul className="flex flex-col">
          <FeaturedProducts collections={sortedCollections} region={region} />
        </ul>
      )}
    </>
  )
}
