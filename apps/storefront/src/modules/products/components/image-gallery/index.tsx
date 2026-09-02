"use client"

import { useState } from "react"
import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { clx } from "@modules/common/components/ui"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [active, setActive] = useState(0)

  if (!images.length) {
    return (
      <div className="aspect-square w-full rounded-2xl bg-gm-ivoire-2 border border-gm-border" />
    )
  }

  const main = images[Math.min(active, images.length - 1)]
  const hasMultiple = images.length > 1

  const showPrevious = () =>
    setActive((i) => (i - 1 + images.length) % images.length)
  const showNext = () => setActive((i) => (i + 1) % images.length)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gm-ivoire-2 border border-gm-border">
        {!!main.url && (
          <Image
            src={main.url}
            priority
            className="absolute inset-0 object-cover"
            alt=""
            fill
            sizes="(max-width: 992px) 100vw, 560px"
          />
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

      {images.length > 1 && (
        <div className="flex gap-2.5">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Voir l'image ${index + 1}`}
              className={clx(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-gm-ivoire-2",
                index === active ? "border-gm-violet" : "border-transparent"
              )}
            >
              {!!image.url && (
                <Image
                  src={image.url}
                  className="absolute inset-0 object-cover"
                  alt=""
                  fill
                  sizes="64px"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ImageGallery
