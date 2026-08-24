# Refonte storefront Golden Market : Fondation (design tokens & composants partagés) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations de la refonte visuelle Golden Market : polices de marque, tokens de couleur en variables CSS, et restylage des composants partagés (`Heading`, `Button`, `Badge`) plus l'ajout d'un composant `Chip`, tous dans `apps/storefront/src/modules/common/components/ui/index.tsx`.

**Architecture:** Les tokens sont des variables CSS définies dans un nouveau fichier `tokens.css`, exposées à Tailwind via `theme.extend.colors.gm.*` et `theme.extend.fontFamily`. Les polices (Baloo 2, Inter) sont chargées via `next/font/google` dans le layout racine, ce qui les auto-héberge (pas de requête réseau vers Google Fonts au runtime, cohérent avec l'exigence mobile-first). Les composants `Heading`/`Button`/`Badge` existants sont déjà une petite bibliothèque maison (pas `@medusajs/ui-preset`) : ce plan les retinte plutôt que de les remplacer, en préservant leur API (props `variant`/`color`) pour ne rien casser dans les 73 fichiers qui les importent.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS 3 (preset `@medusajs/ui-preset` conservé, non retiré), `next/font/google`, TypeScript, `clsx`.

**Spec:** `docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`

## Global Constraints

- Gestionnaire de paquets : npm (`packageManager: "npm@11.11.1"` à la racine). Toutes les commandes ci-dessous s'exécutent avec `npm`.
- Aucun tiret cadratin (—) dans le code ni dans un texte affiché ; le tiret simple (-) est autorisé.
- Le storefront n'a pas de suite de tests automatisés (`AGENTS.md`). La vérification de chaque tâche se fait via `npm run build` (type-check + build Next.js complet) et `npm run lint`, plus une vérification visuelle manuelle décrite dans chaque tâche.
- Mobile-first strict : aucune animation lourde, aucune police supplémentaire au-delà de Baloo 2 et Inter, `next/font` obligatoire (auto-hébergement, pas de `<link>` vers `fonts.googleapis.com`).
- Dark mode non câblé dans ce plan (décision spec §5) : les tokens ne définissent que le thème clair.
- Ne pas toucher à la logique métier : `lib/data/`, workflows backend, `checkout/components/payment/index.tsx` reste identique dans ce plan (son retrait de tiret cadratin et son restylage font partie du plan "Panier + Paiement", pas de celui-ci).
- Ne pas retirer de valeur existante des unions de props `variant`/`color` de `Button`/`Badge` : 73 fichiers importent ces composants, certains avec des valeurs (`variant="secondary"`, `color="green"`, `color="red"`, `color="orange"`) qui doivent continuer à fonctionner à l'identique après ce plan.

---

## File Structure

- **Create** `apps/storefront/src/styles/tokens.css` : variables CSS `--gm-*` (palette) + règle `body` (fond ivoire, texte encre).
- **Modify** `apps/storefront/src/styles/globals.css` : importer `tokens.css`.
- **Modify** `apps/storefront/src/app/layout.tsx` : charger Baloo 2 et Inter via `next/font/google`, les exposer en variables CSS sur `<html>`.
- **Modify** `apps/storefront/tailwind.config.js` : ajouter `colors.gm.*` (référence aux variables CSS) et étendre `fontFamily.sans`/ajouter `fontFamily.display`.
- **Modify** `apps/storefront/src/modules/common/components/ui/index.tsx` : retinter `Heading`, `Button`, `Badge` ; ajouter `Chip`.

---

## Task 1 : Charger les polices de marque (Baloo 2 + Inter)

**Files:**
- Modify: `apps/storefront/src/app/layout.tsx`

**Interfaces:**
- Produces : deux variables CSS globales, `--font-inter` et `--font-baloo`, disponibles sur tout le document (posées sur l'élément `<html>`). Les tâches suivantes (Tailwind `fontFamily`) consomment ces deux noms exacts.

- [ ] **Step 1 : Modifier `layout.tsx` pour charger les polices**

Fichier actuel (`apps/storefront/src/app/layout.tsx`) :

```tsx
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light">
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
```

Remplacer par :

```tsx
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { Baloo_2, Inter } from "next/font/google"
import "styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-mode="light"
      className={`${inter.variable} ${baloo.variable}`}
    >
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi, aucune erreur TypeScript (`next/font/google` a des types intégrés).

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/src/app/layout.tsx
git commit -m "Charge Baloo 2 et Inter via next/font pour le storefront"
```

---

## Task 2 : Créer les tokens de couleur

**Files:**
- Create: `apps/storefront/src/styles/tokens.css`
- Modify: `apps/storefront/src/styles/globals.css`

**Interfaces:**
- Consumes : rien.
- Produces : variables CSS `--gm-violet`, `--gm-violet-hover`, `--gm-amethyst`, `--gm-gold`, `--gm-gold-strong`, `--gm-gold-soft`, `--gm-terracotta`, `--gm-ivoire`, `--gm-ivoire-2`, `--gm-ink`, `--gm-ink-muted`, `--gm-border`, `--gm-on-violet`, `--gm-on-violet-muted`. Consommées par Tailwind (Task 3) et directement par tout CSS custom.

- [ ] **Step 1 : Créer `tokens.css`**

```css
:root {
  --gm-violet: #332871;
  --gm-violet-hover: #241c52;
  --gm-amethyst: #6e5cc4;

  --gm-gold: #e7a92e;
  --gm-gold-strong: #b9821d;
  --gm-gold-soft: #f6dfa0;

  --gm-terracotta: #c85a1d;

  --gm-ivoire: #faf6ee;
  --gm-ivoire-2: #f3ecdd;
  --gm-ink: #211b3d;
  --gm-ink-muted: #5b5480;
  --gm-border: #e6dcc6;

  --gm-on-violet: #fbf7ec;
  --gm-on-violet-muted: rgba(251, 247, 236, 0.72);
}

body {
  background-color: var(--gm-ivoire);
  color: var(--gm-ink);
}
```

- [ ] **Step 2 : Importer `tokens.css` dans `globals.css`**

Fichier actuel (`apps/storefront/src/styles/globals.css`), trois premières lignes :

```css
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";
```

Remplacer par :

```css
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";
@import "./tokens.css";
```

(le reste du fichier, `@layer utilities` et `@layer components`, ne change pas)

- [ ] **Step 3 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Vérification visuelle**

Run: `npm run storefront:dev` (depuis la racine du repo)
Ouvrir `http://localhost:8000`. Vérifier dans les DevTools que `<body>` a bien
`background-color: rgb(250, 246, 238)` (ivoire) au lieu du blanc par défaut.

- [ ] **Step 5 : Commit**

```bash
git add apps/storefront/src/styles/tokens.css apps/storefront/src/styles/globals.css
git commit -m "Ajoute les tokens de couleur Golden Market en variables CSS"
```

---

## Task 3 : Exposer les tokens à Tailwind

**Files:**
- Modify: `apps/storefront/tailwind.config.js`

**Interfaces:**
- Consumes : les variables CSS `--gm-*` de Task 2, `--font-inter`/`--font-baloo` de Task 1.
- Produces : classes Tailwind `bg-gm-violet`, `text-gm-gold`, `border-gm-border`, etc. (une classe par variable, nom identique sans le préfixe `--gm-`), utilitaire `font-display` (Baloo 2), `font-sans` chargeant désormais réellement Inter.

- [ ] **Step 1 : Modifier `theme.extend.colors` et `theme.extend.fontFamily`**

Dans `apps/storefront/tailwind.config.js`, la section `colors` actuelle :

```js
      colors: {
        grey: {
          0: "#FFFFFF",
          5: "#F9FAFB",
          10: "#F3F4F6",
          20: "#E5E7EB",
          30: "#D1D5DB",
          40: "#9CA3AF",
          50: "#6B7280",
          60: "#4B5563",
          70: "#374151",
          80: "#1F2937",
          90: "#111827",
        },
      },
```

Remplacer par :

```js
      colors: {
        grey: {
          0: "#FFFFFF",
          5: "#F9FAFB",
          10: "#F3F4F6",
          20: "#E5E7EB",
          30: "#D1D5DB",
          40: "#9CA3AF",
          50: "#6B7280",
          60: "#4B5563",
          70: "#374151",
          80: "#1F2937",
          90: "#111827",
        },
        gm: {
          violet: "var(--gm-violet)",
          "violet-hover": "var(--gm-violet-hover)",
          amethyst: "var(--gm-amethyst)",
          gold: "var(--gm-gold)",
          "gold-strong": "var(--gm-gold-strong)",
          "gold-soft": "var(--gm-gold-soft)",
          terracotta: "var(--gm-terracotta)",
          ivoire: "var(--gm-ivoire)",
          "ivoire-2": "var(--gm-ivoire-2)",
          ink: "var(--gm-ink)",
          "ink-muted": "var(--gm-ink-muted)",
          border: "var(--gm-border)",
          "on-violet": "var(--gm-on-violet)",
          "on-violet-muted": "var(--gm-on-violet-muted)",
        },
      },
```

Puis la section `fontFamily` actuelle :

```js
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Ubuntu",
          "sans-serif",
        ],
      },
```

Remplacer par :

```js
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Ubuntu",
          "sans-serif",
        ],
        display: ["var(--font-baloo)", "var(--font-inter)", "sans-serif"],
      },
```

- [ ] **Step 2 : Vérifier que le build passe et que les classes sont générées**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

Run (après le build) : `grep -r "gm-violet" .next/static/css/*.css`
Expected: au moins une correspondance (la classe `.bg-gm-violet` ou `.text-gm-violet` n'apparaît que si elle est utilisée quelque part dans le JSX ; si aucune correspondance, c'est normal tant qu'aucun composant ne l'utilise encore — ce grep sert surtout à confirmer après la Task 5 que la classe est bien générée. À ce stade, vérifier plutôt que le build ne lève aucune erreur de configuration Tailwind, ce qui est le vrai signal que `tailwind.config.js` est syntaxiquement valide.)

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/tailwind.config.js
git commit -m "Expose les tokens Golden Market comme couleurs et polices Tailwind"
```

---

## Task 4 : Retinter `Heading`

**Files:**
- Modify: `apps/storefront/src/modules/common/components/ui/index.tsx`

**Interfaces:**
- Consumes : classe Tailwind `font-display` (Task 3).
- Produces : aucun changement d'API (`HeadingProps` inchangé), tous les appelants existants (`<Heading level="h1">...</Heading>`, etc.) continuent de fonctionner sans modification.

- [ ] **Step 1 : Ajouter `font-display` au composant `Heading`**

Bloc actuel :

```tsx
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level: Component = "h2", children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={clsx(
          "font-semibold",
          Component === "h1" && "text-3xl",
          Component === "h2" && "text-2xl",
          Component === "h3" && "text-xl",
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
```

Remplacer par :

```tsx
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level: Component = "h2", children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={clsx(
          "font-display font-semibold text-gm-ink",
          Component === "h1" && "text-3xl",
          Component === "h2" && "text-2xl",
          Component === "h3" && "text-xl",
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000`. Inspecter un
`<h1>`/`<h2>` de la page d'accueil actuelle (ex. le titre "Ecommerce Starter
Template" du hero non encore restylé) : la police doit être Baloo 2 (visible
à l'œil : lettres rondes et grasses), pas Inter.

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/common/components/ui/index.tsx
git commit -m "Applique Baloo 2 et la couleur encre au composant Heading"
```

---

## Task 5 : Retinter `Button`

**Files:**
- Modify: `apps/storefront/src/modules/common/components/ui/index.tsx`

**Interfaces:**
- Consumes : classes Tailwind `bg-gm-gold`, `text-gm-ink`, `bg-gm-gold-strong`, `text-gm-violet`, `border-gm-violet`, `bg-gm-violet`, `text-gm-on-violet`, `text-gm-amethyst`, `border-white/40` (Task 3).
- Produces : `ButtonProps.variant` accepte désormais `"primary" | "secondary" | "transparent" | "outline-onviolet"` (nouvelle valeur ajoutée, les 3 existantes conservées). Les tâches des plans suivants (Accueil/Catalogue/Fiche produit, Panier/Paiement, Compte) utiliseront `variant="outline-onviolet"` sur les surfaces violettes (hero, footer, carte de bienvenue du compte).

- [ ] **Step 1 : Retinter le composant et ajouter le variant `outline-onviolet`**

Bloc actuel :

```tsx
// Button Component
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "transparent"
  size?: "small" | "medium" | "large"
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "medium",
      isLoading,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          "inline-flex gap-2 items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" && "bg-black text-white hover:bg-gray-800",
          variant === "secondary" &&
            "bg-white text-black border border-gray-200 hover:bg-gray-50",
          variant === "transparent" && "bg-transparent hover:bg-gray-100",
          size === "small" && "h-8 px-3 text-sm",
          size === "medium" && "h-10 px-4",
          size === "large" && "h-12 px-6 text-lg",
          className
        )}
        {...props}
      >
        {isLoading ? "Loading..." : children}
      </button>
    )
  }
)
Button.displayName = "Button"
```

Remplacer par :

```tsx
// Button Component
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "transparent" | "outline-onviolet"
  size?: "small" | "medium" | "large"
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "medium",
      isLoading,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          "inline-flex gap-2 items-center justify-center rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gm-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" &&
            "bg-gm-gold text-gm-ink hover:bg-gm-gold-strong shadow-sm",
          variant === "secondary" &&
            "bg-transparent text-gm-violet border border-gm-violet hover:bg-gm-violet hover:text-gm-on-violet",
          variant === "transparent" &&
            "bg-transparent text-gm-amethyst underline-offset-4 hover:underline",
          variant === "outline-onviolet" &&
            "bg-transparent text-gm-on-violet border border-white/40 hover:border-gm-on-violet hover:bg-white/10",
          size === "small" && "h-8 px-3 text-sm",
          size === "medium" && "h-10 px-4",
          size === "large" && "h-12 px-6 text-lg",
          className
        )}
        {...props}
      >
        {isLoading ? "Loading..." : children}
      </button>
    )
  }
)
Button.displayName = "Button"
```

Note : le rayon de bordure passe de `rounded-md` à `rounded-full` (forme
pilule), conforme à la spec, pour tous les boutons du site immédiatement.

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi, aucune erreur de type (toutes les valeurs `variant`
existantes dans le code, ex. `variant="secondary"` dans
`modules/home/components/hero/index.tsx`, restent valides).

- [ ] **Step 3 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000`. Le bouton
"View on GitHub" du hero (actuellement `variant="secondary"`) doit
maintenant apparaître en forme de pilule, contour violet, texte violet.

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/common/components/ui/index.tsx
git commit -m "Retinte le composant Button aux couleurs Golden Market"
```

---

## Task 6 : Retinter `Badge`

**Files:**
- Modify: `apps/storefront/src/modules/common/components/ui/index.tsx`

**Interfaces:**
- Consumes : classes Tailwind `bg-gm-ivoire-2`, `text-gm-ink-muted`, `bg-gm-gold-soft`, `text-gm-gold-strong`, `bg-gm-terracotta`, `bg-gm-amethyst/10`, `text-gm-amethyst` (Task 3).
- Produces : `BadgeProps.color` accepte désormais `"green" | "red" | "blue" | "orange" | "grey" | "purple" | "gold" | "terracotta" | "amethyst"` (3 nouvelles valeurs ajoutées, les 6 existantes conservées avec les mêmes classes qu'avant sauf `"grey"` qui adopte les tokens ivoire).

- [ ] **Step 1 : Retinter le composant et ajouter les valeurs `gold`/`terracotta`/`amethyst`**

Bloc actuel :

```tsx
// Badge Component
type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  color?: "green" | "red" | "blue" | "orange" | "grey" | "purple"
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, color = "grey", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
          color === "green" && "bg-green-100 text-green-700",
          color === "red" && "bg-red-100 text-red-700",
          color === "blue" && "bg-blue-100 text-blue-700",
          color === "orange" && "bg-orange-100 text-orange-700",
          color === "grey" && "bg-gray-100 text-gray-700",
          color === "purple" && "bg-purple-100 text-purple-700",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
Badge.displayName = "Badge"
```

Remplacer par :

```tsx
// Badge Component
type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  color?:
    | "green"
    | "red"
    | "blue"
    | "orange"
    | "grey"
    | "purple"
    | "gold"
    | "terracotta"
    | "amethyst"
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, color = "grey", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
          color === "green" && "bg-green-100 text-green-700",
          color === "red" && "bg-red-100 text-red-700",
          color === "blue" && "bg-blue-100 text-blue-700",
          color === "orange" && "bg-orange-100 text-orange-700",
          color === "grey" && "bg-gm-ivoire-2 text-gm-ink-muted",
          color === "purple" && "bg-purple-100 text-purple-700",
          color === "gold" && "bg-gm-gold-soft text-gm-gold-strong",
          color === "terracotta" && "bg-gm-terracotta text-white",
          color === "amethyst" && "bg-gm-amethyst/10 text-gm-amethyst",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
Badge.displayName = "Badge"
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi. Les 3 appels existants
(`modules/checkout/components/payment-test/index.tsx` avec `color="orange"`,
`modules/account/components/account-info/index.tsx` avec `color="green"` et
`color="red"`) continuent de compiler et de s'afficher à l'identique.

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/src/modules/common/components/ui/index.tsx
git commit -m "Retinte Badge et ajoute les variantes gold/terracotta/amethyst"
```

---

## Task 7 : Créer le composant `Chip`

**Files:**
- Modify: `apps/storefront/src/modules/common/components/ui/index.tsx`

**Interfaces:**
- Consumes : classes Tailwind `border-gm-border`, `bg-gm-violet`, `text-gm-on-violet`, `hover:border-gm-gold` (Task 3).
- Produces : `export const Chip` — composant `<span>` avec prop `active?: boolean`, utilisé par le plan "Accueil + Catalogue + Fiche produit" pour les catégories de la page d'accueil et les filtres du catalogue.

- [ ] **Step 1 : Ajouter le composant `Chip` à la fin du fichier**

Ajouter en fin de fichier `apps/storefront/src/modules/common/components/ui/index.tsx` (après le composant `Checkbox`) :

```tsx
// Chip Component
type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  active?: boolean
}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, active, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors cursor-pointer",
          active
            ? "border-gm-violet bg-gm-violet text-gm-on-violet"
            : "border-gm-border bg-white text-gm-ink hover:border-gm-gold",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
Chip.displayName = "Chip"
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi (le composant n'est pas encore utilisé ailleurs, donc
aucun changement visuel à ce stade ; le build valide seulement la syntaxe et
les types).

- [ ] **Step 3 : Vérifier que le lint passe**

Run: `cd apps/storefront && npm run lint`
Expected: aucune erreur (en particulier pas de `no-unused-vars` puisque
`Chip` est exporté, pas seulement déclaré).

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/common/components/ui/index.tsx
git commit -m "Ajoute le composant Chip pour les categories et filtres"
```

---

## Fin de plan

Après ces 7 tâches, tout le site utilise déjà Baloo 2/Inter, un fond ivoire,
et des boutons/badges retintés (visible immédiatement sur toutes les pages
existantes, même non encore redesignées individuellement). Les plans
suivants (`Accueil + Catalogue + Fiche produit`, `Panier + Paiement`,
`Compte`) consomment `Button`, `Badge`, `Heading`, `Chip` et les classes
`gm-*` définies ici sans avoir besoin d'y retoucher.
