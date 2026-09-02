import { listCategories } from "@lib/data/categories"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Heading } from "@modules/common/components/ui"
import CategoryIcon from "./category-icon"

const CategoryGrid = async () => {
  const categories = await listCategories()

  // Pas de plafond arbitraire : le magasin a 7 vraies catégories (dont
  // "Sport", ajoutée en 2026-09) et la grille doit toutes les montrer.
  const topLevel = (categories || []).filter((c) => !c.parent_category)

  if (topLevel.length === 0) {
    return null
  }

  return (
    <div className="content-container py-10 small:py-16">
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <div>
          <span className="block mb-2.5 text-xs font-bold uppercase tracking-wide text-gm-gold-strong">
            Rayons
          </span>
          <Heading level="h2" className="text-2xl">
            Parcourir par catégorie
          </Heading>
        </div>
        <LocalizedClientLink
          href="/store"
          className="shrink-0 text-sm font-semibold text-gm-amethyst hover:underline"
        >
          Toutes les catégories →
        </LocalizedClientLink>
      </div>
      <div className="grid grid-cols-3 xsmall:grid-cols-4 medium:grid-cols-7 gap-3.5">
        {topLevel.map((category) => (
          <LocalizedClientLink
            key={category.id}
            href={`/categories/${category.handle}`}
            className="flex flex-col items-center gap-2.5 rounded-2xl border border-gm-border bg-white px-2 py-[1.125rem] text-center hover:border-gm-gold hover:-translate-y-0.5 transition-transform"
          >
            <span className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-gm-violet text-gm-gold">
              <CategoryIcon handle={category.handle} />
            </span>
            <span className="text-xs font-semibold text-gm-ink leading-tight">
              {category.name}
            </span>
          </LocalizedClientLink>
        ))}
      </div>
    </div>
  )
}

export default CategoryGrid
