import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  semanticSearchRateLimitMiddleware,
  whatsappOtpConfirmRateLimitMiddleware,
  whatsappOtpVerificationRateLimitMiddleware,
} from "../middlewares"

function createFakeCache() {
  const store = new Map<string, unknown>()
  return {
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, data: unknown) => {
      store.set(key, data)
    }),
    invalidate: jest.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function createFakeLogger() {
  return {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }
}

function createFakeReq(overrides: Partial<{ ip: string; scope: unknown }> = {}) {
  return {
    ip: overrides.ip ?? "203.0.113.1",
    socket: { remoteAddress: "203.0.113.1" },
    scope: overrides.scope,
  } as any
}

function createFakeRes() {
  const res: any = {
    headers: {} as Record<string, string>,
    statusCode: undefined as number | undefined,
    jsonBody: undefined as unknown,
  }
  res.setHeader = jest.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = jest.fn((body: unknown) => {
    res.jsonBody = body
    return res
  })
  return res
}

function createFakeScope(
  overrides: { cache?: unknown; logger?: ReturnType<typeof createFakeLogger>; throwOnCacheResolve?: boolean } = {}
) {
  const logger = overrides.logger ?? createFakeLogger()
  const resolve = jest.fn((key: string) => {
    if (key === Modules.CACHE) {
      if (overrides.throwOnCacheResolve) {
        throw new Error("Résolution du cache indisponible")
      }
      return overrides.cache
    }
    if (key === ContainerRegistrationKeys.LOGGER) {
      return logger
    }
    throw new Error(`Clé de résolution inattendue dans le test : ${key}`)
  })
  return { resolve, logger }
}

describe("semanticSearchRateLimitMiddleware", () => {
  it("laisse passer les requêtes tant que la limite (30/60s) n'est pas atteinte", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 30; i++) {
      const req = createFakeReq({ scope })
      const res = createFakeRes()
      await semanticSearchRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(30)
  })

  it("bloque au-delà de la limite et répond 429 avec Retry-After, sans appeler next", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 30; i++) {
      const req = createFakeReq({ scope })
      const res = createFakeRes()
      await semanticSearchRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope })
    const res = createFakeRes()
    await semanticSearchRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.jsonBody).toEqual({
      type: "rate_limit_exceeded",
      message: "Trop de requêtes de recherche sémantique. Réessayez plus tard.",
    })
    expect(res.headers["Retry-After"]).toBeDefined()
    expect(next).toHaveBeenCalledTimes(30)
  })

  it("applique un bucket indépendant par IP", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 30; i++) {
      const req = createFakeReq({ scope, ip: "203.0.113.10" })
      const res = createFakeRes()
      await semanticSearchRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope, ip: "203.0.113.20" })
    const res = createFakeRes()
    await semanticSearchRateLimitMiddleware(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it("laisse passer la requête et logue une erreur si la résolution du cache échoue", async () => {
    const logger = createFakeLogger()
    const scope = createFakeScope({ throwOnCacheResolve: true, logger })
    const next = jest.fn()
    const req = createFakeReq({ scope })
    const res = createFakeRes()

    await semanticSearchRateLimitMiddleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toContain("Résolution du cache indisponible")
  })

  it("laisse passer la requête si checkRateLimit rejette (ex: Redis indisponible)", async () => {
    const cache = {
      get: jest.fn(async () => {
        throw new Error("Redis indisponible")
      }),
      set: jest.fn(async () => {}),
      invalidate: jest.fn(async () => {}),
    }
    const logger = createFakeLogger()
    const scope = createFakeScope({ cache, logger })
    const next = jest.fn()
    const req = createFakeReq({ scope })
    const res = createFakeRes()

    await semanticSearchRateLimitMiddleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toContain("Redis indisponible")
  })
})

describe("whatsappOtpVerificationRateLimitMiddleware", () => {
  it("laisse passer les requêtes tant que la limite (5/15min) n'est pas atteinte", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000000" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(5)
  })

  it("bloque au-delà de la limite et répond 429", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000000" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope })
    req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000000" }
    const res = createFakeRes()
    await whatsappOtpVerificationRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.headers["Retry-After"]).toBeDefined()
    expect(next).toHaveBeenCalledTimes(5)
  })

  it("ne limite jamais une demande pour un autre code_provider (ex: token)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 10; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "token", entity_id: "someone@example.com" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(10)
  })

  it("applique un bucket indépendant par entity_id (numéro de téléphone)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000001" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope })
    req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000002" }
    const res = createFakeRes()
    await whatsappOtpVerificationRateLimitMiddleware(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})

describe("whatsappOtpConfirmRateLimitMiddleware", () => {
  it("laisse passer les requêtes tant que la limite (20/15min) n'est pas atteinte", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 20; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", code: "000000" }
      const res = createFakeRes()
      await whatsappOtpConfirmRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(20)
  })

  it("bloque au-delà de la limite et répond 429", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 20; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", code: "000000" }
      const res = createFakeRes()
      await whatsappOtpConfirmRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope })
    req.body = { code_provider: "whatsapp-otp", code: "000000" }
    const res = createFakeRes()
    await whatsappOtpConfirmRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.headers["Retry-After"]).toBeDefined()
    expect(next).toHaveBeenCalledTimes(20)
  })

  it("ne limite jamais une confirmation pour un autre code_provider (ex: token)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 25; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "token", code: "abc123" }
      const res = createFakeRes()
      await whatsappOtpConfirmRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(25)
  })

  it("applique un bucket indépendant par IP", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 20; i++) {
      const req = createFakeReq({ scope, ip: "203.0.113.30" })
      req.body = { code_provider: "whatsapp-otp", code: "000000" }
      const res = createFakeRes()
      await whatsappOtpConfirmRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope, ip: "203.0.113.40" })
    req.body = { code_provider: "whatsapp-otp", code: "000000" }
    const res = createFakeRes()
    await whatsappOtpConfirmRateLimitMiddleware(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})
