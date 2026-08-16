jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn() },
  })),
}))

import ResendNotificationProviderService from "../resend/service"

describe("ResendNotificationProviderService", () => {
  const logger = { info: jest.fn(), error: jest.fn() }

  const buildService = () =>
    new (ResendNotificationProviderService as any)(
      { logger },
      { api_key: "re_test", from: "commandes@golden-market.co" }
    )

  it("sends the order-placed template through the Resend client", async () => {
    const service = buildService()
    const sendMock = (service as any).resendClient.emails.send as jest.Mock
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null })

    const result = await service.send({
      to: "client@example.com",
      channel: "email",
      template: "order-placed",
      data: { display_id: 42, total: 15000, currency_code: "xof" },
    })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "commandes@golden-market.co",
        to: ["client@example.com"],
        subject: expect.stringContaining("#42"),
      })
    )
    expect(result).toEqual({ id: "email_123" })
  })

  it("logs and returns an empty result when the template is unknown", async () => {
    const service = buildService()

    const result = await service.send({
      to: "client@example.com",
      channel: "email",
      template: "unknown-template",
      data: {},
    })

    expect(result).toEqual({})
    expect(logger.error).toHaveBeenCalled()
  })
})
