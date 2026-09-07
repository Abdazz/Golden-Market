"use client"

import { useState } from "react"
import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { clx } from "@modules/common/components/ui"
import { getYoutubeVideoId } from "@lib/util/youtube"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  // URL YouTube optionnelle (product.metadata.video_url) - ajoutée comme
  // dernière vignette de la galerie quand elle est renseignée et parseable.
  videoUrl?: string | null
}

type GalleryItem =
  | { type: "image"; id: string; url: string }
  | { type: "video"; id: string; videoId: string }

const ImageGallery = ({ images, videoUrl }: ImageGalleryProps) => {
  const [active, setActive] = useState(0)

  const videoId = videoUrl ? getYoutubeVideoId(videoUrl) : null

  const items: GalleryItem[] = [
    ...images.map((image) => ({
      type: "image" as const,
      id: image.id,
      url: image.url,
    })),
    ...(videoId
      ? [{ type: "video" as const, id: `video-${videoId}`, videoId }]
      : []),
  ]

  if (!items.length) {
    return (
      <div className="aspect-square w-full rounded-2xl bg-gm-ivoire-2 border border-gm-border" />
    )
  }

  const main = items[Math.min(active, items.length - 1)]
  const hasMultiple = items.length > 1

  const showPrevious = () =>
    setActive((i) => (i - 1 + items.length) % items.length)
  const showNext = () => setActive((i) => (i + 1) % items.length)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gm-ivoire-2 border border-gm-border">
        {main.type === "video" ? (
          <iframe
            src={`https://www.youtube.com/embed/${main.videoId}`}
            title="Vidéo du produit"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          !!main.url && (
            <Image
              src={main.url}
              priority
              className="absolute inset-0 object-cover"
              alt=""
              fill
              sizes="(max-width: 992px) 100vw, 560px"
            />
          )
        )}
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={showPrevious}
              aria-label="Image précédente"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gm-ink shadow hover:bg-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={showNext}
              aria-label="Image suivante"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gm-ink shadow hover:bg-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex gap-2.5">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={
                item.type === "video"
                  ? "Voir la vidéo du produit"
                  : `Voir l'image ${index + 1}`
              }
              className={clx(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-gm-ivoire-2",
                index === active ? "border-gm-violet" : "border-transparent"
              )}
            >
              {item.type === "video" ? (
                <>
                  <Image
                    src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`}
                    className="absolute inset-0 object-cover"
                    alt=""
                    fill
                    sizes="64px"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </>
              ) : (
                !!item.url && (
                  <Image
                    src={item.url}
                    className="absolute inset-0 object-cover"
                    alt=""
                    fill
                    sizes="64px"
                  />
                )
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ImageGallery
