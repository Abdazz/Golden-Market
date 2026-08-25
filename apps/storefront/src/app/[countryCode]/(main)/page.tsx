import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import TrustBand from "@modules/home/components/trust-band"
import CategoryGrid from "@modules/home/components/category-grid"
import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

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

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  if (!collections || !region) {
    return null
  }

  const [promoCollection, ...restCollections] = collections

  return (
    <>
      <Hero />
      <TrustBand />
      <CategoryGrid />
      {promoCollection && (
        <ul className="flex flex-col">
          <FeaturedProducts
            collections={[promoCollection]}
            region={region}
            tone="promo"
          />
        </ul>
      )}
      {restCollections.length > 0 && (
        <ul className="flex flex-col">
          <FeaturedProducts collections={restCollections} region={region} />
        </ul>
      )}
    </>
  )
}
