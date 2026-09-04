import { retryWhile } from "../retry-while"

describe("retryWhile", () => {
  it("returns immediately when shouldRetry is false on the first try", async () => {
    const fn = jest.fn().mockResolvedValue(42)

    const result = await retryWhile(fn, () => false, { delayMs: 0 })

    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries until shouldRetry returns false, up to the attempts limit", async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(17000)

    const result = await retryWhile(fn, (value) => value === 0, {
      attempts: 5,
      delayMs: 0,
    })

    expect(result).toBe(17000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("stops retrying after reaching the attempts limit and returns the last result", async () => {
    const fn = jest.fn().mockResolvedValue(0)

    const result = await retryWhile(fn, (value) => value === 0, {
      attempts: 3,
      delayMs: 0,
    })

    expect(result).toBe(0)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
