import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { useState } from "react"

// Vidéo publicitaire du produit, synchronisée vers le catalogue Meta (voir
// apps/backend/src/lib/meta-catalog-mapping.ts, resolveVideoLink). Une seule
// vidéo par produit (pas par variante) - stockée dans product.metadata.video_url,
// aucune migration nécessaire (metadata est un champ JSON natif de Medusa).
//
// Réutilise l'endpoint natif /admin/uploads (même stockage que les images,
// file-local -> golden-market.co/static/...) plutôt qu'un pipeline dédié.
// Point d'attention connu : cet endpoint charge le fichier entier en mémoire
// (multer memoryStorage + base64) avant de l'écrire sur disque - un warning
// local prévient au-delà de VIDEO_SIZE_WARNING_MB, mais rien ne bloque
// techniquement un fichier plus gros (jusqu'à la limite Meta de 200 Mo).
const VIDEO_SIZE_WARNING_MB = 50

type UploadResponse = { files: Array<{ id: string; url: string }> }

const ProductVideoWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const existingVideoUrl =
    typeof product.metadata?.video_url === "string" ? product.metadata.video_url : null

  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl)
  const [status, setStatus] = useState<"idle" | "uploading" | "saving" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function saveVideoUrl(newVideoUrl: string | null) {
    setStatus("saving")
    setErrorMessage(null)

    const nextMetadata = { ...(product.metadata ?? {}) }
    if (newVideoUrl) {
      nextMetadata.video_url = newVideoUrl
    } else {
      delete nextMetadata.video_url
    }

    const res = await fetch(`/admin/products/${product.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: nextMetadata }),
    })

    if (!res.ok) {
      setStatus("error")
      setErrorMessage("Échec de l'enregistrement du produit.")
      return
    }

    setVideoUrl(newVideoUrl)
    setStatus("idle")
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) {
      return
    }

    setErrorMessage(null)

    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > VIDEO_SIZE_WARNING_MB) {
      const proceed = window.confirm(
        `Cette vidéo fait ${sizeMb.toFixed(0)} Mo. Les fichiers volumineux ` +
          `peuvent échouer à l'upload (le serveur charge le fichier entier en ` +
          `mémoire) et sont de toute façon déconseillés pour la publicité Meta ` +
          `(privilégier des vidéos courtes). Continuer quand même ?`
      )
      if (!proceed) {
        return
      }
    }

    setStatus("uploading")

    const formData = new FormData()
    formData.append("files", file)

    const uploadRes = await fetch("/admin/uploads", {
      method: "POST",
      credentials: "include",
      body: formData,
    })

    if (!uploadRes.ok) {
      setStatus("error")
      setErrorMessage("Échec de l'upload de la vidéo.")
      return
    }

    const { files }: UploadResponse = await uploadRes.json()
    const uploadedUrl = files[0]?.url
    if (!uploadedUrl) {
      setStatus("error")
      setErrorMessage("Réponse d'upload inattendue.")
      return
    }

    await saveVideoUrl(uploadedUrl)
  }

  async function handleRemove() {
    if (!window.confirm("Retirer la vidéo de ce produit ?")) {
      return
    }
    await saveVideoUrl(null)
  }

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <h2 className="text-ui-fg-base txt-large-plus mb-4">Vidéo publicitaire</h2>
      <p className="text-ui-fg-subtle txt-small mb-4">
        Synchronisée automatiquement vers le catalogue Meta pour les publicités vidéo.
      </p>

      {videoUrl && (
        <div className="mb-4">
          <video src={videoUrl} controls className="max-w-full rounded-lg" style={{ maxHeight: 240 }} />
        </div>
      )}

      <div className="flex items-center gap-x-3">
        <label className="txt-compact-small-plus bg-ui-button-neutral text-ui-fg-base border border-ui-border-base rounded-md px-3 py-1.5 cursor-pointer">
          {videoUrl ? "Remplacer la vidéo" : "Ajouter une vidéo"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={status === "uploading" || status === "saving"}
          />
        </label>

        {videoUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={status === "uploading" || status === "saving"}
            className="txt-compact-small-plus text-ui-fg-error"
          >
            Retirer
          </button>
        )}

        {status === "uploading" && <span className="text-ui-fg-subtle txt-small">Envoi en cours…</span>}
        {status === "saving" && <span className="text-ui-fg-subtle txt-small">Enregistrement…</span>}
      </div>

      {errorMessage && <p className="text-ui-fg-error txt-small mt-2">{errorMessage}</p>}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductVideoWidget
