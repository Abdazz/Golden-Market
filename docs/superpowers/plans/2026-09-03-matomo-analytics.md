# Statistiques de visite (Matomo self-hosted) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Golden Market self-hosted visit statistics (trafic, pages/produits vus, provenance, entonnoir e-commerce) via Matomo, avec un résumé dans l'admin Medusa.

**Architecture:** Deux nouveaux conteneurs (`matomo` + `matomo-db`, MariaDB) ajoutés au `docker-compose.prod.yml` existant, gatés par un profil Compose actif en production uniquement. Le storefront Next.js charge le tracker JS Matomo côté client (derrière un bandeau de consentement, fail-closed) et envoie les événements Ecommerce natifs. Le backend Medusa expose une route admin qui interroge l'API de reporting Matomo côté serveur et alimente un widget dans le dashboard admin.

**Tech Stack:** Matomo (image officielle `matomo:5-apache`), MariaDB (`mariadb:11.4`), Docker Compose profiles, Next.js App Router (client components), Medusa admin widgets (`@medusajs/admin-sdk`), Apache reverse proxy + certbot.

**Spec:** `docs/superpowers/specs/2026-09-02-statistiques-visite-design.md`

## Global Constraints

- Self-hosted uniquement — aucun SaaS analytics.
- Tracking actif en **production uniquement** (via absence des variables `NEXT_PUBLIC_MATOMO_*` hors prod, pas de branche conditionnelle applicative).
- Aucune donnée fabriquée — si un widget/rapport ne peut pas être rempli avec de vraies données, il affiche un état "indisponible", jamais un nombre inventé.
- Bandeau de consentement fail-closed : aucun cookie, aucun appel réseau Matomo avant consentement explicite.
- Rétention illimitée, aucune purge automatique à construire.
- Jamais de trailer `Co-Authored-By: Claude` dans les commits ; commentaires/commits en français ; jamais de semicolons/double quotes 2-space indent côté backend (`@medusajs/eslint-plugin`).
- Vérification visuelle obligatoire (Playwright + captures d'écran réelles) une fois l'implémentation commencée.
- Toujours committer sur `staging` d'abord, jamais directement sur `main`.

---

## Vue d'ensemble des fichiers

**Backend :**
- Modifier `apps/backend/.env.template` — secrets Matomo (reporting)
- Créer `apps/backend/src/lib/matomo-reporting.ts` — client Reporting API Matomo (testable, isolé de la route)
- Créer `apps/backend/src/lib/__tests__/matomo-reporting.unit.spec.ts`
- Créer `apps/backend/src/api/admin/analytics-summary/route.ts` — route mince, délègue à `matomo-reporting.ts`
- Créer `apps/backend/src/admin/widgets/analytics-summary.tsx` — widget dashboard

**Storefront :**
- Créer `apps/storefront/src/lib/analytics/matomo.ts` — cœur du tracking (init, consentement, événements)
- Créer `apps/storefront/src/modules/analytics/components/consent-banner/index.tsx`
- Créer `apps/storefront/src/modules/analytics/components/matomo-tracker/index.tsx`
- Créer `apps/storefront/src/modules/analytics/components/product-view-tracker/index.tsx`
- Créer `apps/storefront/src/modules/analytics/components/order-tracker/index.tsx`
- Modifier `apps/storefront/src/app/layout.tsx` — monter tracker + bandeau
- Modifier `apps/storefront/src/modules/products/templates/index.tsx` — monter le tracker de vue produit
- Modifier `apps/storefront/src/modules/products/components/product-actions/index.tsx` — événement ajout panier
- Modifier `apps/storefront/src/modules/order/templates/order-completed-template.tsx` — monter le tracker de commande
- Modifier `apps/storefront/Dockerfile` — nouveaux `ARG`/`ENV` `NEXT_PUBLIC_MATOMO_*`
- Créer `apps/storefront/e2e/analytics-consent.spec.ts`

**Infra :**
- Modifier `docker-compose.prod.yml` — services `matomo` + `matomo-db` (profil `analytics`)
- Modifier `.env.deploy.example` — nouvelles variables documentées
- Créer `deploy/backup-matomo.sh` — sauvegarde MariaDB (mysqldump), miroir de `backup-postgres.sh`
- Créer `deploy/apache/analytics.golden-market.co.conf` — vhost (activation manuelle une fois le DNS prêt)
- Modifier `HANDOFF.md`

---

### Task 1: Client Reporting API Matomo côté backend (testable)

**Files:**
- Create: `apps/backend/src/lib/matomo-reporting.ts`
- Test: `apps/backend/src/lib/__tests__/matomo-reporting.unit.spec.ts`

**Interfaces:**
- Produces: `fetchAnalyticsSummary(config: MatomoConfig, fetchImpl?: typeof fetch): Promise<AnalyticsSummary>` et les types `MatomoConfig`, `AnalyticsSummary` — consommés par Task 2.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/lib/__tests__/matomo-reporting.unit.spec.ts
import { fetchAnalyticsSummary } from "../matomo-reporting"

describe("fetchAnalyticsSummary", () => {
  it("returns unavailable when Matomo is not configured", async () => {
    const result = await fetchAnalyticsSummary({})

    expect(result).toEqual({ available: false })
  })

  it("aggregates the bulk API response into a summary", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { value: 12 }, // VisitsSummary.get (day)
        { value: 54 }, // VisitsSummary.get (week)
        [
          { label: "/products/coupe-ongles", nb_visits: 8 },
          { label: "/", nb_visits: 6 },
        ], // Actions.getPageUrls
        [
          { label: "Direct Entry", nb_visits: 7 },
          { label: "Search Engines", nb_visits: 5 },
        ], // Referrers.getReferrerType
        { ecommerceOrder: { nb_conversions: 2, conversion_rate: "16.7%" } }, // Goals.get
      ],
    })

    const result = await fetchAnalyticsSummary(
      {
        reportingUrl: "http://matomo",
        siteId: "1",
        apiToken: "test-token",
      },
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual({
      available: true,
      visitsToday: 12,
      visitsWeek: 54,
      topPages: [
        { label: "/products/coupe-ongles", visits: 8 },
        { label: "/", visits: 6 },
      ],
      topReferrerType: "Direct Entry",
      conversionRate: "16.7%",
    })
  })

  it("returns unavailable when the request fails", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("network error"))

    const result = await fetchAnalyticsSummary(
      { reportingUrl: "http://matomo", siteId: "1", apiToken: "test-token" },
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual({ available: false })
  })

  it("returns unavailable when Matomo responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) })

    const result = await fetchAnalyticsSummary(
      { reportingUrl: "http://matomo", siteId: "1", apiToken: "test-token" },
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual({ available: false })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest src/lib/__tests__/matomo-reporting.unit.spec.ts`
Expected: FAIL with "Cannot find module '../matomo-reporting'"

- [ ] **Step 3: Write the implementation**

```typescript
// apps/backend/src/lib/matomo-reporting.ts

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
    // Docker, etc.), même en interne au réseau Docker. (Corrigé pendant
    // l'implémentation suite à une revue de sécurité automatique - voir
    // commit `47832c4`.)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/lib/__tests__/matomo-reporting.unit.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/backend && npx medusa lint && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors/warnings

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/matomo-reporting.ts apps/backend/src/lib/__tests__/matomo-reporting.unit.spec.ts
git commit -m "Ajoute le client de reporting Matomo (backend, testable)"
```

---

### Task 2: Route admin `analytics-summary` + secrets

**Files:**
- Create: `apps/backend/src/api/admin/analytics-summary/route.ts`
- Modify: `apps/backend/.env.template`

**Interfaces:**
- Consumes: `fetchAnalyticsSummary`, `MatomoConfig` from Task 1 (`../../../lib/matomo-reporting`).
- Produces: `GET /admin/analytics-summary` → JSON body matching `AnalyticsSummary` — consommé par Task 3 (widget).

- [ ] **Step 1: Add the secrets to `.env.template`**

Open `apps/backend/.env.template`, after the `MOOV_MONEY_NAME=Golden Market` line, add:

```bash

# --- Statistiques de visite (Matomo self-hosted) ---
# URL interne du conteneur Matomo (réseau Docker du même docker-compose.prod.yml,
# jamais exposée publiquement) - vide en dev/staging, Matomo n'y tourne pas.
MATOMO_REPORTING_URL=
MATOMO_SITE_ID=
# Jeton d'authentification Matomo (Administration > Utilisateurs > jeton API),
# à générer une fois Matomo installé - jamais un mot de passe.
MATOMO_API_TOKEN=
```

- [ ] **Step 2: Write the route**

```typescript
// apps/backend/src/api/admin/analytics-summary/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { fetchAnalyticsSummary } from "../../../lib/matomo-reporting"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const summary = await fetchAnalyticsSummary({
    reportingUrl: process.env.MATOMO_REPORTING_URL,
    siteId: process.env.MATOMO_SITE_ID,
    apiToken: process.env.MATOMO_API_TOKEN,
  })

  res.json(summary)
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx medusa lint`
Expected: no errors

- [ ] **Step 4: Manual verification against local dev**

Run: `cd apps/backend && npx medusa develop` (déjà lancé si une session dev tourne), puis dans un autre terminal :
```bash
curl -s http://localhost:9002/admin/analytics-summary -b "connect.sid=<session admin>" | python3 -m json.tool
```
Expected: `{"available": false}` (MATOMO_REPORTING_URL vide en local) — confirme que la route ne plante pas sans Matomo configuré. L'authentification admin est gérée automatiquement par le middleware Medusa (`src/api/admin/*` est protégé nativement) : sans session valide, la requête renvoie 401 avant même d'atteindre le handler, c'est le comportement attendu.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/admin/analytics-summary/route.ts apps/backend/.env.template
git commit -m "Ajoute la route admin analytics-summary (Matomo)"
```

---

### Task 3: Widget dashboard admin

**Files:**
- Create: `apps/backend/src/admin/widgets/analytics-summary.tsx`

**Interfaces:**
- Consumes: `GET /admin/analytics-summary` (Task 2), réponse JSON shape `AnalyticsSummary` (dupliquée localement en type TS côté widget — le bundle admin Vite est compilé séparément du serveur, pas d'import cross-bundle).

- [ ] **Step 1: Write the widget**

```tsx
// apps/backend/src/admin/widgets/analytics-summary.tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
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
const AnalyticsSummaryWidget = () => {
  const [summary, setSummary] = useState<Summary>(null)

  useEffect(() => {
    fetch("/admin/analytics-summary", { credentials: "include" })
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => setSummary({ available: false }))
  }, [])

  return (
    <Container className="p-6">
      <Heading level="h2" className="mb-4">
        Statistiques de visite
      </Heading>

      {summary === null && <Text className="text-ui-fg-subtle">Chargement…</Text>}

      {summary && !summary.available && (
        <Text className="text-ui-fg-subtle">Statistiques indisponibles pour le moment.</Text>
      )}

      {summary?.available && (
        <div className="flex flex-col gap-y-4">
          <div className="flex gap-x-8">
            <div>
              <Text className="text-ui-fg-subtle txt-small">Visites aujourd&apos;hui</Text>
              <Text className="txt-large-plus">{summary.visitsToday}</Text>
            </div>
            <div>
              <Text className="text-ui-fg-subtle txt-small">Visites cette semaine</Text>
              <Text className="txt-large-plus">{summary.visitsWeek}</Text>
            </div>
            {summary.conversionRate && (
              <div>
                <Text className="text-ui-fg-subtle txt-small">Taux de conversion</Text>
                <Text className="txt-large-plus">{summary.conversionRate}</Text>
              </div>
            )}
          </div>

          {summary.topPages.length > 0 && (
            <div>
              <Text className="text-ui-fg-subtle txt-small mb-1">Pages les plus vues</Text>
              <ul className="flex flex-col gap-y-1">
                {summary.topPages.map((page) => (
                  <li key={page.label} className="flex justify-between txt-compact-small">
                    <span>{page.label}</span>
                    <span className="text-ui-fg-subtle">{page.visits}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.topReferrerType && (
            <Text className="text-ui-fg-subtle txt-small">
              Canal dominant : {summary.topReferrerType}
            </Text>
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
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default AnalyticsSummaryWidget
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx medusa lint`
Expected: no errors

- [ ] **Step 3: Manual verification in the admin UI**

Run: `cd apps/backend && npx medusa develop` puis ouvrir `http://localhost:9002/app/orders` dans un navigateur connecté en admin.
Expected: le widget "Statistiques de visite" apparaît en haut de la page, affiche "Statistiques indisponibles pour le moment." (MATOMO_REPORTING_URL vide en dev) sans faire planter la page.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin/widgets/analytics-summary.tsx
git commit -m "Ajoute le widget admin de résumé des statistiques de visite"
```

---

### Task 4: Cœur du tracking storefront (consentement + Matomo JS API)

**Files:**
- Create: `apps/storefront/src/lib/analytics/matomo.ts`

**Interfaces:**
- Produces (consommé par Tasks 5-8) :
  - `isMatomoConfigured(): boolean`
  - `getStoredConsent(): "granted" | "denied" | null`
  - `storeConsent(value: "granted" | "denied"): void`
  - `initMatomoTracker(): void` (injecte `matomo.js`, configure `requireConsent`/`setConsentGiven` selon le consentement déjà stocké — idempotent, à appeler une seule fois)
  - `grantConsent(): void` (appelle `setConsentGiven`, persiste)
  - `trackPageView(): void`
  - `trackProductView(product: { id: string; name: string; category?: string; price: number }): void`
  - `trackAddToCart(item: { id: string; name: string; category?: string; price: number; quantity: number }): void`
  - `trackOrder(order: { id: string; items: { id: string; name: string; price: number; quantity: number }[]; total: number; subtotal: number; shipping: number }): void`

- [ ] **Step 1: Write the module**

```typescript
// apps/storefront/src/lib/analytics/matomo.ts

// Cœur du tracking Matomo self-hosted (voir docs/superpowers/specs/
// 2026-09-02-statistiques-visite-design.md). Piloté par deux variables
// publiques, définies uniquement dans le build de production
// (docker-compose.prod.yml -> args du build storefront) : en dev/staging
// elles sont absentes, toutes les fonctions ci-dessous deviennent des
// no-op silencieux - la contrainte "production uniquement" découle de
// l'infra, pas d'une branche conditionnelle applicative à maintenir.
//
// Consentement fail-closed : tant que l'utilisateur n'a pas explicitement
// accepté (bandeau, voir modules/analytics/components/consent-banner),
// le tracker Matomo est configuré en requireConsent - aucun cookie posé,
// aucun appel réseau envoyé.

declare global {
  interface Window {
    _paq?: unknown[][]
  }
}

const MATOMO_URL = process.env.NEXT_PUBLIC_MATOMO_URL
const MATOMO_SITE_ID = process.env.NEXT_PUBLIC_MATOMO_SITE_ID
const CONSENT_STORAGE_KEY = "gm_matomo_consent"

export const isMatomoConfigured = (): boolean => !!MATOMO_URL && !!MATOMO_SITE_ID

const push = (...args: unknown[]) => {
  if (typeof window === "undefined") {
    return
  }
  window._paq = window._paq || []
  window._paq.push(args)
}

export const getStoredConsent = (): "granted" | "denied" | null => {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return value === "granted" || value === "denied" ? value : null
  } catch {
    // localStorage indisponible (navigation privée stricte, etc.) : on
    // retombe sur le comportement fail-closed (pas de consentement connu).
    return null
  }
}

export const storeConsent = (value: "granted" | "denied"): void => {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value)
  } catch {
    // Échec silencieux : le bandeau se réaffichera à la page suivante,
    // comportement dégradé acceptable plutôt qu'une erreur visible.
  }
}

let initialized = false

export const initMatomoTracker = (): void => {
  if (!isMatomoConfigured() || initialized || typeof document === "undefined") {
    return
  }
  initialized = true

  push("setTrackerUrl", `${MATOMO_URL}/matomo.php`)
  push("setSiteId", MATOMO_SITE_ID)
  push("requireConsent")

  if (getStoredConsent() === "granted") {
    push("setConsentGiven")
  }

  const script = document.createElement("script")
  script.async = true
  script.src = `${MATOMO_URL}/matomo.js`
  document.head.appendChild(script)
}

export const grantConsent = (): void => {
  storeConsent("granted")
  push("setConsentGiven")
}

export const denyConsent = (): void => {
  storeConsent("denied")
}

export const trackPageView = (): void => {
  if (!isMatomoConfigured()) {
    return
  }
  push("setCustomUrl", window.location.href)
  push("setDocumentTitle", document.title)
  push("trackPageView")
}

export const trackProductView = (product: {
  id: string
  name: string
  category?: string
  price: number
}): void => {
  if (!isMatomoConfigured()) {
    return
  }
  push("setEcommerceView", product.id, product.name, product.category ?? "", product.price)
  push("trackPageView")
}

export const trackAddToCart = (item: {
  id: string
  name: string
  category?: string
  price: number
  quantity: number
}): void => {
  if (!isMatomoConfigured()) {
    return
  }
  push("addEcommerceItem", item.id, item.name, item.category ?? "", item.price, item.quantity)
  push("trackEcommerceCartUpdate", item.price * item.quantity)
}

export const trackOrder = (order: {
  id: string
  items: { id: string; name: string; price: number; quantity: number }[]
  total: number
  subtotal: number
  shipping: number
}): void => {
  if (!isMatomoConfigured()) {
    return
  }
  order.items.forEach((item) => {
    push("addEcommerceItem", item.id, item.name, "", item.price, item.quantity)
  })
  push("trackEcommerceOrder", order.id, order.total, order.subtotal, undefined, order.shipping)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/lib/analytics/matomo.ts
git commit -m "Ajoute le cœur du tracking Matomo côté storefront"
```

---

### Task 5: Bandeau de consentement + tracker monté dans le layout

**Files:**
- Create: `apps/storefront/src/modules/analytics/components/consent-banner/index.tsx`
- Create: `apps/storefront/src/modules/analytics/components/matomo-tracker/index.tsx`
- Modify: `apps/storefront/src/app/layout.tsx`
- Test: `apps/storefront/e2e/analytics-consent.spec.ts`

**Interfaces:**
- Consumes: tout `lib/analytics/matomo.ts` (Task 4).
- Produces: `<MatomoTracker />` et `<ConsentBanner />`, montés une fois dans `app/layout.tsx` (racine, comme `<WhatsAppFloatButton />` déjà présent).

- [ ] **Step 1: Write `MatomoTracker`**

```tsx
// apps/storefront/src/modules/analytics/components/matomo-tracker/index.tsx
"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import {
  initMatomoTracker,
  isMatomoConfigured,
  trackPageView,
} from "@lib/analytics/matomo"

// Composant invisible, monté une seule fois dans app/layout.tsx : initialise
// le tracker Matomo (no-op si NEXT_PUBLIC_MATOMO_URL absent, donc hors
// production) et déclenche trackPageView à chaque changement de route -
// Next.js étant une SPA côté navigation, le tracker par défaut de Matomo
// (conçu pour des rechargements complets) ne suffit pas seul.
const MatomoTracker = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    initMatomoTracker()
  }, [])

  useEffect(() => {
    if (!isMatomoConfigured()) {
      return
    }
    trackPageView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  return null
}

export default MatomoTracker
```

- [ ] **Step 2: Write `ConsentBanner`**

```tsx
// apps/storefront/src/modules/analytics/components/consent-banner/index.tsx
"use client"

import { useEffect, useState } from "react"
import {
  denyConsent,
  getStoredConsent,
  grantConsent,
  isMatomoConfigured,
} from "@lib/analytics/matomo"

// Bandeau de consentement au tracking de visite (Matomo). Fail-closed par
// conception : tant qu'aucun choix n'est enregistré, aucun cookie n'est
// posé et aucun appel réseau Matomo n'est envoyé (voir lib/analytics/matomo.ts,
// requireConsent). N'apparaît que si Matomo est configuré (donc jamais hors
// production).
const ConsentBanner = () => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isMatomoConfigured() && getStoredConsent() === null) {
      setVisible(true)
    }
  }, [])

  if (!visible) {
    return null
  }

  const handleAccept = () => {
    grantConsent()
    setVisible(false)
  }

  const handleDecline = () => {
    denyConsent()
    setVisible(false)
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] bg-gm-violet text-gm-on-violet-muted px-5 py-4 small:px-8 flex flex-col small:flex-row items-center gap-3 small:justify-between"
      data-testid="analytics-consent-banner"
    >
      <p className="text-sm text-center small:text-left">
        Golden Market utilise un outil de statistiques de visite auto-hébergé
        (aucune donnée partagée avec un tiers) pour mieux comprendre l&apos;usage
        du site.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDecline}
          data-testid="analytics-consent-decline"
          className="px-4 py-2 rounded-full text-sm font-semibold border border-gm-on-violet/40 hover:bg-white/10"
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={handleAccept}
          data-testid="analytics-consent-accept"
          className="px-4 py-2 rounded-full text-sm font-semibold bg-gm-gold text-gm-ink hover:bg-gm-gold-strong"
        >
          Accepter
        </button>
      </div>
    </div>
  )
}

export default ConsentBanner
```

- [ ] **Step 3: Mount both in the root layout**

Modify `apps/storefront/src/app/layout.tsx`:

```tsx
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { Baloo_2, Inter } from "next/font/google"
import WhatsAppFloatButton from "@modules/layout/components/whatsapp-float-button"
import ConsentBanner from "@modules/analytics/components/consent-banner"
import MatomoTracker from "@modules/analytics/components/matomo-tracker"
import { Suspense } from "react"
import "styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      data-mode="light"
      className={`${inter.variable} ${baloo.variable}`}
    >
      <body>
        <main className="relative">{props.children}</main>
        <WhatsAppFloatButton />
        <Suspense fallback={null}>
          <MatomoTracker />
        </Suspense>
        <ConsentBanner />
      </body>
    </html>
  )
}
```

`useSearchParams` (utilisé dans `MatomoTracker`) exige un `<Suspense>` englobant en App Router - même contrainte que les usages existants de ce hook dans `product-actions/index.tsx`.

- [ ] **Step 4: Write the failing e2e tests**

```typescript
// apps/storefront/e2e/analytics-consent.spec.ts
import { expect, test } from "@playwright/test"

// Ces tests vérifient le comportement du bandeau de consentement lui-même,
// pas Matomo : NEXT_PUBLIC_MATOMO_URL est absent en dev/staging (tracking
// production uniquement, voir docker-compose.prod.yml), donc le bandeau ne
// s'affiche jamais dans cet environnement de test - ce test documente et
// verrouille ce comportement plutôt que de simuler une variable d'env qui
// n'existe nulle part hors production.
test.describe("Bandeau de consentement analytics", () => {
  test("ne s'affiche pas quand Matomo n'est pas configuré (dev/staging)", async ({ page }) => {
    await page.goto("/bf")
    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0)
  })
})
```

- [ ] **Step 5: Run the test to verify it passes as-is (no Matomo configured locally)**

Run: `cd apps/storefront && PLAYWRIGHT_BASE_URL=http://localhost:8002 npx playwright test e2e/analytics-consent.spec.ts`
Expected: PASS (le bandeau n'existe pas tant que `NEXT_PUBLIC_MATOMO_URL` n'est pas défini)

- [ ] **Step 6: Typecheck and lint**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json && npx next lint --file src/modules/analytics/components/consent-banner/index.tsx --file src/modules/analytics/components/matomo-tracker/index.tsx --file src/app/layout.tsx`
Expected: no errors

- [ ] **Step 7: Manual local verification with a temporary Matomo instance**

Ce test-ci a besoin d'un vrai `NEXT_PUBLIC_MATOMO_URL` pour être significatif. Ne fait pas partie de la suite committée (dépendrait d'un service externe non disponible en CI) - à faire une fois manuellement pendant l'implémentation :

```bash
# Terminal 1 : Matomo temporaire (jamais committé)
docker run --rm -p 8090:80 --name matomo-local-test matomo:5-apache
# Terminal 2 : storefront avec le tracker activé
cd apps/storefront
NEXT_PUBLIC_MATOMO_URL=http://localhost:8090 NEXT_PUBLIC_MATOMO_SITE_ID=1 npx next dev --turbopack -p 8002
```

Ouvrir `http://localhost:8002/bf`, vérifier : le bandeau s'affiche, aucune requête vers `localhost:8090/matomo.php` avant d'avoir cliqué "Accepter" (onglet Réseau des devtools), une requête part après acceptation, le choix persiste après un rechargement de page (pas de nouveau bandeau). Puis `docker stop matomo-local-test`.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/modules/analytics/components/consent-banner apps/storefront/src/modules/analytics/components/matomo-tracker apps/storefront/src/app/layout.tsx apps/storefront/e2e/analytics-consent.spec.ts
git commit -m "Ajoute le bandeau de consentement et le tracker Matomo (pages vues)"
```

---

### Task 6: Tracking Ecommerce — vue produit, ajout panier, commande

**Files:**
- Create: `apps/storefront/src/modules/analytics/components/product-view-tracker/index.tsx`
- Create: `apps/storefront/src/modules/analytics/components/order-tracker/index.tsx`
- Modify: `apps/storefront/src/modules/products/templates/index.tsx`
- Modify: `apps/storefront/src/modules/products/components/product-actions/index.tsx`
- Modify: `apps/storefront/src/modules/order/templates/order-completed-template.tsx`

**Interfaces:**
- Consumes: `trackProductView`, `trackAddToCart`, `trackOrder` (Task 4).

- [ ] **Step 1: Write `ProductViewTracker`**

```tsx
// apps/storefront/src/modules/analytics/components/product-view-tracker/index.tsx
"use client"

import { useEffect } from "react"
import { trackProductView } from "@lib/analytics/matomo"

type ProductViewTrackerProps = {
  product: {
    id: string
    title: string
    categories?: { name: string }[]
  }
  price: number
}

// Composant invisible monté sur la fiche produit (templates/index.tsx) :
// envoie l'événement Ecommerce setEcommerceView à Matomo. Données réelles
// uniquement (id/titre/catégorie/prix Medusa du produit affiché).
const ProductViewTracker = ({ product, price }: ProductViewTrackerProps) => {
  useEffect(() => {
    trackProductView({
      id: product.id,
      name: product.title,
      category: product.categories?.[0]?.name,
      price,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  return null
}

export default ProductViewTracker
```

- [ ] **Step 2: Write `OrderTracker`**

```tsx
// apps/storefront/src/modules/analytics/components/order-tracker/index.tsx
"use client"

import { useEffect } from "react"
import { trackOrder } from "@lib/analytics/matomo"

type OrderTrackerProps = {
  order: {
    id: string
    items: { id: string; title: string; unit_price: number; quantity: number }[]
    total: number
    subtotal: number
    shipping_total: number
  }
}

const TRACKED_ORDERS_KEY = "gm_matomo_tracked_orders"

// Composant invisible monté sur la page de confirmation de commande :
// envoie trackEcommerceOrder à Matomo, une seule fois par commande. La page
// de confirmation peut être revisitée (rechargement, retour arrière) - un
// id de commande déjà envoyé est mémorisé en localStorage pour ne jamais
// compter deux fois la même commande dans l'entonnoir de conversion.
const OrderTracker = ({ order }: OrderTrackerProps) => {
  useEffect(() => {
    let alreadyTracked: string[] = []
    try {
      alreadyTracked = JSON.parse(
        window.localStorage.getItem(TRACKED_ORDERS_KEY) ?? "[]"
      )
    } catch {
      alreadyTracked = []
    }

    if (alreadyTracked.includes(order.id)) {
      return
    }

    trackOrder({
      id: order.id,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.title,
        price: item.unit_price,
        quantity: item.quantity,
      })),
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping_total,
    })

    try {
      window.localStorage.setItem(
        TRACKED_ORDERS_KEY,
        JSON.stringify([...alreadyTracked, order.id])
      )
    } catch {
      // Échec silencieux (localStorage indisponible) : au pire l'entonnoir
      // recomptera cette commande si la page est revisitée, jamais bloquant.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  return null
}

export default OrderTracker
```

- [ ] **Step 3: Wire `ProductViewTracker` into the product template**

Modify `apps/storefront/src/modules/products/templates/index.tsx` — ajouter l'import et le composant, en réutilisant le prix déjà calculé par `ProductInfo`/`ProductActions` (le template n'a pas le prix directement ; le calculer via `getProductPrice`, déjà utilisé ailleurs dans `apps/storefront/src/modules/products/components/product-actions/index.tsx`) :

```tsx
import React, { Suspense } from "react"

import Breadcrumb, { Crumb } from "@modules/common/components/breadcrumb"
import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import ProductTrust from "@modules/products/components/product-trust"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import ProductViewTracker from "@modules/analytics/components/product-view-tracker"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { getProductPrice } from "@lib/util/get-product-price"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  const category = product.categories?.[0]
  const crumbs: Crumb[] = [
    { label: "Accueil", href: "/" },
    category
      ? { label: category.name, href: `/categories/${category.handle}` }
      : { label: "Tous les produits", href: "/store" },
    { label: product.title },
  ]

  const { cheapestPrice } = getProductPrice({ product })

  return (
    <>
      <div className="content-container" data-testid="product-container">
        <ProductViewTracker
          product={product}
          price={cheapestPrice?.calculated_price_number ?? 0}
        />
        <Breadcrumb items={crumbs} />

        <div className="grid grid-cols-1 gap-10 pb-16 small:grid-cols-[1.05fr_1fr] small:items-start">
          <div className="w-full">
            <ImageGallery images={images} />
          </div>

          <div className="flex flex-col gap-6 small:sticky small:top-24">
            <ProductInfo product={product} />

            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>

            <ProductTrust
              freeShippingNote={
                typeof product.metadata?.free_shipping_note === "string"
                  ? product.metadata.free_shipping_note
                  : null
              }
            />

            <ProductTabs product={product} />
          </div>
        </div>
      </div>

      <div
        className="content-container my-16 small:my-24"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
```

**Vérifier avant d'écrire ce step** : `apps/storefront/src/lib/util/get-product-price.ts` — confirmer que `calculated_price_number` est bien le nom du champ numérique retourné (utilisé ailleurs dans `product-actions/index.tsx` sous une forme ou une autre). Si le nom diffère, l'ajuster ici en conséquence — ne pas deviner un champ qui n'existe pas.

- [ ] **Step 4: Wire `trackAddToCart` into `product-actions`**

Modifier `apps/storefront/src/modules/products/components/product-actions/index.tsx` : ajouter l'import `trackAddToCart` depuis `@lib/analytics/matomo`, et l'appeler dans `handleAddToCart` juste après le `setAddedVariantId(variantId)` existant :

```typescript
import { trackAddToCart } from "@lib/analytics/matomo"
```

Puis dans `handleAddToCart`, après `setAddedVariantId(variantId)` :

```typescript
    trackAddToCart({
      id: variantId,
      name: product.title,
      category: product.categories?.[0]?.name,
      price: priceLabel ? Number(variantPrice?.calculated_price_number ?? cheapestPrice?.calculated_price_number ?? 0) : 0,
      quantity,
    })
```

**Vérifier avant d'écrire ce step** : le nom exact du champ prix numérique dans l'objet retourné par `getProductPrice` (même vérification que le Step 3 ci-dessus, cohérence obligatoire entre les deux endroits).

- [ ] **Step 5: Wire `OrderTracker` into the order confirmation template**

Modifier `apps/storefront/src/modules/order/templates/order-completed-template.tsx` :

```tsx
import { Heading } from "@modules/common/components/ui"
import { cookies as nextCookies } from "next/headers"

import Breadcrumb from "@modules/common/components/breadcrumb"
import CartTotals from "@modules/common/components/cart-totals"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderDetails from "@modules/order/components/order-details"
import OrderTracker from "@modules/analytics/components/order-tracker"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default async function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const cookies = await nextCookies()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"

  return (
    <div className="content-container py-6 min-h-[calc(100vh-64px)]">
      <OrderTracker
        order={{
          id: order.id,
          items: (order.items ?? []).map((item) => ({
            id: item.id,
            title: item.product_title ?? item.title,
            unit_price: item.unit_price,
            quantity: item.quantity,
          })),
          total: order.total,
          subtotal: order.subtotal ?? 0,
          shipping_total: order.shipping_total ?? 0,
        }}
      />
      <Breadcrumb
        items={[
          { label: "Accueil", href: "/" },
          { label: "Commande confirmée" },
        ]}
      />
      <div className="flex flex-col justify-center items-center gap-y-10 max-w-4xl mx-auto w-full">
        {isOnboarding && <OnboardingCta orderId={order.id} />}
        <div
          className="flex flex-col gap-4 max-w-4xl w-full rounded-2xl border border-gm-border bg-white py-10 px-6 small:px-10"
          data-testid="order-complete-container"
        >
          <Heading
            level="h1"
            className="flex flex-col gap-y-3 text-gm-ink text-3xl mb-4"
          >
            <span>Merci !</span>
            <span>Votre commande a été enregistrée avec succès.</span>
          </Heading>
          <OrderDetails order={order} />
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            Récapitulatif
          </Heading>
          <Items order={order} />
          <CartTotals totals={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
          <Help />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no errors — corriger tout nom de champ de prix incorrect détecté ici (voir avertissements des Steps 3-4).

- [ ] **Step 7: Manual verification with the temporary local Matomo (same setup as Task 5 Step 7)**

Avec `NEXT_PUBLIC_MATOMO_URL`/`NEXT_PUBLIC_MATOMO_SITE_ID` définis et le consentement accepté : visiter une fiche produit (vérifier dans l'onglet Réseau un appel `matomo.php` avec `idgoal` / paramètres `ec_id` correspondant au produit), ajouter au panier (nouvel appel avec le contenu du panier), passer une commande de test jusqu'à confirmation (appel `trackEcommerceOrder` visible avec le vrai id de commande) puis recharger la page de confirmation (aucun nouvel appel `trackEcommerceOrder` - idempotence).

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/modules/analytics/components/product-view-tracker apps/storefront/src/modules/analytics/components/order-tracker apps/storefront/src/modules/products/templates/index.tsx apps/storefront/src/modules/products/components/product-actions/index.tsx apps/storefront/src/modules/order/templates/order-completed-template.tsx
git commit -m "Câble le tracking Ecommerce Matomo (vue produit, panier, commande)"
```

---

### Task 7: Build storefront conditionné par les variables Matomo

**Files:**
- Modify: `apps/storefront/Dockerfile`
- Modify: `docker-compose.prod.yml` (section `storefront.build.args` uniquement — la partie `matomo`/`matomo-db` est Task 8)

**Interfaces:** aucune (configuration de build uniquement).

- [ ] **Step 1: Add the build args to the Dockerfile**

Modifier `apps/storefront/Dockerfile` :

```dockerfile
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_MATOMO_URL
ARG NEXT_PUBLIC_MATOMO_SITE_ID
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL} \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_MATOMO_URL=${NEXT_PUBLIC_MATOMO_URL} \
    NEXT_PUBLIC_MATOMO_SITE_ID=${NEXT_PUBLIC_MATOMO_SITE_ID}
```

- [ ] **Step 2: Pass the args from docker-compose.prod.yml**

Dans `docker-compose.prod.yml`, service `storefront`, bloc `build.args` — ajouter après `NEXT_PUBLIC_BASE_URL` :

```yaml
        NEXT_PUBLIC_MATOMO_URL: ${NEXT_PUBLIC_MATOMO_URL:-}
        NEXT_PUBLIC_MATOMO_SITE_ID: ${NEXT_PUBLIC_MATOMO_SITE_ID:-}
```

Le `:-` (valeur par défaut vide) est important : sans lui, Docker Compose échoue si la variable est totalement absente du `.env.deploy` (le cas de staging, volontairement).

- [ ] **Step 3: Verify the compose file parses**

Run: `docker compose -f docker-compose.prod.yml config --quiet`
Expected: aucune erreur (le fichier n'a pas encore les services `matomo`/`matomo-db` de Task 8, c'est normal à ce stade)

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/Dockerfile docker-compose.prod.yml
git commit -m "Ajoute les build args NEXT_PUBLIC_MATOMO_* au storefront"
```

---

### Task 8: Infrastructure Docker — conteneurs Matomo + MariaDB

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.env.deploy.example`

**Interfaces:** aucune (infrastructure).

- [ ] **Step 1: Add the services to `docker-compose.prod.yml`**

Ajouter avant la section `volumes:` finale :

```yaml
  matomo-db:
    image: mariadb:11.4
    container_name: ${ENV_NAME}-golden-market-matomo-db
    restart: unless-stopped
    profiles: ["analytics"]
    environment:
      MYSQL_DATABASE: ${MATOMO_DB_NAME}
      MYSQL_USER: ${MATOMO_DB_USER}
      MYSQL_PASSWORD: ${MATOMO_DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MATOMO_DB_ROOT_PASSWORD}
    volumes:
      - matomo_db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 10

  matomo:
    image: matomo:5-apache
    container_name: ${ENV_NAME}-golden-market-matomo
    restart: unless-stopped
    profiles: ["analytics"]
    depends_on:
      matomo-db:
        condition: service_healthy
    environment:
      MATOMO_DATABASE_HOST: matomo-db
      MATOMO_DATABASE_ADAPTER: mysql
      MATOMO_DATABASE_USERNAME: ${MATOMO_DB_USER}
      MATOMO_DATABASE_PASSWORD: ${MATOMO_DB_PASSWORD}
      MATOMO_DATABASE_DBNAME: ${MATOMO_DB_NAME}
    ports:
      - "127.0.0.1:${MATOMO_PORT}:80"
    volumes:
      - matomo_data:/var/www/html
```

Et dans la section `volumes:` finale, ajouter :

```yaml
  matomo_db_data:
  matomo_data:
```

- [ ] **Step 2: Document the new variables in `.env.deploy.example`**

Ajouter à la fin de `.env.deploy.example` :

```bash

# --- Statistiques de visite (Matomo self-hosted, production uniquement) ---
# Absent du .env.deploy de staging par choix (voir spec) : le profil
# Compose "analytics" n'est alors jamais activé, ces conteneurs n'existent
# pas sur cet environnement.
# COMPOSE_PROFILES=analytics
# MATOMO_PORT=9090
# MATOMO_DB_NAME=matomo
# MATOMO_DB_USER=matomo
# MATOMO_DB_PASSWORD=change_me
# MATOMO_DB_ROOT_PASSWORD=change_me
# NEXT_PUBLIC_MATOMO_URL=https://analytics.golden-market.co
# NEXT_PUBLIC_MATOMO_SITE_ID=1
```

Les lignes restent commentées dans l'exemple (contrairement aux variables toujours actives) : ce bloc n'est décommenté et rempli que dans le `.env.deploy` réel de production, jamais dans celui de staging.

- [ ] **Step 3: Verify the compose file parses with the profile**

Run: `MATOMO_PORT=9090 MATOMO_DB_NAME=matomo MATOMO_DB_USER=matomo MATOMO_DB_PASSWORD=x MATOMO_DB_ROOT_PASSWORD=x docker compose -f docker-compose.prod.yml --profile analytics config --quiet`
Expected: aucune erreur, et `docker compose -f docker-compose.prod.yml --profile analytics config` inclut bien `matomo`/`matomo-db` dans les services listés.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml .env.deploy.example
git commit -m "Ajoute les services Matomo/MariaDB à docker-compose.prod.yml (profil analytics)"
```

---

### Task 9: Sauvegarde MariaDB

**Files:**
- Create: `deploy/backup-matomo.sh`

**Interfaces:** aucune (script shell autonome, invoqué par cron comme `backup-postgres.sh`).

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Sauvegarde du conteneur MariaDB de Matomo (production uniquement, voir
# docker-compose.prod.yml - profil "analytics") et purge des dumps plus
# vieux que RETENTION_DAYS. Miroir de backup-postgres.sh, adapté à
# mysqldump.
# Usage : backup-matomo.sh <container_name> <mysql_user> <mysql_password> <mysql_db> <backup_dir> <retention_days>

if [ "$#" -ne 6 ]; then
  echo "Usage: $0 <container_name> <mysql_user> <mysql_password> <mysql_db> <backup_dir> <retention_days>" >&2
  exit 1
fi

CONTAINER_NAME="$1"
MYSQL_USER="$2"
MYSQL_PASSWORD="$3"
MYSQL_DB="$4"
BACKUP_DIR="$5"
RETENTION_DAYS="$6"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%S)"
DUMP_FILE="${BACKUP_DIR}/${MYSQL_DB}-${TIMESTAMP}.sql.gz"

docker exec "$CONTAINER_NAME" mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DB" | gzip > "$DUMP_FILE"

find "$BACKUP_DIR" -name "${MYSQL_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x deploy/backup-matomo.sh`

- [ ] **Step 3: Commit**

```bash
git add deploy/backup-matomo.sh
git commit -m "Ajoute le script de sauvegarde MariaDB (Matomo)"
```

---

### Task 10: Vhost Apache (préparé, activation manuelle une fois le DNS prêt)

**Files:**
- Create: `deploy/apache/analytics.golden-market.co.conf`

**Interfaces:** aucune.

**Contexte important** : au moment d'écrire ce plan, `analytics.golden-market.co` ne résout vers aucune IP (vérifié via `dig +short analytics.golden-market.co A`, contrairement à `staging.golden-market.co` et `golden-market.co` qui résolvent déjà vers `144.91.110.105`). L'enregistrement DNS doit être créé chez le fournisseur DNS du domaine — hors de portée d'un accès SSH au VPS. **Ce fichier est préparé et committé, mais son activation (Steps 3-5 ci-dessous) reste bloquée tant que ce DNS n'est pas ajouté.**

- [ ] **Step 1: Write the vhost file**

```apache
<VirtualHost *:80>
    ServerName analytics.golden-market.co

    ProxyPreserveHost On

    ProxyPass / http://127.0.0.1:9090/
    ProxyPassReverse / http://127.0.0.1:9090/

    ErrorLog ${APACHE_LOG_DIR}/analytics-error.log
    CustomLog ${APACHE_LOG_DIR}/analytics-access.log combined
</VirtualHost>
```

Le port `9090` correspond à `MATOMO_PORT` dans `.env.deploy.example` (Task 8) — si une valeur différente est retenue au moment du déploiement réel, l'ajuster ici en conséquence.

- [ ] **Step 2: Commit**

```bash
git add deploy/apache/analytics.golden-market.co.conf
git commit -m "Prépare le vhost Apache analytics.golden-market.co (activation manuelle après DNS)"
```

- [ ] **Step 3 (manuel, une fois le DNS ajouté par le propriétaire) : copier le vhost et activer le site**

```bash
ssh admin@144.91.110.105 'sudo cp /opt/golden-market/production/deploy/apache/analytics.golden-market.co.conf /etc/apache2/sites-available/ && sudo a2ensite analytics.golden-market.co && sudo apache2ctl configtest && sudo apache2ctl graceful'
```

- [ ] **Step 4 (manuel) : certificat certbot**

```bash
ssh admin@144.91.110.105 'sudo certbot --apache -d analytics.golden-market.co'
```

- [ ] **Step 5 (manuel) : vérifier**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://analytics.golden-market.co/
```
Expected: `200` (page d'accueil/assistant d'installation Matomo)

---

### Task 11: Déploiement staging (code seulement, Matomo n'y tourne pas) puis production

**Files:** aucun nouveau fichier — déploiement des Tasks 1-10.

- [ ] **Step 1: Run the full local verification suite**

```bash
cd apps/backend && npx jest --silent=false && npx tsc --noEmit -p tsconfig.json && npx medusa lint
cd ../storefront && npx tsc --noEmit -p tsconfig.json && PLAYWRIGHT_BASE_URL=http://localhost:8002 npx playwright test
```
Expected: tous les tests passent (backend + les 10 tests e2e existants + le nouveau test de consentement)

- [ ] **Step 2: Push to staging, verify the deploy is green, verify no Matomo container exists there**

```bash
git push origin staging
```
Puis surveiller via `gh run watch <run-id> --exit-status`. Une fois vert :
```bash
ssh admin@144.91.110.105 'docker ps --filter "name=staging" --format "table {{.Names}}"'
```
Expected: ni `staging-golden-market-matomo` ni `staging-golden-market-matomo-db` dans la liste (profil `analytics` absent du `.env.deploy` de staging) — conforme à la contrainte "production uniquement".

- [ ] **Step 3: Visual verification on staging**

Naviguer sur `https://staging.golden-market.co/bf`, vérifier qu'aucun bandeau de consentement n'apparaît (Matomo non configuré) et que le reste du site fonctionne normalement (aucune régression).

- [ ] **Step 4: Add the real MATOMO_* secrets to production's `.env.deploy` (manual, on the VPS)**

```bash
ssh admin@144.91.110.105 'cat >> /opt/golden-market/production/.env.deploy <<EOF

COMPOSE_PROFILES=analytics
MATOMO_PORT=9090
MATOMO_DB_NAME=matomo
MATOMO_DB_USER=matomo
MATOMO_DB_PASSWORD=<mot de passe fort généré>
MATOMO_DB_ROOT_PASSWORD=<mot de passe fort généré, différent>
NEXT_PUBLIC_MATOMO_URL=https://analytics.golden-market.co
NEXT_PUBLIC_MATOMO_SITE_ID=1
EOF'
```

Générer des mots de passe forts réels (ex. `openssl rand -base64 24`) — jamais de valeur devinée ou de placeholder laissé tel quel en production.

- [ ] **Step 5: Merge to main, push, verify the deploy is green**

```bash
git checkout main && git merge staging --ff-only && git push origin main
```
Surveiller via `gh run watch <run-id> --exit-status`.

- [ ] **Step 6: Verify the Matomo containers are running in production**

```bash
ssh admin@144.91.110.105 'docker ps --filter "name=production-golden-market-matomo" --format "table {{.Names}}\t{{.Status}}"'
```
Expected: `production-golden-market-matomo` et `production-golden-market-matomo-db` tous deux `Up`.

- [ ] **Step 7 (bloqué tant que le DNS n'est pas ajouté) : compléter l'assistant d'installation Matomo**

Une fois `https://analytics.golden-market.co` accessible (Task 10, Steps 3-5 effectuées) : ouvrir l'URL dans un navigateur, suivre l'assistant (langue, vérification des prérequis, connexion DB déjà pré-remplie via les variables d'environnement, création du compte super-administrateur avec un vrai mot de passe fort, création du site "Golden Market" avec l'URL `https://golden-market.co`), noter l'**idSite** obtenu (doit correspondre à `MATOMO_SITE_ID`, sinon corriger le `.env.deploy` et redéployer) et générer un **jeton d'authentification** (Administration → Utilisateurs → cliquer sur l'utilisateur super-admin → "Afficher le jeton") à reporter dans `MATOMO_API_TOKEN` sur le VPS production :

```bash
ssh admin@144.91.110.105 "echo 'MATOMO_API_TOKEN=<jeton réel>' >> /opt/golden-market/production/apps/backend/.env"
ssh admin@144.91.110.105 "echo 'MATOMO_REPORTING_URL=http://production-golden-market-matomo' >> /opt/golden-market/production/apps/backend/.env"
ssh admin@144.91.110.105 'cd /opt/golden-market/production && docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d backend'
```

`MATOMO_REPORTING_URL` utilise le nom du conteneur Matomo (réseau Docker interne du projet Compose production, résolution DNS automatique entre conteneurs du même projet) — pas le domaine public, pour que l'appel backend→Matomo ne dépende ni du DNS public ni d'Apache.

- [ ] **Step 8 (bloqué tant que Step 7 n'est pas fait) : vérification visuelle complète en production**

Sur `https://golden-market.co` : bandeau de consentement visible, acceptation, navigation sur une fiche produit + ajout au panier + commande de test complète (utiliser un vrai produit, ne pas fabriquer de données mais accepter qu'une commande de test réelle soit passée — comme convenu pour la vérification "vue produit → panier → commande" du funnel). Puis sur `https://analytics.golden-market.co`, vérifier que ces visites/événements apparaissent réellement (pas seulement "ça a l'air de marcher"). Puis dans l'admin Medusa (`https://golden-market.co/app/orders`), vérifier que le widget affiche des chiffres cohérents avec le dashboard Matomo.

- [ ] **Step 9: Update HANDOFF.md**

Marquer le sous-projet Matomo comme fait (ou "en attente de DNS" si le Step 7-8 n'a pas pu être complété faute de DNS), avec le détail de ce qui reste à faire par le propriétaire le cas échéant.

```bash
git add HANDOFF.md
git commit -m "Documente le déploiement des statistiques de visite (Matomo)"
git push origin main
```

---

## Self-Review

**Couverture de la spec** : infra Docker (Task 8), domaine/reverse proxy (Task 10), sauvegarde (Task 9), activation conditionnelle par env (Task 7), pages vues (Task 5), entonnoir Ecommerce (Task 6), provenance (automatique côté Matomo, aucun code requis — noté, pas de tâche dédiée nécessaire), consentement (Task 5), widget admin (Tasks 2-3), gestion des erreurs (fail-closed dans Task 4/5, timeout+catch dans Task 1, message neutre dans Task 3) — tout couvert.

**Placeholders** : aucun "TODO"/"TBD" dans le code livré. Les deux points explicitement marqués comme bloqués (DNS pour Task 10 Steps 3-5, et par conséquent Task 11 Steps 7-8) sont des dépendances externes réelles documentées comme telles, pas des trous dans le plan — chaque étape bloquée a ses commandes exactes prêtes à l'emploi dès que le DNS existe.

**Cohérence des types** : `AnalyticsSummary` défini une fois dans `matomo-reporting.ts` (Task 1) et dupliqué à l'identique côté widget (Task 3, bundle Vite séparé du serveur — pas d'import cross-bundle possible dans ce projet). `MatomoConfig` cohérent entre Task 1 et Task 2. Les fonctions de `lib/analytics/matomo.ts` (Task 4) sont réutilisées telles quelles dans toutes les Tasks 5-6, aucune redéfinition locale.

**Champ prix vérifié (Task 6)** : `calculated_price_number` confirmé par lecture directe de `lib/util/get-product-price.ts:22` (`getPricesForVariant`) au moment d'écrire ce plan — les deux emplacements (Steps 3 et 4) utilisent le bon nom.
