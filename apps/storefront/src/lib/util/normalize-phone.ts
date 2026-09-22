// Copie volontaire de apps/backend/src/lib/normalize-phone.ts : les deux
// apps sont des projets Next.js/Medusa séparés sans package partagé. Garder
// les deux implémentations identiques si l'une des deux change (voir
// docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md).
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "")

  if (!digitsOnly) {
    throw new Error("Numéro de téléphone invalide")
  }

  const withoutInternationalPrefix = digitsOnly.startsWith("00226")
    ? digitsOnly.slice(2)
    : digitsOnly

  const withCountryCode = withoutInternationalPrefix.startsWith("226")
    ? withoutInternationalPrefix
    : `226${withoutInternationalPrefix}`

  // Un numéro burkinabè local fait exactement 8 chiffres (+226 en préfixe) -
  // rejeter toute autre longueur pour éviter que deux saisies malformées
  // différentes ne produisent deux identifiants distincts au lieu d'un
  // rejet clair. Voir revue finale.
  if (withCountryCode.length !== 11) {
    throw new Error("Numéro de téléphone invalide")
  }

  return `+${withCountryCode}`
}
