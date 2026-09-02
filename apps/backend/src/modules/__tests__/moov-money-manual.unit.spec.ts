import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { MoovMoneyManualService } from "../moov-money-manual"

describe("MoovMoneyManualService", () => {
  const container = {}
  const options = {
    phone_number: "+22661853737",
    account_name: "Golden Market",
  }

  it("initiates a payment session with the transfer instructions", async () => {
    const service = new MoovMoneyManualService(container, options)

    const result = await service.initiatePayment({} as any)

    expect(typeof result.id).toBe("string")
    expect(result.data).toMatchObject({
      provider: "moov-money-manual",
      phone_number: "+22661853737",
      account_name: "Golden Market",
    })
  })

  it("authorizes the payment session immediately", async () => {
    const service = new MoovMoneyManualService(container, options)

    const result = await service.authorizePayment({} as any)

    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED)
  })
})
