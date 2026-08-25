# Refonte storefront Golden Market : Panier, Paiement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habiller le Panier et le Paiement (checkout en 4 étapes) avec l'identité Golden Market : ligne de panier en carte (plus de tableau HTML), récapitulatif sticky avec CTA "Passer la commande", et les 4 cartes d'étape du checkout (Adresse, Livraison, Paiement, Récapitulatif) avec pastille numérotée, résumé d'une ligne pour les étapes complétées, et encart d'instructions Orange Money reformaté (suppression du tiret cadratin existant).

**Architecture:** Ce plan consomme les tokens et composants (`Button`, `Badge`, `Heading`, `Chip`) du plan Fondation, et la `Thumbnail` carrée du plan Accueil/Catalogue/Produit, sans les modifier. Il ajoute un nouveau composant partagé, `StepHeader` (pastille numérotée), consommé par les 4 étapes du checkout. La ligne de panier (`Item`) est refondue en carte flexbox (elle était un `<tr>` de tableau) et sert à la fois au panier complet et au mini-récapitulatif du checkout via une prop `type`. Les composants de champ de formulaire partagés (`Input`, `NativeSelect`, `Radio`, `Checkbox`, `IconBadge`) sont retintés une seule fois en début de plan : toutes les étapes du checkout en héritent automatiquement. Aucune logique métier n'est touchée (`lib/data/`, calcul de prix, appels `initiatePaymentSession`/`setShippingMethod`/`placeOrder`/`updateLineItem`/`deleteLineItem`) : uniquement le JSX/CSS des composants de présentation.

**Tech Stack:** Next.js 15 (App Router, `"use client"` uniquement ou déjà présent), Tailwind CSS avec les tokens `gm-*` du plan Fondation, Headless UI (`RadioGroup`, `Listbox`, déjà utilisés), Stripe Elements (déjà intégré, seul le style CSS de la carte change).

**Spec:** `docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`

## Global Constraints

- Ce plan suppose les plans `2026-08-24-storefront-redesign-fondation.md` et `2026-08-24-storefront-redesign-accueil-catalogue-produit.md` déjà exécutés : tokens `gm-*`, polices `font-display`/`font-sans`, composants `Button`/`Badge`/`Heading`/`Chip` retintés, `Thumbnail` en ratio carré fixe, assets `public/logo/logo-color.png` et `public/logo/logo-white.png` présents.
- Gestionnaire de paquets : npm. Toutes les commandes s'exécutent avec `npm`.
- Aucun tiret cadratin (—) dans le code ni dans un texte affiché ; le tiret simple (-) est autorisé. Le tiret cadratin existant dans `checkout/components/payment/index.tsx` (entre le numéro de téléphone et le titulaire du compte Orange Money) est supprimé dans ce plan (Task 11).
- Pas de suite de tests automatisée côté storefront : vérification par `npm run build`, `npm run lint`, et vérification visuelle manuelle décrite dans chaque tâche, aux largeurs ~375px (mobile), ~768px (tablette), ≥1280px (desktop).
- Mobile-first strict : pas d'animation lourde, pas de vidéo de fond, pas de parallax. Transitions CSS courtes uniquement.
- Ne pas modifier `lib/data/`, les workflows backend, le calcul de prix, ou les appels `initiatePaymentSession`, `setShippingMethod`, `placeOrder`, `updateLineItem`, `deleteLineItem`, `applyPromotions` : seul l'habillage visuel change. Chaque tâche de ce plan préserve exactement la logique et les `data-testid` existants sauf mention explicite contraire.
- Décision de scope : les composants de champ de formulaire partagés (`Input` deux variantes, `NativeSelect`, `Radio`, `Checkbox`, `IconBadge`) sont retintés dans ce plan (Tasks 1-2) car utilisés massivement par les formulaires du panier et du checkout. Cela retinte aussi par ricochet les pages Compte (login/register/adresses), pas encore planifiées, sans changer leur logique ; même principe que le retintage de `Thumbnail`/`ProductPreview` dans le plan Accueil/Catalogue/Produit qui bénéficie à plusieurs pages sans y retoucher.
- Décision de scope : le champ de code promo (`DiscountCode`) n'est plus affiché dans le récapitulatif de la page Paiement (il reste sur la page Panier), conformément à la liste de contenu de la maquette Paiement dans la spec (§ Paiement : "mini-liste d'articles, sous-total, livraison, total", pas de code promo). Le composant `DiscountCode` n'est pas supprimé, seulement son rendu dans `CheckoutSummary`.
- Traduction : ce plan traduit en français les titres, CTA et libellés de section explicitement nommés par la spec ou visibles à l'écran (ex. "Passer la commande", "Continuer mes achats", "Livraison", "Paiement"). Les libellés de champ de formulaire individuels (ex. "First name", "Last name") ne sont pas traduits dans ce plan : ils ne sont pas nommés par la spec et leur volume dépasse l'habillage visuel demandé.

---

## File Structure

- **Modify** `apps/storefront/src/modules/common/components/ui/index.tsx` : retinter `Input`, `Checkbox`, `IconBadge`.
- **Modify** `apps/storefront/src/modules/common/components/input/index.tsx` : retinter le champ à étiquette flottante (adresses).
- **Modify** `apps/storefront/src/modules/common/components/native-select/index.tsx` : retinter (pays).
- **Modify** `apps/storefront/src/modules/common/components/radio/index.tsx` : retinter le rond de sélection (livraison/paiement).
- **Modify** `apps/storefront/src/modules/cart/components/cart-item-select/index.tsx` : retinter le sélecteur de quantité.
- **Create** `apps/storefront/src/modules/checkout/components/step-header/index.tsx` : pastille numérotée partagée par les 4 étapes.
- **Modify** `apps/storefront/src/modules/cart/components/item/index.tsx` : carte de ligne de panier (remplace la ligne de tableau).
- **Modify** `apps/storefront/src/modules/common/components/line-item-price/index.tsx`, `line-item-unit-price/index.tsx`, `line-item-options/index.tsx` : retintage.
- **Modify** `apps/storefront/src/modules/cart/templates/items.tsx`, `preview.tsx` : listes d'articles (panier complet + mini-liste checkout).
- **Modify** `apps/storefront/src/modules/common/components/cart-totals/index.tsx` : retintage + note "livraison calculée à l'étape suivante".
- **Modify** `apps/storefront/src/modules/checkout/components/discount-code/index.tsx` : retintage + traduction.
- **Modify** `apps/storefront/src/modules/cart/components/empty-cart-message/index.tsx`, `sign-in-prompt/index.tsx` : retintage.
- **Modify** `apps/storefront/src/modules/common/components/interactive-link/index.tsx` : retintage.
- **Modify** `apps/storefront/src/modules/cart/templates/summary.tsx`, `index.tsx` : récapitulatif panier + page panier.
- **Modify** `apps/storefront/src/modules/checkout/components/addresses/index.tsx`, `address-select/index.tsx`, `shipping-address/index.tsx` : étape Adresse.
- **Modify** `apps/storefront/src/modules/checkout/components/shipping/index.tsx` : étape Livraison.
- **Modify** `apps/storefront/src/modules/checkout/components/payment/index.tsx`, `payment-container/index.tsx`, `payment-button/index.tsx` : étape Paiement.
- **Modify** `apps/storefront/src/modules/checkout/components/review/index.tsx` : étape Récapitulatif.
- **Modify** `apps/storefront/src/modules/checkout/templates/checkout-summary/index.tsx`, `apps/storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx` : récapitulatif de commande + page checkout.
- **Modify** `apps/storefront/src/app/[countryCode]/(checkout)/layout.tsx` : en-tête du layout checkout.

---

## Task 1 : Retinter Input, Checkbox, IconBadge (ui/index.tsx)

**Files:**
- Modify: `apps/storefront/src/modules/common/components/ui/index.tsx`

**Interfaces:**
- Consumes : tokens `gm-*` (plan Fondation).
- Produces : aucune interface modifiée (`InputProps`, `CheckboxProps`, `IconBadgeProps` inchangées). `IconBadge` est utilisé par `CartItemSelect` (Task 2).

- [ ] **Step 1 : Retinter `Input`**

Bloc actuel :

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && <Label>{label}</Label>}
        <input
          ref={ref}
          className={clsx(
            "flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
      </div>
    )
  }
)
```

Remplacer par :

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && <Label>{label}</Label>}
        <input
          ref={ref}
          className={clsx(
            "flex h-10 w-full rounded-lg border border-gm-border bg-white px-3 py-2 text-sm placeholder:text-gm-ink-muted focus:outline-none focus:ring-2 focus:ring-gm-gold focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
      </div>
    )
  }
)
```

- [ ] **Step 2 : Retinter `Checkbox`**

Bloc actuel :

```tsx
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          className={clsx(
            "h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900",
            className
          )}
          {...props}
        />
        {label && <Label htmlFor={id}>{label}</Label>}
      </div>
    )
  }
)
```

Remplacer par :

```tsx
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          className={clsx(
            "h-4 w-4 rounded border-gm-border accent-gm-violet focus:ring-gm-gold",
            className
          )}
          {...props}
        />
        {label && <Label htmlFor={id}>{label}</Label>}
      </div>
    )
  }
)
```

- [ ] **Step 3 : Retinter `IconBadge`**

Bloc actuel :

```tsx
export const IconBadge = forwardRef<HTMLSpanElement, IconBadgeProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center rounded-full bg-gray-100 p-1",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
```

Remplacer par :

```tsx
export const IconBadge = forwardRef<HTMLSpanElement, IconBadgeProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center rounded-full bg-white p-1",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
```

