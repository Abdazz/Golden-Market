import { buildOgImage, OG_IMAGE_SIZE } from "@lib/og-image"

export const alt = "Golden Market — la marketplace des bonnes affaires au Burkina Faso"
export const size = OG_IMAGE_SIZE
export const contentType = "image/png"

export default async function Image() {
  return buildOgImage()
}
