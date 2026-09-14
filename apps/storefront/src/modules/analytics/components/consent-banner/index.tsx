"use client"

import { useEffect, useState } from "react"
import { getStoredConsent, storeConsent } from "@lib/analytics/consent"
import { grantMatomoConsent, isMatomoConfigured } from "@lib/analytics/matomo"
import { initMetaPixelTracker, isMetaPixelConfigured } from "@lib/analytics/meta-pixel"

// Bandeau de consentement au tracking (Matomo self-hosted + Pixel Meta pour
// les pubs dynamiques). Fail-closed par conception : tant qu'aucun choix
// n'est enregistré, ni cookie Matomo ni Pixel Meta ne s'activent. N'apparaît
// que si l'un des deux est configuré (donc jamais hors production).
const ConsentBanner = () => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (
      (isMatomoConfigured() || isMetaPixelConfigured()) &&
      getStoredConsent() === null
    ) {
      setVisible(true)
    }
  }, [])

  if (!visible) {
    return null
  }

  const handleAccept = () => {
    storeConsent("granted")
    grantMatomoConsent()
    // Contrairement à Matomo (déjà chargé au montage, juste tenu en attente
    // via requireConsent), le Pixel Meta n'est pas encore chargé du tout tant
    // que le consentement n'a jamais été donné - il faut l'initialiser ici,
    // en plus du montage normal (voir matomo-tracker/index.tsx) qui suffit
    // pour un visiteur ayant déjà consenti lors d'une visite précédente.
    initMetaPixelTracker()
    setVisible(false)
  }

  const handleDecline = () => {
    storeConsent("denied")
    setVisible(false)
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] bg-gm-violet text-gm-on-violet-muted px-5 py-4 small:px-8 flex flex-col small:flex-row items-center gap-3 small:justify-between"
      data-testid="analytics-consent-banner"
    >
      <p className="text-sm text-center small:text-left">
        Golden Market utilise un outil de statistiques de visite auto-hébergé
        ainsi que le Pixel Meta (Facebook/Instagram) pour améliorer nos
        publicités. Ce dernier partage certaines données de navigation avec
        Meta.
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
