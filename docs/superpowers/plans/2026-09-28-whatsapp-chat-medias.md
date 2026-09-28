# Chat WhatsApp complet dans l'admin — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depuis la page Conversations WhatsApp de l'admin, envoyer photos, vidéos, documents, notes vocales et emojis (légende, envoi multiple, Ctrl+V, glisser-déposer) et voir vidéos, vocaux et documents des clients, avec purge à 90 jours.

**Architecture:** L'admin téléverse chaque fichier vers une nouvelle route Medusa qui détecte le type sur le contenu, convertit (image -> JPEG avec sharp, vocal -> OGG/Opus avec ffmpeg) et stocke sous un nom aléatoire ; l'admin demande ensuite l'envoi au webhook n8n existant (nouvelle action `send_media`), qui envoie à WhatsApp **par lien** et enregistre le message avec sa pièce jointe. Côté réception, le workflow n8n principal copie vidéos, vocaux et documents du client dans le stockage Medusa comme il le fait déjà pour les photos ; la purge nocturne couvre tous ces fichiers.

**Tech Stack:** Medusa 2.18 (routes admin, `uploadFilesWorkflow`, multer), sharp, ffmpeg (binaire système, `apk add ffmpeg` dans l'image), React (extension admin, HTML natif), n8n 2.33 (workflows `AdmConvAction7Qx`, `i6KGA9BvK9unjxxj`, `PurgeClientPhot1`), WhatsApp Cloud API v20.0, Jest.

**Spec:** `docs/superpowers/specs/2026-09-28-whatsapp-chat-medias-design.md`

## Global Constraints

- n8n reste le **seul écrivain** de la base `golden_market` et le **seul détenteur du jeton WhatsApp** ; Medusa ne fait que stocker les fichiers et appeler le webhook `Admin - actions conversation` (`N8N_ADMIN_ACTIONS_WEBHOOK_URL` + `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET`, en-tête `x-admin-actions-secret`).
- Limites WhatsApp (octets) : image 5 Mo, vidéo 16 Mo, audio 16 Mo, document 100 Mo ; 1 Mo = 1 048 576 octets.
- Formats envoyés : image JPEG/PNG (WebP, GIF, AVIF convertis en JPEG ; HEIC seulement si sharp sait le lire, sinon refus clair) ; vidéo MP4/3GP (pas de MOV) ; audio OGG/Opus (vocal), MP3, M4A ; document PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ZIP.
- Noms stockés : `wa-media-<aléatoire>.<ext>` (envoyés par le propriétaire), `client-media-<aléatoire>.<ext>` (reçus), `client-photo-<aléatoire>.<ext>` (existant) ; aléatoire = 20 caractères hexadécimaux (`crypto.randomBytes(10)`).
- Pièce jointe (colonne JSONB `messages.attachments`) : `{ type: "image"|"video"|"audio"|"document", url: string|null, mime_type?, filename?, size?, voice?, expired?, unavailable? }` ; les anciennes `{ type: "image", url }` restent valides.
- Fenêtre de 24 h : `send_media` refusé avec `window_expired` si le dernier message client date de plus de 24 h (même règle que `send_text`).
- Conservation : 90 jours pour les fichiers des messages `role IN ('user','human')` ; **jamais** pour `role = 'assistant'` (photos catalogue de l'agent, fichiers produits partagés).
- Français partout (UI, messages d'erreur, commentaires, commits) ; pas d'emoji dans le code hors liste du sélecteur ; jamais de trailer `Co-Authored-By`.
- Admin : pas de composant `@medusajs/ui`, liens `<a>`, `fetch(..., { credentials: "include" })` (conventions du projet, voir `AGENTS.md`).
- n8n : aucun `Buffer` ni `URL` dans les **expressions** (seulement dans les nœuds Code) ; `this.helpers.getBinaryDataBuffer(0, 'data')` pour lire un binaire ; les nœuds HTTP renvoient les erreurs sur la sortie succès -> toujours tester la présence d'un `wamid` ; modification par export CLI -> patch JSON -> `import:workflow` -> `publish:workflow --id=` -> `docker restart golden_market_n8n`.
- VPS : `ssh admin@144.91.110.105` ; conteneur n8n `golden_market_n8n` ; trop de ssh rapprochés -> attendre ~1 min.
- Numéro de test autorisé : +226 77 40 61 01 (`22677406101`), le propriétaire doit avoir écrit au bot dans les 24 h.

## Review Focus

1. **Vidéo iPhone en MOV/HEVC choisie depuis le téléphone** -> refus clair « Format vidéo non accepté par WhatsApp : MP4 uniquement » avant tout envoi (Task 1 test `refuse une vidéo MOV`).
2. **Vocal enregistré sous Safari (MP4/AAC) ou Firefox (OGG)** -> converti ou accepté, jamais refusé (Task 2 tests de conversion MP4 et OGG).
3. **Envoi de 3 fichiers dont le 2e est refusé par WhatsApp** -> le 1er reste envoyé, le 2e reste en aperçu avec son erreur, le 3e n'est pas envoyé tant que le 2e n'est pas retiré ou réessayé (Task 7 test `envoie séquentiellement et s'arrête au premier échec`).
4. **Purge à 90 jours** -> ne supprime jamais une photo catalogue envoyée par l'agent (`role = 'assistant'`) et garde le type d'origine (vidéo reste `video`, expirée) (Task 6 vérification SQL).
5. **Document au nom accentué ou avec espaces** (« Facture n°12 été.pdf ») -> nom affiché intact chez le client et dans l'admin, stockage sous nom aléatoire (Task 1 test `garde le nom d'origine du document`).

---

### Task 1: Détection et validation des médias (pure)

**Files:**
- Create: `apps/backend/src/lib/whatsapp-media-types.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-media-types.unit.spec.ts`

**Interfaces:**
- Produces:
```ts
export type MediaKind = "image" | "video" | "audio" | "document"
export const MAX_BYTES: Record<MediaKind, number> // image 5 Mo, video 16 Mo, audio 16 Mo, document 100 Mo
export const MAX_UPLOAD_BYTES: number // 100 Mo (limite multer)
export type SniffedMedia = {
  kind: MediaKind
  mimeType: string
  ext: string
  convert: "none" | "image-to-jpeg" | "voice-to-ogg"
}
export function sniffMedia(buffer: Buffer, input: { filename: string; voice: boolean }):
  { ok: true; media: SniffedMedia } | { ok: false; message: string }
export function sizeError(kind: MediaKind, size: number): string | null
export function displayFilename(filename: string): string // nom d'origine nettoyé (chemin retiré, 200 caractères max)
```

- [ ] **Step 1: Écrire les tests**

```ts
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
```

- [ ] **Step 2: Vérifier l'échec** — Run: `cd apps/backend && TEST_TYPE=unit npx jest src/lib/__tests__/whatsapp-media-types.unit.spec.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
// Types de médias acceptés par WhatsApp Cloud API pour l'envoi depuis l'admin
// (spec 2026-09-28 whatsapp-chat-medias). Le type est détecté sur le contenu
// (signature des premiers octets), jamais sur le nom ni le Content-Type annoncé.

export type MediaKind = "image" | "video" | "audio" | "document"

const MB = 1048576
export const MAX_BYTES: Record<MediaKind, number> = {
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  document: 100 * MB,
}
export const MAX_UPLOAD_BYTES = 100 * MB

export type SniffedMedia = {
  kind: MediaKind
  mimeType: string
  ext: string
  convert: "none" | "image-to-jpeg" | "voice-to-ogg"
}

type Result = { ok: true; media: SniffedMedia } | { ok: false; message: string }

const REFUSED = "Type de fichier non accepté par WhatsApp."
const ok = (media: SniffedMedia): Result => ({ ok: true, media })
const startsWith = (buffer: Buffer, signature: number[] | string, offset = 0) => {
  const sig = typeof signature === "string" ? Buffer.from(signature, "binary") : Buffer.from(signature)
  return buffer.length >= offset + sig.length && buffer.subarray(offset, offset + sig.length).equals(sig)
}
const extOf = (filename: string) => (filename.split(/[\\/]/).pop() ?? "").split(".").pop()?.toLowerCase() ?? ""

const VOICE: SniffedMedia = { kind: "audio", mimeType: "audio/ogg", ext: "ogg", convert: "voice-to-ogg" }

const OOXML: Record<string, { mimeType: string; ext: string }> = {
  docx: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  pptx: { mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
  zip: { mimeType: "application/zip", ext: "zip" },
}
const OLE: Record<string, { mimeType: string; ext: string }> = {
  doc: { mimeType: "application/msword", ext: "doc" },
  xls: { mimeType: "application/vnd.ms-excel", ext: "xls" },
  ppt: { mimeType: "application/vnd.ms-powerpoint", ext: "ppt" },
}

export function sniffMedia(buffer: Buffer, input: { filename: string; voice: boolean }): Result {
  const ext = extOf(input.filename)
  const brand = startsWith(buffer, "ftyp", 4) ? buffer.subarray(8, 12).toString("binary") : null

  // Vocal enregistré dans le navigateur (Chrome : WebM, Safari : MP4, Firefox : OGG).
  if (input.voice) {
    if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]) || startsWith(buffer, "OggS") || brand) return ok(VOICE)
    return { ok: false, message: REFUSED }
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return ok({ kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "none" })
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return ok({ kind: "image", mimeType: "image/png", ext: "png", convert: "none" })
  if ((startsWith(buffer, "RIFF") && startsWith(buffer, "WEBP", 8)) || startsWith(buffer, "GIF8")) {
    return ok({ kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "image-to-jpeg" })
  }
  if (brand) {
    if (["avif", "avis", "heic", "heix", "mif1", "msf1"].includes(brand)) {
      return ok({ kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "image-to-jpeg" })
    }
    if (brand === "qt  ") return { ok: false, message: "Format vidéo non accepté par WhatsApp : MP4 uniquement." }
    if (brand.startsWith("M4A")) return ok({ kind: "audio", mimeType: "audio/mp4", ext: "m4a", convert: "none" })
    if (brand.startsWith("3gp") || brand.startsWith("3g2")) {
      return ok({ kind: "video", mimeType: "video/3gpp", ext: "3gp", convert: "none" })
    }
    return ok({ kind: "video", mimeType: "video/mp4", ext: "mp4", convert: "none" })
  }
  if (startsWith(buffer, "ID3") || startsWith(buffer, [0xff, 0xfb]) || startsWith(buffer, [0xff, 0xf3]) || startsWith(buffer, [0xff, 0xf2])) {
    return ok({ kind: "audio", mimeType: "audio/mpeg", ext: "mp3", convert: "none" })
  }
  if (startsWith(buffer, "OggS")) return ok({ kind: "audio", mimeType: "audio/ogg", ext: "ogg", convert: "none" })
  if (startsWith(buffer, "%PDF")) return ok({ kind: "document", mimeType: "application/pdf", ext: "pdf", convert: "none" })
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const known = OOXML[ext] ?? OOXML.zip
    return ok({ kind: "document", ...known, convert: "none" })
  }
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && OLE[ext]) {
    return ok({ kind: "document", ...OLE[ext], convert: "none" })
  }
  // Texte : seulement avec une extension .txt/.csv et sans octet nul.
  if ((ext === "txt" || ext === "csv") && buffer.length > 0 && !buffer.includes(0)) {
    return ok({ kind: "document", mimeType: ext === "csv" ? "text/csv" : "text/plain", ext, convert: "none" })
  }
  return { ok: false, message: REFUSED }
}

