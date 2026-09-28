import { execFileSync } from "node:child_process"
import sharp from "sharp"
import { convertToOggOpus, prepareOutgoingMedia } from "../whatsapp-media-prepare"

// Échantillon audio de 1 s généré par ffmpeg dans le format donné.
const sample = (args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", ...args, "pipe:1"])

describe("convertToOggOpus", () => {
  it("convertit un vocal WebM (Chrome) en OGG/Opus", async () => {
    const out = await convertToOggOpus(sample(["-c:a", "libopus", "-f", "webm"]))
    expect(out.subarray(0, 4).toString("binary")).toBe("OggS")
  })
  it("convertit un vocal MP4/AAC (Safari)", async () => {
    const out = await convertToOggOpus(sample(["-c:a", "aac", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov"]))
    expect(out.subarray(0, 4).toString("binary")).toBe("OggS")
  })
  it("lève une erreur sur un contenu illisible", async () => {
    await expect(convertToOggOpus(Buffer.from("pas un audio"))).rejects.toThrow()
  })
})

describe("prepareOutgoingMedia", () => {
  it("convertit une image WebP en JPEG", async () => {
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#f00" } }).webp().toBuffer()
    const result = await prepareOutgoingMedia(webp, { filename: "p.webp", voice: false })
    expect(result).toMatchObject({ ok: true, media: { kind: "image", mimeType: "image/jpeg", ext: "jpg", voice: false } })
    if (result.ok) expect(result.media.buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  })

  it("vocal : OGG/Opus marqué voice", async () => {
    const result = await prepareOutgoingMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1]), { filename: "vocal.webm", voice: true }, {
      convertVoice: async () => Buffer.from("OggS-converti"),
    })
    expect(result).toMatchObject({ ok: true, media: { kind: "audio", mimeType: "audio/ogg", ext: "ogg", voice: true, warning: null } })
  })

  it("conversion du vocal impossible : envoi en audio simple avec avertissement", async () => {
    const result = await prepareOutgoingMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1]), { filename: "vocal.webm", voice: true }, {
      convertVoice: async () => {
        throw new Error("ffmpeg absent")
      },
    })
    expect(result).toEqual({ ok: false, message: "Vocal impossible à convertir pour WhatsApp, réessayez l'enregistrement." })
  })

  it("refuse un document trop lourd et garde le nom d'origine d'un document accepté", async () => {
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(10)])
    const accepted = await prepareOutgoingMedia(pdf, { filename: "Facture n°12 été.pdf", voice: false })
    expect(accepted).toMatchObject({ ok: true, media: { kind: "document", filename: "Facture n°12 été.pdf" } })
    const huge = Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(101 * 1048576)])
    expect(await prepareOutgoingMedia(huge, { filename: "gros.pdf", voice: false })).toEqual({
      ok: false,
      message: "Document trop lourd : 100 Mo maximum pour WhatsApp.",
    })
  })

  it("image illisible par sharp (HEIC non pris en charge) : refus clair", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)])
    expect(await prepareOutgoingMedia(heic, { filename: "IMG.HEIC", voice: false })).toEqual({
      ok: false,
      message: "Format de photo non pris en charge : envoyez-la en JPEG ou PNG.",
    })
  })
})
