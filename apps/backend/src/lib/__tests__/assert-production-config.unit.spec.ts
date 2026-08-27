import { assertProductionConfig } from "../assert-production-config"

describe("assertProductionConfig", () => {
  const validEnv = {
    NODE_ENV: "production",
    JWT_SECRET: "a".repeat(32),
    COOKIE_SECRET: "b".repeat(32),
    STORE_CORS: "https://boutique.golden-market.co",
    ADMIN_CORS: "https://admin.golden-market.co",
    AUTH_CORS: "https://admin.golden-market.co",
  }

  it("ne fait rien hors production, même avec des valeurs de dev", () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: "development",
        JWT_SECRET: "supersecret",
        COOKIE_SECRET: "supersecret",
        STORE_CORS: "http://localhost:8000",
        ADMIN_CORS: "http://localhost:9000",
        AUTH_CORS: "http://localhost:9000",
      })
    ).not.toThrow()
  })

  it("ne lève rien en production quand toute la config est saine", () => {
    expect(() => assertProductionConfig(validEnv)).not.toThrow()
  })

  it("lève une erreur si JWT_SECRET vaut encore la valeur de dev", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, JWT_SECRET: "supersecret" })
    ).toThrow(/JWT_SECRET/)
  })

  it("lève une erreur si COOKIE_SECRET est trop court", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, COOKIE_SECRET: "trop-court" })
    ).toThrow(/COOKIE_SECRET/)
  })

  it("lève une erreur si JWT_SECRET est absent", () => {
    const { JWT_SECRET, ...rest } = validEnv
    expect(() => assertProductionConfig(rest)).toThrow(/JWT_SECRET/)
  })

  it("lève une erreur si STORE_CORS contient localhost", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, STORE_CORS: "https://boutique.golden-market.co,http://localhost:8000" })
    ).toThrow(/STORE_CORS/)
  })

  it("lève une erreur si ADMIN_CORS contient localhost", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, ADMIN_CORS: "http://localhost:9000" })
    ).toThrow(/ADMIN_CORS/)
  })

  it("lève une erreur si AUTH_CORS contient localhost", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, AUTH_CORS: "http://localhost:9000" })
    ).toThrow(/AUTH_CORS/)
  })
})
