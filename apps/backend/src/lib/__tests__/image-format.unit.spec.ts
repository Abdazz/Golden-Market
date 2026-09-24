import sharp from "sharp"

import { ensureJpegOrPng, jpegFilenameFor } from "../image-format"

const makeImage = (format: "webp" | "jpeg" | "png") =>
  sharp({
    create: {
      width: 4,
      height: 3,
      channels: 4,
      background: { r: 200, g: 100, b: 50, alpha: 0.5 },
    },
  })
    .toFormat(format)
    .toBuffer()

describe("ensureJpegOrPng", () => {
  it("convertit une image webp en jpeg", async () => {
    const result = await ensureJpegOrPng(await makeImage("webp"))

    expect(result.converted).toBe(true)
    expect(result.mimeType).toBe("image/jpeg")
    expect(result.ext).toBe("jpg")
    const meta = await sharp(result.buffer).metadata()
    expect(meta.format).toBe("jpeg")
    expect([meta.width, meta.height]).toEqual([4, 3])
  })

  it("laisse un jpeg inchangé, octet pour octet", async () => {
    const input = await makeImage("jpeg")
    const result = await ensureJpegOrPng(input)

    expect(result.converted).toBe(false)
    expect(result.mimeType).toBe("image/jpeg")
    expect(result.ext).toBe("jpg")
    expect(result.buffer.equals(input)).toBe(true)
  })

  it("laisse un png inchangé", async () => {
    const input = await makeImage("png")
    const result = await ensureJpegOrPng(input)

    expect(result.converted).toBe(false)
    expect(result.mimeType).toBe("image/png")
    expect(result.ext).toBe("png")
    expect(result.buffer.equals(input)).toBe(true)
  })

  it("lève une erreur sur un contenu qui n'est pas une image", async () => {
    await expect(ensureJpegOrPng(Buffer.from("pas une image"))).rejects.toThrow()
  })
})

describe("jpegFilenameFor", () => {
  it("remplace l'extension webp d'une URL par .jpg, sans le préfixe horodaté du provider file-local", () => {
    expect(
      jpegFilenameFor(
        "https://golden-market.co/static/1788384027808-kit-cure-oreilles-spirale-en-inox-6-pi%C3%A8ces-ali-1.webp"
      )
    ).toBe("kit-cure-oreilles-spirale-en-inox-6-pièces-ali-1.jpg")
  })

  it("ajoute .jpg à un nom sans extension", () => {
    expect(jpegFilenameFor("http://localhost:9000/static/123-image")).toBe("image.jpg")
  })
})