- [ ] **Step 4 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/modules/common/components/ui/index.tsx
git commit -m "Retinte Input, Checkbox et IconBadge aux couleurs Golden Market"
```

---

## Task 2 : Retinter les champs de formulaire du checkout

**Files:**
- Modify: `apps/storefront/src/modules/common/components/input/index.tsx`
- Modify: `apps/storefront/src/modules/common/components/native-select/index.tsx`
- Modify: `apps/storefront/src/modules/common/components/radio/index.tsx`
- Modify: `apps/storefront/src/modules/cart/components/cart-item-select/index.tsx`

**Interfaces:**
- Consumes : tokens `gm-*`, `IconBadge` retinté (Task 1).
- Produces : aucune interface modifiée sur les quatre composants (props inchangées).

- [ ] **Step 1 : Retinter le champ à étiquette flottante (`common/components/input`)**

Dans `apps/storefront/src/modules/common/components/input/index.tsx`, remplacer le bloc `<input>` :

```tsx
          <input
            type={inputType}
            name={name}
            placeholder=" "
            required={required}
            className="pt-4 pb-1 block w-full h-11 px-4 mt-0 bg-ui-bg-field border rounded-md appearance-none focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active border-ui-border-base hover:bg-ui-bg-field-hover"
            {...props}
            ref={inputRef}
          />
```

Par :

```tsx
          <input
            type={inputType}
            name={name}
            placeholder=" "
            required={required}
            className="pt-4 pb-1 block w-full h-11 px-4 mt-0 bg-white border border-gm-border rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-gm-gold/40 focus:border-gm-gold hover:border-gm-ink-muted transition-colors"
            {...props}
            ref={inputRef}
          />
```

Puis remplacer le `<label>` juste en dessous :

```tsx
          <label
            htmlFor={name}
            onClick={() => inputRef.current?.focus()}
            className="flex items-center justify-center mx-3 px-1 transition-all absolute duration-300 top-3 -z-1 origin-0 text-ui-fg-subtle"
          >
```

Par :

```tsx
          <label
            htmlFor={name}
            onClick={() => inputRef.current?.focus()}
            className="flex items-center justify-center mx-3 px-1 transition-all absolute duration-300 top-3 -z-1 origin-0 text-gm-ink-muted"
          >
```

Puis remplacer le bouton afficher/masquer le mot de passe :

```tsx
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-ui-fg-subtle px-4 focus:outline-none transition-all duration-150 outline-none focus:text-ui-fg-base absolute right-0 top-3"
            >
```

Par :

```tsx
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gm-ink-muted px-4 focus:outline-none transition-all duration-150 outline-none focus:text-gm-ink absolute right-0 top-3"
            >
```

- [ ] **Step 2 : Retinter `NativeSelect`**

Dans `apps/storefront/src/modules/common/components/native-select/index.tsx`, remplacer :

```tsx
        <div
          onFocus={() => innerRef.current?.focus()}
          onBlur={() => innerRef.current?.blur()}
          className={clx(
            "relative flex items-center text-base-regular border border-ui-border-base bg-ui-bg-subtle rounded-md hover:bg-ui-bg-field-hover",
            className,
            {
              "text-ui-fg-muted": isPlaceholder,
            }
          )}
        >
          <select
            ref={innerRef}
            defaultValue={defaultValue}
            {...props}
            className="appearance-none flex-1 bg-transparent border-none px-4 py-2.5 transition-colors duration-150 outline-none "
          >
            <option disabled value="">
              {placeholder}
            </option>
            {children}
          </select>
          <span className="absolute right-4 inset-y-0 flex items-center pointer-events-none ">
            <ChevronUpDown />
          </span>
        </div>
```

Par :

```tsx
        <div
          onFocus={() => innerRef.current?.focus()}
          onBlur={() => innerRef.current?.blur()}
          className={clx(
            "relative flex items-center text-sm border border-gm-border bg-white rounded-lg hover:border-gm-ink-muted focus-within:border-gm-gold transition-colors",
            className,
            {
              "text-gm-ink-muted": isPlaceholder,
            }
          )}
        >
          <select
            ref={innerRef}
            defaultValue={defaultValue}
            {...props}
            className="appearance-none flex-1 bg-transparent border-none px-4 py-2.5 transition-colors duration-150 outline-none text-gm-ink"
          >
            <option disabled value="">
              {placeholder}
            </option>
            {children}
          </select>
          <span className="absolute right-4 inset-y-0 flex items-center pointer-events-none text-gm-ink-muted">
            <ChevronUpDown />
          </span>
        </div>
```

- [ ] **Step 3 : Retinter `Radio` (rond de sélection livraison/paiement)**

Remplacer le fichier `apps/storefront/src/modules/common/components/radio/index.tsx` entier par :

```tsx
const Radio = ({
  checked,
  "data-testid": dataTestId,
}: {
  checked: boolean
  "data-testid"?: string
}) => {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className="group relative flex h-5 w-5 shrink-0 items-center justify-center outline-none"
      data-testid={dataTestId || "radio-button"}
    >
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-gm-border bg-white transition-colors group-data-[state=checked]:border-gm-violet group-data-[state=checked]:bg-gm-violet">
        {checked && <div className="h-1.5 w-1.5 rounded-full bg-gm-on-violet" />}
      </div>
    </button>
  )
}

export default Radio
```

Note : corrige au passage `aria-checked="true"` (toujours vrai, bug existant) en
`aria-checked={checked}`.

- [ ] **Step 4 : Retinter `CartItemSelect`**

Remplacer le fichier `apps/storefront/src/modules/cart/components/cart-item-select/index.tsx` entier par :

```tsx
"use client"

import { IconBadge, clx } from "@modules/common/components/ui"
import {
  SelectHTMLAttributes,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import ChevronDown from "@modules/common/icons/chevron-down"

type NativeSelectProps = {
  placeholder?: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">

const CartItemSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ placeholder = "Select...", className, children, ...props }, ref) => {
    const innerRef = useRef<HTMLSelectElement>(null)
    const [isPlaceholder, setIsPlaceholder] = useState(false)

    useImperativeHandle<HTMLSelectElement | null, HTMLSelectElement | null>(
      ref,
      () => innerRef.current
    )

    useEffect(() => {
      if (innerRef.current && innerRef.current.value === "") {
        setIsPlaceholder(true)
      } else {
        setIsPlaceholder(false)
      }
    }, [innerRef.current?.value])

    return (
      <div>
        <IconBadge
          onFocus={() => innerRef.current?.focus()}
          onBlur={() => innerRef.current?.blur()}
          className={clx(
            "relative flex items-center border border-gm-border text-sm text-gm-ink group",
            className,
            {
              "text-gm-ink-muted": isPlaceholder,
            }
          )}
        >
          <select
            ref={innerRef}
            {...props}
            className="appearance-none bg-transparent border-none pl-3 pr-6 transition-colors duration-150 focus:border-gm-gold outline-none w-full h-full"
          >
            <option disabled value="">
              {placeholder}
            </option>
            {children}
          </select>
          <span className="absolute flex pointer-events-none justify-end right-2 inset-y-0 items-center">
            <ChevronDown />
          </span>
        </IconBadge>
      </div>
    )
  }
)

CartItemSelect.displayName = "CartItemSelect"

export default CartItemSelect
```

- [ ] **Step 5 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 6 : Commit**

```bash
git add apps/storefront/src/modules/common/components/input/index.tsx apps/storefront/src/modules/common/components/native-select/index.tsx apps/storefront/src/modules/common/components/radio/index.tsx apps/storefront/src/modules/cart/components/cart-item-select/index.tsx
git commit -m "Retinte les champs de formulaire du panier et du checkout"
```

---

## Task 3 : Creer le composant StepHeader (pastille d'étape)

**Files:**
- Create: `apps/storefront/src/modules/checkout/components/step-header/index.tsx`

**Interfaces:**
- Consumes : `Heading`, `clx` (`@modules/common/components/ui`).
- Produces : `export default function StepHeader(props)` avec `props: { step: number; title: string; status: "completed" | "active" | "disabled"; summary?: string; onEdit?: () => void; editTestId?: string }`. Consomme par Tasks 9-12 (Addresses, Shipping, Payment, Review).

- [ ] **Step 1 : Creer le composant**

```tsx
import { clx, Heading } from "@modules/common/components/ui"

type StepStatus = "completed" | "active" | "disabled"

type StepHeaderProps = {
  step: number
  title: string
  status: StepStatus
  summary?: string
  onEdit?: () => void
  editTestId?: string
}

const StepHeader = ({
  step,
  title,
  status,
  summary,
  onEdit,
  editTestId,
}: StepHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={clx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold font-display",
            status === "completed" && "bg-gm-violet text-gm-on-violet",
            status === "active" && "bg-gm-gold text-gm-ink",
            status === "disabled" && "bg-gm-ivoire-2 text-gm-ink-muted"
          )}
        >
          {status === "completed" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M13.5 4.5L6.5 11.5L3 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            step
          )}
        </span>
        <div className="min-w-0">
          <Heading
            level="h2"
            className={clx("text-lg", status === "disabled" && "text-gm-ink-muted")}
          >
            {title}
          </Heading>
          {summary && <p className="text-sm text-gm-ink-muted truncate">{summary}</p>}
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-sm font-semibold text-gm-amethyst hover:underline"
          data-testid={editTestId}
        >
          Modifier
        </button>
      )}
    </div>
  )
}

export default StepHeader
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi (composant pas encore utilisé, vérifie seulement la syntaxe).

- [ ] **Step 3 : Vérifier que le lint passe**

Run: `cd apps/storefront && npm run lint`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/checkout/components/step-header/index.tsx
git commit -m "Ajoute le composant StepHeader pour les étapes du checkout"
```

---

## Task 4 : Restyler la ligne de panier partagée (Item, LineItemPrice, LineItemUnitPrice, LineItemOptions)

**Files:**
- Modify: `apps/storefront/src/modules/cart/components/item/index.tsx`
- Modify: `apps/storefront/src/modules/common/components/line-item-price/index.tsx`
- Modify: `apps/storefront/src/modules/common/components/line-item-unit-price/index.tsx`
- Modify: `apps/storefront/src/modules/common/components/line-item-options/index.tsx`

**Interfaces:**
- Consumes : `Thumbnail` carrée (plan Accueil/Catalogue/Produit), `CartItemSelect` retinté (Task 2), tokens `gm-*`.
- Produces : `Item` garde ses props (`item`, `type?: "full" | "preview"`, `currencyCode`) et son rendu passe de ligne de tableau (`<tr>`) à carte flexbox (`<div>`). Consomme par Task 5 (`ItemsTemplate`, `ItemsPreviewTemplate`) qui doivent donc retirer leur wrapper `<Table>`.

- [ ] **Step 1 : Restyler `LineItemOptions`**

Remplacer le fichier `apps/storefront/src/modules/common/components/line-item-options/index.tsx` entier par :

```tsx
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
  if (!variant?.title) {
    return null
  }

  return (
    <Text data-testid={dataTestid} data-value={dataValue} className="text-xs text-gm-ink-muted">
      {variant.title}
    </Text>
  )
}

