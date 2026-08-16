import { Modules } from "@medusajs/framework/utils"
import passwordResetHandler from "../auth-password-reset"

describe("passwordResetHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const createNotifications = jest.fn()

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === Modules.NOTIFICATION) return { createNotifications }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalStorefrontUrl = process.env.STOREFRONT_URL

  afterEach(() => {
    jest.clearAllMocks()
    process.env.STOREFRONT_URL = originalStorefrontUrl
  })

  it("sends a password reset email for customers", async () => {
    process.env.STOREFRONT_URL = "https://boutique.golden-market.co"

    await passwordResetHandler({
      event: {
        data: {
          entity_id: "client@example.com",
          token: "reset-token-123",
          actor_type: "customer",
        },
      } as any,
      container: container as any,
    })

    expect(createNotifications).toHaveBeenCalledWith({
      to: "client@example.com",
      channel: "email",
      template: "password-reset",
      data: {
        reset_url:
          "https://boutique.golden-market.co/reset-password?token=reset-token-123&email=client%40example.com",
      },
    })
  })

  it("ignores password reset events for non-customer actors", async () => {
    await passwordResetHandler({
      event: {
        data: {
          entity_id: "admin@golden-market.co",
          token: "reset-token-456",
          actor_type: "user",
        },
      } as any,
      container: container as any,
    })

    expect(createNotifications).not.toHaveBeenCalled()
  })
})
