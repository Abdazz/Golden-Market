import { displayFilename, MAX_BYTES, sizeError, sniffMedia } from "../whatsapp-media-types"

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "binary") : Buffer.from(p))))
const ftyp = (brand: string) => bytes([0, 0, 0, 24], "ftyp", brand, [0, 0, 0, 0], "isom", "mp41")

describe("sniffMedia", () => {
  it("reconnaît JPEG et PNG sans conversion", () => {
    expect(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0]), { filename: "a.bin", voice: false })).toEqual({
      ok: true,
      media: { kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "none" },
    })
    expect(sniffMedia(bytes([0x89], "PNG\r\n", [0x1a, 0x0a]), { filename: "x", voice: false })).toMatchObject({
      ok: true,
      media: { kind: "image", mimeType: "image/png", convert: "none" },
    })
  })

  it("marque WebP, GIF, AVIF et HEIC pour conversion en JPEG", () => {
    expect(sniffMedia(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "), { filename: "p.webp", voice: false })).toMatchObject({
      ok: true,
      media: { kind: "image", convert: "image-to-jpeg" },
    })
    expect(sniffMedia(bytes("GIF89a"), { filename: "g.gif", voice: false })).toMatchObject({ ok: true, media: { convert: "image-to-jpeg" } })
    expect(sniffMedia(ftyp("avif"), { filename: "i.avif", voice: false })).toMatchObject({ ok: true, media: { kind: "image" } })
    expect(sniffMedia(ftyp("heic"), { filename: "IMG.HEIC", voice: false })).toMatchObject({ ok: true, media: { kind: "image" } })
  })

  it("accepte une vidéo MP4 ou 3GP, refuse une vidéo MOV", () => {
    expect(sniffMedia(ftyp("isom"), { filename: "v.mp4", voice: false })).toEqual({
      ok: true,
      media: { kind: "video", mimeType: "video/mp4", ext: "mp4", convert: "none" },
    })
    expect(sniffMedia(ftyp("3gp5"), { filename: "v.3gp", voice: false })).toMatchObject({ ok: true, media: { mimeType: "video/3gpp" } })
    expect(sniffMedia(ftyp("qt  "), { filename: "IMG_0001.MOV", voice: false })).toEqual({
      ok: false,
      message: "Format vidéo non accepté par WhatsApp : MP4 uniquement.",
    })
  })

  it("vocal du navigateur : WebM, MP4 audio ou OGG convertis en OGG/Opus", () => {
    expect(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3]), { filename: "vocal.webm", voice: true })).toEqual({
      ok: true,
      media: { kind: "audio", mimeType: "audio/ogg", ext: "ogg", convert: "voice-to-ogg" },
    })
    expect(sniffMedia(ftyp("M4A "), { filename: "vocal.m4a", voice: true })).toMatchObject({ ok: true, media: { convert: "voice-to-ogg" } })
    expect(sniffMedia(ftyp("isom"), { filename: "vocal.mp4", voice: true })).toMatchObject({ ok: true, media: { kind: "audio", convert: "voice-to-ogg" } })
    expect(sniffMedia(bytes("OggS"), { filename: "vocal.ogg", voice: true })).toMatchObject({ ok: true, media: { convert: "voice-to-ogg" } })
  })

  it("fichier audio joint (hors vocal) : MP3, M4A, OGG acceptés tels quels ; WebM refusé", () => {
    expect(sniffMedia(bytes("ID3", [4, 0]), { filename: "son.mp3", voice: false })).toEqual({
      ok: true,
      media: { kind: "audio", mimeType: "audio/mpeg", ext: "mp3", convert: "none" },
    })
    expect(sniffMedia(ftyp("M4A "), { filename: "son.m4a", voice: false })).toMatchObject({ ok: true, media: { kind: "audio", mimeType: "audio/mp4" } })
    expect(sniffMedia(bytes("OggS"), { filename: "son.ogg", voice: false })).toMatchObject({ ok: true, media: { mimeType: "audio/ogg" } })
    expect(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3]), { filename: "v.webm", voice: false }).ok).toBe(false)
  })

  it("documents : PDF, Office (OLE et OOXML selon l'extension), ZIP, TXT/CSV", () => {
    expect(sniffMedia(bytes("%PDF-1.7"), { filename: "Facture.pdf", voice: false })).toEqual({
      ok: true,
      media: { kind: "document", mimeType: "application/pdf", ext: "pdf", convert: "none" },
    })
    const zip = bytes("PK", [3, 4])
    expect(sniffMedia(zip, { filename: "Devis.docx", voice: false })).toMatchObject({
      ok: true,
      media: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
    })
    expect(sniffMedia(zip, { filename: "Stock.xlsx", voice: false })).toMatchObject({ ok: true, media: { ext: "xlsx" } })
    expect(sniffMedia(zip, { filename: "Pres.pptx", voice: false })).toMatchObject({ ok: true, media: { ext: "pptx" } })
    expect(sniffMedia(zip, { filename: "photos.zip", voice: false })).toMatchObject({ ok: true, media: { mimeType: "application/zip" } })
    const ole = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(sniffMedia(ole, { filename: "Vieux.doc", voice: false })).toMatchObject({ ok: true, media: { mimeType: "application/msword" } })
    expect(sniffMedia(ole, { filename: "Vieux.xls", voice: false })).toMatchObject({ ok: true, media: { mimeType: "application/vnd.ms-excel" } })
    expect(sniffMedia(Buffer.from("nom;prix\nseau;2500\n"), { filename: "prix.csv", voice: false })).toMatchObject({
      ok: true,
      media: { mimeType: "text/csv", ext: "csv" },
    })
    expect(sniffMedia(Buffer.from("Bonjour"), { filename: "note.txt", voice: false })).toMatchObject({ ok: true, media: { mimeType: "text/plain" } })
  })

  it("refuse un exécutable ou un fichier inconnu, même renommé en .pdf", () => {
    expect(sniffMedia(bytes("MZ", [0x90, 0]), { filename: "facture.pdf", voice: false })).toEqual({
      ok: false,
      message: "Type de fichier non accepté par WhatsApp.",
    })
    expect(sniffMedia(bytes([0, 1, 2, 3]), { filename: "a.txt", voice: false }).ok).toBe(false)
  })
})

describe("sizeError", () => {
  it("applique la limite WhatsApp de chaque type", () => {
    expect(sizeError("image", MAX_BYTES.image)).toBeNull()
    expect(sizeError("image", MAX_BYTES.image + 1)).toBe("Photo trop lourde : 5 Mo maximum pour WhatsApp.")
    expect(sizeError("video", 17 * 1048576)).toBe("Vidéo trop lourde : 16 Mo maximum pour WhatsApp.")
    expect(sizeError("audio", 17 * 1048576)).toBe("Audio trop lourd : 16 Mo maximum pour WhatsApp.")
    expect(sizeError("document", 101 * 1048576)).toBe("Document trop lourd : 100 Mo maximum pour WhatsApp.")
  })
})

describe("displayFilename", () => {
  it("garde le nom d'origine du document (accents, espaces), retire le chemin", () => {
    expect(displayFilename("C:\\Users\\a\\Facture n°12 été.pdf")).toBe("Facture n°12 été.pdf")
    expect(displayFilename("x".repeat(300) + ".pdf").length).toBe(200)
    expect(displayFilename("")).toBe("document")
  })
})
