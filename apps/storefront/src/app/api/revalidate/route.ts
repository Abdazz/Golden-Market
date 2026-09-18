import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

/**
 * Appelé par le subscriber Medusa price-updated-storefront-revalidate.ts à
 * chaque changement de prix (défaut ou override de price list) - sans ça, le
 * cache "products" (force-cache, sans expiration) reste figé jusqu'au
 * prochain redéploiement du storefront.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-revalidate-secret")

  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 })
  }

  revalidateTag("products")

  return NextResponse.json({ revalidated: true })
}
