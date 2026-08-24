# Refonte storefront Golden Market : Accueil, Catalogue, Fiche produit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habiller l'Accueil, le Catalogue (PLP) et la Fiche produit (PDP) avec l'identité Golden Market : header et footer violets avec le logo de marque, hero de marque, bandeau de confiance, grille de catégories, carte produit restylée (réutilisée partout), panneau de filtres mobile sur le catalogue, et galerie/CTA sticky mobile sur la fiche produit.

**Architecture:** Ce plan consomme les tokens et composants (`Button`, `Badge`, `Chip`, `Heading`) posés par le plan Fondation — aucun de ces trois n'est retouché ici, seulement utilisé. La carte produit (`ProductPreview`/`Thumbnail`) est un composant partagé par l'Accueil, le Catalogue et les "produits similaires" de la Fiche produit : elle n'est modifiée qu'une fois (Task 6) et bénéficie automatiquement aux trois pages. Aucune logique métier n'est touchée (`lib/data/`, calcul de prix, ajout au panier) : uniquement le JSX/CSS des composants de présentation.

**Tech Stack:** Next.js 15 (App Router, composants serveur pour Nav/Footer/Hero/produits, `"use client"` uniquement où déjà présent), Tailwind CSS avec les tokens `gm-*` du plan Fondation, `next/image`.

**Spec:** `docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`

## Global Constraints

- Ce plan suppose le plan `2026-08-24-storefront-redesign-fondation.md` déjà exécuté (tokens `gm-*`, polices `font-display`/`font-sans`, composants `Button`/`Badge`/`Chip` disponibles).
- Gestionnaire de paquets : npm. Toutes les commandes s'exécutent avec `npm`.
- Aucun tiret cadratin (—) dans le code ni dans un texte affiché ; le tiret simple (-) est autorisé. Un tiret cadratin existant est corrigé dans ce plan (Task 9, `mobile-actions.tsx`).
- Pas de suite de tests automatisés côté storefront : vérification par `npm run build`, `npm run lint`, et vérification visuelle manuelle décrite dans chaque tâche, aux largeurs ~375px (mobile), ~768px (tablette), ≥1280px (desktop).
- Mobile-first strict : pas d'animation lourde, pas de vidéo de fond, pas de parallax. Transitions CSS courtes uniquement (déjà le cas dans le code existant via Headless UI `Transition`).
- Ne pas modifier `lib/data/`, les workflows backend, ou le comportement d'ajout au panier / sélection de variante déjà en place dans `product-actions/index.tsx` : seul l'habillage visuel change.
- Aucune collection "promotions" n'existe dans le modèle de données actuel. Le bandeau "Bons plans" de la spec est traité comme un traitement visuel (`tone="promo"`) appliqué à la première collection retournée par `listCollections`, pas comme une nouvelle règle métier de sélection de produits. Documenté explicitement dans Task 7 ; à revisiter si une vraie collection de promotions est créée plus tard.

---

## File Structure

- **Create** `apps/storefront/public/logo/logo-color.png`, `apps/storefront/public/logo/logo-white.png` : assets de marque copiés depuis le dossier charte graphique.
- **Modify** `apps/storefront/src/modules/layout/templates/nav/index.tsx` : header violet avec logo.
- **Modify** `apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx` : badge de quantité doré/violet cohérent avec les tokens.
- **Modify** `apps/storefront/src/modules/layout/templates/footer/index.tsx` : footer violet avec logo.
- **Modify** `apps/storefront/src/modules/home/components/hero/index.tsx` : hero de marque.
- **Create** `apps/storefront/src/modules/home/components/trust-band/index.tsx` : bandeau de confiance (nouveau).
- **Create** `apps/storefront/src/modules/home/components/category-grid/index.tsx` : grille de catégories (nouveau).
- **Modify** `apps/storefront/src/modules/products/components/thumbnail/index.tsx` : image carrée `object-fit: cover`.
- **Modify** `apps/storefront/src/modules/products/components/product-preview/index.tsx` : carte produit restylée (nom, prix, badge).
- **Modify** `apps/storefront/src/modules/products/components/product-preview/price.tsx` : prix en Baloo 2, ancien prix barré.
- **Modify** `apps/storefront/src/modules/home/components/featured-products/product-rail/index.tsx` : accepte un `tone` optionnel, réutilisé par la page d'accueil.
- **Modify** `apps/storefront/src/modules/home/components/featured-products/index.tsx` : propage `tone`.
- **Modify** `apps/storefront/src/app/[countryCode]/(main)/page.tsx` : compose Hero, TrustBand, CategoryGrid, bandeau promo, meilleures ventes.
- **Modify** `apps/storefront/src/modules/store/templates/index.tsx` : disposition catalogue + bouton filtre mobile.
- **Modify** `apps/storefront/src/modules/store/components/refinement-list/index.tsx` : panneau filtre en modal sur mobile.
- **Modify** `apps/storefront/src/modules/products/components/image-gallery/index.tsx` : galerie restylée.
- **Modify** `apps/storefront/src/modules/products/components/product-tabs/accordion.tsx` : accordéon restylé.
- **Modify** `apps/storefront/src/modules/products/components/product-actions/mobile-actions.tsx` : barre sticky restylée, retrait du tiret cadratin.

