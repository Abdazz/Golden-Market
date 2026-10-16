import { scryptSync } from "crypto"
import { decryptPin, encryptPin, hashPin, isValidPin, resolveClientIp, signCourierToken, verifyCourierToken, verifyPin } from "../courier-auth"

describe("PIN", () => {
  it("4 chiffres exactement", () => {
    expect(isValidPin("1234")).toBe(true)
    for (const bad of ["123", "12345", "12a4", "", " 1234", 1234, null, undefined]) expect(isValidPin(bad)).toBe(false)
  })
  it("haché (jamais en clair), vérifiable, sel différent à chaque fois", async () => {
    const a = await hashPin("1234")
    const b = await hashPin("1234")
    expect(a).not.toContain("1234")
    expect(a).not.toEqual(b)
    expect(await verifyPin("1234", a)).toBe(true)
    expect(await verifyPin("1235", a)).toBe(false)
    expect(await verifyPin("1234", "n-importe-quoi")).toBe(false)
  })
  it("un PIN haché avant le passage en asynchrone (scryptSync) se vérifie toujours", async () => {
    const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex")
    const old = `${salt.toString("hex")}:${scryptSync("4321", salt, 32).toString("hex")}`
    expect(await verifyPin("4321", old)).toBe(true)
    expect(await verifyPin("4322", old)).toBe(false)
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

describe("resolveClientIp", () => {
  const relay = { "x-courier-relay-secret": "s3cret", "x-courier-client-ip": "41.1.2.3", "x-forwarded-for": "6.6.6.6" }
  it("sans secret : adresse de connexion, en-têtes transmis ignorés", () => {
    expect(resolveClientIp(relay, "10.0.0.1", undefined)).toEqual({ ok: true, ip: "10.0.0.1" })
    expect(resolveClientIp({}, undefined, "")).toEqual({ ok: true, ip: "unknown" })
  })
  it("secret défini : en-tête absent ou faux refusé", () => {
    expect(resolveClientIp({ "x-courier-client-ip": "41.1.2.3" }, "10.0.0.1", "s3cret")).toEqual({ ok: false })
    expect(resolveClientIp({ ...relay, "x-courier-relay-secret": "s3creT" }, "10.0.0.1", "s3cret")).toEqual({ ok: false })
    expect(resolveClientIp({ ...relay, "x-courier-relay-secret": "s3cret-long" }, "10.0.0.1", "s3cret")).toEqual({ ok: false })
  })
  it("secret défini et bon : adresse posée par le relais, sinon adresse de connexion", () => {
    expect(resolveClientIp(relay, "10.0.0.1", "s3cret")).toEqual({ ok: true, ip: "41.1.2.3" })
    expect(resolveClientIp({ "x-courier-relay-secret": "s3cret" }, "10.0.0.1", "s3cret")).toEqual({ ok: true, ip: "10.0.0.1" })
  })
})

describe("PIN chiffré pour le message d'accès", () => {
  it("se relit avec le même secret, jamais en clair, illisible sinon", () => {
    const a = encryptPin("4826", "secret-a")
    expect(a).not.toContain("4826")
    expect(a).not.toEqual(encryptPin("4826", "secret-a"))
    expect(decryptPin(a, "secret-a")).toBe("4826")
    expect(decryptPin(a, "secret-b")).toBeNull()
    expect(decryptPin(null, "secret-a")).toBeNull()
    expect(decryptPin("zz:zz:zz", "secret-a")).toBeNull()
  })
})
