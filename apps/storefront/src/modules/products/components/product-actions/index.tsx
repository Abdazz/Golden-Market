"use client"

import { addToCart } from "@lib/data/cart"
import { useIntersection } from "@lib/hooks/use-in-view"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import Divider from "@modules/common/components/divider"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OptionSelect from "@modules/products/components/product-actions/option-select"
import { isEqual } from "lodash"
import { useParams, usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import ProductPrice from "../product-price"
import MobileActions from "./mobile-actions"
import { useRouter } from "next/navigation"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt) => {
    if (varopt.option_id) acc[varopt.option_id] = varopt.value
    return acc
  }, {})
}

export default function ProductActions({
  product,
  disabled,
}: ProductActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [options, setOptions] = useState<Record<string, string | undefined>>({})
  const [isAdding, setIsAdding] = useState(false)
  // Id de la variante pour laquelle le dernier ajout au panier réussi a eu
  // lieu (pas un simple booléen) : addToCart est une server action qui
  // déclenche un rafraîchissement de route, lequel refait tourner l'effet de
  // présélection de variante ci-dessous avec un nouvel objet product - un
  // booléen remis à zéro sur un changement de référence de `options` serait
  // donc effacé à tort par ce rafraîchissement. Comparer par id de variante
  // survit à ce rafraîchissement tout en revenant à "Ajouter au panier" dès
  // que le client sélectionne réellement une autre variante.
  const [addedVariantId, setAddedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const countryCode = useParams().countryCode as string

  // If there is only 1 variant, preselect the options
  useEffect(() => {
    if (product.variants?.length === 1) {
      const variantOptions = optionsAsKeymap(product.variants[0].options)
      setOptions(variantOptions ?? {})
    }
  }, [product.variants])

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) {
      return
    }

    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  const justAdded = !!selectedVariant && addedVariantId === selectedVariant.id

  // update the options when a variant is selected
  const setOptionValue = (optionId: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [optionId]: value,
    }))
  }

  //check if the selected options produce a valid variant
  const isValidVariant = useMemo(() => {
    return product.variants?.some((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const value = isValidVariant ? selectedVariant?.id : null

    if (params.get("v_id") === value) {
      return
    }

    if (value) {
      params.set("v_id", value)
    } else {
      params.delete("v_id")
    }

    router.replace(pathname + "?" + params.toString())
  }, [selectedVariant, isValidVariant])

  // check if the selected variant is in stock
  const inStock = useMemo(() => {
    // If we don't manage inventory, we can always add to cart
    if (selectedVariant && !selectedVariant.manage_inventory) {
      return true
    }

    // If we allow back orders on the variant, we can add to cart
    if (selectedVariant?.allow_backorder) {
      return true
    }

    // If there is inventory available, we can add to cart
    if (
      selectedVariant?.manage_inventory &&
      (selectedVariant?.inventory_quantity || 0) > 0
    ) {
      return true
    }

    // Otherwise, we can't add to cart
    return false
  }, [selectedVariant])

  const actionsRef = useRef<HTMLDivElement>(null)

  const inView = useIntersection(actionsRef, "0px")

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)

    const variantId = selectedVariant.id

    await addToCart({
      variantId,
      quantity,
      countryCode,
    })

    setIsAdding(false)
    setAddedVariantId(variantId)
  }

  const { variantPrice, cheapestPrice } = getProductPrice({
    product,
    variantId: selectedVariant?.id,
  })
  const priceLabel = (selectedVariant ? variantPrice : cheapestPrice)
    ?.calculated_price

  return (
    <>
      <div className="flex flex-col gap-y-2" ref={actionsRef}>
        <div>
          {(product.variants?.length ?? 0) > 1 && (
            <div className="flex flex-col gap-y-4">
              {(product.options || []).map((option) => {
                return (
                  <div key={option.id}>
                    <OptionSelect
                      option={option}
                      current={options[option.id]}
                      updateOption={setOptionValue}
                      title={option.title ?? ""}
                      data-testid="product-options"
                      disabled={!!disabled || isAdding}
                    />
                  </div>
                )
              })}
              <Divider />
            </div>
          )}
        </div>

        <ProductPrice product={product} variant={selectedVariant} />

        {justAdded ? (
          <div className="flex items-stretch gap-3" data-testid="post-add-to-cart-actions">
            <LocalizedClientLink
              href="/cart"
              className="flex-1 inline-flex items-center justify-center h-10 rounded-full bg-gm-gold text-gm-ink font-semibold hover:bg-gm-gold-strong"
              data-testid="view-cart-button"
            >
              Voir le panier
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/store"
              className="flex-1 inline-flex items-center justify-center h-10 rounded-full border border-gm-violet text-gm-violet font-semibold hover:bg-gm-violet hover:text-gm-on-violet"
              data-testid="continue-shopping-button"
            >
              Retour sur la liste des produits
            </LocalizedClientLink>
          </div>
        ) : (
          <div className="flex items-stretch gap-3">
            <div className="flex items-center rounded-full border border-gm-border overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || isAdding}
                className="w-9 h-10 bg-gm-ivoire-2 text-gm-ink text-lg disabled:opacity-40"
                aria-label="Diminuer la quantité"
              >
                −
              </button>
              <span
                className="w-9 text-center font-bold text-sm tabular-nums"
                data-testid="product-quantity"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                disabled={quantity >= 99 || isAdding}
                className="w-9 h-10 bg-gm-ivoire-2 text-gm-ink text-lg disabled:opacity-40"
                aria-label="Augmenter la quantité"
              >
                +
              </button>
            </div>
            <Button
              onClick={handleAddToCart}
              disabled={
                !inStock ||
                !selectedVariant ||
                !!disabled ||
                isAdding ||
                !isValidVariant
              }
              variant="primary"
              className="flex-1 h-10"
              isLoading={isAdding}
              data-testid="add-product-button"
            >
              {!selectedVariant && !options
                ? "Sélectionnez une variante"
                : !inStock || !isValidVariant
                ? "Rupture de stock"
                : priceLabel
                ? `Ajouter au panier · ${priceLabel}`
                : "Ajouter au panier"}
            </Button>
          </div>
        )}
        <MobileActions
          product={product}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          isAdding={isAdding}
          justAdded={justAdded}
          show={!inView}
          optionsDisabled={!!disabled || isAdding}
        />
      </div>
    </>
  )
}