export default LineItemOptions
```

- [ ] **Step 2 : Restyler `LineItemPrice`**

Remplacer le fichier `apps/storefront/src/modules/common/components/line-item-price/index.tsx` entier par :

```tsx
import { getPercentageDiff } from "@lib/util/get-percentage-diff"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"

type LineItemPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
  currencyCode: string
}

const LineItemPrice = ({ item, style = "default", currencyCode }: LineItemPriceProps) => {
  const { total, original_total } = item
  const originalPrice = original_total ?? 0
  const currentPrice = total ?? 0
  const hasReducedPrice = currentPrice < originalPrice

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      {hasReducedPrice && (
        <span className="text-xs line-through text-gm-ink-muted" data-testid="product-original-price">
          {convertToLocale({ amount: originalPrice, currency_code: currencyCode })}
        </span>
      )}
      <span
        className={clx("font-display font-bold text-sm", {
          "text-gm-violet": hasReducedPrice,
          "text-gm-ink": !hasReducedPrice,
        })}
        data-testid="product-price"
      >
        {convertToLocale({ amount: currentPrice, currency_code: currencyCode })}
      </span>
      {hasReducedPrice && style === "default" && (
        <span className="text-xs text-gm-terracotta font-semibold">
          -{getPercentageDiff(originalPrice, currentPrice || 0)}%
        </span>
      )}
    </div>
  )
}

export default LineItemPrice
```

- [ ] **Step 3 : Restyler `LineItemUnitPrice`**

Remplacer le fichier `apps/storefront/src/modules/common/components/line-item-unit-price/index.tsx` entier par :

```tsx
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"

type LineItemUnitPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
  currencyCode: string
}

const LineItemUnitPrice = ({ item, style = "default", currencyCode }: LineItemUnitPriceProps) => {
  const total = item.total ?? 0
  const original_total = item.original_total ?? 0
  const hasReducedPrice = total < original_total
  const percentage_diff = Math.round(((original_total - total) / original_total) * 100)

  return (
    <span className="inline-flex items-center gap-1">
      {hasReducedPrice && style === "default" && (
        <span className="text-gm-ink-muted line-through text-xs">
          {convertToLocale({
            amount: original_total / item.quantity,
            currency_code: currencyCode,
          })}
        </span>
      )}
      <span
        className={clx("text-xs", {
          "text-gm-terracotta font-semibold": hasReducedPrice,
          "text-gm-ink-muted": !hasReducedPrice,
        })}
        data-testid="product-unit-price"
      >
        {convertToLocale({ amount: total / item.quantity, currency_code: currencyCode })}
      </span>
      {hasReducedPrice && style === "default" && (
        <span className="text-gm-terracotta text-xs font-semibold">-{percentage_diff}%</span>
      )}
    </span>
  )
}

export default LineItemUnitPrice
```

- [ ] **Step 4 : Restyler `Item` (carte au lieu de ligne de tableau)**

Remplacer le fichier `apps/storefront/src/modules/cart/components/item/index.tsx` entier par :

```tsx
"use client"

import { updateLineItem } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import CartItemSelect from "@modules/cart/components/cart-item-select"
import ErrorMessage from "@modules/checkout/components/error-message"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LineItemUnitPrice from "@modules/common/components/line-item-unit-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Spinner from "@modules/common/icons/spinner"
import Thumbnail from "@modules/products/components/thumbnail"
import { useState } from "react"

type ItemProps = {
  item: HttpTypes.StoreCartLineItem
  type?: "full" | "preview"
  currencyCode: string
}

const Item = ({ item, type = "full", currencyCode }: ItemProps) => {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changeQuantity = async (quantity: number) => {
    setError(null)
    setUpdating(true)

    await updateLineItem({
      lineId: item.id,
      quantity,
    })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => {
        setUpdating(false)
      })
  }

  // TODO: Update this to grab the actual max inventory
  const maxQtyFromInventory = 10
  const maxQuantity = item.variant?.manage_inventory ? 10 : maxQtyFromInventory

  if (type === "preview") {
    return (
      <div
        className="flex items-center gap-3 py-3 border-b border-gm-border last:border-0"
        data-testid="product-row"
      >
        <LocalizedClientLink href={`/products/${item.product_handle}`} className="shrink-0">
          <Thumbnail
            thumbnail={item.thumbnail}
            images={item.variant?.product?.images}
            size="square"
            className="w-14"
          />
        </LocalizedClientLink>
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-sm font-semibold text-gm-ink line-clamp-1" data-testid="product-title">
            {item.product_title}
          </span>
          <LineItemOptions variant={item.variant} data-testid="product-variant" />
          <span className="flex items-center gap-1 text-xs text-gm-ink-muted mt-0.5">
            {item.quantity} x
            <LineItemUnitPrice item={item} style="tight" currencyCode={currencyCode} />
          </span>
        </div>
        <LineItemPrice item={item} style="tight" currencyCode={currencyCode} />
      </div>
    )
  }

  return (
    <div className="flex gap-4 py-4 border-b border-gm-border last:border-0" data-testid="product-row">
      <LocalizedClientLink href={`/products/${item.product_handle}`} className="shrink-0">
        <Thumbnail
          thumbnail={item.thumbnail}
          images={item.variant?.product?.images}
          size="square"
          className="w-20 small:w-24"
        />
      </LocalizedClientLink>

      <div className="flex flex-1 flex-col min-w-0 gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <LocalizedClientLink href={`/products/${item.product_handle}`}>
              <span className="text-sm font-semibold text-gm-ink line-clamp-2" data-testid="product-title">
                {item.product_title}
              </span>
            </LocalizedClientLink>
            <LineItemOptions variant={item.variant} data-testid="product-variant" />
          </div>
          <LineItemPrice item={item} style="tight" currencyCode={currencyCode} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CartItemSelect
              value={item.quantity}
              onChange={(value) => changeQuantity(parseInt(value.target.value))}
              className="w-16 h-10"
              data-testid="product-select-button"
            >
              {/* TODO: Update this with the v2 way of managing inventory */}
              {Array.from({ length: Math.min(maxQuantity, 10) }, (_, i) => (
                <option value={i + 1} key={i}>
                  {i + 1}
                </option>
              ))}

              <option value={1} key={1}>
                1
              </option>
            </CartItemSelect>
            {updating && <Spinner />}
          </div>
          <DeleteButton id={item.id} data-testid="product-delete-button">
            Retirer
          </DeleteButton>
        </div>
        <ErrorMessage error={error} data-testid="product-error-message" />
      </div>
    </div>
  )
}

export default Item
```

Note : la logique de mise à jour de quantité, de suppression et de gestion
d'erreur est identique à l'original (mêmes appels `updateLineItem`, mêmes
`data-testid`) ; seul le rendu passe de `<Table.Row>` à une carte flexbox, et
`DeleteButton` recoit désormais le texte "Retirer" au lieu d'être muet.

- [ ] **Step 5 : Restyler `DeleteButton`**

Dans `apps/storefront/src/modules/common/components/delete-button/index.tsx`, remplacer :

```tsx
      <button
        className="flex gap-x-1 text-ui-fg-subtle hover:text-ui-fg-base cursor-pointer"
        onClick={() => handleDelete(id)}
      >
```

Par :

```tsx
      <button
        className="flex gap-x-1 text-xs font-semibold text-gm-ink-muted hover:text-gm-terracotta cursor-pointer transition-colors"
        onClick={() => handleDelete(id)}
      >
```

- [ ] **Step 6 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi (le nouveau rendu de `Item` n'est pas encore branche
partout : `ItemsTemplate`/`ItemsPreviewTemplate` l'enveloppent encore dans
`<Table>` à ce stade, ce qui reste valide en HTML même si visuellement
imparfait ; corrige en Task 5).

- [ ] **Step 7 : Commit**

```bash
git add apps/storefront/src/modules/cart/components/item/index.tsx apps/storefront/src/modules/common/components/line-item-price/index.tsx apps/storefront/src/modules/common/components/line-item-unit-price/index.tsx apps/storefront/src/modules/common/components/line-item-options/index.tsx apps/storefront/src/modules/common/components/delete-button/index.tsx
git commit -m "Restyle la ligne de panier en carte au lieu d'une ligne de tableau"
```

---

## Task 5 : Restyler les listes d'articles (ItemsTemplate, ItemsPreviewTemplate)

**Files:**
- Modify: `apps/storefront/src/modules/cart/templates/items.tsx`
- Modify: `apps/storefront/src/modules/cart/templates/preview.tsx`

**Interfaces:**
- Consumes : `Item` carte (Task 4), `Heading` (plan Fondation).
- Produces : `ItemsTemplate`/`ItemsPreviewTemplate` gardent leurs props (`cart`). Consomme par Task 8 (`CartTemplate`) et Task 13 (`CheckoutSummary`).

- [ ] **Step 1 : Restyler `ItemsTemplate`**

Remplacer le fichier `apps/storefront/src/modules/cart/templates/items.tsx` entier par :

```tsx
import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Heading } from "@modules/common/components/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart
}

const ItemsTemplate = ({ cart }: ItemsTemplateProps) => {
  const items = cart?.items
  const itemCount = items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <Heading level="h1" className="text-xl mb-4">
        Panier
        {itemCount > 0 && (
          <span className="text-gm-ink-muted font-normal"> ({itemCount})</span>
        )}
      </Heading>
      <div>
        {items
          ? items
              .sort((a, b) => {
                return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
              })
              .map((item) => {
                return <Item key={item.id} item={item} currencyCode={cart?.currency_code} />
              })
          : repeat(5).map((i) => {
              return <SkeletonLineItem key={i} />
            })}
      </div>
    </div>
  )
}

export default ItemsTemplate
```

- [ ] **Step 2 : Restyler `ItemsPreviewTemplate`**

Remplacer le fichier `apps/storefront/src/modules/cart/templates/preview.tsx` entier par :

```tsx
"use client"

import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsTemplateProps = {
  cart: HttpTypes.StoreCart
}