---

## Task 1 : Copier les assets logo dans `public/`

**Files:**
- Create: `apps/storefront/public/logo/logo-color.png`
- Create: `apps/storefront/public/logo/logo-white.png`

**Interfaces:**
- Produces : deux fichiers statiques servis par Next.js aux chemins `/logo/logo-color.png` et `/logo/logo-white.png`, consommés par Task 2 (Nav) et Task 3 (Footer) via `next/image`.

- [ ] **Step 1 : Copier les fichiers**

```bash
mkdir -p apps/storefront/public/logo
cp "/media/abdazz/DATA/CODE/perso/golden_market_projects/golden_market_visual_identity/fond transparent/logo.png" \
   apps/storefront/public/logo/logo-color.png
cp "/media/abdazz/DATA/CODE/perso/golden_market_projects/golden_market_visual_identity/fond transparent/logo-version-blanc.png" \
   apps/storefront/public/logo/logo-white.png
```

- [ ] **Step 2 : Vérifier la présence des fichiers**

Run: `ls -la apps/storefront/public/logo/`
Expected: les deux fichiers `logo-color.png` et `logo-white.png` présents, chacun environ 25 Ko.

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/public/logo/
git commit -m "Ajoute les assets logo Golden Market au storefront"
```

---

## Task 2 : Restyler le header (`Nav`)

**Files:**
- Modify: `apps/storefront/src/modules/layout/templates/nav/index.tsx`
- Modify: `apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`

**Interfaces:**
- Consumes : `/logo/logo-white.png` (Task 1), classes `bg-gm-violet`, `text-gm-on-violet` (plan Fondation).
- Produces : aucune nouvelle interface exportée ; `Nav` reste un composant serveur sans props.

- [ ] **Step 1 : Remplacer le rendu de `Nav`**

Fichier actuel (`apps/storefront/src/modules/layout/templates/nav/index.tsx`) :

```tsx
import { Suspense } from "react"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

export default async function Nav() {
  const [regions, locales, currentLocale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
  ])

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto border-b duration-200 bg-white border-ui-border-base">
        <nav className="content-container txt-xsmall-plus text-ui-fg-subtle flex items-center justify-between w-full h-full text-small-regular">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="txt-compact-xlarge-plus hover:text-ui-fg-base uppercase"
              data-testid="nav-store-link"
            >
              Medusa Store
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <div className="hidden small:flex items-center gap-x-6 h-full">
              <LocalizedClientLink
                className="hover:text-ui-fg-base"
                href="/account"
                data-testid="nav-account-link"
              >
                Account
              </LocalizedClientLink>
            </div>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="hover:text-ui-fg-base flex gap-2"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  Cart (0)
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
```

Remplacer par :

```tsx
import { Suspense } from "react"
import Image from "next/image"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

export default async function Nav() {
  const [regions, locales, currentLocale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
  ])

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto bg-gm-violet text-gm-on-violet">
        <nav className="content-container flex items-center justify-between w-full h-full text-sm">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full text-gm-on-violet-muted [&_button]:!text-gm-on-violet-muted [&_button:hover]:!text-gm-on-violet">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="flex items-center h-full py-3"
              data-testid="nav-store-link"
            >
              <Image
                src="/logo/logo-white.png"
                alt="Golden Market"
                width={140}
                height={44}
                className="h-9 w-auto"
                priority
              />
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <div className="hidden small:flex items-center gap-x-6 h-full">
              <LocalizedClientLink
                className="text-gm-on-violet-muted hover:text-gm-on-violet transition-colors"
                href="/account"
                data-testid="nav-account-link"
              >
                Mon compte
              </LocalizedClientLink>
            </div>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="text-gm-on-violet-muted hover:text-gm-on-violet flex gap-2 transition-colors"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  Panier (0)
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
```

Note : `SideMenu` garde son comportement (Popover Headless UI) inchangé ; seule
la couleur du texte du déclencheur "Menu" est adaptée au fond violet via les
classes de survol ciblées `[&_button]:!text-gm-on-violet-muted`. Le contenu
du panneau déroulant de `SideMenu` (fond blanc) n'est pas dans le périmètre
de ce plan.

- [ ] **Step 2 : Restyler le badge de quantité du panier**

Dans `apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`,
localiser le badge numérique affiché sur l'icône panier (recherche du motif
`totalItems` dans le fichier pour le retrouver). Remplacer ses classes de
couleur (typiquement une classe `bg-ui-fg-base text-white` ou équivalente)
par `bg-gm-terracotta text-white`. Garder la logique JavaScript de calcul de
`totalItems` strictement inchangée ; seule la classe CSS du badge change.

Exemple de remplacement si le badge est rendu ainsi :

```tsx
<span className="bg-ui-fg-base text-white rounded-full ...">
  {totalItems}
