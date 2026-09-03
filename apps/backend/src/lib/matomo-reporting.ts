// Client pour l'API de reporting Matomo (module=API), appelé uniquement
// côté serveur (jamais depuis le navigateur - le jeton d'authentification
// resterait exposé). Utilise API.getBulkRequest pour agréger plusieurs
// rapports en un seul appel HTTP. Voir docs/superpowers/specs/
// 2026-09-02-statistiques-visite-design.md, section "Résumé dans l'admin
// Medusa".
export type MatomoConfig = {
  reportingUrl?: string
  siteId?: string
  apiToken?: string
}

export type AnalyticsSummary =
  | { available: false }
  | {
      available: true
      visitsToday: number
      visitsWeek: number
      topPages: { label: string; visits: number }[]
      topReferrerType: string | null
      conversionRate: string | null
    }

const UNAVAILABLE: AnalyticsSummary = { available: false }

const REQUEST_TIMEOUT_MS = 5000

function buildBulkUrl(siteId: string, index: number, params: Record<string, string>) {
  const query = new URLSearchParams({ idSite: siteId, format: "JSON", ...params })
  return `urls[${index}]=${encodeURIComponent(`?${query.toString()}`)}`
}

export async function fetchAnalyticsSummary(
  config: MatomoConfig,
  fetchImpl: typeof fetch = fetch
): Promise<AnalyticsSummary> {
  const { reportingUrl, siteId, apiToken } = config

  if (!reportingUrl || !siteId || !apiToken) {
    return UNAVAILABLE
  }

  const body = [
    buildBulkUrl(siteId, 0, { method: "VisitsSummary.get", period: "day", date: "today" }),
    buildBulkUrl(siteId, 1, { method: "VisitsSummary.get", period: "week", date: "today" }),
    buildBulkUrl(siteId, 2, {
      method: "Actions.getPageUrls",
      period: "day",
      date: "today",
      flat: "1",
      filter_limit: "5",
    }),
    buildBulkUrl(siteId, 3, { method: "Referrers.getReferrerType", period: "day", date: "today" }),
    buildBulkUrl(siteId, 4, { method: "Goals.get", period: "day", date: "today" }),
  ].join("&")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    // token_auth dans le corps de la requête, pas dans l'URL : une URL avec
    // le jeton finirait en clair dans les journaux d'accès (Apache, proxy
    // Docker, etc.), même en interne au réseau Docker.
    const response = await fetchImpl(
      `${reportingUrl}/index.php?module=API&method=API.getBulkRequest&format=JSON`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `token_auth=${encodeURIComponent(apiToken)}&${body}`,
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      return UNAVAILABLE
    }

    const [visitsDay, visitsWeek, pages, referrers, goals] = (await response.json()) as [
      { value?: number },
      { value?: number },
      { label: string; nb_visits: number }[],
      { label: string; nb_visits: number }[],
      Record<string, { conversion_rate?: string }>
    ]

    const topReferrer = Array.isArray(referrers)
      ? [...referrers].sort((a, b) => b.nb_visits - a.nb_visits)[0]
      : undefined

    return {
      available: true,
      visitsToday: visitsDay?.value ?? 0,
      visitsWeek: visitsWeek?.value ?? 0,
      topPages: Array.isArray(pages)
        ? pages.map((p) => ({ label: p.label, visits: p.nb_visits }))
        : [],
      topReferrerType: topReferrer?.label ?? null,
      conversionRate: goals?.ecommerceOrder?.conversion_rate ?? null,
    }
  } catch {
    return UNAVAILABLE
  } finally {
    clearTimeout(timeout)
  }
}
