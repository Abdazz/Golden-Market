import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureJpegOrPng } from "./image-format"
import { displayFilename, sizeError, sniffMedia } from "./whatsapp-media-types"
import type { MediaKind } from "./whatsapp-media-types"

// Prépare un fichier joint depuis l'admin pour l'envoi WhatsApp (spec
// 2026-09-28 whatsapp-chat-medias) : type détecté sur le contenu, image
// convertie en JPEG si besoin, vocal du navigateur converti en OGG/Opus mono
// (seul format qu'WhatsApp affiche comme note vocale), limites de taille.

export type PreparedMedia = {
  buffer: Buffer
  kind: MediaKind
  mimeType: string
  ext: string
  filename: string
  voice: boolean
  warning: string | null
}

// Fichiers temporaires plutôt que des tubes : un MP4 (Safari) n'est pas
// lisible depuis un tube quand son index est en fin de fichier.
export async function convertToOggOpus(input: Buffer, ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg"): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "wa-voice-"))
  const source = join(dir, "source")
  const target = join(dir, "vocal.ogg")
  try {
    await writeFile(source, input)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y", "-i", source,
        "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", target,
      ])
      let stderr = ""
      child.stderr.on("data", (chunk) => (stderr += chunk))
      child.on("error", reject)
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code} : ${stderr.slice(0, 300)}`))))
    })
    return await readFile(target)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function prepareOutgoingMedia(
  buffer: Buffer,
  input: { filename: string; voice: boolean },
  deps: { convertVoice?: (b: Buffer) => Promise<Buffer> } = {}
): Promise<{ ok: true; media: PreparedMedia } | { ok: false; message: string }> {
  const sniffed = sniffMedia(buffer, input)
  if (!sniffed.ok) return sniffed
  const { media } = sniffed
  let out = buffer
  let voice = false

  if (media.convert === "image-to-jpeg") {
    try {
      out = (await ensureJpegOrPng(buffer)).buffer
    } catch {
      return { ok: false, message: "Format de photo non pris en charge : envoyez-la en JPEG ou PNG." }
    }
  } else if (media.convert === "voice-to-ogg") {
    try {
      out = await (deps.convertVoice ?? convertToOggOpus)(buffer)
      voice = true
    } catch {
      return { ok: false, message: "Vocal impossible à convertir pour WhatsApp, réessayez l'enregistrement." }
    }
  }

  const tooBig = sizeError(media.kind, out.length)
  if (tooBig) return { ok: false, message: tooBig }

  return {
    ok: true,
    media: {
      buffer: out,
      kind: media.kind,
      mimeType: media.mimeType,
      ext: media.ext,
      filename: media.kind === "document" ? displayFilename(input.filename) : `${media.kind}.${media.ext}`,
      voice,
      warning: null,
    },
  }
}
