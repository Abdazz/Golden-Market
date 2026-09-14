"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import {
  initMatomoTracker,
  isMatomoConfigured,
  trackPageView as trackMatomoPageView,
} from "@lib/analytics/matomo"
import {
  initMetaPixelTracker,
  isMetaPixelConfigured,
  trackPageView as trackMetaPageView,
} from "@lib/analytics/meta-pixel"

// Composant invisible, monté une seule fois dans app/layout.tsx : initialise
// les trackers Matomo et Pixel Meta (no-op si les variables publiques
// correspondantes sont absentes, donc hors production) et déclenche
// PageView à chaque changement de route - Next.js étant une SPA côté
// navigation, le tracking par défaut de ces outils (conçu pour des
// rechargements complets) ne suffit pas seul.
const MatomoTracker = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    initMatomoTracker()
    // No-op si le consentement n'a pas déjà été donné lors d'une visite
    // précédente (voir meta-pixel.ts) - sinon pris en charge par
    // ConsentBanner au moment de l'acceptation.
    initMetaPixelTracker()
  }, [])

  useEffect(() => {
    if (isMatomoConfigured()) {
      trackMatomoPageView()
    }
    if (isMetaPixelConfigured()) {
      trackMetaPageView()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  return null
}

export default MatomoTracker
