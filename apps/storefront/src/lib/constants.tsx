import { Cash, CreditCard, Phone } from "@medusajs/icons"
import Bancontact from "@modules/common/icons/bancontact"
import Ideal from "@modules/common/icons/ideal"
import PayPal from "@modules/common/icons/paypal"
import React from "react"

/* Map of payment provider_id to their title and icon. Add in any payment providers you want to use. */
export const paymentInfoMap: Record<
  string,
  { title: string; icon: React.JSX.Element }
> = {
  pp_stripe_stripe: {
    title: "Carte bancaire",
    icon: <CreditCard />,
  },
  "pp_medusa-payments_default": {
    title: "Carte bancaire",
    icon: <CreditCard />,
  },
  "pp_stripe-ideal_stripe": {
    title: "iDeal",
    icon: <Ideal />,
  },
  "pp_stripe-bancontact_stripe": {
    title: "Bancontact",
    icon: <Bancontact />,
  },
  pp_paypal_paypal: {
    title: "PayPal",
    icon: <PayPal />,
  },
  pp_system_default: {
    title: "Paiement manuel",
    icon: <CreditCard />,
  },
  "pp_orange-money-manual_orange-money-manual": {
    title: "Orange Money",
    icon: <Phone />,
  },
  "pp_moov-money-manual_moov-money-manual": {
    title: "Moov Money",
    icon: <Phone />,
  },
  "pp_cash-on-delivery_cash-on-delivery": {
    title: "Paiement à la réception",
    icon: <Cash />,
  },
  // Add more payment providers here
}

// This only checks if it is native stripe or medusa payments for card payments, it ignores the other stripe-based providers
export const isStripeLike = (providerId?: string) => {
  return (
    providerId?.startsWith("pp_stripe_") || providerId?.startsWith("pp_medusa-")
  )
}

export const isPaypal = (providerId?: string) => {
  return providerId?.startsWith("pp_paypal")
}
export const isManual = (providerId?: string) => {
  return providerId?.startsWith("pp_system_default")
}

export const isOrangeMoney = (providerId?: string) => {
  return providerId?.startsWith("pp_orange-money-manual")
}

export const isMoovMoney = (providerId?: string) => {
  return providerId?.startsWith("pp_moov-money-manual")
}

export const isCashOnDelivery = (providerId?: string) => {
  return providerId?.startsWith("pp_cash-on-delivery")
}

// Regroupe les trois providers manuels (aucune saisie de carte, capture
// manuelle par le marchand dans l'admin) - utilisé pour le bouton générique
// "Passer la commande" (payment-button) et le filtrage par ville.
export const isManualPaymentMethod = (providerId?: string) => {
  return (
    isManual(providerId) ||
    isOrangeMoney(providerId) ||
    isMoovMoney(providerId) ||
    isCashOnDelivery(providerId)
  )
}

// Add currencies that don't need to be divided by 100
export const noDivisionCurrencies = [
  "krw",
  "jpy",
  "vnd",
  "clp",
  "pyg",
  "xaf",
  "xof",
  "bif",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "rwf",
  "xpf",
  "htg",
  "vuv",
  "xag",
  "xdr",
  "xau",
]
