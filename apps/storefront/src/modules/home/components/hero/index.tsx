import Image from "next/image"

import { Button, Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Visuel décoratif de la maquette ("Golden Market · Accueil") : anneau or +
// halo + carte produit flottante. La carte montre un vrai produit du
// catalogue ; le badge de remise n'apparaît que si ce produit est
// réellement en promotion (price list Medusa "sale"), jamais fabriqué.
export type HeroFeatured = {
  title: string
  handle: string
  thumbnail?: string | null
  price?: string | null
  discountLabel?: string | null
}

const Hero = ({ featured }: { featured?: HeroFeatured | null }) => {
  return (
    <div className="relative w-full overflow-hidden bg-gm-violet">
      <div className="content-container grid items-center gap-12 py-14 small:grid-cols-[1.05fr_0.95fr] small:py-24">
        <div className="flex flex-col items-start gap-6 max-w-xl">
          <span className="inline-flex items-center rounded-full border border-gm-gold/35 bg-gm-gold/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-gm-gold-strong">
            Marketplace du Burkina Faso
          </span>
          <Heading
            level="h1"
            className="text-4xl small:text-5xl medium:text-6xl font-extrabold leading-[1.08] tracking-tight text-gm-on-violet"
          >
            Les occasions en <span className="text-gm-gold">or</span> à ne pas
            manquer
          </Heading>
          <p className="text-gm-on-violet-muted text-base small:text-[17px] leading-relaxed max-w-[46ch]">
            Golden Market rassemble le meilleur du bon plan : électronique,
            maison, mode et bien plus, livré partout au Burkina Faso, payable
            par Orange Money.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <LocalizedClientLink href="/store">
              <Button variant="primary" size="large">
                Découvrir la boutique
              </Button>
            </LocalizedClientLink>
            <LocalizedClientLink href="/store">
              <Button variant="outline-onviolet" size="large">
                Voir les promotions
              </Button>
            </LocalizedClientLink>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-4 text-[13.5px] text-gm-on-violet-muted">
            <span className="inline-flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gm-gold"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Paiement Orange Money
            </span>
            <span className="inline-flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gm-gold"
              >
                <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
                <circle cx="7" cy="18" r="1.6" />
                <circle cx="18" cy="18" r="1.6" />
              </svg>
              Livraison nationale
            </span>
          </div>
        </div>

        {featured?.thumbnail && (
          <div className="relative mx-auto hidden h-[340px] w-[340px] small:block">
            <div
              className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2"
              style={{
                background:
                  "radial-gradient(circle, rgba(231,169,46,0.28), transparent 68%)",
              }}
            />
            <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[22px] border-transparent border-t-gm-gold border-r-gm-gold [border-bottom-color:rgba(231,169,46,0.35)] rotate-[-35deg]" />
            <LocalizedClientLink
              href={`/products/${featured.handle}`}
              className="absolute bottom-[6%] left-[8%] w-52 rotate-[-6deg] rounded-2xl bg-gm-ivoire p-3 shadow-2xl"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl">
                <Image
                  src={featured.thumbnail}
                  alt={featured.title}
                  fill
                  sizes="208px"
                  className="object-cover"
                />
              </div>
              <div className="px-1 pt-2.5">
                <div className="text-[13px] font-semibold text-gm-ink line-clamp-1">
                  {featured.title}
                </div>
                {featured.price && (
                  <div className="mt-1 font-display text-sm font-bold text-gm-violet tabular-nums">
                    {featured.price}
                  </div>
                )}
              </div>
              {featured.discountLabel && (
                <span className="absolute -right-3.5 top-5 rotate-[4deg] rounded-full bg-gm-terracotta px-3 py-1.5 text-xs font-bold text-white shadow-lg">
                  {featured.discountLabel}
                </span>
              )}
            </LocalizedClientLink>
          </div>
        )}
      </div>
    </div>
  )
}

export default Hero
