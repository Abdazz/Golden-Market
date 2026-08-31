import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "fr-FR",
}: ConvertToLocaleParams) => {
  if (!currency_code || isEmpty(currency_code)) {
    return amount.toString()
  }

  // Le catalogue Golden Market est en francs CFA (XOF). Les maquettes
  // affichent "15 000 FCFA" : séparateur de milliers = espace insécable,
  // suffixe "FCFA" collé, aucune décimale. Le style "currency" natif
  // produirait "15 000 F CFA" (fr-FR) voire "F CFA 15,000" (en-US), non
  // conformes - on formate donc le nombre seul puis on appose le suffixe.
  if (currency_code.toUpperCase() === "XOF") {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: minimumFractionDigits ?? 0,
      maximumFractionDigits: maximumFractionDigits ?? 0,
    }).format(amount)

    return `${formatted} FCFA`
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency_code,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount)
}
