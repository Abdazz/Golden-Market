import handler from "../auth-verification-requested-whatsapp"

function createFakeLogger() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}

function createFakeContainer(overrides: { logger?: ReturnType<typeof createFakeLogger> } = {}) {
  const logger = overrides.logger ?? createFakeLogger()
  return {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      throw new Error(`Clé de résolution inattendue dans le test : ${key}`)
    }),
    logger,
  }
}

describe("auth-verification-requested-whatsapp subscriber", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/whatsapp-order"
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET = "test-secret"
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("ignore les événements dont le code_provider n'est pas whatsapp-otp", async () => {
    global.fetch = jest.fn() as any
    const container = createFakeContainer()

    await handler({
      event: { data: { entity_id: "+22670000000", code_provider: "token", code: "123456" } },
      container: container as any,
    } as any)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("envoie le code via le webhook n8n existant pour un événement whatsapp-otp", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any
    const container = createFakeContainer()

    await handler({
      event: {
        data: {
          entity_id: "+22670000000",
          code_provider: "whatsapp-otp",
          code: "482913",
        },
      },
      container: container as any,
    } as any)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("https://n8n.example.com/webhook/whatsapp-order")
    expect(init.method).toBe("POST")
    expect(init.headers["x-webhook-secret"]).toBe("test-secret")
    expect(JSON.parse(init.body)).toEqual({
      phone: "+22670000000",
      template_name: "account_verification_code",
      params: ["482913"],
    })
  })

  it("ne relance jamais d'exception si le webhook échoue", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    const logger = createFakeLogger()
    const container = createFakeContainer({ logger })

    await expect(
      handler({
        event: { data: { entity_id: "+22670000000", code_provider: "whatsapp-otp", code: "111111" } },
        container: container as any,
      } as any)
    ).resolves.not.toThrow()

    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it("ne fait rien si N8N_ORDER_CONFIRMATION_WEBHOOK_URL n'est pas configuré", async () => {
    delete process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
    global.fetch = jest.fn() as any
    const logger = createFakeLogger()
    const container = createFakeContainer({ logger })

    await handler({
      event: { data: { entity_id: "+22670000000", code_provider: "whatsapp-otp", code: "111111" } },
      container: container as any,
    } as any)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledTimes(1)
  })
})