</span>
```

Devient :

```tsx
<span className="bg-gm-terracotta text-white rounded-full ...">
  {totalItems}
</span>
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000`. Le header
doit être violet plein, logo blanc centré, lien "Mon compte" et icône panier
visibles en blanc cassé, badge de quantité en terracotta si le panier
contient des articles.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/modules/layout/templates/nav/index.tsx apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx
git commit -m "Restyle le header en violet avec le logo Golden Market"
```

---

## Task 3 : Restyler le footer

**Files:**
- Modify: `apps/storefront/src/modules/layout/templates/footer/index.tsx`

**Interfaces:**
- Consumes : `/logo/logo-white.png` (Task 1).
- Produces : aucune nouvelle interface exportée.

- [ ] **Step 1 : Remplacer les classes de fond/texte du conteneur `<footer>`**

Dans `apps/storefront/src/modules/layout/templates/footer/index.tsx`, la
ligne d'ouverture actuelle :

```tsx
    <footer className="border-t border-ui-border-base w-full">
```

Remplacer par :

```tsx
    <footer className="w-full bg-gm-violet text-gm-on-violet-muted">
```

- [ ] **Step 2 : Remplacer le lien de marque par le logo**

Bloc actuel :

```tsx
          <div>
            <LocalizedClientLink
              href="/"
              className="txt-compact-xlarge-plus text-ui-fg-subtle hover:text-ui-fg-base uppercase"
            >
              Medusa Store
            </LocalizedClientLink>
          </div>
```

Remplacer par :

```tsx
          <div>
            <LocalizedClientLink href="/">
              <Image
                src="/logo/logo-white.png"
                alt="Golden Market"
                width={150}
                height={47}
                className="h-11 w-auto"
              />
            </LocalizedClientLink>
          </div>
```

Ajouter l'import en haut du fichier, avec les autres imports :

```tsx
import Image from "next/image";
```

- [ ] **Step 3 : Remplacer les couleurs de texte des colonnes**

Rechercher, dans le reste du fichier, chaque occurrence de
`text-ui-fg-base`, `text-ui-fg-subtle` et `text-ui-fg-muted` (titres de
colonne, liens, copyright) et les remplacer respectivement par
`text-gm-on-violet`, `text-gm-on-violet-muted`, `text-gm-on-violet-muted`.
Remplacer aussi la classe `hover:text-ui-fg-base` (sur les liens) par
`hover:text-gm-on-violet`.

- [ ] **Step 4 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 5 : Vérification visuelle**

Run: `npm run storefront:dev`. Faire défiler jusqu'au footer : fond violet
plein, logo blanc, texte lisible (blanc cassé sur violet, jamais de texte
sombre sur fond violet).

- [ ] **Step 6 : Commit**

```bash
git add apps/storefront/src/modules/layout/templates/footer/index.tsx
git commit -m "Restyle le footer en violet avec le logo Golden Market"
```

---

## Task 4 : Restyler le hero et ajouter le bandeau de confiance

**Files:**
- Modify: `apps/storefront/src/modules/home/components/hero/index.tsx`
- Create: `apps/storefront/src/modules/home/components/trust-band/index.tsx`

