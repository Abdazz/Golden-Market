import { HttpTypes } from "@medusajs/types";

export const isSimpleProduct = (product: HttpTypes.StoreProduct): boolean => {
    return product.options?.length === 1 && product.options[0].values?.length === 1;
}

// Produit commandable : au moins une variante sans suivi de stock, avec
// réappro autorisé, ou avec du stock réel (même règle que product-actions).
export const isProductAvailable = (product: HttpTypes.StoreProduct): boolean =>
    (product.variants ?? []).some(
        (variant) =>
            !variant.manage_inventory ||
            variant.allow_backorder ||
            (variant.inventory_quantity ?? 0) > 0
    )
