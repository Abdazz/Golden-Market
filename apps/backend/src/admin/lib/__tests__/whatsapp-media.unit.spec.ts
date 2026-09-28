import { captionFor, clientSizeError, guessKind, sendAll } from "../whatsapp-media"
import type { PendingFile } from "../whatsapp-media"

const file = (name: string, type: string, size = 10) => ({ name, type, size }) as unknown as File
const pending = (id: string, f: File, voice = false): PendingFile => ({ id, file: f, voice, status: "ready", error: null })
const media = (kind: string) => ({ kind, url: `https://x/${kind}`, mime_type: "m", filename: "f", size: 1, voice: false }) as any

describe("guessKind / clientSizeError / captionFor", () => {
  it("devine le type d'après le type MIME du navigateur", () => {
    expect(guessKind(file("a.jpg", "image/jpeg"))).toBe("image")
    expect(guessKind(file("a.mp4", "video/mp4"))).toBe("video")
    expect(guessKind(file("a.mp3", "audio/mpeg"))).toBe("audio")
    expect(guessKind(file("a.pdf", "application/pdf"))).toBe("document")
  })
  it("refuse avant envoi un fichier trop lourd (photo avant conversion : 20 Mo tolérés)", () => {
    expect(clientSizeError(file("v.mp4", "video/mp4", 17 * 1048576), false)).toBe("Vidéo trop lourde : 16 Mo maximum pour WhatsApp.")
    expect(clientSizeError(file("p.png", "image/png", 6 * 1048576), false)).toBeNull()
    expect(clientSizeError(file("p.png", "image/png", 21 * 1048576), false)).toBe("Photo trop lourde : 20 Mo maximum.")
  })
  it("met la légende sur le premier fichier seulement", () => {
    expect(captionFor(0, " Voici ")).toBe("Voici")
    expect(captionFor(1, "Voici")).toBe("")
  })
})

describe("sendAll", () => {
  it("envoie séquentiellement et s'arrête au premier échec", async () => {
    const order: string[] = []
    const updates: Record<string, any> = {}
    const result = await sendAll([pending("a", file("a.jpg", "image/jpeg")), pending("b", file("b.mp4", "video/mp4")), pending("c", file("c.pdf", "application/pdf"))], "Légende", {
      upload: async (p) => (order.push(`upload:${p.id}`), { ok: true, media: media(p.id) }),
      send: async (m, caption) => {
        order.push(`send:${m.kind}:${caption}`)
        return m.kind === "b" ? { ok: false, message: "Refusé par WhatsApp" } : { ok: true }
      },
      sendText: async () => ({ ok: true }),
      onUpdate: (id, patch) => (updates[id] = { ...updates[id], ...patch }),
    })
    expect(order).toEqual(["upload:a", "send:a:Légende", "upload:b", "send:b:"])
    expect(updates.a.status).toBe("sent")
    expect(updates.b).toMatchObject({ status: "error", error: "Refusé par WhatsApp" })
    expect(updates.c).toBeUndefined()
    // La légende est partie avec "a" : ne pas la renvoyer au réessai.
    expect(result).toEqual({ ok: false, windowExpired: false, textSent: true })
  })

  it("légende partie avec le 1er fichier puis échec du 2e : textSent vrai pour ne pas la renvoyer au réessai", async () => {
    const result = await sendAll([pending("a", file("a.jpg", "image/jpeg")), pending("b", file("b.jpg", "image/jpeg"))], "Légende", {
      upload: async (p) => ({ ok: true, media: media(p.id) }),
      send: async (m) => (m.kind === "b" ? { ok: false, message: "Refusé" } : { ok: true }),
      sendText: async () => ({ ok: true }),
      onUpdate: () => {},
    })
    expect(result).toEqual({ ok: false, windowExpired: false, textSent: true })
  })

  it("échec du fichier qui porte la légende : textSent faux (le texte reste à envoyer)", async () => {
    const result = await sendAll([pending("a", file("a.jpg", "image/jpeg"))], "Légende", {
      upload: async (p) => ({ ok: true, media: media(p.id) }),
      send: async () => ({ ok: false, message: "Refusé" }),
      sendText: async () => ({ ok: true }),
      onUpdate: () => {},
    })
    expect(result).toEqual({ ok: false, windowExpired: false, textSent: false })
  })

  it("vocal seul avec du texte : le texte part ensuite en message séparé", async () => {
    const sent: string[] = []
    const result = await sendAll([pending("v", file("vocal.webm", "audio/webm"), true)], "Écoutez ceci", {
      upload: async () => ({ ok: true, media: media("audio") }),
      send: async (m, caption) => (sent.push(`media:${m.kind}:${caption}`), { ok: true }),
      sendText: async (t) => (sent.push(`text:${t}`), { ok: true }),
      onUpdate: () => {},
    })
    expect(sent).toEqual(["media:audio:", "text:Écoutez ceci"])
    expect(result).toEqual({ ok: true, windowExpired: false, textSent: true })
  })

  it("fenêtre de 24 h fermée : signalée pour basculer sur la relance", async () => {
    const result = await sendAll([pending("a", file("a.jpg", "image/jpeg"))], "", {
      upload: async () => ({ ok: true, media: media("image") }),
      send: async () => ({ ok: false, message: "24 h", errorCode: "window_expired" }),
      sendText: async () => ({ ok: true }),
      onUpdate: () => {},
    })
    expect(result.windowExpired).toBe(true)
  })
})
