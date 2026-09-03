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
