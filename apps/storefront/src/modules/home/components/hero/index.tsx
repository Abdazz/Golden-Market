import { Button, Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="w-full bg-gm-violet">
      <div className="content-container py-14 small:py-24">
        <div className="flex flex-col items-start gap-6 max-w-2xl">
          <span className="inline-flex items-center rounded-full border border-gm-gold/35 bg-gm-gold/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-gm-gold-strong">
            Marketplace du Burkina Faso
          </span>
          <Heading
            level="h1"
            className="text-4xl small:text-5xl leading-tight text-gm-on-violet"
          >
            Les occasions en <span className="text-gm-gold">or</span> à ne pas
            manquer
          </Heading>
          <p className="text-gm-on-violet-muted text-base leading-relaxed max-w-md">
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
        </div>
      </div>
    </div>
  )
}

export default Hero