const LABELS: Record<MediaKind, string> = {
  image: "Photo trop lourde",
  video: "Vidéo trop lourde",
  audio: "Audio trop lourd",
  document: "Document trop lourd",
}

export function sizeError(kind: MediaKind, size: number): string | null {
  return size > MAX_BYTES[kind]
    ? `${LABELS[kind]} : ${MAX_BYTES[kind] / MB} Mo maximum pour WhatsApp.`
    : null
}

// Nom affiché au client pour un document (WhatsApp le montre tel quel).
export function displayFilename(filename: string): string {
  const name = (filename.split(/[\\/]/).pop() ?? "").trim()
  return (name || "document").slice(0, 200)
}
```

- [ ] **Step 4: Vérifier le succès** — même commande. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/lib/whatsapp-media-types.ts apps/backend/src/lib/__tests__/whatsapp-media-types.unit.spec.ts
git commit -m "feat(whatsapp-admin): détection et limites des médias envoyés"
```

---

### Task 2: Préparation des médias (conversion image et vocal)

**Files:**
- Create: `apps/backend/src/lib/whatsapp-media-prepare.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-media-prepare.unit.spec.ts`
- Modify: `apps/backend/Dockerfile` (étape finale : ffmpeg)

**Interfaces:**
- Consumes: Task 1 (`sniffMedia`, `sizeError`, `displayFilename`, `MediaKind`) ; `ensureJpegOrPng` (`src/lib/image-format.ts`, existant).
- Produces:
```ts
export type PreparedMedia = {
  buffer: Buffer; kind: MediaKind; mimeType: string; ext: string
  filename: string        // nom d'origine affiché (documents)
  voice: boolean          // true si converti en OGG/Opus (affiché comme vocal chez le client)
  warning: string | null
}
export function convertToOggOpus(input: Buffer, ffmpegPath?: string): Promise<Buffer>
export function prepareOutgoingMedia(
  buffer: Buffer,
  input: { filename: string; voice: boolean },
  deps?: { convertVoice?: (b: Buffer) => Promise<Buffer> }
): Promise<{ ok: true; media: PreparedMedia } | { ok: false; message: string }>
```

