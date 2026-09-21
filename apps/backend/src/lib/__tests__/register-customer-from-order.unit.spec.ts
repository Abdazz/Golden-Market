jest.mock("@medusajs/core-flows", () => ({
  requestVerificationWorkflow: jest.fn(),
}))

import { requestVerificationWorkflow } from "@medusajs/core-flows"
import { registerCustomerFromOrder } from "../register-customer-from-order"

function createFakeAuthModuleService() {
  return {
    register: jest.fn(async () => ({
      success: true,
      authIdentity: { id: "authid_phone_1" },
    })),
  }
}

describe("registerCustomerFromOrder", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requestVerificationWorkflow as jest.Mock).mockReturnValue({
      run: jest.fn(async () => ({ result: { code_provider: "whatsapp-otp" } })),
    })
  })

  it("enregistre l'identité phone-pass puis envoie un vrai code WhatsApp (sans jamais le confirmer elle-même)", async () => {
    const authModuleService = createFakeAuthModuleService()
    const container = {}

    const result = await registerCustomerFromOrder(authModuleService as any, container, {
      phone: "+22670000000",
      password: "motdepasse123",
    })

    expect(result).toEqual({ success: true, authIdentityId: "authid_phone_1" })
    expect(authModuleService.register).toHaveBeenCalledWith("phone-pass", {
      body: { email: "+22670000000", password: "motdepasse123" },
    })
    expect(requestVerificationWorkflow).toHaveBeenCalledWith(container)
    const runMock = (requestVerificationWorkflow as jest.Mock).mock.results[0].value.run
    expect(runMock).toHaveBeenCalledWith({
      input: {
        auth_identity_id: "authid_phone_1",
        entity_id: "+22670000000",
        entity_type: "phone",
        code_provider: "whatsapp-otp",
      },
    })
  })

  it("retourne une erreur si l'enregistrement de l'identité échoue, sans jamais envoyer de code", async () => {
    const authModuleService = createFakeAuthModuleService()
    authModuleService.register = jest.fn(async () => ({
      success: false,
      error: "Identity with email already exists",
    }))

    const result = await registerCustomerFromOrder(authModuleService as any, {}, {
      phone: "+22670000000",
      password: "motdepasse123",
    })

    expect(result).toEqual({
      success: false,
      error: "Identity with email already exists",
    })
    expect(requestVerificationWorkflow).not.toHaveBeenCalled()
  })
})
