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
