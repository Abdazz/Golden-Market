import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

type LineItemOptionsProps = {
  variant: HttpTypes.StoreProductVariant | undefined
  "data-testid"?: string
  "data-value"?: HttpTypes.StoreProductVariant
}

const LineItemOptions = ({
  variant,
  "data-testid": dataTestid,
  "data-value": dataValue,
}: LineItemOptionsProps) => {
  // "Default Title" est le nom que Medusa donne à la variante unique d'un
  // produit sans option - aucune information à afficher pour l'acheteur.
  if (!variant?.title || variant.title === "Default Title") {
    return null
  }

  return (
    <Text data-testid={dataTestid} data-value={dataValue} className="text-xs text-gm-ink-muted">
      {variant.title}
    </Text>
  )
}

export default LineItemOptions