- [ ] **Step 1: Tests** (ffmpeg réel pour la conversion, présent en local : `/usr/bin/ffmpeg`)

```ts
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
```

Note de conception : la spec prévoyait un envoi en « audio simple » si la conversion échoue ; or WhatsApp refuse le WebM (format d'enregistrement de Chrome), donc un vocal non converti ne pourrait pas partir. Refus clair + nouvel enregistrement à la place (ruling à consigner dans le ledger).

- [ ] **Step 2: Vérifier l'échec** — Run: `cd apps/backend && TEST_TYPE=unit npx jest src/lib/__tests__/whatsapp-media-prepare.unit.spec.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
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
```

Dans `apps/backend/Dockerfile`, étape finale, juste après `FROM node:20-alpine` / `WORKDIR /app` :
```dockerfile
# ffmpeg : conversion des notes vocales de l'admin en OGG/Opus pour WhatsApp
# (src/lib/whatsapp-media-prepare.ts).
RUN apk add --no-cache ffmpeg
```

- [ ] **Step 4: Vérifier le succès** — même commande, Expected: PASS ; puis `cd apps/backend && npx tsc --noEmit -p .` — Expected: 0 erreur.

- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/lib/whatsapp-media-prepare.ts apps/backend/src/lib/__tests__/whatsapp-media-prepare.unit.spec.ts apps/backend/Dockerfile
git commit -m "feat(whatsapp-admin): conversion des images et vocaux avant envoi (sharp, ffmpeg)"
```

---

### Task 3: Routes Medusa (téléversement et envoi) et action n8n côté client

**Files:**
- Modify: `apps/backend/src/lib/whatsapp-admin-actions-client.ts` (action `send_media`)
- Modify: `apps/backend/src/lib/whatsapp-admin-action-http.ts` (`parseSendMediaBody`)
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/media/route.ts` (POST : téléversement)
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/media-messages/route.ts` (POST : envoi)
- Modify: `apps/backend/src/api/middlewares.ts` (multer sur la route de téléversement)
- Modify: `apps/backend/package.json` (dépendance `multer` 2.2.0 explicite, déjà présente via Medusa)
- Test: `apps/backend/src/lib/__tests__/whatsapp-admin-actions-client.unit.spec.ts`, `apps/backend/src/lib/__tests__/whatsapp-admin-action-http.unit.spec.ts` (fichiers existants, ajouts)

**Interfaces:**
- Consumes: Task 2 (`prepareOutgoingMedia`, `PreparedMedia`).
- Produces (contrat HTTP consommé par Task 7) :
  - `POST /admin/whatsapp-conversations/:phone/media` (multipart : `file`, `voice` = `"true"|"false"`) → 200 `{ ok: true, media: { url, kind, mime_type, filename, size, voice } }` ; 400 `{ ok: false, error_code: "invalid_request", message }`.
  - `POST /admin/whatsapp-conversations/:phone/media-messages` JSON `{ kind, url, mime_type, filename, size, voice, caption? }` → mêmes réponses que `/messages` (`toHttpResponse`).
  - `runAdminAction({ action: "send_media", phoneNumber, media: { kind, url, mime_type, filename, size, voice }, caption })` → corps webhook `{ action: "send_media", phone_number, text: caption ?? "", media }`.

- [ ] **Step 1: Tests (ajouts)**

Dans `whatsapp-admin-action-http.unit.spec.ts` :
```ts
import { parseSendMediaBody } from "../whatsapp-admin-action-http"

describe("parseSendMediaBody", () => {
  const media = { kind: "image", url: "https://golden-market.co/static/1-wa-media-a.jpg", mime_type: "image/jpeg", filename: "image.jpg", size: 1200, voice: false }
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
```
Dans `whatsapp-admin-actions-client.unit.spec.ts` (suivre le style des tests existants, `fetchImpl` simulé) :
```ts
it("send_media : transmet le média et la légende au webhook", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true, message: null, warning: null }) })
  const media = { kind: "document" as const, url: "https://golden-market.co/static/1-wa-media-b.pdf", mime_type: "application/pdf", filename: "Facture.pdf", size: 10, voice: false }
  await runAdminAction({ action: "send_media", phoneNumber: "22677406101", media, caption: "Votre facture" }, { url: "https://n8n/x", secret: "s", fetchImpl })
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ action: "send_media", phone_number: "22677406101", text: "Votre facture", media })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `cd apps/backend && TEST_TYPE=unit npx jest src/lib/__tests__/whatsapp-admin-action` — Expected: FAIL (`parseSendMediaBody` absent, corps sans `media`).

- [ ] **Step 3: Implémenter**

`whatsapp-admin-actions-client.ts` :
```ts
export type AdminAction = "take_over" | "hand_back" | "send_text" | "send_reengagement" | "send_media"

export type OutgoingMedia = {
  kind: "image" | "video" | "audio" | "document"
  url: string
  mime_type: string
  filename: string
  size: number
  voice: boolean
}
```
signature : `input: { action: AdminAction; phoneNumber: string; text?: string; media?: OutgoingMedia; caption?: string }` ; corps :
```ts
body: JSON.stringify({
  action: input.action,
  phone_number: input.phoneNumber,
  text: input.action === "send_media" ? input.caption ?? "" : input.text,
  ...(input.media ? { media: input.media } : {}),
}),
```
(vérifier que le test existant de `send_text` attend toujours `{ action, phone_number, text }` : `media` n'est ajouté que s'il est fourni.)

`whatsapp-admin-action-http.ts` :
```ts
// Légende : 1 024 caractères maximum (limite WhatsApp des légendes de média).
const SendMediaBody = z.object({
  kind: z.enum(["image", "video", "audio", "document"]),
  url: z.string().startsWith("https://"),
  mime_type: z.string().min(1),
  filename: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
  voice: z.boolean(),
  caption: z.string().trim().max(1024).optional(),
})

export const parseSendMediaBody = (
  body: unknown
): { ok: true; media: OutgoingMedia; caption: string } | { ok: false; message: string } => {
  const parsed = SendMediaBody.safeParse(body)
  if (!parsed.success) return { ok: false, message: "Média invalide ou légende trop longue (1 024 caractères maximum)." }
  const { caption, ...media } = parsed.data
  return { ok: true, media, caption: caption ?? "" }
}
```
(importer `OutgoingMedia` en type depuis `./whatsapp-admin-actions-client`.)

`[phone]/media/route.ts` :
```ts
import { randomBytes } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { prepareOutgoingMedia } from "../../../../../lib/whatsapp-media-prepare"

// Téléversement d'un média joint depuis l'admin (spec 2026-09-28
// whatsapp-chat-medias) : type vérifié sur le contenu, conversion, stockage
// public sous un nom aléatoire (URL non devinable, purgée après 90 jours par
// n8n). L'envoi WhatsApp se fait ensuite via /media-messages.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const file = (req as unknown as { file?: { buffer: Buffer; originalname: string } }).file
  if (!file) {
    res.status(400).json({ ok: false, error_code: "invalid_request", message: "Aucun fichier reçu." })
    return
  }
  const voice = String((req.body as Record<string, unknown> | undefined)?.voice ?? "") === "true"
  const prepared = await prepareOutgoingMedia(file.buffer, { filename: file.originalname, voice })
  if (!prepared.ok) {
    res.status(400).json({ ok: false, error_code: "invalid_request", message: prepared.message })
    return
  }
  const { media } = prepared
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          filename: `wa-media-${randomBytes(10).toString("hex")}.${media.ext}`,
          mimeType: media.mimeType,
          content: media.buffer.toString("base64"),
          access: "public",
        },
      ],
    },
  })
  res.json({
    ok: true,
    media: {
      url: result[0].url,
      kind: media.kind,
      mime_type: media.mimeType,
      filename: media.filename,
      size: media.buffer.length,
      voice: media.voice,
    },
  })
}
```

`[phone]/media-messages/route.ts` :
```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { parseSendMediaBody, toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"

// Envoi d'un média déjà téléversé (/media) : n8n l'envoie à WhatsApp par lien
// et l'enregistre dans l'historique (action send_media).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = parseSendMediaBody(req.body)
  if (!parsed.ok) {
    const { status, body } = toHttpResponse({ kind: "invalid_request", message: parsed.message })
    res.status(status).json(body)
    return
  }
  const { status, body } = toHttpResponse(
    await runAdminAction({ action: "send_media", phoneNumber: req.params.phone, media: parsed.media, caption: parsed.caption })
  )
  res.status(status).json(body)
}
```

`api/middlewares.ts` : ajouter en tête `import multer from "multer"` et `import { MAX_UPLOAD_BYTES } from "../lib/whatsapp-media-types"`, puis dans `routes` :
```ts
    // Médias joints depuis la page Conversations WhatsApp (spec 2026-09-28) :
    // fichier gardé en mémoire (comme /admin/uploads natif), 100 Mo maximum.
    {
      matcher: "/admin/whatsapp-conversations/:phone/media",
      methods: ["POST"],
      middlewares: [multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single("file")],
    },
