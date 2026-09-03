import { readFileSync } from "fs"
import { join } from "path"
import { ImageResponse } from "next/og"
import { BRAND_TAGLINE } from "@lib/contact"

// Générateur partagé pour opengraph-image.tsx et twitter-image.tsx :
// avant ce fichier, les deux étaient encore les .jpg par défaut du starter
// Medusa/Next.js (aucune image Golden Market, jamais personnalisées - trouvé
// en cartographiant le projet le 2026-09-03). Génère dynamiquement une image
// à la charte réelle du site (couleurs gm-violet/gm-gold de tokens.css,
// logo réel, même accroche que metadata.description sur la page d'accueil)
// plutôt qu'un fichier statique fabriqué à la main.
//
// Couleurs recopiées de src/styles/tokens.css (--gm-violet, --gm-gold, etc.) -
// ImageResponse (Satori) n'a pas accès aux classes Tailwind/variables CSS du
// site, seulement à des styles inline littéraux.
const GM_VIOLET = "rgb(51, 40, 113)"
const GM_VIOLET_HOVER = "rgb(36, 28, 82)"
const GM_GOLD = "rgb(231, 169, 46)"
const GM_ON_VIOLET = "rgb(251, 247, 236)"
const GM_ON_VIOLET_MUTED = "rgba(251, 247, 236, 0.72)"

const logoBase64 = readFileSync(
  join(process.cwd(), "public/logo/logo-mark-color.png")
).toString("base64")

export const OG_IMAGE_SIZE = { width: 1200, height: 630 }

export function buildOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: `linear-gradient(135deg, ${GM_VIOLET} 0%, ${GM_VIOLET_HOVER} 100%)`,
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 20px",
            borderRadius: 999,
            border: `1px solid ${GM_GOLD}`,
            color: GM_GOLD,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 40,
          }}
        >
          Marketplace du Burkina Faso
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${logoBase64}`}
            width={110}
            height={110}
            alt=""
          />
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 700,
              color: GM_ON_VIOLET,
            }}
          >
            Golden Market
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 30,
            color: GM_ON_VIOLET_MUTED,
            textAlign: "center",
            maxWidth: 880,
          }}
        >
          {BRAND_TAGLINE}
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE }
  )
}