const ItemsPreviewTemplate = ({ cart }: ItemsTemplateProps) => {
  const items = cart.items
  const hasOverflow = items && items.length > 4

  return (
    <div
      className={clx({
        "overflow-y-scroll overflow-x-hidden no-scrollbar max-h-[320px]": hasOverflow,
      })}
      data-testid="items-table"
    >
      {items
        ? items
            .sort((a, b) => {
              return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
            })
            .map((item) => {
              return (
                <Item key={item.id} item={item} type="preview" currencyCode={cart.currency_code} />
              )
            })
        : repeat(5).map((i) => {
            return <SkeletonLineItem key={i} />
          })}
    </div>
  )
}

export default ItemsPreviewTemplate
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Verification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/cart` avec au
moins un article dans le panier. La liste s'affiche en cartes empilées
(vignette carrée, nom, variante, selecteur de quantité, bouton "Retirer",
prix), plus de tableau HTML visible.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/modules/cart/templates/items.tsx apps/storefront/src/modules/cart/templates/preview.tsx
git commit -m "Restyle les listes d'articles du panier en cartes"
```

---

## Task 6 : Restyler les totaux et le code promo partagés

**Files:**
- Modify: `apps/storefront/src/modules/common/components/cart-totals/index.tsx`
- Modify: `apps/storefront/src/modules/checkout/components/discount-code/index.tsx`

**Interfaces:**
- Consumes : `Badge`, `Heading`, `Input`, `Label` (plan Fondation, Task 1).
- Produces : `CartTotals` accepte une nouvelle prop optionnelle `shippingCalculatedLater?: boolean` (défaut `false`) qui remplace le montant de livraison par la mention "Calculée à l'étape suivante". Consomme par Task 8 (`Summary`, avec `shippingCalculatedLater`) et Task 13 (`CheckoutSummary`, sans la prop).

- [ ] **Step 1 : Restyler `CartTotals`**

Remplacer le fichier `apps/storefront/src/modules/common/components/cart-totals/index.tsx` entier par :

```tsx
"use client"

import { convertToLocale } from "@lib/util/money"
import React from "react"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    tax_total?: number | null
    currency_code: string
    item_subtotal?: number | null
    shipping_subtotal?: number | null
    discount_subtotal?: number | null
  }
  shippingCalculatedLater?: boolean
}

const CartTotals: React.FC<CartTotalsProps> = ({ totals, shippingCalculatedLater = false }) => {
  const { currency_code, total, tax_total, item_subtotal, shipping_subtotal, discount_subtotal } =
    totals

  return (
    <div className="flex flex-col gap-y-2 text-sm text-gm-ink-muted">
      <div className="flex items-center justify-between">
        <span>Sous-total (hors livraison et taxes)</span>
        <span className="text-gm-ink font-medium" data-testid="cart-subtotal" data-value={item_subtotal || 0}>
          {convertToLocale({ amount: item_subtotal ?? 0, currency_code })}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span>Livraison</span>
        {shippingCalculatedLater ? (
          <span className="italic text-right" data-testid="cart-shipping">
            Calculée à l&apos;étape suivante
          </span>
        ) : (
          <span
            className="text-gm-ink font-medium"
            data-testid="cart-shipping"
            data-value={shipping_subtotal || 0}
          >
            {convertToLocale({ amount: shipping_subtotal ?? 0, currency_code })}
          </span>
        )}
      </div>
      {!!discount_subtotal && (
        <div className="flex items-center justify-between">
          <span>Réduction</span>
          <span
            className="text-gm-terracotta font-medium"
            data-testid="cart-discount"
            data-value={discount_subtotal || 0}
          >
            - {convertToLocale({ amount: discount_subtotal ?? 0, currency_code })}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span>Taxes</span>
        <span className="text-gm-ink font-medium" data-testid="cart-taxes" data-value={tax_total || 0}>
          {convertToLocale({ amount: tax_total ?? 0, currency_code })}
        </span>
      </div>
      <div className="h-px w-full bg-gm-border my-2" />
      <div className="flex items-center justify-between text-gm-ink">
        <span className="font-semibold">Total</span>
        <span className="font-display font-bold text-lg" data-testid="cart-total" data-value={total || 0}>
          {convertToLocale({ amount: total ?? 0, currency_code })}
        </span>
      </div>
    </div>
  )
}

export default CartTotals
```

- [ ] **Step 2 : Restyler `DiscountCode`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/discount-code/index.tsx` entier par :

```tsx
"use client"

import { Badge, Heading, Input, Label } from "@modules/common/components/ui"
import React from "react"

import { applyPromotions } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import Trash from "@modules/common/icons/trash"
import ErrorMessage from "../error-message"
import { SubmitButton } from "../submit-button"

type DiscountCodeProps = {
  cart: HttpTypes.StoreCart
}