```
et `"multer": "2.2.0"` dans les `dependencies` de `apps/backend/package.json` (puis `npm install` à la racine pour mettre à jour le lockfile ; `npm ls multer` doit montrer une seule version).

- [ ] **Step 4: Vérifier** — Run: `cd apps/backend && TEST_TYPE=unit npx jest src/lib/__tests__/whatsapp-admin-action && npx tsc --noEmit -p . && npx eslint "src/api/admin/whatsapp-conversations/[phone]/media" "src/api/admin/whatsapp-conversations/[phone]/media-messages" src/api/middlewares.ts` — Expected: PASS, 0 erreur.

- [ ] **Step 5: Vérification locale de la route de téléversement** (serveur local, session admin locale de test, voir `$SCRATCH/local-admin.env`) : `curl -F file=@facture.pdf -F voice=false` avec le jeton Bearer → 200 et `media.url` servie (`curl -I` 200) ; un `.exe` renommé `.pdf` → 400 « Type de fichier non accepté par WhatsApp. » ; un vocal WebM généré par ffmpeg avec `voice=true` → `mime_type: "audio/ogg"`, `voice: true`. `/media-messages` en local → 503 `unavailable` (webhook non configuré, attendu).

- [ ] **Step 6: Commit**
```bash
git add apps/backend/src/lib/whatsapp-admin-actions-client.ts apps/backend/src/lib/whatsapp-admin-action-http.ts apps/backend/src/lib/__tests__/whatsapp-admin-action*.ts "apps/backend/src/api/admin/whatsapp-conversations/[phone]/media" "apps/backend/src/api/admin/whatsapp-conversations/[phone]/media-messages" apps/backend/src/api/middlewares.ts apps/backend/package.json package-lock.json
git commit -m "feat(whatsapp-admin): routes de téléversement et d'envoi de médias"
```

---

### Task 4: Lecture des pièces jointes (tous types)

**Files:**
- Modify: `apps/backend/src/lib/whatsapp-chat-db.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts` (existant, ajout)

**Interfaces:**
- Produces:
```ts
export type ChatAttachment = {
  type: "image" | "video" | "audio" | "document"
  url: string | null
  mime_type?: string; filename?: string; size?: number; voice?: boolean; expired?: boolean; unavailable?: boolean
}
export function normalizeAttachments(raw: unknown): ChatAttachment[]
```

- [ ] **Step 1: Test**
```ts
import { normalizeAttachments } from "../whatsapp-chat-db"

describe("normalizeAttachments", () => {
  it("garde les anciennes photos et les nouveaux types, ignore le reste", () => {
    expect(
      normalizeAttachments([
        { type: "image", url: "https://x/a.jpg" },
        { type: "video", url: "https://x/b.mp4", mime_type: "video/mp4" },
        { type: "audio", url: null, expired: true, voice: true },
        { type: "document", url: "https://x/c.pdf", filename: "Facture.pdf", size: 1200 },
        { type: "sticker", url: "https://x/d.webp" },
        "n'importe quoi",
      ])
    ).toEqual([
      { type: "image", url: "https://x/a.jpg" },
      { type: "video", url: "https://x/b.mp4", mime_type: "video/mp4" },
      { type: "audio", url: null, expired: true, voice: true },
      { type: "document", url: "https://x/c.pdf", filename: "Facture.pdf", size: 1200 },
    ])
    expect(normalizeAttachments(null)).toEqual([])
  })
})
```
- [ ] **Step 2: Vérifier l'échec** — `cd apps/backend && TEST_TYPE=unit npx jest src/lib/__tests__/whatsapp-chat-db.unit.spec.ts` → FAIL.
- [ ] **Step 3: Implémenter** — remplacer le type `ChatAttachment` (commentaire : « url null + expired : fichier supprimé après 90 jours ; unavailable : copie en échec à la réception ») et ajouter :
```ts
const ATTACHMENT_TYPES = ["image", "video", "audio", "document"]

