import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { CashOnDeliveryService } from "../cash-on-delivery"

describe("CashOnDeliveryService", () => {
  const container = {}

  it("initiates a payment session with the pay-on-delivery note", async () => {
    const service = new CashOnDeliveryService(container, {})

    const result = await service.initiatePayment({} as any)

    expect(typeof result.id).toBe("string")
    expect(result.data).toMatchObject({
      provider: "cash-on-delivery",
    })
  })

  it("authorizes the payment session immediately", async () => {
    const service = new CashOnDeliveryService(container, {})

    const result = await service.authorizePayment({} as any)

    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED)
  })
})
