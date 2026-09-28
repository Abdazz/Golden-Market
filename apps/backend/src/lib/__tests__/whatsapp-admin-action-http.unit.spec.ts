import { parseSendMediaBody, parseSendTextBody, toHttpResponse } from "../whatsapp-admin-action-http"

describe("toHttpResponse", () => {
  it("renvoie 200 avec le message et l'avertissement en cas de succès", () => {
    const message = { role: "human" as const, content: "Bonjour", createdAt: "2026-09-27T10:00:00.000Z" }
    expect(toHttpResponse({ kind: "ok", message, warning: "not_saved" })).toEqual({
      status: 200,
      body: { ok: true, message, warning: "not_saved" },
    })
  })

  it.each([
    ["invalid_request", 400],
    ["not_found", 404],
    ["window_expired", 409],
    ["whatsapp_error", 502],
    ["unavailable", 503],
  ] as const)("associe %s au statut %i", (kind, status) => {
    expect(toHttpResponse({ kind, message: "détail" })).toEqual({
      status,
      body: { ok: false, error_code: kind, message: "détail" },
    })
  })
})

describe("parseSendTextBody", () => {
  it("accepte un texte et retire les espaces autour", () => {
    expect(parseSendTextBody({ text: "  Bonjour 👋\nÀ bientôt  " })).toEqual({ ok: true, text: "Bonjour 👋\nÀ bientôt" })
  })

  it.each([[{}], [{ text: "   " }], [{ text: 42 }], [null]])("refuse un corps invalide %j", (body) => {
    expect(parseSendTextBody(body).ok).toBe(false)
  })

  it("refuse plus de 4096 caractères", () => {
    expect(parseSendTextBody({ text: "a".repeat(4097) }).ok).toBe(false)
    expect(parseSendTextBody({ text: "a".repeat(4096) }).ok).toBe(true)
  })
})

describe("parseSendMediaBody", () => {
  const media = {
    kind: "image",
    url: "https://golden-market.co/static/1-wa-media-a.jpg",
    mime_type: "image/jpeg",
    filename: "image.jpg",
    size: 1200,
    voice: false,
  }
  it("accepte un média et une légende facultative", () => {
    expect(parseSendMediaBody({ ...media, caption: " Voici la photo " })).toEqual({ ok: true, media, caption: "Voici la photo" })
    expect(parseSendMediaBody(media)).toEqual({ ok: true, media, caption: "" })
  })
  it("refuse un type inconnu, une URL non https ou une légende de plus de 1 024 caractères", () => {
    expect(parseSendMediaBody({ ...media, kind: "sticker" }).ok).toBe(false)
    expect(parseSendMediaBody({ ...media, url: "http://x/y.jpg" }).ok).toBe(false)
    expect(parseSendMediaBody({ ...media, caption: "a".repeat(1025) }).ok).toBe(false)
  })
})
