import { linkEmailIdentity } from "../link-email-identity"

function createFakeAuthModuleService(overrides: { existingIdentityCustomerId?: string | null } = {}) {
  return {
    register: jest.fn(async () => ({
      success: true,
      authIdentity: { id: "authid_email_1" },
    })),
    listAuthIdentities: jest.fn(async () => {
      if (overrides.existingIdentityCustomerId === undefined) {
        return []
      }
      return [
        {
          id: "authid_email_existing",
          app_metadata: overrides.existingIdentityCustomerId
            ? { customer_id: overrides.existingIdentityCustomerId }
            : {},
        },
      ]
    }),
  }
}

jest.mock("@medusajs/core-flows", () => ({
  setAuthAppMetadataWorkflow: () => ({
    run: jest.fn(async () => ({ result: {} })),
  }),
}))

describe("linkEmailIdentity", () => {
  const container = { resolve: jest.fn() } as any

  it("crée une identité email et la lie au client donné", async () => {
    const authModuleService = createFakeAuthModuleService()

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "motdepasse123",
      customerId: "cus_1",
    })

    expect(result).toEqual({ success: true })
    expect(authModuleService.listAuthIdentities).toHaveBeenCalledWith({
      provider_identities: { entity_id: "client@example.com", provider: "emailpass" },
    })
    expect(authModuleService.register).toHaveBeenCalledWith("emailpass", {
      body: { email: "client@example.com", password: "motdepasse123" },
    })
  })

  it("refuse si l'email est déjà lié à un autre client", async () => {
    const authModuleService = createFakeAuthModuleService({ existingIdentityCustomerId: "cus_other" })

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "motdepasse123",
      customerId: "cus_1",
    })

    expect(result).toEqual({
      success: false,
      error: "Cet email est déjà associé à un autre compte.",
    })
    expect(authModuleService.register).not.toHaveBeenCalled()
  })

  it("autorise si l'email existe déjà mais appartient déjà au même client", async () => {
    const authModuleService = createFakeAuthModuleService({ existingIdentityCustomerId: "cus_1" })

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "motdepasse123",
      customerId: "cus_1",
    })

    expect(result).toEqual({ success: true })
  })

  it("retourne une erreur si l'enregistrement de l'identité échoue", async () => {
    const authModuleService = createFakeAuthModuleService()
    authModuleService.register = jest.fn(async () => ({
      success: false,
      error: "Password should be a string",
    }))

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "",
      customerId: "cus_1",
    })

    expect(result).toEqual({ success: false, error: "Password should be a string" })
  })
})
