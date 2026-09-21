// apps/backend/src/modules/__tests__/whatsapp-otp-verification.unit.spec.ts
import { WhatsappOtpVerificationProvider } from "../whatsapp-otp-verification"

function createFakeAuthVerificationService() {
  const records: any[] = []
  return {
    list: jest.fn(async (filter: any, config: any) => {
      let result = records.filter((r) => {
        if (filter.auth_identity_id && r.auth_identity_id !== filter.auth_identity_id) return false
        if (filter.entity_id && r.entity_id !== filter.entity_id) return false
        if (filter.entity_type && r.entity_type !== filter.entity_type) return false
        if (filter.code_provider && r.code_provider !== filter.code_provider) return false
        if (filter.verified_at === null && r.verified_at != null) return false
        if (filter.provider_metadata?.code_hash) {
          return r.provider_metadata?.code_hash === filter.provider_metadata.code_hash
        }
        return true
      })

      if (config?.order?.requested_at === "DESC") {
        result = [...result].sort(
          (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
        )
      }

      if (config?.take) {
        result = result.slice(0, config.take)
      }

      return result
    }),
    create: jest.fn(async (data: any) => {
      const record = { id: `authver_${records.length + 1}`, verified_at: null, ...data }
      records.push(record)
      return record
    }),
    update: jest.fn(async (data: any) => {
      const index = records.findIndex((r) => r.id === data.id)
      records[index] = { ...records[index], ...data }
      return records[index]
    }),
    _records: records,
  }
}

describe("WhatsappOtpVerificationProvider", () => {
  const baseRequestData = {
    entity_id: "+22670000000",
    auth_identity_id: "authid_1",
    entity_type: "phone",
    code_provider: "whatsapp-otp",
  }

  it("génère un code à 6 chiffres numériques lors d'une demande", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const result = await provider.request(baseRequestData)

    expect(result.code).toMatch(/^\d{6}$/)
    expect(result.expires_at).toBeInstanceOf(Date)
    expect(service.create).toHaveBeenCalledTimes(1)
  })

  it("ne stocke jamais le code en clair, seulement son hash", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const result = await provider.request(baseRequestData)

    const stored = service._records[0]
    expect(stored.provider_metadata.code_hash).toBeDefined()
    expect(stored.provider_metadata.code_hash).not.toBe(result.code)
  })

  it("retourne la vérification existante sans en créer une nouvelle si déjà confirmée", async () => {
    const service = createFakeAuthVerificationService()
    service._records.push({
      id: "authver_existing",
      auth_identity_id: "authid_1",
      entity_id: "+22670000000",
      entity_type: "phone",
      verified_at: new Date(),
      provider_metadata: { code_hash: "irrelevant" },
    })
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const result = await provider.request(baseRequestData)

    expect(result.id).toBe("authver_existing")
    expect(service.create).not.toHaveBeenCalled()
  })

  it("confirme un code valide et non expiré", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)
    const confirmed = await provider.confirm({
      code,
      code_provider: "whatsapp-otp",
      auth_identity_id: "authid_1",
    })

    expect(confirmed.verified_at).not.toBeNull()
  })

  it("rejette un code invalide", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    await provider.request(baseRequestData)

    await expect(
      provider.confirm({ code: "000000", auth_identity_id: "authid_1" })
    ).rejects.toThrow("Verification code is invalid or already used")
  })

  it("rejette un code déjà utilisé", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)
    await provider.confirm({ code, auth_identity_id: "authid_1" })

    await expect(provider.confirm({ code, auth_identity_id: "authid_1" })).rejects.toThrow(
      "Verification code is invalid or already used"
    )
  })

  it("rejette un code expiré (TTL de 10 minutes)", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)
    // Recule artificiellement la date de demande de 11 minutes.
    service._records[0].requested_at = new Date(Date.now() - 11 * 60 * 1000)

    await expect(
      provider.confirm({ code, auth_identity_id: "authid_1" })
    ).rejects.toThrow("Verification code has expired")
  })

  it("met à jour un enregistrement non vérifié existant lors d'une deuxième demande (chemin resend-code)", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    // Première demande
    const firstResult = await provider.request(baseRequestData)
    const firstCode = firstResult.code
    const firstHash = service._records[0].provider_metadata.code_hash

    // Réinitialiser les mocks pour isoler les appels
    service.create.mockClear()
    service.update.mockClear()

    // Deuxième demande avec les mêmes identifiants
    const secondResult = await provider.request(baseRequestData)
    const secondCode = secondResult.code

    // Assertions pour le chemin "update" (Finding 3)
    expect(service.update).toHaveBeenCalledTimes(1)
    expect(service.create).not.toHaveBeenCalled()
    expect(secondCode).not.toBe(firstCode)
    expect(service._records[0].provider_metadata.code_hash).not.toBe(firstHash)
  })

  it("rejette la confirmation si auth_identity_id est absent, même avec un code correct", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)

    await expect(provider.confirm({ code, code_provider: "whatsapp-otp" })).rejects.toThrow(
      "Authentication context required to confirm a verification code"
    )
  })

  it("bloque après 5 tentatives erronées, même si la 6e tentative aurait été le bon code", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)

    for (let i = 0; i < 5; i++) {
      await expect(
        provider.confirm({ code: "000000", auth_identity_id: "authid_1" })
      ).rejects.toThrow("Verification code is invalid or already used")
    }

    await expect(
      provider.confirm({ code, auth_identity_id: "authid_1" })
    ).rejects.toThrow("Too many attempts, request a new code")
  })

  it("incrémente provider_metadata.attempts sur un code erroné sans lever une erreur imprévue", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    await provider.request(baseRequestData)

    await expect(
      provider.confirm({ code: "000000", auth_identity_id: "authid_1" })
    ).rejects.toThrow("Verification code is invalid or already used")

    expect(service._records[0].provider_metadata.attempts).toBe(1)
  })

  it("confirme toujours un code correct tant que le nombre de tentatives est sous la limite", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)

    for (let i = 0; i < 3; i++) {
      await expect(
        provider.confirm({ code: "000000", auth_identity_id: "authid_1" })
      ).rejects.toThrow("Verification code is invalid or already used")
    }

    const confirmed = await provider.confirm({ code, auth_identity_id: "authid_1" })
    expect(confirmed.verified_at).not.toBeNull()
  })
})
