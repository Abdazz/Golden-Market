import { registerCustomerFromOrder } from "../register-customer-from-order"

function createFakeAuthModuleService() {
  return {
    register: jest.fn(async () => ({
      success: true,
      authIdentity: { id: "authid_phone_1" },
    })),
    requestAuthVerification: jest.fn(async () => ({
      code: "482913",
      expires_at: new Date(),
    })),
    confirmAuthVerification: jest.fn(async () => ({ verified_at: new Date() })),
  }
}

describe("registerCustomerFromOrder", () => {
  it("enregistre l'identité phone-pass puis confirme la vérification sans jamais afficher de code", async () => {
    const authModuleService = createFakeAuthModuleService()

    const result = await registerCustomerFromOrder(authModuleService as any, {
      phone: "+22670000000",
      password: "motdepasse123",
    })

    expect(result).toEqual({ success: true, authIdentityId: "authid_phone_1" })
    expect(authModuleService.register).toHaveBeenCalledWith("phone-pass", {
      body: { email: "+22670000000", password: "motdepasse123" },
    })
    expect(authModuleService.requestAuthVerification).toHaveBeenCalledWith({
      entity_id: "+22670000000",
      auth_identity_id: "authid_phone_1",
      entity_type: "phone",
      code_provider: "whatsapp-otp",
    })
    expect(authModuleService.confirmAuthVerification).toHaveBeenCalledWith({
      code: "482913",
      code_provider: "whatsapp-otp",
    })
  })

  it("retourne une erreur si l'enregistrement de l'identité échoue", async () => {
    const authModuleService = createFakeAuthModuleService()
    authModuleService.register = jest.fn(async () => ({
      success: false,
      error: "Identity with email already exists",
    }))

    const result = await registerCustomerFromOrder(authModuleService as any, {
      phone: "+22670000000",
      password: "motdepasse123",
    })

    expect(result).toEqual({
      success: false,
      error: "Identity with email already exists",
    })
    expect(authModuleService.requestAuthVerification).not.toHaveBeenCalled()
  })
})