export function normalizeAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (a): a is ChatAttachment =>
      !!a && typeof a === "object" && ATTACHMENT_TYPES.includes((a as { type?: string }).type ?? "")
  )
}
```
et dans `getConversation` : `attachments: normalizeAttachments(row.attachments),`.
- [ ] **Step 4: Vérifier** — même commande → PASS ; `npx tsc --noEmit -p .` → 0 erreur.
- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/lib/whatsapp-chat-db.ts apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts
git commit -m "feat(whatsapp-admin): lecture des pièces jointes vidéo, audio et document"
```

---

### Task 5: n8n — action `send_media` (workflow `AdmConvAction7Qx`)

**Files:**
- Script de patch : `$SCRATCH/patch-admin-actions.py` (jetable)
- Modify (n8n prod) : workflow `AdmConvAction7Qx` « Admin - actions conversation »
- Modify : `/home/abdazz/CODE/perso/golden_market_projects/n8n_automation/guide-golden-market-agent.md` (§ 2.9)

**Interfaces:**
- Consumes: corps webhook de Task 3 `{ action: "send_media", phone_number, text, media: { kind, url, mime_type, filename, size, voice } }`.
- Produces: réponse `{ ok: true, message: { role: "human", content, createdAt }, warning: null }` ou `{ ok: false, error_code, message }` (identique à `send_text`) ; ligne `messages` `role = 'human'`, `attachments = [media sans size]`.

- [ ] **Step 1: Exporter** — `ssh admin@144.91.110.105 'docker exec golden_market_n8n n8n export:workflow --id=AdmConvAction7Qx --output=/tmp/adm.json && docker exec golden_market_n8n cat /tmp/adm.json' > $SCRATCH/adm.json` (garder aussi une copie `adm.backup.json`).

- [ ] **Step 2: Patch** (`python3 $SCRATCH/patch-admin-actions.py`) — modifications exactes :
  1. `Normalize Payload` : nouvelle affectation `media` (type `object`) = `={{ $json.body?.media ?? null }}`.
  2. `Validate Request` (jsCode) : `ACTIONS` inclut `'send_media'` ; pour `send_media` : `media.kind` ∈ image/video/audio/document et `media.url` commence par `https://` sinon `fail(400, 'invalid_request', 'Média invalide.')` ; légende ≤ 1024 ; même contrôle de fenêtre 24 h que `send_text` (factoriser : `if (req.action === 'send_text' || req.action === 'send_media')`) ; renvoyer `media: req.media` dans le JSON de sortie.
  3. `Route Action` : nouvelle règle `send_media` (sortie renommée `send_media`), insérée **avant** la règle `error`.
  4. Nouveau nœud `Send Media` (copie de `Send Text`, mêmes en-têtes, `onError` identique) avec :
```
={{ JSON.stringify((() => {
  const m = $json.media;
  const payload = { link: m.url };
  if ($json.text && m.kind !== 'audio') payload.caption = $json.text;
  if (m.kind === 'document') payload.filename = m.filename;
  return { messaging_product: 'whatsapp', to: $json.phone_number, type: m.kind, [m.kind]: payload };
})()) }}
```
  5. Connexions : `Route Action` sortie `send_media` → `Send Media` ; `Send Media` sortie 0 → `Check Send Result`, sortie erreur → `Format WhatsApp Error` (comme `Send Text`).
  6. `Prepare Human Message` : ajouter `attachments` :
```js
const media = req.route === 'send_media' ? req.media : null;
const attachments = media ? [{ type: media.kind, url: media.url, mime_type: media.mime_type, filename: media.filename, voice: !!media.voice }] : null;
return [{ json: { conversation_id: req.conversation_id, content, wamid: $input.first().json.messages[0].id, attachments: attachments ? JSON.stringify(attachments) : null } }];
```
  7. `Save Human Message` : insertion `INSERT INTO messages (conversation_id, role, content, whatsapp_msg_id, attachments) VALUES ($1::uuid, 'human', $2, $3, $4::jsonb)` et `queryReplacement` `={{ [ $json.conversation_id, $json.content, $json.wamid, $json.attachments ] }}`.

- [ ] **Step 3: Importer et publier** — `scp` du JSON patché, `docker cp`, `n8n import:workflow --input=/tmp/adm.json`, `n8n publish:workflow --id=AdmConvAction7Qx`, `docker restart golden_market_n8n`.

