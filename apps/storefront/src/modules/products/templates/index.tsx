import React, { Suspense } from "react"

import Breadcrumb, { Crumb } from "@modules/common/components/breadcrumb"
import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import ProductTrust from "@modules/products/components/product-trust"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  const category = product.categories?.[0]
  const crumbs: Crumb[] = [
    { label: "Accueil", href: "/" },
    category
      ? { label: category.name, href: `/categories/${category.handle}` }
      : { label: "Tous les produits", href: "/store" },
    { label: product.title },
  ]

  return (
    <>
      <div className="content-container" data-testid="product-container">
        <Breadcrumb items={crumbs} />

        <div className="grid grid-cols-1 gap-10 pb-16 small:grid-cols-[1.05fr_1fr] small:items-start">
          <div className="w-full">
            <ImageGallery images={images} />
          </div>

          <div className="flex flex-col gap-6 small:sticky small:top-24">
            <ProductInfo product={product} />

            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>

            <ProductTrust />

            <ProductTabs product={product} />
          </div>
        </div>
      </div>

      <div
        className="content-container my-16 small:my-24"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
