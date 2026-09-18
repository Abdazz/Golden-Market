export type StorefrontRevalidateConfig = {
  storefrontUrl: string
  secret: string
}

/**
 * POST /api/revalidate côté storefront (Next.js Route Handler) - invalide le
 * cache de données produits (`revalidateTag("products")`) pour que les
 * changements de prix (prix par défaut ou override de price list) soient
 * visibles immédiatement, sans attendre le prochain redéploiement du
 * storefront (voir apps/storefront/src/app/api/revalidate/route.ts).
 */
export async function triggerStorefrontRevalidate(
  config: StorefrontRevalidateConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const { storefrontUrl, secret } = config

  if (!storefrontUrl) {
    throw new Error("STOREFRONT_URL non configuré")
  }
  if (!secret) {
    throw new Error("REVALIDATE_SECRET non configuré")
  }

  const response = await fetchImpl(`${storefrontUrl}/api/revalidate`, {
    method: "POST",
    headers: { "x-revalidate-secret": secret },
  })

  if (!response.ok) {
    throw new Error(`Revalidation storefront a répondu ${response.status}`)
  }
}
