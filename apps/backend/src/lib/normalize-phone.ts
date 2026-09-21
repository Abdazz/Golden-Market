// Le téléphone sert désormais d'identifiant d'authentification (voir
// docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md) :
// deux saisies différentes du même numéro réel ne doivent jamais produire
// deux identifiants distincts. Ne gère que le Burkina Faso (+226), seul pays
// desservi par ce store.
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "")

  if (!digitsOnly) {
    throw new Error("Numéro de téléphone invalide")
  }

  // 00226XXXXXXXX (préfixe international) -> 226XXXXXXXX
  const withoutInternationalPrefix = digitsOnly.startsWith("00226")
    ? digitsOnly.slice(2)
    : digitsOnly

  // 226XXXXXXXX (déjà préfixé, sans le +) -> garder tel quel
  // XXXXXXXX (8 chiffres locaux, sans préfixe) -> ajouter 226
  const withCountryCode = withoutInternationalPrefix.startsWith("226")
    ? withoutInternationalPrefix
    : `226${withoutInternationalPrefix}`

  // Un numéro burkinabè local fait exactement 8 chiffres (+226 en préfixe) -
  // rejeter toute autre longueur pour éviter que deux saisies malformées
  // différentes (ex: "7000" et "0 70 00 00 00") ne produisent deux
  // identifiants distincts au lieu d'un rejet clair. Voir revue finale.
  if (withCountryCode.length !== 11) {
    throw new Error("Numéro de téléphone invalide")
  }

  return `+${withCountryCode}`
}
