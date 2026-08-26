import { Heading, Text } from "@modules/common/components/ui"

import InteractiveLink from "@modules/common/components/interactive-link"
import Package from "@modules/common/icons/package"

const EmptyCartMessage = () => {
  return (
    <div
      className="py-24 small:py-32 flex flex-col items-center text-center gap-3"
      data-testid="empty-cart-message"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gm-ivoire-2 text-gm-violet mb-2">
        <Package size={28} />
      </span>
      <Heading level="h1" className="text-2xl">
        Votre panier est vide
      </Heading>
      <Text className="text-sm text-gm-ink-muted max-w-sm">
        Vous n&apos;avez encore rien ajouté à votre panier. Parcourez notre catalogue pour trouver
        votre prochaine bonne affaire.
      </Text>
      <div className="mt-2">
        <InteractiveLink href="/store">Explorer les produits</InteractiveLink>
      </div>
    </div>
  )
}

export default EmptyCartMessage
