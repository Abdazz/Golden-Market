import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { OrangeMoneyManualService } from "../orange-money-manual"

describe("OrangeMoneyManualService", () => {
  const container = {}
  const options = {
    phone_number: "+22670000000",
    account_name: "Golden Market",
  }

  it("initiates a payment session with the transfer instructions", async () => {
    const service = new OrangeMoneyManualService(container, options)

    const result = await service.initiatePayment({} as any)

    expect(typeof result.id).toBe("string")
    expect(result.data).toMatchObject({
      provider: "orange-money-manual",
      phone_number: "+22670000000",
      account_name: "Golden Market",
    })
  })

  it("authorizes the payment session immediately", async () => {
    const service = new OrangeMoneyManualService(container, options)

    const result = await service.authorizePayment({} as any)

    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED)
  })
})
