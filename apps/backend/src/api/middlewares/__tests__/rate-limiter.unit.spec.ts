import { checkRateLimit } from "../rate-limiter"

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
})