- [ ] **Step 4: Tester en réel** (fenêtre ouverte : demander au propriétaire d'écrire « test » au bot) : appel direct du webhook depuis le conteneur n8n avec le secret (`$N8N_ADMIN_ACTIONS_WEBHOOK_SECRET`) : `send_media` image `https://golden-market.co/static/...` (une photo produit existante) + légende → `{ ok: true }`, photo reçue avec légende ; `SELECT attachments FROM messages ORDER BY created_at DESC LIMIT 1` → pièce jointe `image`. `send_media` avec `url` en `http://` → 400. Expected : réception confirmée par le propriétaire.

- [ ] **Step 5: Documenter** — guide n8n § 2.9 : action `send_media` (corps, envoi par lien, légende ignorée pour l'audio, pièce jointe enregistrée) ; commit dans `n8n_automation` : `docs(guide): action send_media (médias envoyés depuis l'admin Medusa)`.

---

### Task 6: n8n — réception vidéo/vocal/document et purge à 90 jours

**Files:**
- Script de patch : `$SCRATCH/patch-main-media.py`, `$SCRATCH/patch-purge.py` (jetables)
- Modify (n8n prod) : workflows `i6KGA9BvK9unjxxj` (principal) et `PurgeClientPhot1`
- Modify : guide n8n § 2.10

**Interfaces:**
- Produces: messages client avec `attachments = [{ type: "video"|"audio"|"document", url, mime_type, filename?, voice? }]` ou `[{ type, url: null, unavailable: true }]`.

- [ ] **Step 1: Exporter** les deux workflows (copies de sauvegarde gardées).

- [ ] **Step 2: Patch du workflow principal** — modifications exactes :
  1. Nouveau nœud Code `Prepare Client Media` (`onError: continueErrorOutput`), entrées : `Download Media (Audio)`, `Binary To Base64 (Video)` (sortie 0), `Download Media (Document)` :
```js
// Copie du média client (vidéo, vocal, document) dans le stockage Medusa pour
// l'affichage dans l'admin - même méthode que les photos (Binary To Base64).
const item = $input.first();
const msg = $('Webhook1').first().json.body.entry[0].changes[0].value.messages[0];
const kind = msg.video ? 'video' : msg.audio ? 'audio' : 'document';
const source = msg[kind] || {};
const random = () => Math.random().toString(16).slice(2, 12);
const ext = (item.binary.data.fileExtension || (source.filename || '').split('.').pop() || 'bin').toLowerCase();
item.binary.data.fileName = 'client-media-' + random() + random() + '.' + ext;
const isProd = $env.MEDUSA_ENV === 'production';
return [{ json: { ...item.json,
  media_kind: kind,
  media_mime: source.mime_type || item.binary.data.mimeType || '',
  media_filename: source.filename || null,
  media_voice: !!source.voice,
  medusa_backend_url: isProd ? $env.MEDUSA_BACKEND_URL_PRODUCTION : $env.MEDUSA_BACKEND_URL,
  medusa_auth_header: 'Basic ' + Buffer.from((isProd ? $env.MEDUSA_ADMIN_KEY_PRODUCTION : $env.MEDUSA_ADMIN_KEY_STAGING) + ':').toString('base64'),
}, binary: item.binary }];
```
  2. Nouveau nœud HTTP `Upload Client Media` : copie de `Upload Client Photo` (même URL, en-tête, corps multipart `files` depuis `data`, `onError: continueRegularOutput`).
  3. Nouveau nœud Switch `Route After Media Upload` sur `$('Prepare Client Media').first().json.media_kind` : `audio` → `Transcribe Audio (Whisper)`, `video` → `Describe Video (Vision)`, `document` → `Override Message Text With Document`.
  4. Rebranchements : `Download Media (Audio)` sortie 0 → `Prepare Client Media` (au lieu de `Transcribe Audio (Whisper)`) ; `Binary To Base64 (Video)` sortie 0 → `Prepare Client Media` (au lieu de `Describe Video (Vision)`) ; `Prepare Client Media` sortie 0 → `Upload Client Media` → `Route After Media Upload` ; sortie erreur → `Vision Error Fallback`.
  5. Le nœud HTTP `Upload Client Media` remplace l'item (JSON de Medusa, sans binaire) : ajouter entre `Upload Client Media` et `Route After Media Upload` un nœud Code `Restore Media Binary` qui renvoie l'item préparé (binaire compris) :
```js
// Whisper lit le binaire "data" de son entrée : on repasse l'item préparé
// (l'URL copiée se relit ensuite via $('Upload Client Media')).
return [$('Prepare Client Media').first()];
```
  `Describe Video (Vision)` : remplacer toute référence à `$json.base64` / `$json.mimeType` par `$('Binary To Base64 (Video)').first().json.base64` / `.mimeType`. Vérifier sur les exécutions réelles du Step 4 que la transcription et la description fonctionnent toujours.
  6. Document : `Is Video Message` sortie « faux » → nouvel If `Is Document Message` (`!!...messages[0].document`) ; vrai → `Get Media URL (Document)` → `Download Media (Document)` (copies des nœuds audio, `onError: continueErrorOutput`, erreurs → `Vision Error Fallback`) → `Prepare Client Media` ; faux → `Final Message`.
  7. Nouveau nœud Code `Override Message Text With Document` :
```js
const original = $('Edit Fields').item.json;
const media = $('Prepare Client Media').first().json;
const url = $('Upload Client Media').first().json.files?.[0]?.url || null;
const name = media.media_filename || 'document';
return { json: { ...original, message_text: '[Document envoyé par le client : ' + name + ']',
  attachments: [url ? { type: 'document', url, mime_type: media.media_mime, filename: name } : { type: 'document', url: null, unavailable: true }] } };
```
  8. Fonction commune de pièce jointe (copiée dans `Override Message Text With Audio`, `Override Message Text With Video` et `Vision Error Fallback`), qui remplace le calcul actuel de `attachments` :
```js
const clientAttachments = () => {
  try {
    const url = $('Upload Client Photo').first().json.files?.[0]?.url;
    if (url) return [{ type: 'image', url }];
  } catch (e) {}
  try {
    const media = $('Prepare Client Media').first().json;
    let url = null;
    try { url = $('Upload Client Media').first().json.files?.[0]?.url || null; } catch (e) {}
    return [url
      ? { type: media.media_kind, url, mime_type: media.media_mime, ...(media.media_filename ? { filename: media.media_filename } : {}), ...(media.media_voice ? { voice: true } : {}) }
      : { type: media.media_kind, url: null, unavailable: true }];
  } catch (e) {}
  return null;
};
```
  `Override Message Text With Audio` et `...With Video` ajoutent `attachments: clientAttachments()` au JSON renvoyé (les deux chemins, avec et sans transcription/description).

- [ ] **Step 3: Patch de la purge** (`PurgeClientPhot1`, renommer « Maintenance - purge des médias (90 jours) ») :
  - `Find Expired Photos` : `WHERE m.role IN ('user', 'human')` (jamais `assistant`).
  - `Prepare Deletions` : ne retenir que les URL dont le nom de fichier contient `client-photo-`, `client-media-` ou `wa-media-`.
  - `Mark Expired` : conserver le type et les métadonnées :
```sql
UPDATE messages
SET attachments = (
  SELECT jsonb_agg(CASE WHEN elem->>'url' IS NOT NULL
                        THEN elem || jsonb_build_object('url', NULL, 'expired', true)
                        ELSE elem END)
  FROM jsonb_array_elements(attachments) elem
)
WHERE id = $1::uuid;
```

- [ ] **Step 4: Importer, publier, redémarrer, tester en réel** — le propriétaire envoie au bot une vidéo, un vocal et un PDF : l'agent répond comme avant (vidéo décrite, vocal transcrit), les trois messages ont une pièce jointe avec URL (`SELECT content, attachments FROM messages WHERE role='user' ORDER BY created_at DESC LIMIT 3`). Purge : exécution manuelle sur une copie de test (UPDATE d'un message de test antidaté de 91 jours, `role='human'`, pièce jointe `video` pointant un fichier `wa-media-` téléversé exprès) → fichier supprimé, pièce jointe `{ type: "video", ..., url: null, expired: true }` ; un message `assistant` antidaté reste intact.

- [ ] **Step 5: Documenter** — guide n8n § 2.10 (médias clients, purge étendue) ; commit `n8n_automation` : `docs(guide): vidéos, vocaux et documents clients dans l'admin, purge 90 jours étendue`.

---

### Task 7: Admin — affichage des médias et zone de message complète

**Files:**
- Create: `apps/backend/src/admin/lib/whatsapp-media.ts` (logique pure : type probable d'un fichier, limites, légende, envoi séquentiel)
- Test: `apps/backend/src/admin/lib/__tests__/whatsapp-media.unit.spec.ts`
- Create: `apps/backend/src/admin/components/whatsapp-attachment.tsx` (rendu d'une pièce jointe)
- Create: `apps/backend/src/admin/components/whatsapp-composer.tsx` (zone de message : trombone, glisser-déposer, Ctrl+V, aperçus, emojis, micro)
- Modify: `apps/backend/src/admin/routes/whatsapp-conversations/page.tsx` (types, `MessageBubble`, remplacement de `Composer`)

**Interfaces:**
- Consumes: routes Task 3 (`/media`, `/media-messages`, `/messages`) ; type `ChatAttachment` Task 4.
- Produces (`whatsapp-media.ts`) :
```ts
export type PendingFile = { id: string; file: File; voice: boolean; status: "ready" | "sending" | "sent" | "error"; error: string | null }
export const guessKind: (file: File) => "image" | "video" | "audio" | "document"
export const clientSizeError: (file: File, voice: boolean) => string | null
export const captionFor: (index: number, text: string) => string // légende sur le 1er fichier seulement
export async function sendAll(
  files: PendingFile[],
  text: string,
  deps: {
    upload: (f: PendingFile) => Promise<{ ok: true; media: OutgoingMediaDto } | { ok: false; message: string; errorCode?: string }>
    send: (media: OutgoingMediaDto, caption: string) => Promise<{ ok: true } | { ok: false; message: string; errorCode?: string }>
    sendText: (text: string) => Promise<{ ok: true } | { ok: false; message: string; errorCode?: string }>
    onUpdate: (id: string, patch: Partial<PendingFile>) => void
  }
): Promise<{ ok: boolean; windowExpired: boolean; textSent: boolean }>
```

- [ ] **Step 1: Tests de la logique pure**
```ts
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
```

- [ ] **Step 2: Vérifier l'échec** — `cd apps/backend && TEST_TYPE=unit npx jest src/admin/lib/__tests__/whatsapp-media.unit.spec.ts` → FAIL.

- [ ] **Step 3: Implémenter `whatsapp-media.ts`**
```ts
// Logique pure de la zone de message de la page Conversations WhatsApp (spec
// 2026-09-28 whatsapp-chat-medias) : contrôles avant envoi et envoi
// séquentiel des fichiers joints (téléversement puis envoi, un par un).

export type OutgoingMediaDto = {
  kind: "image" | "video" | "audio" | "document"
  url: string
  mime_type: string
  filename: string
  size: number
  voice: boolean
}
export type PendingFile = { id: string; file: File; voice: boolean; status: "ready" | "sending" | "sent" | "error"; error: string | null }
type Outcome = { ok: true } | { ok: false; message: string; errorCode?: string }

const MB = 1048576
// Photo : 20 Mo tolérés avant conversion (le serveur vérifie les 5 Mo WhatsApp
// après conversion en JPEG).
const LIMITS = { image: 20 * MB, video: 16 * MB, audio: 16 * MB, document: 100 * MB }
const LABELS = {
  image: "Photo trop lourde : 20 Mo maximum.",
  video: "Vidéo trop lourde : 16 Mo maximum pour WhatsApp.",
  audio: "Audio trop lourd : 16 Mo maximum pour WhatsApp.",
  document: "Document trop lourd : 100 Mo maximum pour WhatsApp.",
}

export const guessKind = (file: File): OutgoingMediaDto["kind"] =>
  file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document"

export const clientSizeError = (file: File, voice: boolean): string | null => {
  const kind = voice ? "audio" : guessKind(file)
  return file.size > LIMITS[kind] ? LABELS[kind] : null
}

export const captionFor = (index: number, text: string): string => (index === 0 ? text.trim() : "")

export async function sendAll(
  files: PendingFile[],
  text: string,
  deps: {
    upload: (f: PendingFile) => Promise<{ ok: true; media: OutgoingMediaDto } | { ok: false; message: string; errorCode?: string }>
    send: (media: OutgoingMediaDto, caption: string) => Promise<Outcome>
    sendText: (text: string) => Promise<Outcome>
    onUpdate: (id: string, patch: Partial<PendingFile>) => void
  }
): Promise<{ ok: boolean; windowExpired: boolean; textSent: boolean }> {
  const queue = files.filter((f) => f.status !== "sent")
  let captionUsed = false
  for (const [index, pending] of queue.entries()) {
    deps.onUpdate(pending.id, { status: "sending", error: null })
    const uploaded = await deps.upload(pending)
    if (!uploaded.ok) {
      deps.onUpdate(pending.id, { status: "error", error: uploaded.message })
      return { ok: false, windowExpired: false, textSent: false }
    }
    // WhatsApp refuse une légende sur un audio : le texte partira à part.
    const caption = uploaded.media.kind === "audio" ? "" : captionFor(index, text)
    if (caption) captionUsed = true
    const sent = await deps.send(uploaded.media, caption)
    if (!sent.ok) {
      deps.onUpdate(pending.id, { status: "error", error: sent.message })
      return { ok: false, windowExpired: sent.errorCode === "window_expired", textSent: false }
    }
    deps.onUpdate(pending.id, { status: "sent", error: null })
  }
  if (text.trim() && !captionUsed) {
    const sent = await deps.sendText(text.trim())
    if (!sent.ok) return { ok: false, windowExpired: sent.errorCode === "window_expired", textSent: false }
    return { ok: true, windowExpired: false, textSent: true }
  }
  return { ok: true, windowExpired: false, textSent: captionUsed }
}
```
Note : `captionFor(index, ...)` porte sur l'index dans la file restante ; si la 1re vidéo est déjà partie (réessai), la légende a déjà été envoyée → sur réessai, ne pas renvoyer la légende : la zone de texte est vidée au premier succès portant la légende (Step 4).

- [ ] **Step 4: Composants**
  - `whatsapp-attachment.tsx` — `WhatsappAttachment({ attachment })` :
    - `url === null` → encadré gris « Média expiré (conservé 90 jours) » si `expired`, « Média indisponible » si `unavailable`, sinon « Photo supprimée (90 jours) » (compatibilité).
    - `image` → `<a target=_blank><img class="h-40 w-40 rounded-md object-cover" loading="lazy"></a>`.
    - `video` → `<video controls preload="metadata" class="max-h-64 w-64 rounded-md" src=url>`.
    - `audio` → `<audio controls preload="metadata" src=url class="w-64">` + libellé « Note vocale » si `voice`.
    - `document` → carte `rounded-md border border-ui-border-base bg-ui-bg-base p-2` : pastille avec l'extension en majuscules (`PDF`, `DOCX`…), `filename` (tronqué), taille (`formatSize` : Ko/Mo, 1 décimale), lien « Télécharger » (`<a href={url} download={filename} target=_blank>`).
  - `whatsapp-composer.tsx` — `WhatsappComposer({ phoneNumber, replyWindow, onSent })`, reprend tout le comportement de l'ancien `Composer` (texte, relance hors fenêtre, bascule `window_expired`, remise à zéro au changement de conversation) et ajoute :
    - bouton trombone → `<input type="file" multiple accept="image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip">` ;
    - `onDragOver` / `onDrop` sur le conteneur de la conversation (prop `dropTargetRef` ou gestion sur la zone de message + message « Déposez vos fichiers ici » pendant le survol) ;
    - `onPaste` sur la zone de texte : ajoute les `clipboardData.files` de type image ;
    - bandeau d'aperçus : image/vidéo via `URL.createObjectURL` (révoqué au retrait), document = carte nom + taille, vocal = « Note vocale (0:12) » ; croix de retrait ; erreur et bouton « Réessayer » sous un fichier en échec ; erreur `clientSizeError` affichée immédiatement à l'ajout (fichier non ajouté) ;
    - bouton 😊 → panneau de 48 emojis courants (constante `EMOJIS`, ex. 😀 😂 😊 😍 🙏 👍 👌 👏 🙌 🔥 🎉 ✅ ❌ ⚠️ ❤️ 💯 😢 😅 🤝 📦 🚚 💰 💳 📞 📍 ⏰ 🛒 🎁 ⭐ ✨ 👋 🙂 😉 🤔 😎 🥰 😁 🤗 💪 👉 👇 📷 🎥 🎤 📄 ✔️ 🆗) ; insertion à la position du curseur (`selectionStart`), focus rendu à la zone de texte ;
    - bouton micro : `navigator.mediaDevices.getUserMedia({ audio: true })`, `MediaRecorder` avec le premier type pris en charge parmi `audio/ogg;codecs=opus`, `audio/webm;codecs=opus`, `audio/mp4` ; pendant l'enregistrement : durée `m:ss`, boutons « Annuler » et « Envoyer » ; à l'arrêt, `File([blob], "vocal.<ext>")` ajouté comme `PendingFile` `voice: true` et envoi immédiat ; refus du micro → « Autorisez le micro pour enregistrer un vocal » ; arrêt automatique à 15 minutes ; pistes du micro arrêtées (`track.stop()`) à la fin ;
    - bouton Envoyer actif si texte non vide **ou** au moins un fichier ; texte seul → `/messages` (inchangé) ; sinon `sendAll` avec `upload` = `fetch` multipart vers `/media` (`FormData` : `file`, `voice`) et `send` = POST JSON `/media-messages` ; à la fin : fichiers envoyés retirés de l'aperçu, texte vidé si `textSent`, `onSent(null)` pour rafraîchir la conversation, `setWindowClosed(true)` si `windowExpired` ;
    - zone de texte : `maxLength` 4096 si aucun fichier, 1024 (légende) sinon, avec compteur quand > 900.
  - `page.tsx` : type `ChatMessage.attachments` = `ChatAttachment[]` (mêmes champs que Task 4, redéclarés côté admin) ; `MessageBubble` : pièces jointes rendues avec `WhatsappAttachment` dans une colonne (`flex flex-col gap-1`), légende (`content`) dessous si non vide ; remplacer `<Composer …/>` par `<WhatsappComposer …/>` et supprimer l'ancien composant `Composer` (déplacé).

- [ ] **Step 5: Vérifier** — `cd apps/backend && TEST_TYPE=unit npx jest src/admin/lib/__tests__/whatsapp-media.unit.spec.ts` → PASS ; `cd src/admin && npx tsc --noEmit -p .` → 0 erreur ; `cd ../.. && npx eslint src/admin && npx medusa build 2>&1 | tail -3` → build OK.

- [ ] **Step 6: Vérification locale (navigateur, admin local)** — la base des conversations n'existe qu'en production (`WHATSAPP_CHAT_DATABASE_URL`) : en local la page affiche « indisponible ». Vérifier en local que la page se charge sans erreur console et que le build admin inclut les nouveaux composants ; le parcours visuel complet (aperçus, emojis, micro, lecteurs) est fait en production en Task 8 Step 2.

- [ ] **Step 7: Commit**
```bash
git add apps/backend/src/admin/lib/whatsapp-media.ts apps/backend/src/admin/lib/__tests__/whatsapp-media.unit.spec.ts apps/backend/src/admin/components apps/backend/src/admin/routes/whatsapp-conversations/page.tsx
git commit -m "feat(whatsapp-admin): médias, emojis et vocaux dans la zone de message et la conversation"
```

---

### Task 8: Déploiement, tests réels, documentation

- [ ] **Step 1: Staging puis production** — `git push origin staging` ; vérifier que l'image contient ffmpeg (`docker exec staging-golden-market-backend ffmpeg -version | head -1`) ; tester `/media` sur staging avec la clé admin (PDF → 200 + URL servie ; vocal WebM → OGG). Puis `git push origin staging:main` et mêmes vérifications en production (`production-golden-market-backend`).
- [ ] **Step 2: Parcours réel dans l'admin de production** (propriétaire connecté à l'admin, fenêtre de 24 h ouverte sur son numéro — lui demander d'écrire au bot) : depuis la page Conversations, envoyer à `22677406101` : une photo avec légende, deux photos d'un coup, une capture collée (Ctrl+V), une vidéo MP4, un PDF, un vocal, un texte avec emojis ; le propriétaire confirme la réception de chaque élément (vocal affiché comme note vocale) ; chaque envoi apparaît dans la conversation avec son média. Puis le propriétaire envoie au bot une vidéo, un vocal et un PDF : visibles dans l'admin (lecteur vidéo, lecteur audio, carte document).
- [ ] **Step 3: Documentation** — `AGENTS.md` (section « Conversations WhatsApp dans l'admin » : médias, routes `/media` et `/media-messages`, ffmpeg dans l'image, purge 90 jours tous médias) ; `HANDOFF.md` (entrée datée : livré, vérifié, limites) ; commit + push.
