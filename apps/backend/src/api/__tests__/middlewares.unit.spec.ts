import express from "express"
import type { Server } from "http"
import { resetPasswordRateLimiter } from "../middlewares"

describe("resetPasswordRateLimiter", () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.post(
      "/auth/customer/emailpass/reset-password",
      resetPasswordRateLimiter,
      (_req, res) => {
        res.sendStatus(201)
      }
    )

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(() => {
    server.close()
  })

  it("allows requests under the limit and blocks once it is exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await fetch(
        `${baseUrl}/auth/customer/emailpass/reset-password`,
        { method: "POST" }
      )
      expect(response.status).toBe(201)
    }

    const blocked = await fetch(
      `${baseUrl}/auth/customer/emailpass/reset-password`,
      { method: "POST" }
    )
    expect(blocked.status).toBe(429)
  })
})
