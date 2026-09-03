import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

type Summary =
  | { available: false }
  | {
      available: true
      visitsToday: number
      visitsWeek: number
      topPages: { label: string; visits: number }[]
      topReferrerType: string | null
      conversionRate: string | null
    }
  | null

// Widget de résumé des statistiques de visite (Matomo self-hosted, voir
// docs/superpowers/specs/2026-09-02-statistiques-visite-design.md). N'appelle
// jamais l'API Matomo directement : passe par la route backend
// /admin/analytics-summary, qui détient seule le jeton d'authentification.
//
// Note technique : n'importe aucun composant de @medusajs/ui (Container,
// Heading, Text) - leurs types entrent en conflit (TS2786, "bigint is not
// assignable to ReactNode") avec le React 19 du monorepo (le peerDependency
// de @medusajs/ui est ^18.3.1, tandis que la racine du monorepo installe
// React 19 pour le storefront Next.js 15). Éléments HTML natifs à la place,
// portant les mêmes classes utilitaires (txt-*, text-ui-fg-*) que le reste
// de l'admin Medusa - rendu visuel identique, sans le conflit de types.
const AnalyticsSummaryWidget = () => {
  const [summary, setSummary] = useState<Summary>(null)

  useEffect(() => {
    fetch("/admin/analytics-summary", { credentials: "include" })
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => setSummary({ available: false }))
  }, [])

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <h2 className="text-ui-fg-base txt-large-plus mb-4">Statistiques de visite</h2>

      {summary === null && <p className="text-ui-fg-subtle">Chargement…</p>}

      {summary && !summary.available && (
        <p className="text-ui-fg-subtle">Statistiques indisponibles pour le moment.</p>
      )}

      {summary?.available && (
        <div className="flex flex-col gap-y-4">
          <div className="flex gap-x-8">
            <div>
              <p className="text-ui-fg-subtle txt-small">Visites aujourd&apos;hui</p>
              <p className="text-ui-fg-base txt-large-plus">{summary.visitsToday}</p>
            </div>
            <div>
              <p className="text-ui-fg-subtle txt-small">Visites cette semaine</p>
              <p className="text-ui-fg-base txt-large-plus">{summary.visitsWeek}</p>
            </div>
            {summary.conversionRate && (
              <div>
                <p className="text-ui-fg-subtle txt-small">Taux de conversion</p>
                <p className="text-ui-fg-base txt-large-plus">{summary.conversionRate}</p>
              </div>
            )}
          </div>

          {summary.topPages.length > 0 && (
            <div>
              <p className="text-ui-fg-subtle txt-small mb-1">Pages les plus vues</p>
              <ul className="flex flex-col gap-y-1">
                {summary.topPages.map((page) => (
                  <li key={page.label} className="flex justify-between txt-compact-small text-ui-fg-base">
                    <span>{page.label}</span>
                    <span className="text-ui-fg-subtle">{page.visits}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.topReferrerType && (
            <p className="text-ui-fg-subtle txt-small">
              Canal dominant : {summary.topReferrerType}
            </p>
          )}

          <a
            href="https://analytics.golden-market.co"
            target="_blank"
            rel="noreferrer"
            className="txt-compact-small text-ui-fg-interactive"
          >
            Voir le dashboard complet →
          </a>
        </div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default AnalyticsSummaryWidget