**Interfaces:**
- Consumes : `Button` variant `"primary"`/`"outline-onviolet"`, `Heading` (plan Fondation).
- Produces : `export default function TrustBand()` — composant sans props, consommé par Task 7 (composition de la page d'accueil).

- [ ] **Step 1 : Remplacer `Hero`**

Fichier actuel (`apps/storefront/src/modules/home/components/hero/index.tsx`) :

```tsx
import { Github } from "@medusajs/icons";
import { Button, Heading } from "@modules/common/components/ui";
const Hero = () => {
  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-3xl leading-10 text-ui-fg-base font-normal"
          >
            Ecommerce Starter Template
          </Heading>
          <Heading
            level="h2"
            className="text-3xl leading-10 text-ui-fg-subtle font-normal"
          >
            Powered by Medusa and Next.js
          </Heading>
        </span>
        <a href="https://github.com/medusajs/dtc-starter" target="_blank">
          <Button variant="secondary">
            View on GitHub <Github />
          </Button>
        </a>
      </div>
    </div>
  );
};

export default Hero;
```

Remplacer par :

```tsx
import { Button, Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="w-full bg-gm-violet relative overflow-hidden">
      <div className="content-container py-14 small:py-24 relative z-10 flex flex-col items-start gap-6 max-w-2xl">
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
  )
}

export default Hero
```

- [ ] **Step 2 : Créer `TrustBand`**

```tsx
const items = [
  {
    title: "Paiement Orange Money",
    detail: "Simple et sécurisé, sans carte bancaire",
  },
  {
    title: "Livraison au Burkina Faso",
    detail: "Expédié depuis Ouagadougou",
  },
  {
    title: "Une question ?",
    detail: "+226 61 85 37 37 sur WhatsApp",
  },
]

const TrustBand = () => {
  return (
    <div className="w-full bg-gm-ivoire-2 border-b border-gm-border">
      <div className="content-container grid grid-cols-1 small:grid-cols-3 gap-5 py-6">
        {items.map((item) => (
          <div key={item.title} className="flex flex-col">
            <strong className="text-sm font-semibold text-gm-ink">
              {item.title}
            </strong>
            <span className="text-sm text-gm-ink-muted">{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TrustBand
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi (le composant `TrustBand` n'est pas encore importé
nulle part, ce qui est normal à ce stade : il sera câblé dans la page
d'accueil en Task 7 ; le build valide seulement la syntaxe).

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/home/components/hero/index.tsx apps/storefront/src/modules/home/components/trust-band/index.tsx
git commit -m "Restyle le hero et ajoute le bandeau de confiance"
```

---

## Task 5 : Créer la grille de catégories

**Files:**
- Create: `apps/storefront/src/modules/home/components/category-grid/index.tsx`

**Interfaces:**
- Consumes : `listCategories` de `@lib/data/categories` (déjà utilisé par `Footer`, même fonction, aucune nouvelle donnée backend).
- Produces : `export default async function CategoryGrid()` — composant serveur asynchrone sans props, consommé par Task 7.

- [ ] **Step 1 : Créer le composant**

```tsx
import { listCategories } from "@lib/data/categories"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Heading } from "@modules/common/components/ui"

const CategoryGrid = async () => {
  const categories = await listCategories()

  const topLevel = (categories || [])
    .filter((c) => !c.parent_category)
    .slice(0, 6)

  if (topLevel.length === 0) {
    return null
  }

  return (
    <div className="content-container py-10 small:py-16">
      <div className="flex items-baseline justify-between mb-6">
        <Heading level="h2" className="text-2xl">
          Parcourir par catégorie
        </Heading>
        <LocalizedClientLink
          href="/store"
          className="text-sm font-semibold text-gm-amethyst hover:underline"
        >
          Toutes les catégories
        </LocalizedClientLink>
      </div>
      <div className="grid grid-cols-3 small:grid-cols-6 gap-3.5">
        {topLevel.map((category) => (
          <LocalizedClientLink
            key={category.id}
            href={`/categories/${category.handle}`}
            className="flex flex-col items-center gap-2.5 rounded-2xl border border-gm-border bg-white px-2 py-4.5 text-center hover:border-gm-gold hover:-translate-y-0.5 transition-transform"
          >
            <span className="flex h-13 w-13 items-center justify-center rounded-full bg-gm-violet text-gm-gold text-lg font-bold">
              {category.name.charAt(0).toUpperCase()}
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
```

Note : pas de photo dédiée par catégorie disponible (cf. spec) ; l'icône est
la première lettre du nom de la catégorie sur fond violet/or, cohérent avec
le reste de la palette, plutôt qu'une image manquante ou un pictogramme
générique non pertinent au produit réel.

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/src/modules/home/components/category-grid/index.tsx
git commit -m "Ajoute la grille de categories a la page d'accueil"
```

---

## Task 6 : Restyler la carte produit partagée (`Thumbnail` + `ProductPreview` + `PreviewPrice`)

**Files:**
- Modify: `apps/storefront/src/modules/products/components/thumbnail/index.tsx`
- Modify: `apps/storefront/src/modules/products/components/product-preview/index.tsx`
- Modify: `apps/storefront/src/modules/products/components/product-preview/price.tsx`

**Interfaces:**
- Consumes : classes `gm-*` (plan Fondation).
- Produces : `ThumbnailProps` inchangé (aucune prop ajoutée/retirée). `ProductPreview`/`PreviewPrice` gardent leurs props actuelles. Ce composant est utilisé tel quel par `product-rail` (Accueil), `paginated-products` (Catalogue) et `related-products` (Fiche produit) : aucun de ces trois fichiers n'a besoin d'être modifié pour hériter du nouveau style.

- [ ] **Step 1 : Passer `Thumbnail` en image carrée avec `object-fit: cover`**

Dans `apps/storefront/src/modules/products/components/thumbnail/index.tsx`,
remplacer le bloc de classes du `Container` :

```tsx
    <Container
      className={clx(
        "relative w-full overflow-hidden p-4 bg-ui-bg-subtle shadow-elevation-card-rest rounded-large group-hover:shadow-elevation-card-hover transition-shadow ease-in-out duration-150",
        className,
        {
          "aspect-[11/14]": isFeatured,
          "aspect-[9/16]": !isFeatured && size !== "square",
          "aspect-[1/1]": size === "square",
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
```

Par :

```tsx
    <Container
      className={clx(
        "relative w-full overflow-hidden p-0 bg-gm-ivoire-2 rounded-2xl transition-transform ease-in-out duration-150 group-hover:-translate-y-1",
        className,
        {
          "aspect-square": true,
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
```

Note : toutes les tailles (`isFeatured`, `"square"`, et les autres) passent
désormais en ratio carré fixe, conforme à la spec (§ "Photos catalogue
hétérogènes"). Dans `ImageOrPlaceholder`, remplacer `object-cover` reste
inchangé (déjà présent sur `<Image>`), il n'y a rien à modifier dans cette
sous-fonction.

- [ ] **Step 2 : Restyler `ProductPreview`**

Fichier actuel (`apps/storefront/src/modules/products/components/product-preview/index.tsx`) :

```tsx
import { Text } from "@modules/common/components/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"

export default async function ProductPreview({
  product,
  isFeatured,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({
    product,
  })

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
        />
        <div className="flex txt-compact-medium mt-4 justify-between">
          <Text className="text-ui-fg-subtle" data-testid="product-title">
            {product.title}
          </Text>
          <div className="flex items-center gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
```

Remplacer par :

```tsx
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Badge } from "@modules/common/components/ui"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"

export default async function ProductPreview({
  product,
  isFeatured,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({
    product,
  })

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="group block rounded-2xl border border-gm-border bg-white overflow-hidden transition-shadow hover:shadow-md"
      data-testid="product-wrapper"
    >
      <div className="relative">
        {cheapestPrice?.price_type === "sale" && (
          <Badge
            color="terracotta"
            className="absolute top-2.5 left-2.5 z-10"
          >
            Promo
          </Badge>
        )}
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
          className="rounded-none"
        />
      </div>
      <div className="flex flex-col gap-2 p-3">
        <span
          className="text-sm font-semibold text-gm-ink leading-snug line-clamp-2 min-h-[2.6em]"
          data-testid="product-title"
        >
          {product.title}
        </span>
        <div className="flex items-baseline gap-2">
          {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
        </div>
      </div>
    </LocalizedClientLink>
  )
}
```

- [ ] **Step 3 : Restyler `PreviewPrice`**

Fichier actuel (`apps/storefront/src/modules/products/components/product-preview/price.tsx`) :

```tsx
import { Text, clx } from "@modules/common/components/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      {price.price_type === "sale" && (
        <Text
          className="line-through text-ui-fg-muted"
          data-testid="original-price"
        >
          {price.original_price}
        </Text>
      )}
      <Text
        className={clx("text-ui-fg-muted", {
          "text-ui-fg-interactive": price.price_type === "sale",
        })}
        data-testid="price"
      >
        {price.calculated_price}
      </Text>
    </>
  )
}
```

Remplacer par :

```tsx
import { clx } from "@modules/common/components/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      <span
        className={clx("font-display font-bold text-base tabular-nums", {
          "text-gm-violet": price.price_type === "sale",
          "text-gm-ink": price.price_type !== "sale",
        })}
        data-testid="price"
      >
        {price.calculated_price}
      </span>
      {price.price_type === "sale" && (
        <span
          className="line-through text-gm-ink-muted text-xs tabular-nums"
          data-testid="original-price"
        >
          {price.original_price}
        </span>
      )}
    </>
  )
}
```

Note : l'ordre visuel change (prix actuel d'abord, prix barré ensuite),
conforme aux maquettes de référence.

- [ ] **Step 4 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 5 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir la page d'accueil (les rails de
collection existants suffisent à ce stade, avant même la Task 7) : les
cartes produit doivent avoir une image carrée nette, un nom sur 2 lignes
maximum, un prix en Baloo 2 gras, et un badge "Promo" en terracotta sur les
produits en solde s'il y en a dans le catalogue seedé.

- [ ] **Step 6 : Commit**

```bash
git add apps/storefront/src/modules/products/components/thumbnail/index.tsx apps/storefront/src/modules/products/components/product-preview/index.tsx apps/storefront/src/modules/products/components/product-preview/price.tsx
git commit -m "Restyle la carte produit partagee (image carree, prix, badge promo)"
```

---

## Task 7 : Composer la page d'accueil

**Files:**
- Modify: `apps/storefront/src/modules/home/components/featured-products/product-rail/index.tsx`
- Modify: `apps/storefront/src/modules/home/components/featured-products/index.tsx`
- Modify: `apps/storefront/src/app/[countryCode]/(main)/page.tsx`

**Interfaces:**
- Consumes : `TrustBand` (Task 4), `CategoryGrid` (Task 5), `ProductPreview` restylé (Task 6).
- Produces : `ProductRail` accepte une nouvelle prop optionnelle `tone?: "default" | "promo"` ; `FeaturedProducts` la propage via une nouvelle prop optionnelle `tone?: "default" | "promo"` sur le composant lui-même, appliquée à toutes les collections qu'il reçoit.

- [ ] **Step 1 : Ajouter la prop `tone` à `ProductRail`**

Fichier actuel (`apps/storefront/src/modules/home/components/featured-products/product-rail/index.tsx`) :

```tsx
import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

import InteractiveLink from "@modules/common/components/interactive-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      fields: "*variants.calculated_price",
    },
  })

  if (!pricedProducts) {
    return null
  }

  return (
    <div className="content-container py-12 small:py-24">
      <div className="flex justify-between mb-8">
        <Text className="txt-xlarge">{collection.title}</Text>
        <InteractiveLink href={`/collections/${collection.handle}`}>
          View all
        </InteractiveLink>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-3 gap-x-6 gap-y-24 small:gap-y-36">
        {pricedProducts &&
          pricedProducts.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} isFeatured />
            </li>
          ))}
      </ul>
    </div>
  )
}
```

Remplacer par :

```tsx
import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { Heading, clx } from "@modules/common/components/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
  tone = "default",
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
  tone?: "default" | "promo"
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      fields: "*variants.calculated_price",
    },
  })

  if (!pricedProducts) {
    return null
  }

  return (
    <div
      className={clx("py-10 small:py-16", {
        "bg-gm-terracotta/[0.06]": tone === "promo",
      })}
    >
      <div className="content-container">
        <div className="flex items-baseline justify-between mb-6">
          <Heading level="h2" className="text-2xl">
            {tone === "promo" ? (
              <span className="text-gm-terracotta">{collection.title}</span>
            ) : (
              collection.title
            )}
          </Heading>
          <LocalizedClientLink
            href={`/collections/${collection.handle}`}
            className={clx("text-sm font-semibold hover:underline", {
              "text-gm-terracotta": tone === "promo",
              "text-gm-amethyst": tone !== "promo",
            })}
          >
            Voir tout
          </LocalizedClientLink>
        </div>
        <ul className="grid grid-cols-2 small:grid-cols-4 gap-4">
          {pricedProducts &&
            pricedProducts.map((product) => (
              <li key={product.id}>
                <ProductPreview product={product} region={region} />
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
```

Note : `isFeatured` n'est plus passé à `ProductPreview` (il forçait un ratio
`11/14` avant Task 6 ; `Thumbnail` impose désormais un carré partout, donc
cette prop n'a plus d'effet visuel et est retirée pour rester honnête sur ce
qui est utilisé).

- [ ] **Step 2 : Propager `tone` dans `FeaturedProducts`**

Fichier actuel (`apps/storefront/src/modules/home/components/featured-products/index.tsx`) :

```tsx
import { HttpTypes } from "@medusajs/types"
import ProductRail from "@modules/home/components/featured-products/product-rail"

export default async function FeaturedProducts({
  collections,
  region,
}: {
  collections: HttpTypes.StoreCollection[]
  region: HttpTypes.StoreRegion
}) {
  return collections.map((collection) => (
    <li key={collection.id}>
      <ProductRail collection={collection} region={region} />
    </li>
  ))
}
```

Remplacer par :

```tsx
import { HttpTypes } from "@medusajs/types"
import ProductRail from "@modules/home/components/featured-products/product-rail"

export default async function FeaturedProducts({
  collections,
  region,
  tone = "default",
}: {
  collections: HttpTypes.StoreCollection[]
  region: HttpTypes.StoreRegion
  tone?: "default" | "promo"
}) {
  return collections.map((collection) => (
    <li key={collection.id}>
      <ProductRail collection={collection} region={region} tone={tone} />
    </li>
  ))
}
```

- [ ] **Step 3 : Composer la page d'accueil**

Fichier actuel (`apps/storefront/src/app/[countryCode]/(main)/page.tsx`) :

```tsx
import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "Medusa Next.js Starter Template",
  description:
    "A performant frontend ecommerce starter template with Next.js 15 and Medusa.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  if (!collections || !region) {
    return null
  }

  return (
    <>
      <Hero />
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
    </>
  )
}
```

Remplacer par :

```tsx
import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import TrustBand from "@modules/home/components/trust-band"
import CategoryGrid from "@modules/home/components/category-grid"
import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "Golden Market",
  description:
    "Golden Market : la marketplace des bonnes affaires au Burkina Faso.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  if (!collections || !region) {
    return null
  }

  const [promoCollection, ...restCollections] = collections

  return (
    <>
      <Hero />
      <TrustBand />
      <CategoryGrid />
      {promoCollection && (
        <FeaturedProducts
          collections={[promoCollection]}
          region={region}
          tone="promo"
        />
      )}
      {restCollections.length > 0 && (
        <ul className="flex flex-col">
          <FeaturedProducts collections={restCollections} region={region} />
        </ul>
      )}
    </>
  )
}
```

- [ ] **Step 4 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 5 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000`. Ordre attendu
de haut en bas : hero violet, bandeau de confiance, grille de catégories,
première collection en bandeau teinté terracotta ("Voir tout" en
terracotta), puis les collections restantes en bandeau standard ("Voir
tout" en améthyste).

- [ ] **Step 6 : Commit**

```bash
git add apps/storefront/src/modules/home/components/featured-products/product-rail/index.tsx apps/storefront/src/modules/home/components/featured-products/index.tsx "apps/storefront/src/app/[countryCode]/(main)/page.tsx"
git commit -m "Compose la nouvelle page d'accueil Golden Market"
```

---

## Task 8 : Restyler le catalogue (PLP) et ajouter le panneau de filtres mobile

**Files:**
- Modify: `apps/storefront/src/modules/store/templates/index.tsx`
- Modify: `apps/storefront/src/modules/store/components/refinement-list/index.tsx`

**Interfaces:**
- Consumes : `Chip` (plan Fondation), `Button`.
- Produces : `RefinementList` garde exactement les mêmes props (`sortBy`, `search`, `hideOptionsPicker`, `data-testid`) ; son rendu interne seul change (ajout d'un état local `mobileFiltersOpen` propre au composant, non exposé).

- [ ] **Step 1 : Restyler `StoreTemplate`**

Fichier actuel (`apps/storefront/src/modules/store/templates/index.tsx`) :

```tsx
import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div
      className="flex flex-col small:flex-row small:items-start py-6 content-container"
      data-testid="category-container"
    >
      <RefinementList sortBy={sort} />
      <div className="w-full">
        <div className="mb-8 text-2xl-semi">
          <h1 data-testid="store-page-title">All products</h1>
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
            optionValueIds={optionValueIds}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplate
```

Remplacer par :

```tsx
import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { Heading } from "@modules/common/components/ui"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="content-container py-6" data-testid="category-container">
      <Heading level="h1" className="text-3xl mb-6">
        Tous les produits
      </Heading>
      <div className="flex flex-col small:flex-row small:items-start gap-8">
        <RefinementList sortBy={sort} />
        <div className="w-full">
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default StoreTemplate
```

- [ ] **Step 2 : Ajouter le panneau de filtres mobile à `RefinementList`**

Lire l'intégralité de
`apps/storefront/src/modules/store/components/refinement-list/index.tsx`
(déjà lu pendant le brainstorming : il rend actuellement `SortProducts` et,
si `!hideOptionsPicker`, `OptionsPicker`, dans un conteneur qui reste visible
en permanence). Repérer le `return (...)` du composant et l'élément racine
qu'il retourne (un `<div>` englobant `SortProducts`/`OptionsPicker`).

Remplacer ce `return` par la structure suivante, qui garde `SortProducts` et
`OptionsPicker` strictement identiques en desktop (≥900px, classe
`small:block`) et les déplace dans une modale plein écran sur mobile,
déclenchée par un bouton "Filtrer" :

```tsx
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileFiltersOpen(true)}
        className="small:hidden inline-flex items-center gap-2 rounded-lg border border-gm-border bg-white px-3.5 py-2 text-sm font-semibold text-gm-ink mb-4"
        data-testid="mobile-filter-button"
      >
        Filtrer
      </button>

      <div className="hidden small:flex small:flex-col small:w-60 small:sticky small:top-24 gap-6">
        <SortProducts sortBy={sortBy} data-testid={dataTestId} />
        {!hideOptionsPicker && <OptionsPicker />}
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[60] small:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-lg text-gm-ink">
                Filtrer
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="text-gm-ink-muted text-sm font-semibold"
              >
                Fermer
              </button>
            </div>
            <div className="flex flex-col gap-6">
              <SortProducts sortBy={sortBy} data-testid={dataTestId} />
              {!hideOptionsPicker && <OptionsPicker />}
            </div>
          </div>
        </div>
      )}
    </>
  )
```

Ajouter `useState` à l'import React existant en tête de fichier (le fichier
importe déjà `useCallback` et `useMemo` depuis `"react"` : ajouter `useState`
à côté dans la même ligne d'import).

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/store` (ou
équivalent selon la région active). À largeur desktop (≥900px), les filtres
apparaissent en colonne latérale collante, pas de bouton "Filtrer" visible.
En redimensionnant sous 900px (ou via le mode mobile des DevTools), la
colonne disparaît, un bouton "Filtrer" apparaît ; cliquer dessus ouvre un
panneau plein écran depuis le bas avec les mêmes filtres, fermable en
cliquant sur "Fermer" ou en dehors du panneau.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/modules/store/templates/index.tsx apps/storefront/src/modules/store/components/refinement-list/index.tsx
git commit -m "Restyle le catalogue et ajoute le panneau de filtres mobile"
```

---

## Task 9 : Restyler la fiche produit (galerie, accordéon, barre sticky mobile)

**Files:**
- Modify: `apps/storefront/src/modules/products/components/image-gallery/index.tsx`
- Modify: `apps/storefront/src/modules/products/components/product-tabs/accordion.tsx`
- Modify: `apps/storefront/src/modules/products/components/product-actions/mobile-actions.tsx`

**Interfaces:**
- Consumes : classes `gm-*`, `Button` (plan Fondation).
- Produces : aucune interface publique modifiée sur les trois composants (props inchangées).

- [ ] **Step 1 : Restyler `image-gallery`**

Lire `apps/storefront/src/modules/products/components/image-gallery/index.tsx`
en entier. Repérer les classes appliquées au conteneur de chaque image
(actuellement probablement un ratio non carré avec `bg-ui-bg-subtle` ou
équivalent). Remplacer, pour l'image principale, les classes de conteneur
par `relative aspect-square w-full overflow-hidden rounded-2xl bg-gm-ivoire-2
border border-gm-border`, et sur l'`<Image>` interne, s'assurer que
`object-cover` est présent (l'ajouter si absent). Le composant garde sa
logique de récupération de la liste d'images (`product.images`) inchangée ;
seules les classes CSS du conteneur et l'ajout de `object-cover` changent.

- [ ] **Step 2 : Restyler `accordion.tsx`**

Lire `apps/storefront/src/modules/products/components/product-tabs/accordion.tsx`
en entier. Repérer la classe appliquée à l'en-tête cliquable de chaque item
(bouton qui bascule l'ouverture/fermeture) et remplacer ses classes de bordure
par `border-b border-gm-border`, sa classe de texte par `font-semibold
text-gm-ink`. Repérer le conteneur du contenu déplié et remplacer sa classe
de texte par `text-sm text-gm-ink-muted leading-relaxed`. Ne pas toucher à la
logique d'ouverture/fermeture (état `useState`/Headless UI `Disclosure` déjà
en place), seulement les classes CSS.

- [ ] **Step 3 : Restyler `mobile-actions.tsx` et retirer le tiret cadratin**

Dans `apps/storefront/src/modules/products/components/product-actions/mobile-actions.tsx`,
remplacer le bloc suivant :

```tsx
            <div className="flex items-center gap-x-2">
              <span data-testid="mobile-title">{product.title}</span>
              <span>—</span>
              {selectedPrice ? (
```

Par (suppression du tiret cadratin décoratif, remplacé par une mise en page
sans séparateur textuel) :

```tsx
            <div className="flex flex-col items-center gap-y-1">
              <span
                data-testid="mobile-title"
                className="text-sm font-semibold text-gm-ink line-clamp-1"
              >
                {product.title}
              </span>
              {selectedPrice ? (
```

Puis, plus bas dans le même bloc, fermer la nouvelle structure : repérer la
fermeture du `<div>` qui contenait auparavant `{selectedPrice ? (...) : (
<div></div> )}` et s'assurer que la balise fermante correspond bien au
nouveau `<div className="flex flex-col items-center gap-y-1">` (un seul
niveau de `</div>` à ajuster, pas de changement de structure au-delà de ce
renommage de classe).

Remplacer ensuite le conteneur englobant (fond blanc actuel) :

```tsx
          <div
            className="bg-white flex flex-col gap-y-3 justify-center items-center text-large-regular p-4 h-full w-full border-t border-gray-200"
            data-testid="mobile-actions"
          >
```

Par :

```tsx
          <div
            className="bg-white flex flex-col gap-y-3 justify-center items-center p-4 h-full w-full border-t border-gm-border shadow-[0_-8px_24px_-12px_rgba(33,27,61,0.2)]"
            data-testid="mobile-actions"
          >
```

Enfin, dans le bouton principal "Add to cart"/"Out of stock", ajouter la
classe `bg-gm-gold text-gm-ink hover:bg-gm-gold-strong` n'est pas nécessaire
: le composant `Button` (plan Fondation, Task 5) applique déjà ces couleurs
par défaut via `variant="primary"`, qui est la valeur par défaut déjà
utilisée ici sans prop `variant` explicite. Ne rien changer sur ce bouton.

- [ ] **Step 4 : Vérifier qu'aucun tiret cadratin ne subsiste dans les trois fichiers**

Run: `grep -n "—" apps/storefront/src/modules/products/components/image-gallery/index.tsx apps/storefront/src/modules/products/components/product-tabs/accordion.tsx apps/storefront/src/modules/products/components/product-actions/mobile-actions.tsx`
Expected: aucune sortie (grep retourne un code de sortie non nul, aucune
correspondance).

- [ ] **Step 5 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 6 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir une fiche produit
(`http://localhost:8000/fr/products/<handle>`). Galerie carrée avec fond
ivoire, accordéon (description/livraison/paiement si présent) avec bordures
et texte cohérents avec la palette. Réduire la largeur sous ~1024px (seuil
`lg` de Tailwind utilisé par `mobile-actions.tsx`) et faire défiler la page
au-delà du bloc d'actions principal : une barre blanche avec ombre douce
doit apparaître en bas d'écran avec le nom du produit, le prix, et le bouton
d'ajout au panier, sans tiret cadratin visible entre le nom et le prix.

- [ ] **Step 7 : Commit**

```bash
git add apps/storefront/src/modules/products/components/image-gallery/index.tsx apps/storefront/src/modules/products/components/product-tabs/accordion.tsx apps/storefront/src/modules/products/components/product-actions/mobile-actions.tsx
git commit -m "Restyle la galerie, l'accordeon et la barre sticky mobile de la fiche produit"
```

---

## Fin de plan

Après ces 9 tâches, l'Accueil, le Catalogue et la Fiche produit affichent
l'identité Golden Market complète (header/footer violets, hero de marque,
bandeau de confiance, catégories, cartes produit cohérentes, filtres mobile,
galerie et CTA sticky). Le plan suivant (`Panier + Paiement`) réutilise la
carte produit (Task 6) dans ses mini-résumés de commande sans modification
supplémentaire.