const DiscountCode: React.FC<DiscountCodeProps> = ({ cart }) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState("")

  const { promotions = [] } = cart
  const removePromotionCode = async (code: string) => {
    const validPromotions = promotions.filter((promotion) => promotion.code !== code)

    await applyPromotions(
      validPromotions.filter((p) => p.code !== undefined).map((p) => p.code!)
    )
  }

  const addPromotionCode = async (formData: FormData) => {
    setErrorMessage("")

    const code = formData.get("code")
    if (!code) {
      return
    }
    const input = document.getElementById("promotion-input") as HTMLInputElement
    const codes = promotions.filter((p) => p.code !== undefined).map((p) => p.code!)
    codes.push(code.toString())

    try {
      await applyPromotions(codes)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }

    if (input) {
      input.value = ""
    }
  }

  return (
    <div className="w-full flex flex-col">
      <form action={(a) => addPromotionCode(a)} className="w-full">
        <Label className="flex gap-x-1 mb-2 items-center">
          <button
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            className="text-sm font-semibold text-gm-amethyst hover:underline"
            data-testid="add-discount-button"
          >
            Ajouter un code promo
          </button>
        </Label>

        {isOpen && (
          <>
            <div className="flex w-full gap-x-2">
              <Input
                className="w-full"
                id="promotion-input"
                name="code"
                type="text"
                autoFocus={false}
                data-testid="discount-input"
              />
              <SubmitButton variant="secondary" data-testid="discount-apply-button">
                Appliquer
              </SubmitButton>
            </div>

            <ErrorMessage error={errorMessage} data-testid="discount-error-message" />
          </>
        )}
      </form>

      {promotions.length > 0 && (
        <div className="w-full mt-4">
          <Heading level="h3" className="text-sm mb-2">
            Codes promo appliqués :
          </Heading>

          {promotions.map((promotion) => {
            return (
              <div
                key={promotion.id}
                className="flex items-center justify-between w-full mb-2"
                data-testid="discount-row"
              >
                <span className="flex items-baseline gap-1 text-sm truncate" data-testid="discount-code">
                  <Badge color={promotion.is_automatic ? "green" : "gold"}>{promotion.code}</Badge>
                  <span className="text-gm-ink-muted">
                    (
                    {promotion.application_method?.value !== undefined &&
                      promotion.application_method.currency_code !== undefined && (
                        <>
                          {promotion.application_method.type === "percentage"
                            ? `${promotion.application_method.value}%`
                            : convertToLocale({
                                amount: +promotion.application_method.value,
                                currency_code: promotion.application_method.currency_code,
                              })}
                        </>
                      )}
                    )
                  </span>
                </span>
                {!promotion.is_automatic && (
                  <button
                    className="flex items-center text-gm-ink-muted hover:text-gm-terracotta"
                    onClick={() => {
                      if (!promotion.code) {
                        return
                      }

                      removePromotionCode(promotion.code)
                    }}
                    data-testid="remove-discount-button"
                  >
                    <Trash size={14} />
                    <span className="sr-only">Retirer le code promo de la commande</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DiscountCode
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/common/components/cart-totals/index.tsx apps/storefront/src/modules/checkout/components/discount-code/index.tsx
git commit -m "Restyle les totaux du panier et le code promo, traduit en français"
```

---

## Task 7 : Restyler les messages d'état du panier

**Files:**
- Modify: `apps/storefront/src/modules/cart/components/empty-cart-message/index.tsx`
- Modify: `apps/storefront/src/modules/cart/components/sign-in-prompt/index.tsx`
- Modify: `apps/storefront/src/modules/common/components/interactive-link/index.tsx`

**Interfaces:**
- Consumes : `Heading`, `Text`, `Button` (plan Fondation), icone `Package` (`@modules/common/icons/package`, existante).
- Produces : aucune interface modifiée.

- [ ] **Step 1 : Restyler `EmptyCartMessage`**

Remplacer le fichier `apps/storefront/src/modules/cart/components/empty-cart-message/index.tsx` entier par :

```tsx
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
```

- [ ] **Step 2 : Restyler `SignInPrompt`**

Remplacer le fichier `apps/storefront/src/modules/cart/components/sign-in-prompt/index.tsx` entier par :

```tsx
import { Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gm-border bg-white p-5">
      <div>
        <Heading level="h2" className="text-lg">
          Déjà client ?
        </Heading>
        <Text className="text-sm text-gm-ink-muted mt-1">
          Connectez-vous pour une expérience plus rapide.
        </Text>
      </div>
      <LocalizedClientLink href="/account">
        <Button variant="secondary" data-testid="sign-in-button">
          Se connecter
        </Button>
      </LocalizedClientLink>
    </div>
  )
}

export default SignInPrompt
```

- [ ] **Step 3 : Restyler `InteractiveLink`**

Remplacer le fichier `apps/storefront/src/modules/common/components/interactive-link/index.tsx` entier par :

```tsx
import { ArrowUpRightMini } from "@medusajs/icons"
import { Text } from "@modules/common/components/ui"
import LocalizedClientLink from "../localized-client-link"

type InteractiveLinkProps = {
  href: string
  children?: React.ReactNode
  onClick?: () => void
}

const InteractiveLink = ({ href, children, onClick, ...props }: InteractiveLinkProps) => {
  return (
    <LocalizedClientLink className="flex gap-x-1 items-center group" href={href} onClick={onClick} {...props}>
      <Text className="text-gm-amethyst font-semibold">{children}</Text>
      <ArrowUpRightMini className="group-hover:rotate-45 ease-in-out duration-150 text-gm-amethyst" />
    </LocalizedClientLink>
  )
}

export default InteractiveLink
```

- [ ] **Step 4 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 5 : Verification visuelle**

Run: `npm run storefront:dev`, vider le panier puis ouvrir
`http://localhost:8000/fr/cart`. Icone de colis dans un cercle ivoire,
message "Votre panier est vide", lien "Explorer les produits" en amethyste.
Se deconnecter et revisiter le panier avec des articles : la carte "Déjà
client ?" s'affiche au-dessus de la liste.

- [ ] **Step 6 : Commit**

```bash
git add apps/storefront/src/modules/cart/components/empty-cart-message/index.tsx apps/storefront/src/modules/cart/components/sign-in-prompt/index.tsx apps/storefront/src/modules/common/components/interactive-link/index.tsx
git commit -m "Restyle les messages d'état du panier (vide, invite à se connecter)"
```

---

## Task 8 : Restyler le récapitulatif et la page panier

**Files:**
- Modify: `apps/storefront/src/modules/cart/templates/summary.tsx`
- Modify: `apps/storefront/src/modules/cart/templates/index.tsx`

**Interfaces:**
- Consumes : `CartTotals` avec `shippingCalculatedLater` (Task 6), `DiscountCode` retinté (Task 6), `ItemsTemplate` restylée (Task 5), `SignInPrompt` restylée (Task 7).
- Produces : aucune interface modifiée (`Summary`/`CartTemplate` gardent leurs props).

- [ ] **Step 1 : Restyler `Summary`**

Remplacer le fichier `apps/storefront/src/modules/cart/templates/summary.tsx` entier par :

```tsx
"use client"

import { Button, Heading } from "@modules/common/components/ui"

import CartTotals from "@modules/common/components/cart-totals"
import DiscountCode from "@modules/checkout/components/discount-code"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

type SummaryProps = {
  cart: HttpTypes.StoreCart
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart }: SummaryProps) => {
  const step = getCheckoutStep(cart)

  return (
    <div className="flex flex-col gap-y-6 rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <Heading level="h2" className="text-xl">
        Récapitulatif
      </Heading>
      <DiscountCode cart={cart} />
      <CartTotals totals={cart} shippingCalculatedLater />
      <LocalizedClientLink href={"/checkout?step=" + step} data-testid="checkout-button">
        <Button className="w-full" size="large">
          Passer la commande
        </Button>
      </LocalizedClientLink>
      <LocalizedClientLink
        href="/store"
        className="text-center text-sm font-semibold text-gm-amethyst hover:underline"
      >
        Continuer mes achats
      </LocalizedClientLink>
    </div>
  )
}

export default Summary
```

- [ ] **Step 2 : Restyler `CartTemplate`**

Remplacer le fichier `apps/storefront/src/modules/cart/templates/index.tsx` entier par :

```tsx
import ItemsTemplate from "./items"
import Summary from "./summary"
import EmptyCartMessage from "../components/empty-cart-message"
import SignInPrompt from "../components/sign-in-prompt"
import { HttpTypes } from "@medusajs/types"

const CartTemplate = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  return (
    <div className="py-8 small:py-12">
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 small:grid-cols-[1fr_380px] gap-8 small:gap-10 items-start">
            <div className="flex flex-col gap-y-6">
              {!customer && <SignInPrompt />}
              <ItemsTemplate cart={cart} />
            </div>
            <div className="small:sticky small:top-8">
              {cart && cart.region && <Summary cart={cart} />}
            </div>
          </div>
        ) : (
          <EmptyCartMessage />
        )}
      </div>
    </div>
  )
}

export default CartTemplate
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Verification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/cart` avec des
articles dans le panier. À largeur desktop (≥1024px) : liste à gauche,
récapitulatif sticky à droite avec code promo, sous-total, "Livraison :
Calculée à l'étape suivante", total, bouton "Passer la commande" plein doré,
lien "Continuer mes achats". A largeur mobile (~375px) : colonne unique,
récapitulatif sous la liste.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/modules/cart/templates/summary.tsx apps/storefront/src/modules/cart/templates/index.tsx
git commit -m "Restyle le récapitulatif et la mise en page de la page panier"
```

---

## Task 9 : Restyler l'étape Adresse

**Files:**
- Modify: `apps/storefront/src/modules/checkout/components/addresses/index.tsx`
- Modify: `apps/storefront/src/modules/checkout/components/address-select/index.tsx`
- Modify: `apps/storefront/src/modules/checkout/components/shipping-address/index.tsx`

**Interfaces:**
- Consumes : `StepHeader` (Task 3), `Radio` retinté (Task 2), `Input`/`NativeSelect`/`Checkbox` retintés (Tasks 1-2).
- Produces : aucune interface modifiée (`Addresses` garde ses props `cart`/`customer`).

- [ ] **Step 1 : Restyler `Addresses`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/addresses/index.tsx` entier par :

```tsx
"use client"
import { setAddresses } from "@lib/data/cart"
import useToggleState from "@lib/hooks/use-toggle-state"
import compareAddresses from "@lib/util/compare-addresses"
import { HttpTypes } from "@medusajs/types"
import StepHeader from "@modules/checkout/components/step-header"
import { Heading } from "@modules/common/components/ui"
import Spinner from "@modules/common/icons/spinner"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
import BillingAddress from "../billing_address"
import ErrorMessage from "../error-message"
import ShippingAddress from "../shipping-address"
import { SubmitButton } from "../submit-button"

const Addresses = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "address"

  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true
  )

  const handleEdit = () => {
    router.push(pathname + "?step=address")
  }

  const [message, formAction] = useActionState(setAddresses, null)

  const summary =
    !isOpen && cart?.shipping_address
      ? `${cart.shipping_address.first_name} ${cart.shipping_address.last_name} - ${cart.shipping_address.address_1}, ${cart.shipping_address.city}`
      : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={1}
        title="Adresse"
        status={isOpen ? "active" : cart?.shipping_address ? "completed" : "disabled"}
        summary={summary}
        onEdit={!isOpen && cart?.shipping_address ? handleEdit : undefined}
        editTestId="edit-address-button"
      />
      {isOpen && (
        <form action={formAction} className="mt-6">
          <ShippingAddress
            customer={customer}
            checked={sameAsBilling}
            onChange={toggleSameAsBilling}
            cart={cart}
          />

          {!sameAsBilling && (
            <div>
              <Heading level="h3" className="text-lg pb-4 pt-8">
                Adresse de facturation
              </Heading>

              <BillingAddress cart={cart} />
            </div>
          )}
          <SubmitButton className="mt-6" data-testid="submit-address-button">
            Continuer vers la livraison
          </SubmitButton>
          <ErrorMessage error={message} data-testid="address-error-message" />
        </form>
      )}
      {!isOpen && !cart?.shipping_address && (
        <div className="mt-4">
          <Spinner />
        </div>
      )}
    </div>
  )
}

export default Addresses
```

- [ ] **Step 2 : Restyler `AddressSelect`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/address-select/index.tsx` entier par :

```tsx
import { Listbox, Transition } from "@headlessui/react"
import { ChevronUpDown } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { Fragment, useMemo } from "react"

import compareAddresses from "@lib/util/compare-addresses"
import { HttpTypes } from "@medusajs/types"
import Radio from "@modules/common/components/radio"

type AddressSelectProps = {
  addresses: HttpTypes.StoreCustomerAddress[]
  addressInput: HttpTypes.StoreCartAddress | null
  onSelect: (address: HttpTypes.StoreCartAddress | undefined, email?: string) => void
}

const AddressSelect = ({ addresses, addressInput, onSelect }: AddressSelectProps) => {
  const handleSelect = (id: string) => {
    const savedAddress = addresses.find((a) => a.id === id)
    if (savedAddress) {
      onSelect(savedAddress as HttpTypes.StoreCartAddress)
    }
  }

  const selectedAddress = useMemo(() => {
    return addresses.find((a) => addressInput && compareAddresses(a, addressInput))
  }, [addresses, addressInput])

  return (
    <Listbox onChange={handleSelect} value={selectedAddress?.id}>
      <div className="relative">
        <Listbox.Button
          className="relative w-full flex justify-between items-center px-4 py-2.5 text-left bg-white cursor-pointer border border-gm-border rounded-lg focus:outline-none focus:border-gm-gold text-sm text-gm-ink"
          data-testid="shipping-address-select"
        >
          {({ open }) => (
            <>
              <span className="block truncate">
                {selectedAddress ? selectedAddress.address_1 : "Choisir une adresse"}
              </span>
              <ChevronUpDown
                className={clx("transition-transform duration-200", { "transform rotate-180": open })}
              />
            </>
          )}
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options
            className="absolute z-20 w-full overflow-auto text-sm bg-white border border-gm-border rounded-lg mt-1 max-h-60 focus:outline-none shadow-md"
            data-testid="shipping-address-options"
          >
            {addresses.map((address) => {
              return (
                <Listbox.Option
                  key={address.id}
                  value={address.id}
                  className="cursor-pointer select-none relative pl-4 pr-4 hover:bg-gm-ivoire-2 py-3"
                  data-testid="shipping-address-option"
                >
                  <div className="flex gap-x-3 items-start">
                    <Radio checked={selectedAddress?.id === address.id} data-testid="shipping-address-radio" />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gm-ink">
                        {address.first_name} {address.last_name}
                      </span>
                      {address.company && (
                        <span className="text-xs text-gm-ink-muted">{address.company}</span>
                      )}
                      <div className="flex flex-col text-xs text-gm-ink-muted mt-1">
                        <span>
                          {address.address_1}
                          {address.address_2 && <span>, {address.address_2}</span>}
                        </span>
                        <span>
                          {address.postal_code}, {address.city}
                        </span>
                        <span>
                          {address.province && `${address.province}, `}
                          {address.country_code?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Listbox.Option>
              )
            })}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}

export default AddressSelect
```

- [ ] **Step 3 : Restyler la carte "adresses enregistrées" et le texte dans `ShippingAddress`**

Dans `apps/storefront/src/modules/checkout/components/shipping-address/index.tsx`, remplacer :

```tsx
      {customer && (addressesInRegion?.length || 0) > 0 && (
        <Container className="mb-6 flex flex-col gap-y-4 p-5">
          <p className="text-small-regular">
            {`Hi ${customer.first_name}, do you want to use one of your saved addresses?`}
          </p>
```

Par :

```tsx
      {customer && (addressesInRegion?.length || 0) > 0 && (
        <Container className="mb-6 flex flex-col gap-y-4 p-5 border border-gm-border">
          <p className="text-sm text-gm-ink">
            {`Bonjour ${customer.first_name}, voulez-vous utiliser une de vos adresses enregistrées ?`}
          </p>
```

- [ ] **Step 4 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 5 : Verification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/checkout` (un
panier valide doit exister). L'étape Adresse affiche une pastille dorée "1"
active, un formulaire avec champs retintés. Soumettre l'adresse : la pastille
devient violette avec une coche, un lien "Modifier" apparait, et un résumé
d'une ligne ("Nom Prenom - adresse, ville") remplace le formulaire.

- [ ] **Step 6 : Commit**

```bash
git add apps/storefront/src/modules/checkout/components/addresses/index.tsx apps/storefront/src/modules/checkout/components/address-select/index.tsx apps/storefront/src/modules/checkout/components/shipping-address/index.tsx
git commit -m "Restyle l'étape Adresse du checkout avec StepHeader"
```

---

## Task 10 : Restyler l'étape Livraison

**Files:**
- Modify: `apps/storefront/src/modules/checkout/components/shipping/index.tsx`

**Interfaces:**
- Consumes : `StepHeader` (Task 3), `Radio` retinté (Task 2).
- Produces : aucune interface modifiée.

- [ ] **Step 1 : Restyler `Shipping`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/shipping/index.tsx` entier par :

```tsx
"use client"
import { Radio, RadioGroup } from "@headlessui/react"
import { setShippingMethod } from "@lib/data/cart"
import { calculatePriceForShippingOption } from "@lib/data/fulfillment"
import { convertToLocale } from "@lib/util/money"
import { Loader } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import ErrorMessage from "@modules/checkout/components/error-message"
import StepHeader from "@modules/checkout/components/step-header"
import MedusaRadio from "@modules/common/components/radio"
import { Button, clx } from "@modules/common/components/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

const PICKUP_OPTION_ON = "__PICKUP_ON"
const PICKUP_OPTION_OFF = "__PICKUP_OFF"

type ShippingProps = {
  cart: HttpTypes.StoreCart
  availableShippingMethods: HttpTypes.StoreCartShippingOption[] | null
}

function formatAddress(address: HttpTypes.StoreCartAddress) {
  if (!address) {
    return ""
  }

  let ret = ""

  if (address.address_1) {
    ret += ` ${address.address_1}`
  }

  if (address.address_2) {
    ret += `, ${address.address_2}`
  }

  if (address.postal_code) {
    ret += `, ${address.postal_code} ${address.city}`
  }

  if (address.country_code) {
    ret += `, ${address.country_code.toUpperCase()}`
  }

  return ret
}

const Shipping: React.FC<ShippingProps> = ({ cart, availableShippingMethods }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPrices, setIsLoadingPrices] = useState(true)

  const [showPickupOptions, setShowPickupOptions] = useState<string>(PICKUP_OPTION_OFF)
  const [calculatedPricesMap, setCalculatedPricesMap] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id || null
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "delivery"

  const _shippingMethods = availableShippingMethods?.filter(
    (sm) =>
      (
        sm as unknown as {
          service_zone?: {
            fulfillment_set?: { type?: string; location?: { address: HttpTypes.StoreCartAddress } }
          }
        }
      ).service_zone?.fulfillment_set?.type !== "pickup"
  )

  const _pickupMethods = availableShippingMethods?.filter(
    (sm) =>
      (
        sm as unknown as {
          service_zone?: {
            fulfillment_set?: { type?: string; location?: { address: HttpTypes.StoreCartAddress } }
          }
        }
      ).service_zone?.fulfillment_set?.type === "pickup"
  )

  const hasPickupOptions = !!_pickupMethods?.length

  useEffect(() => {
    setIsLoadingPrices(true)

    if (_shippingMethods?.length) {
      const promises = _shippingMethods
        .filter((sm) => sm.price_type === "calculated")
        .map((sm) => calculatePriceForShippingOption(sm.id, cart.id))

      if (promises.length) {
        Promise.allSettled(promises).then((res) => {
          const pricesMap: Record<string, number> = {}
          res
            .filter((r) => r.status === "fulfilled")
            .forEach((p) => {
              if (p.value?.id) {
                pricesMap[p.value.id] = p.value.amount ?? 0
              }
            })

          setCalculatedPricesMap(pricesMap)
          setIsLoadingPrices(false)
        })
      }
    }

    if (_pickupMethods?.find((m) => m.id === shippingMethodId)) {
      setShowPickupOptions(PICKUP_OPTION_ON)
    }
  }, [availableShippingMethods])

  const handleEdit = () => {
    router.push(pathname + "?step=delivery", { scroll: false })
  }

  const handleSubmit = () => {
    router.push(pathname + "?step=payment", { scroll: false })
  }

  const handleSetShippingMethod = async (id: string, variant: "shipping" | "pickup") => {
    setError(null)

    if (variant === "pickup") {
      setShowPickupOptions(PICKUP_OPTION_ON)
    } else {
      setShowPickupOptions(PICKUP_OPTION_OFF)
    }

    let currentId: string | null = null
    setIsLoading(true)
    setShippingMethodId((prev) => {
      currentId = prev
      return id
    })

    await setShippingMethod({ cartId: cart.id, shippingMethodId: id })
      .catch((err) => {
        setShippingMethodId(currentId)

        setError(err.message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  const hasMethod = (cart.shipping_methods?.length ?? 0) > 0

  const summary =
    !isOpen && hasMethod
      ? `${cart.shipping_methods!.at(-1)!.name} - ${convertToLocale({
          amount: cart.shipping_methods!.at(-1)!.amount!,
          currency_code: cart?.currency_code,
        })}`
      : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={2}
        title="Livraison"
        status={isOpen ? "active" : hasMethod ? "completed" : "disabled"}
        summary={summary}
        onEdit={
          !isOpen && cart?.shipping_address && cart?.billing_address && cart?.email
            ? handleEdit
            : undefined
        }
        editTestId="edit-delivery-button"
      />
      {isOpen && (
        <div className="mt-6">
          <div className="flex flex-col gap-1 mb-4">
            <span className="text-sm font-semibold text-gm-ink">Mode de livraison</span>
            <span className="text-sm text-gm-ink-muted">Choisissez comment vous souhaitez être livré</span>
          </div>
          <div data-testid="delivery-options-container">
            {hasPickupOptions && (
              <RadioGroup
                value={showPickupOptions}
                onChange={(_value) => {
                  const id = _pickupMethods.find((option) => !option.insufficient_inventory)?.id

                  if (id) {
                    handleSetShippingMethod(id, "pickup")
                  }
                }}
              >
                <Radio
                  value={PICKUP_OPTION_ON}
                  data-testid="delivery-option-radio"
                  className={clx(
                    "flex items-center justify-between cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
                    {
                      "border-gm-violet bg-gm-ivoire-2": showPickupOptions === PICKUP_OPTION_ON,
                    }
                  )}
                >
                  <div className="flex items-center gap-x-3">
                    <MedusaRadio checked={showPickupOptions === PICKUP_OPTION_ON} />
                    <span className="text-sm text-gm-ink">Retrait en magasin</span>
                  </div>
                </Radio>
              </RadioGroup>
            )}
            <RadioGroup
              value={shippingMethodId}
              onChange={(v) => {
                if (v) {
                  return handleSetShippingMethod(v, "shipping")
                }
              }}
            >
              {_shippingMethods?.map((option) => {
                const isDisabled =
                  option.price_type === "calculated" &&
                  !isLoadingPrices &&
                  typeof calculatedPricesMap[option.id] !== "number"

                return (
                  <Radio
                    key={option.id}
                    value={option.id}
                    data-testid="delivery-option-radio"
                    disabled={isDisabled}
                    className={clx(
                      "flex items-center justify-between cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
                      {
                        "border-gm-violet bg-gm-ivoire-2": option.id === shippingMethodId,
                        "opacity-50 cursor-not-allowed hover:border-gm-border": isDisabled,
                      }
                    )}
                  >
                    <div className="flex items-center gap-x-3">
                      <MedusaRadio checked={option.id === shippingMethodId} />
                      <span className="text-sm text-gm-ink">{option.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gm-ink">
                      {option.price_type === "flat" ? (
                        convertToLocale({ amount: option.amount!, currency_code: cart?.currency_code })
                      ) : calculatedPricesMap[option.id] ? (
                        convertToLocale({
                          amount: calculatedPricesMap[option.id],
                          currency_code: cart?.currency_code,
                        })
                      ) : isLoadingPrices ? (
                        <Loader />
                      ) : (
                        "-"
                      )}
                    </span>
                  </Radio>
                )
              })}
            </RadioGroup>
          </div>

          {showPickupOptions === PICKUP_OPTION_ON && (
            <div className="mt-6">
              <div className="flex flex-col gap-1 mb-4">
                <span className="text-sm font-semibold text-gm-ink">Point de retrait</span>
                <span className="text-sm text-gm-ink-muted">Choisissez un point près de chez vous</span>
              </div>
              <div data-testid="delivery-options-container">
                <RadioGroup
                  value={shippingMethodId}
                  onChange={(v) => {
                    if (v) {
                      return handleSetShippingMethod(v, "pickup")
                    }
                  }}
                >
                  {_pickupMethods?.map((option) => {
                    return (
                      <Radio
                        key={option.id}
                        value={option.id}
                        disabled={option.insufficient_inventory}
                        data-testid="delivery-option-radio"
                        className={clx(
                          "flex items-center justify-between cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
                          {
                            "border-gm-violet bg-gm-ivoire-2": option.id === shippingMethodId,
                            "opacity-50 cursor-not-allowed hover:border-gm-border": option.insufficient_inventory,
                          }
                        )}
                      >
                        <div className="flex items-start gap-x-3">
                          <MedusaRadio checked={option.id === shippingMethodId} />
                          <div className="flex flex-col">
                            <span className="text-sm text-gm-ink">{option.name}</span>
                            <span className="text-xs text-gm-ink-muted">
                              {formatAddress(
                                (
                                  option as unknown as {
                                    service_zone?: {
                                      fulfillment_set?: { location?: { address: HttpTypes.StoreCartAddress } }
                                    }
                                  }
                                ).service_zone?.fulfillment_set?.location?.address as HttpTypes.StoreCartAddress
                              )}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gm-ink">
                          {convertToLocale({ amount: option.amount!, currency_code: cart?.currency_code })}
                        </span>
                      </Radio>
                    )
                  })}
                </RadioGroup>
              </div>
            </div>
          )}

          <ErrorMessage error={error} data-testid="delivery-option-error-message" />
          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={!cart.shipping_methods?.[0]}
            data-testid="submit-delivery-option-button"
          >
            Continuer vers le paiement
          </Button>
        </div>
      )}
    </div>
  )
}

export default Shipping
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Verification visuelle**

Run: `npm run storefront:dev`, avancer jusqu'à l'étape Livraison du checkout.
Les options de livraison s'affichent en cartes sélectionnables (bordure
violette + fond ivoire quand sélectionnée, bordure dorée au survol). Valider
: la pastille passe à "complétée", un résumé "Nom méthode - montant"
s'affiché.

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/checkout/components/shipping/index.tsx
git commit -m "Restyle l'étape Livraison du checkout avec StepHeader"
```

---

## Task 11 : Restyler l'étape Paiement (et retirer le tiret cadratin)

**Files:**
- Modify: `apps/storefront/src/modules/checkout/components/payment/index.tsx`
- Modify: `apps/storefront/src/modules/checkout/components/payment-container/index.tsx`
- Modify: `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`

**Interfaces:**
- Consumes : `StepHeader` (Task 3), `Radio` retinté (Task 2).
- Produces : aucune interface modifiée.

- [ ] **Step 1 : Restyler `Payment`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/payment/index.tsx` entier par :

```tsx
"use client"
import { RadioGroup } from "@headlessui/react"
import { isOrangeMoney, isStripeLike, paymentInfoMap } from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer, { StripeCardContainer } from "@modules/checkout/components/payment-container"
import StepHeader from "@modules/checkout/components/step-header"
import { Button, Heading } from "@modules/common/components/ui"
import { HttpTypes } from "@medusajs/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: HttpTypes.StoreCart
  availablePaymentMethods: { id: string }[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardBrand, setCardBrand] = useState<string | null>(null)
  const [cardComplete, setCardComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(activeSession?.provider_id ?? "")

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  const setPaymentMethod = async (method: string) => {
    setError(null)
    setSelectedPaymentMethod(method)
    if (isStripeLike(method) || isOrangeMoney(method)) {
      await initiatePaymentSession(cart, {
        provider_id: method,
      })
    }
  }

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 &&
    cart?.total === 0
  )

  const paymentReady = (activeSession && (cart?.shipping_methods?.length ?? 0) !== 0) || paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), { scroll: false })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const shouldInputCard = isStripeLike(selectedPaymentMethod) && !activeSession

      const checkActiveSession = activeSession?.provider_id === selectedPaymentMethod

      if (!checkActiveSession) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
      }

      if (!shouldInputCard) {
        return router.push(pathname + "?" + createQueryString("step", "review"), {
          scroll: false,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  const summary =
    !isOpen && paymentReady && activeSession
      ? `${paymentInfoMap[activeSession.provider_id]?.title || activeSession.provider_id} - ${
          isOrangeMoney(selectedPaymentMethod)
            ? String(activeSession?.data?.phone_number ?? "Orange Money")
            : isStripeLike(selectedPaymentMethod) && cardBrand
              ? cardBrand
              : "Détails à l'étape suivante"
        }`
      : !isOpen && paidByGiftcard
        ? "Carte cadeau"
        : undefined

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader
        step={3}
        title="Paiement"
        status={isOpen ? "active" : paymentReady ? "completed" : "disabled"}
        summary={summary}
        onEdit={!isOpen && paymentReady ? handleEdit : undefined}
        editTestId="edit-payment-button"
      />
      {isOpen && (
        <div className="mt-6">
          {!paidByGiftcard && availablePaymentMethods?.length && (
            <RadioGroup value={selectedPaymentMethod} onChange={(value: string) => setPaymentMethod(value)}>
              {availablePaymentMethods.map((paymentMethod) => (
                <div key={paymentMethod.id}>
                  {isStripeLike(paymentMethod.id) ? (
                    <StripeCardContainer
                      paymentProviderId={paymentMethod.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                      paymentInfoMap={paymentInfoMap}
                      setCardBrand={setCardBrand}
                      setError={setError}
                      setCardComplete={setCardComplete}
                    />
                  ) : (
                    <PaymentContainer
                      paymentInfoMap={paymentInfoMap}
                      paymentProviderId={paymentMethod.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                    />
                  )}
                </div>
              ))}
            </RadioGroup>
          )}

          {paidByGiftcard && (
            <p className="text-sm text-gm-ink-muted">Méthode de paiement : carte cadeau</p>
          )}

          {isOrangeMoney(selectedPaymentMethod) && activeSession && (
            <div
              className="mt-4 rounded-xl border-l-4 border-gm-violet bg-gm-ivoire-2 p-4 small:p-5"
              data-testid="orange-money-instructions"
            >
              <Heading level="h3" className="text-base mb-3">
                Instructions de paiement Orange Money
              </Heading>
              <div className="flex flex-col gap-1.5 text-sm text-gm-ink">
                <p>
                  Envoyez le montant total au numéro{" "}
                  <span className="font-semibold">{String(activeSession.data?.phone_number ?? "")}</span>,
                  titulaire{" "}
                  <span className="font-semibold">
                    {String(activeSession.data?.account_name ?? "Golden Market")}
                  </span>
                </p>
                <p>
                  Montant à envoyer :{" "}
                  <span className="font-display font-bold text-base text-gm-violet">
                    {convertToLocale({
                      amount: cart.total ?? 0,
                      currency_code: cart.currency_code ?? "XOF",
                    })}
                  </span>
                </p>
                <p className="text-gm-ink-muted">{String(activeSession.data?.note ?? "")}</p>
              </div>
            </div>
          )}

          <ErrorMessage error={error} data-testid="payment-method-error-message" />

          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              (isStripeLike(selectedPaymentMethod) && !cardComplete) ||
              (!selectedPaymentMethod && !paidByGiftcard)
            }
            data-testid="submit-payment-button"
          >
            {!activeSession && isStripeLike(selectedPaymentMethod)
              ? "Saisir les détails de la carte"
              : "Continuer vers le récapitulatif"}
          </Button>
        </div>
      )}
    </div>
  )
}

export default Payment
```

Note importante : ce nouveau fichier ne contient plus aucun tiret cadratin
(`—`). L'ancien bloc `{" "}—{" "}` entre le numéro de téléphone et le
titulaire du compte Orange Money est remplace par une simple virgule ("...,
titulaire ..."), conformément à la spec.

- [ ] **Step 2 : Restyler `PaymentContainer` et `StripeCardContainer`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/payment-container/index.tsx` entier par :

```tsx
import { Radio as RadioGroupOption } from "@headlessui/react"
import { clx } from "@modules/common/components/ui"
import React, { useContext, useMemo, type JSX } from "react"

import Radio from "@modules/common/components/radio"

import { isManual } from "@lib/constants"
import SkeletonCardDetails from "@modules/skeletons/components/skeleton-card-détails"
import { CardElement } from "@stripe/react-stripe-js"
import { StripeCardElementOptions } from "@stripe/stripe-js"
import PaymentTest from "../payment-test"
import { StripeContext } from "../payment-wrapper/stripe-wrapper"

type PaymentContainerProps = {
  paymentProviderId: string
  selectedPaymentOptionId: string | null
  disabled?: boolean
  paymentInfoMap: Record<string, { title: string; icon: JSX.Element }>
  children?: React.ReactNode
}

const PaymentContainer: React.FC<PaymentContainerProps> = ({
  paymentProviderId,
  selectedPaymentOptionId,
  paymentInfoMap,
  disabled = false,
  children,
}) => {
  const isDevelopment = process.env.NODE_ENV === "development"

  return (
    <RadioGroupOption
      key={paymentProviderId}
      value={paymentProviderId}
      disabled={disabled}
      className={clx(
        "flex flex-col gap-y-2 cursor-pointer rounded-xl border border-gm-border px-4 py-3.5 mb-2 transition-colors hover:border-gm-gold",
        {
          "border-gm-violet bg-gm-ivoire-2": selectedPaymentOptionId === paymentProviderId,
        }
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-3">
          <Radio checked={selectedPaymentOptionId === paymentProviderId} />
          <span className="text-sm text-gm-ink">
            {paymentInfoMap[paymentProviderId]?.title || paymentProviderId}
          </span>
          {isManual(paymentProviderId) && isDevelopment && <PaymentTest className="hidden small:block" />}
        </div>
        <span className="text-gm-ink-muted">{paymentInfoMap[paymentProviderId]?.icon}</span>
      </div>
      {isManual(paymentProviderId) && isDevelopment && <PaymentTest className="small:hidden text-[10px]" />}
      {children}
    </RadioGroupOption>
  )
}

export default PaymentContainer

export const StripeCardContainer = ({
  paymentProviderId,
  selectedPaymentOptionId,
  paymentInfoMap,
  disabled = false,
  setCardBrand,
  setError,
  setCardComplete,
}: Omit<PaymentContainerProps, "children"> & {
  setCardBrand: (brand: string) => void
  setError: (error: string | null) => void
  setCardComplete: (complete: boolean) => void
}) => {
  const stripeReady = useContext(StripeContext)

  const useOptions: StripeCardElementOptions = useMemo(() => {
    return {
      style: {
        base: {
          fontFamily: "Inter, sans-serif",
          color: "#211b3d",
          "::placeholder": {
            color: "#5b5480",
          },
        },
      },
      classes: {
        base: "pt-3 pb-1 block w-full h-11 px-4 mt-0 bg-white border border-gm-border rounded-lg appearance-none focus:outline-none focus:border-gm-gold transition-colors",
      },
    }
  }, [])

  return (
    <PaymentContainer
      paymentProviderId={paymentProviderId}
      selectedPaymentOptionId={selectedPaymentOptionId}
      paymentInfoMap={paymentInfoMap}
      disabled={disabled}
    >
      {selectedPaymentOptionId === paymentProviderId &&
        (stripeReady ? (
          <div className="my-4 transition-all duration-150 ease-in-out">
            <span className="text-sm font-semibold text-gm-ink mb-1 block">
              Entrez les détails de votre carte :
            </span>
            <CardElement
              options={useOptions as StripeCardElementOptions}
              onChange={(e) => {
                setCardBrand(e.brand && e.brand.charAt(0).toUpperCase() + e.brand.slice(1))
                setError(e.error?.message || null)
                setCardComplete(e.complete)
              }}
            />
          </div>
        ) : (
          <SkeletonCardDetails />
        ))}
    </PaymentContainer>
  )
}
```

- [ ] **Step 3 : Traduire `PaymentButton`**

Dans `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`,
remplacer les trois occurrences suivantes :

```tsx
      return <Button disabled>Select a payment method</Button>
```

Par :

```tsx
      return <Button disabled>Sélectionnez un mode de paiement</Button>
```

Puis, dans `StripePaymentButton` :

```tsx
      >
        Place order
      </Button>
```

Par :

```tsx
      >
        Passer la commande
      </Button>
```

Puis, dans `ManualTestPaymentButton` (même bloc) :

```tsx
        data-testid="submit-order-button"
      >
        Place order
      </Button>
```

Par :

```tsx
        data-testid="submit-order-button"
      >
        Passer la commande
      </Button>
```

- [ ] **Step 4 : Vérifier qu'aucun tiret cadratin ne subsiste**

Run: `grep -rn "—" apps/storefront/src/modules/checkout/components/payment apps/storefront/src/modules/checkout/components/payment-container apps/storefront/src/modules/checkout/components/payment-button`
Expected: aucune sortie.

- [ ] **Step 5 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 6 : Verification visuelle**

Run: `npm run storefront:dev`, avancer jusqu'à l'étape Paiement. Deux cartes
de méthode (Orange Money, Carte bancaire selon la config du backend).
Selectionner Orange Money : l'encart d'instructions apparait, fond ivoire
soutenu, bordure gauche violette, aucun tiret cadratin visible entre le
numéro de téléphone et le titulaire.

- [ ] **Step 7 : Commit**

```bash
git add apps/storefront/src/modules/checkout/components/payment/index.tsx apps/storefront/src/modules/checkout/components/payment-container/index.tsx apps/storefront/src/modules/checkout/components/payment-button/index.tsx
git commit -m "Restyle l'étape Paiement et retire le tiret cadratin des instructions Orange Money"
```

---

## Task 12 : Restyler l'étape Récapitulatif

**Files:**
- Modify: `apps/storefront/src/modules/checkout/components/review/index.tsx`

**Interfaces:**
- Consumes : `StepHeader` (Task 3), `PaymentButton` traduit (Task 11).
- Produces : aucune interface modifiée.

- [ ] **Step 1 : Restyler `Review`**

Remplacer le fichier `apps/storefront/src/modules/checkout/components/review/index.tsx` entier par :

```tsx
"use client"

import StepHeader from "@modules/checkout/components/step-header"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 &&
    cart?.total === 0
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="rounded-2xl border border-gm-border bg-white p-5 small:p-6">
      <StepHeader step={4} title="Récapitulatif" status={isOpen ? "active" : "disabled"} />
      {isOpen && previousStepsCompleted && (
        <div className="mt-6">
          <p className="text-sm text-gm-ink-muted mb-6">
            En cliquant sur le bouton Passer la commande, vous confirmez avoir lu et accepté nos
            conditions d&apos;utilisation, conditions de vente et notre politique de retour, et
            avoir pris connaissance de notre politique de confidentialité.
          </p>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </div>
      )}
    </div>
  )
}

export default Review
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/src/modules/checkout/components/review/index.tsx
git commit -m "Restyle l'étape Récapitulatif du checkout avec StepHeader"
```

---

## Task 13 : Restyler le récapitulatif de commande et la page checkout

**Files:**
- Modify: `apps/storefront/src/modules/checkout/templates/checkout-summary/index.tsx`
- Modify: `apps/storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx`

**Interfaces:**
- Consumes : `ItemsPreviewTemplate` restylée (Task 5), `CartTotals` sans `shippingCalculatedLater` (Task 6).
- Produces : aucune interface modifiée.

- [ ] **Step 1 : Restyler `CheckoutSummary`**

Remplacer le fichier `apps/storefront/src/modules/checkout/templates/checkout-summary/index.tsx` entier par :

```tsx
import { Heading } from "@modules/common/components/ui"

import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import CartTotals from "@modules/common/components/cart-totals"
import { HttpTypes } from "@medusajs/types"

const CheckoutSummary = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  return (
    <div className="small:sticky small:top-8 h-fit rounded-2xl border border-gm-border bg-white p-5 small:p-6 flex flex-col gap-y-6">
      <Heading level="h2" className="text-xl">
        Récapitulatif de commande
      </Heading>
      <ItemsPreviewTemplate cart={cart} />
      <CartTotals totals={cart} />
    </div>
  )
}

export default CheckoutSummary
```

Note : le champ de code promo (`DiscountCode`) n'est plus rendu ici,
conformément à la décision de scope documentée dans les Global Constraints
(reste disponible sur la page Panier).

- [ ] **Step 2 : Restyler la grille de la page checkout**

Dans `apps/storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx`,
remplacer :

```tsx
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
```

Par :

```tsx
    <div className="grid grid-cols-1 small:grid-cols-[1fr_400px] content-container gap-8 small:gap-10 py-8 small:py-12">
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Verification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/checkout`. A
largeur desktop, le récapitulatif de commande est visible en colonne
laterale collante : mini-liste d'articles, sous-total, livraison, total. Pas
de champ de code promo dans cette colonne.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/modules/checkout/templates/checkout-summary/index.tsx "apps/storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx"
git commit -m "Restyle le récapitulatif de commande et la mise en page de la page checkout"
```

---

## Task 14 : Restyler l'en-tête du layout checkout et vérification finale

**Files:**
- Modify: `apps/storefront/src/app/[countryCode]/(checkout)/layout.tsx`

**Interfaces:**
- Consumes : `/logo/logo-color.png` (plan Accueil/Catalogue/Produit, Task 1).
- Produces : aucune interface modifiée.

- [ ] **Step 1 : Restyler `CheckoutLayout`**

Remplacer le fichier `apps/storefront/src/app/[countryCode]/(checkout)/layout.tsx` entier par :

```tsx
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import MedusaCTA from "@modules/layout/components/medusa-cta"

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full bg-gm-ivoire relative small:min-h-screen">
      <div className="h-16 bg-white border-b border-gm-border">
        <nav className="flex h-full items-center content-container justify-between">
          <LocalizedClientLink
            href="/cart"
            className="flex items-center gap-x-2 text-sm font-semibold text-gm-ink-muted hover:text-gm-ink transition-colors flex-1 basis-0"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90" size={16} />
            <span className="hidden small:block">Retour au panier</span>
            <span className="block small:hidden">Retour</span>
          </LocalizedClientLink>
          <LocalizedClientLink href="/" className="flex items-center" data-testid="store-link">
            <Image
              src="/logo/logo-color.png"
              alt="Golden Market"
              width={130}
              height={41}
              className="h-8 w-auto"
            />
          </LocalizedClientLink>
          <div className="flex-1 basis-0" />
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">
        {children}
      </div>
      <div className="py-4 w-full flex items-center justify-center">
        <MedusaCTA />
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Vérifier que le lint passe**

Run: `cd apps/storefront && npm run lint`
Expected: aucune erreur.

- [ ] **Step 4 : Vérifier qu'aucun tiret cadratin ne subsiste sur tout le périmètre de ce plan**

Run:

```bash
grep -rn "—" apps/storefront/src/modules/cart apps/storefront/src/modules/checkout apps/storefront/src/modules/common/components/cart-totals apps/storefront/src/modules/common/components/line-item-price apps/storefront/src/modules/common/components/line-item-unit-price apps/storefront/src/modules/common/components/line-item-options apps/storefront/src/modules/common/components/interactive-link apps/storefront/src/modules/common/components/input apps/storefront/src/modules/common/components/native-select apps/storefront/src/modules/common/components/radio apps/storefront/src/modules/common/components/delete-button "apps/storefront/src/app/[countryCode]/(checkout)"
```

Expected: aucune sortie.

- [ ] **Step 5 : Verification visuelle finale**

Run: `npm run storefront:dev`. Parcourir le flux complet : Panier (avec et
sans articles, connecté et déconnecté) puis Checkout (Adresse, Livraison,
Paiement avec Orange Money et Carte bancaire si configurés, Récapitulatif),
aux largeurs ~375px, ~768px et ≥1280px. Vérifier en particulier :
contraste du texte sur l'en-tête violet du checkout n'existe plus (en-tête
désormais blanc/ivoire avec texte encre) ; barre "Passer la commande" bien
visible en bas du récapitulatif panier ; les 4 pastilles d'étape du checkout
changent bien de couleur (gris -> or -> violet avec coche) au fil de la
progression ; le flux de paiement Orange Money affiche exactement les mêmes
données qu'avant (numéro, titulaire, montant, note), seule la présentation a
changé.

- [ ] **Step 6 : Commit**

```bash
git add "apps/storefront/src/app/[countryCode]/(checkout)/layout.tsx"
git commit -m "Restyle l'en-tête du layout checkout avec le logo Golden Market"
```

---

## Fin de plan

Après ces 14 tâches, le Panier et le Paiement affichent l'identité Golden
Market complète : ligne de panier en carte, récapitulatif sticky avec CTA
"Passer la commande", 4 étapes de checkout avec pastille numérotée et résumé
d'une ligne pour les étapes complétées, encart Orange Money reformaté sans
tiret cadratin. Les composants de formulaire partagés retintés (Task 1-2)
bénéficient déjà par avance au plan `Compte`, qui n'a plus qu'à poser
`StepHeader`-like patterns propres à ses propres pages (aucune réutilisation
directe de `StepHeader`, spécifique au checkout) et à habiller ses propres
templates (`account-layout`, `overview`, `order-card`, `login`, `register`).
