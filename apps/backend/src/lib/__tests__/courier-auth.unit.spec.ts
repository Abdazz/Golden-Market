import { hashPin, isValidPin, signCourierToken, verifyCourierToken, verifyPin } from "../courier-auth"

describe("PIN", () => {
  it("4 chiffres exactement", () => {
    expect(isValidPin("1234")).toBe(true)
    for (const bad of ["123", "12345", "12a4", "", " 1234", 1234, null, undefined]) expect(isValidPin(bad)).toBe(false)
  })
  it("haché (jamais en clair), vérifiable, sel différent à chaque fois", () => {
    const a = hashPin("1234")
    const b = hashPin("1234")
    expect(a).not.toContain("1234")
    expect(a).not.toEqual(b)
    expect(verifyPin("1234", a)).toBe(true)
    expect(verifyPin("1235", a)).toBe(false)
    expect(verifyPin("1234", "n-importe-quoi")).toBe(false)
  })
})

describe("jeton livreur", () => {
  const secret = "secret-de-test"
  const now = 1_800_000_000_000
  it("aller-retour", () => {
    expect(verifyCourierToken(signCourierToken("cour_1", secret, now), secret, now + 1000)).toBe("cour_1")
  })
  it("expiré après 12 h", () => {
    const token = signCourierToken("cour_1", secret, now)
    expect(verifyCourierToken(token, secret, now + 12 * 3600 * 1000 + 1000)).toBeNull()
  })
  it("falsifié ou mauvais secret", () => {
    const token = signCourierToken("cour_1", secret, now)
    const [payload, sig] = token.split(".")
    expect(verifyCourierToken(`${Buffer.from(JSON.stringify({ c: "cour_2", e: now + 5000 })).toString("base64url")}.${sig}`, secret, now)).toBeNull()
    expect(verifyCourierToken(token, "autre", now)).toBeNull()
    expect(verifyCourierToken("abc", secret, now)).toBeNull()
    expect(verifyCourierToken(`${payload}.`, secret, now)).toBeNull()
  })
  it("signature non ASCII de 43 caractères : null, sans exception", () => {
    const token = signCourierToken("cour_1", secret, now)
    const [payload] = token.split(".")
    const forged = `${payload}.é${"A".repeat(42)}`
    expect(forged.split(".")[1]).toHaveLength(43)
    expect(() => verifyCourierToken(forged, secret, now)).not.toThrow()
    expect(verifyCourierToken(forged, secret, now)).toBeNull()
  })
  it("token qui n'a pas exactement deux parties : null", () => {
    expect(verifyCourierToken("a.b.c", secret, now)).toBeNull()
  })
})
