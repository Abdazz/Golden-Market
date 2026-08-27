import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { checkRateLimit } from "../rate-limiter"
import { resetPasswordRateLimitMiddleware } from "../../middlewares"

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

function createFakeReq(overrides: Partial<{ ip: string; body: unknown; scope: unknown }> = {}) {
  return {
    ip: overrides.ip ?? "203.0.113.1",
    socket: { remoteAddress: "203.0.113.1" },
    body: overrides.body,
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

describe("checkRateLimit", () => {
  const options = { maxRequests: 3, windowSeconds: 60 }

  it("autorise les requêtes tant que la limite n'est pas atteinte", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    const first = await checkRateLimit(cache as any, "rl:test", options, now)
    const second = await checkRateLimit(cache as any, "rl:test", options, now + 1_000)
    const third = await checkRateLimit(cache as any, "rl:test", options, now + 2_000)

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(true)
  })

  it("bloque la requête une fois la limite atteinte dans la fenêtre", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    await checkRateLimit(cache as any, "rl:test", options, now)
    await checkRateLimit(cache as any, "rl:test", options, now + 1_000)
    await checkRateLimit(cache as any, "rl:test", options, now + 2_000)
    const fourth = await checkRateLimit(cache as any, "rl:test", options, now + 3_000)

    expect(fourth.allowed).toBe(false)
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("réautorise une fois la fenêtre expirée", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    await checkRateLimit(cache as any, "rl:test", options, now)
    await checkRateLimit(cache as any, "rl:test", options, now + 1_000)
    await checkRateLimit(cache as any, "rl:test", options, now + 2_000)

    const afterWindow = await checkRateLimit(
      cache as any,
      "rl:test",
      options,
      now + options.windowSeconds * 1000 + 1
    )

    expect(afterWindow.allowed).toBe(true)
  })

  it("traite des clés différentes indépendamment", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    await checkRateLimit(cache as any, "rl:ip-a", options, now)
    await checkRateLimit(cache as any, "rl:ip-a", options, now)
    await checkRateLimit(cache as any, "rl:ip-a", options, now)

    const otherKey = await checkRateLimit(cache as any, "rl:ip-b", options, now)

    expect(otherKey.allowed).toBe(true)
  })

  it("lance une erreur si le cache échoue", async () => {
    const cache = {
      get: jest.fn(async () => {
        throw new Error("Cache indisponible")
      }),
      set: jest.fn(async () => {}),
      invalidate: jest.fn(async () => {}),
    }
    const now = 1_000_000

    await expect(checkRateLimit(cache as any, "rl:test", options, now)).rejects.toThrow(
      "Cache indisponible"
    )
  })
})

describe("resetPasswordRateLimitMiddleware", () => {
  it("bloque après 5 requêtes sur le bucket IP seul (sans identifiant) et répond au format standard", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope, body: undefined })
      const res = createFakeRes()
      await resetPasswordRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    const req = createFakeReq({ scope, body: undefined })
    const res = createFakeRes()
    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.jsonBody).toEqual({
      type: "rate_limit_exceeded",
      message: "Trop de demandes de réinitialisation de mot de passe. Réessayez plus tard.",
    })
  })

  it("applique un bucket par identifiant, indépendant du bucket IP (IP différente à chaque requête)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()
    const identifier = "client@example.com"

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope, ip: `203.0.113.${10 + i}`, body: { identifier } })
      const res = createFakeRes()
      await resetPasswordRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    // IP inédite (donc bucket IP forcément vierge) mais même identifiant : seul le
    // bucket par identifiant peut expliquer un blocage ici.
    const req = createFakeReq({ scope, ip: "203.0.113.99", body: { identifier } })
    const res = createFakeRes()
    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
  })

  it("un identifiant différent n'est pas affecté par le quota d'un autre identifiant", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope, ip: `203.0.113.${20 + i}`, body: { identifier: "a@example.com" } })
      const res = createFakeRes()
      await resetPasswordRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope, ip: "203.0.113.30", body: { identifier: "b@example.com" } })
    const res = createFakeRes()
    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it("normalise l'identifiant (casse et espaces) avant de construire la clé du bucket", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({
        scope,
        ip: `203.0.113.${40 + i}`,
        body: { identifier: "Test@Example.com" },
      })
      const res = createFakeRes()
      await resetPasswordRateLimitMiddleware(req, res, next)
    }

    // Même compte, casse différente et espaces superflus : doit retomber sur le bucket
    // déjà saturé plutôt qu'un bucket vierge.
    const req = createFakeReq({ scope, ip: "203.0.113.50", body: { identifier: "  test@example.com  " } })
    const res = createFakeRes()
    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
  })

  it("retombe uniquement sur le bucket IP quand req.body.identifier est absent ou invalide, sans planter (req.validatedBody pas encore disponible à ce stade du pipeline)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    const req = createFakeReq({ scope, body: { identifier: 12345 } })
    expect((req as any).validatedBody).toBeUndefined()
    const res = createFakeRes()

    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("ne plante pas quand req.body est undefined", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()
    const req = createFakeReq({ scope, body: undefined })
    const res = createFakeRes()

    await expect(resetPasswordRateLimitMiddleware(req, res, next)).resolves.not.toThrow()
    expect(res.status).not.toHaveBeenCalled()
  })

  it("laisse passer la requête et logue une erreur (pas un warning) si la résolution du cache échoue", async () => {
    const logger = createFakeLogger()
    const scope = createFakeScope({ throwOnCacheResolve: true, logger })
    const next = jest.fn()
    const req = createFakeReq({ scope, body: { identifier: "client@example.com" } })
    const res = createFakeRes()

    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
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
    const req = createFakeReq({ scope, body: { identifier: "client@example.com" } })
    const res = createFakeRes()

    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toContain("Redis indisponible")
  })

  it("gère aussi une valeur non-Error levée dans le message de log (fallback String(error))", async () => {
    const cache = {
      get: jest.fn(async () => {
        throw "chaîne brute"
      }),
      set: jest.fn(async () => {}),
      invalidate: jest.fn(async () => {}),
    }
    const logger = createFakeLogger()
    const scope = createFakeScope({ cache, logger })
    const next = jest.fn()
    const req = createFakeReq({ scope, body: { identifier: "client@example.com" } })
    const res = createFakeRes()

    await resetPasswordRateLimitMiddleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toContain("chaîne brute")
  })
})
