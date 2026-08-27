import type { ICacheService } from "@medusajs/framework/types"

export type RateLimitOptions = {
  maxRequests: number
  windowSeconds: number
}

export type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

type RateLimitRecord = {
  count: number
  resetAt: number
}

export async function checkRateLimit(
  cache: ICacheService,
  key: string,
  options: RateLimitOptions,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const record = await cache.get<RateLimitRecord>(key)

  if (record && record.resetAt > now) {
    if (record.count >= options.maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000) }
    }

    const remainingTtl = Math.ceil((record.resetAt - now) / 1000)
    await cache.set(key, { count: record.count + 1, resetAt: record.resetAt }, remainingTtl)
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const resetAt = now + options.windowSeconds * 1000
  await cache.set(key, { count: 1, resetAt }, options.windowSeconds)
  return { allowed: true, retryAfterSeconds: 0 }
}
