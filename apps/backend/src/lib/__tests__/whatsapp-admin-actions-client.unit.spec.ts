import { runAdminAction } from "../whatsapp-admin-actions-client"

const jsonResponse = (status: number, body: unknown) =>
  ({ status, ok: status < 400, json: async () => body }) as unknown as Response

describe("runAdminAction", () => {
  const deps = { url: "https://n8n.test/webhook/admin-conversation-action", secret: "s3cret" }

  it("renvoie unavailable sans appeler n8n quand la configuration est absente", async () => {
    const fetchImpl = jest.fn()
    const result = await runAdminAction(
      { action: "take_over", phoneNumber: "22670000000" },
      { url: undefined, secret: undefined, fetchImpl }
    )
    expect(result.kind).toBe("unavailable")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("envoie l'action, le numéro, le texte et le secret en en-tête", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, message: null, warning: null }))
    await runAdminAction(
      { action: "send_text", phoneNumber: "22670000000", text: "Bonjour 👋\nÀ bientôt" },
      { ...deps, fetchImpl }
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      deps.url,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-actions-secret": "s3cret" },
        body: JSON.stringify({ action: "send_text", phone_number: "22670000000", text: "Bonjour 👋\nÀ bientôt" }),
      })
    )
  })

  it("traduit un succès avec le message enregistré", async () => {
    const message = { role: "human", content: "Bonjour", createdAt: "2026-09-27T10:00:00.000Z" }
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, message, warning: null }))
    expect(
      await runAdminAction({ action: "send_text", phoneNumber: "1", text: "Bonjour" }, { ...deps, fetchImpl })
    ).toEqual({ kind: "ok", message, warning: null })
  })

  it.each(["window_expired", "whatsapp_error", "not_found", "invalid_request"])(
    "traduit l'erreur métier %s avec son message",
    async (code) => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(409, { ok: false, error_code: code, message: "détail" }))
      expect(
        await runAdminAction({ action: "send_text", phoneNumber: "1", text: "x" }, { ...deps, fetchImpl })
      ).toEqual({ kind: code, message: "détail" })
    }
  )

  it("renvoie unavailable sur 401 (secret refusé) ou code d'erreur inconnu", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, { ok: false, error_code: "unauthorized", message: "x" }))
    expect((await runAdminAction({ action: "take_over", phoneNumber: "1" }, { ...deps, fetchImpl })).kind).toBe("unavailable")
  })

  it("renvoie unavailable sur réponse non-JSON", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 502,
      ok: false,
      json: async () => {
        throw new SyntaxError("bad")
      },
    })
    expect((await runAdminAction({ action: "take_over", phoneNumber: "1" }, { ...deps, fetchImpl })).kind).toBe("unavailable")
  })

  it("renvoie unavailable quand n8n est injoignable ou trop lent", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("aborted"))
    expect((await runAdminAction({ action: "take_over", phoneNumber: "1" }, { ...deps, fetchImpl })).kind).toBe("unavailable")
  })
})
