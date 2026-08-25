# Refonte storefront Golden Market : Compte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habiller la page Compte avec l'identité Golden Market : navigation latérale desktop, carte d'accueil violette avec salutation, liste de commandes récentes réutilisant une carte de commande avec badge de statut sémantique, teaser d'adresse par défaut, et formulaires de connexion/inscription restylés avec les mêmes tokens.

**Architecture:** Ce plan consomme les tokens et composants (`Button`, `Badge`, `Heading`) du plan Fondation, et les champs de formulaire (`Input`, `SubmitButton`) déjà retintés par le plan Panier/Paiement. `OrderCard`, jusqu'ici utilisé uniquement par la page "Commandes" complète, devient aussi le composant de rendu des commandes récentes sur la page Vue d'ensemble : il n'est modifié qu'une fois (Task 3) et bénéficie automatiquement aux deux pages. Aucune logique métier n'est touchée (`lib/data/`, authentification, création de commande) : uniquement le JSX/CSS des composants de présentation, plus l'ajout d'un badge de statut qui lit des champs déjà présents sur la commande (`fulfillment_status`, `payment_status`) sans changer leur calcul.

**Tech Stack:** Next.js 15 (App Router, `"use client"` uniquement où déjà présent), Tailwind CSS avec les tokens `gm-*` des plans précédents.

**Spec:** `docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`

## Global Constraints

- Ce plan suppose les plans `2026-08-24-storefront-redesign-fondation.md`, `2026-08-24-storefront-redesign-accueil-catalogue-produit.md` et `2026-08-24-storefront-redesign-panier-paiement.md` déjà exécutés : tokens `gm-*`, composants `Button`/`Badge`/`Heading`, et les champs `Input`/`NativeSelect`/`Radio`/`Checkbox` déjà retintés (le plan Panier/Paiement les a retintés par avance car partagés avec le checkout).
- Gestionnaire de paquets : npm. Toutes les commandes s'exécutent avec `npm`.
- Aucun tiret cadratin (—) dans le code ni dans un texte affiché ; le tiret simple (-) est autorisé.
- Pas de suite de tests automatisée côté storefront : vérification par `npm run build`, `npm run lint`, et vérification visuelle manuelle décrite dans chaque tâche, aux largeurs ~375px (mobile), ~768px (tablette), ≥1280px (desktop).
- Mobile-first strict : pas d'animation lourde, transitions CSS courtes uniquement.
- Ne pas modifier `lib/data/`, l'authentification (`login`, `signup`, `signout`, `requestPasswordReset`), ni le calcul des commandes : seul l'habillage visuel change.
- Décision de scope : seuls les fichiers nommés par la spec (§ Compte) sont retintés en profondeur : `account-layout.tsx`, `account-nav/`, `overview/`, `order-card/`, `login/`, `register/`. Les pages Profil et Adresses (`profile-*`, `address-book/`, `address-card/`) et les pages "Commandes" complète/détail ne sont pas retouchées : elles héritent automatiquement des tokens via `Button`, `Badge`, `Input` déjà retintés, sans qu'aucun fichier de ce plan les mentionne. `forgot-password/index.tsx` est inclus dans ce plan (Task 5) bien que non nommé explicitement par la spec, car il partage l'écran de connexion via `LoginTemplate` et resterait visuellement incohérent sinon.
- Décision de scope : le badge de statut de commande (§ Compte : "statut en badge coloré sémantique") est calculé à partir des champs `order.fulfillment_status` et `order.payment_status`, déjà exposés par le type `HttpTypes.StoreOrder` et déjà lus ailleurs dans le code (`modules/order/components/order-details/index.tsx`). La règle retenue (Task 3) : `fulfillment_status === "delivered"` donne "Livrée" (vert) ; sinon `payment_status` égal à `captured` ou `partially_captured` donne "Paiement reçu" (améthyste) ; sinon "En cours" (doré). Cette règle est une interprétation de présentation, pas une nouvelle donnée métier ; si `npm run build` signale un champ ou une valeur de statut inexistante, ajuster la comparaison de chaîne sans changer la structure de la fonction.
- Décision de scope : `Overview` utilise `customer.addresses?.find(a => a.is_default_shipping)` avec repli sur `is_default_billing` (déjà utilisé ailleurs dans le fichier) pour le teaser d'adresse par défaut. Si `npm run build` signale que `is_default_shipping` n'existe pas sur le type, retirer ce premier `find` et ne garder que le repli sur `is_default_billing`.
- Décision de scope : les statistiques "Profil complété à X%" et "N adresses enregistrées" de l'ancien `Overview` sont retirées : la spec ne les mentionne pas et son contenu explicite (carte d'accueil, commandes récentes, teaser adresse) les remplace entièrement.
- Décision de scope : le contenu de `Overview` (carte d'accueil, commandes, teaser adresse) devient visible à toutes les largeurs, alors qu'il était auparavant masqué sur mobile (`hidden small:block`). Seule la barre de navigation latérale reste desktop uniquement (§ Compte : "Navigation latérale (desktop uniquement)"), conformément au principe mobile-first du reste de la refonte.
- Traduction : ce plan traduit en français l'intégralité des textes de `Login`, `Register` et `AccountNav` (actuellement en anglais), pour rester cohérent avec le reste du storefront déjà traduit par les plans précédents et avec `ForgotPassword`, déjà en français dans le code actuel.

---

## File Structure

- **Modify** `apps/storefront/src/modules/account/components/account-nav/index.tsx` : navigation desktop et mobile, traduite et retintée.
- **Modify** `apps/storefront/src/modules/account/templates/account-layout.tsx` : grille de page et carte "Des questions ?".
- **Modify** `apps/storefront/src/modules/account/components/order-card/index.tsx` : badge de statut sémantique, retintage.
- **Modify** `apps/storefront/src/modules/account/components/overview/index.tsx` : carte d'accueil violette, commandes récentes, teaser adresse.
- **Modify** `apps/storefront/src/modules/account/components/login/index.tsx`, `register/index.tsx`, `forgot-password/index.tsx` : cartes retintées, traduites.

---

## Task 1 : Restyler AccountNav (desktop et mobile)

**Files:**
- Modify: `apps/storefront/src/modules/account/components/account-nav/index.tsx`

**Interfaces:**
- Consumes : tokens `gm-*` (plan Fondation).
- Produces : aucune interface modifiée (`AccountNav` garde sa prop `customer`).

- [ ] **Step 1 : Remplacer le fichier entier**

Remplacer le fichier `apps/storefront/src/modules/account/components/account-nav/index.tsx` entier par :

```tsx
"use client"

import { ArrowRightOnRectangle } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { useParams, usePathname } from "next/navigation"

import { signout } from "@lib/data/customer"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import MapPin from "@modules/common/icons/map-pin"
import Package from "@modules/common/icons/package"
import User from "@modules/common/icons/user"

const AccountNav = ({
  customer,
}: {
  customer: HttpTypes.StoreCustomer | null
}) => {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => {
    await signout(countryCode)
  }

  return (
    <div>
      <div className="small:hidden" data-testid="mobile-account-nav">
        {route !== `/${countryCode}/account` ? (
          <LocalizedClientLink
            href="/account"
            className="flex items-center gap-x-2 text-sm font-semibold text-gm-ink py-2"
            data-testid="account-main-link"
          >
            <ChevronDown className="transform rotate-90" />
            <span>Compte</span>
          </LocalizedClientLink>
        ) : (
          <>
            <div className="font-display font-bold text-xl text-gm-ink mb-4 px-1">
              Bonjour {customer?.first_name}
            </div>
            <div className="text-sm text-gm-ink">
              <ul>
                <li>
                  <LocalizedClientLink
                    href="/account/orders"
                    className="flex items-center justify-between py-4 border-b border-gm-border px-1"
                    data-testid="orders-link"
                  >
                    <div className="flex items-center gap-x-2 text-gm-ink-muted">
                      <Package size={20} />
                      <span className="text-gm-ink">Commandes</span>
                    </div>
                    <ChevronDown className="transform -rotate-90 text-gm-ink-muted" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/addresses"
                    className="flex items-center justify-between py-4 border-b border-gm-border px-1"
                    data-testid="addresses-link"
                  >
                    <div className="flex items-center gap-x-2 text-gm-ink-muted">
                      <MapPin size={20} />
                      <span className="text-gm-ink">Adresses</span>
                    </div>
                    <ChevronDown className="transform -rotate-90 text-gm-ink-muted" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/profile"
                    className="flex items-center justify-between py-4 border-b border-gm-border px-1"
                    data-testid="profile-link"
                  >
                    <div className="flex items-center gap-x-2 text-gm-ink-muted">
                      <User size={20} />
                      <span className="text-gm-ink">Profil</span>
                    </div>
                    <ChevronDown className="transform -rotate-90 text-gm-ink-muted" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <button
                    type="button"
                    className="flex items-center justify-between py-4 w-full"
                    onClick={handleLogout}
                    data-testid="logout-button"
                  >
                    <div className="flex items-center gap-x-2 text-gm-terracotta font-semibold">
                      <ArrowRightOnRectangle />
                      <span>Déconnexion</span>
                    </div>
                  </button>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
      <div className="hidden small:block" data-testid="account-nav">
        <div className="rounded-2xl border border-gm-border bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gm-ink-muted px-3 pb-3">
            Mon compte
          </h3>
          <ul className="flex flex-col gap-y-1">
            <li>
              <AccountNavLink href="/account" route={route!} data-testid="overview-link">
                Vue d&apos;ensemble
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink href="/account/orders" route={route!} data-testid="orders-link">
                Commandes
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink href="/account/addresses" route={route!} data-testid="addresses-link">
                Adresses
              </AccountNavLink>
            </li>
            <li>
              <AccountNavLink href="/account/profile" route={route!} data-testid="profile-link">
                Profil
              </AccountNavLink>
            </li>
            <li className="mt-2 pt-2 border-t border-gm-border">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold text-gm-terracotta hover:bg-gm-ivoire-2 transition-colors"
                data-testid="logout-button"
              >
                Déconnexion
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

type AccountNavLinkProps = {
  href: string
  route: string
  children: React.ReactNode
  "data-testid"?: string
}

const AccountNavLink = ({
  href,
  route,
  children,
  "data-testid": dataTestId,
}: AccountNavLinkProps) => {
  const { countryCode }: { countryCode: string } = useParams()

  const active = route.split(countryCode)[1] === href
  return (
    <LocalizedClientLink
      href={href}
      className={clx(
        "block rounded-lg px-3 py-2.5 text-sm font-medium text-gm-ink-muted hover:bg-gm-ivoire-2 hover:text-gm-ink transition-colors",
        { "bg-gm-ivoire-2 text-gm-violet font-semibold": active }
      )}
      data-testid={dataTestId}
    >
      {children}
    </LocalizedClientLink>
  )
}

export default AccountNav
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Vérification visuelle**

Run: `npm run storefront:dev`, se connecter puis ouvrir
`http://localhost:8000/fr/account`. A largeur desktop (≥1024px) : carte de
navigation blanche à gauche, lien actif en fond ivoire et texte violet,
"Déconnexion" en terracotta en bas. A largeur mobile (~375px) sur
`/account` : salutation "Bonjour Prénom" puis liste Commandes/Adresses/Profil
avec icônes, "Déconnexion" en terracotta.

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/account/components/account-nav/index.tsx
git commit -m "Restyle la navigation du compte, traduite en français"
```

---

## Task 2 : Restyler AccountLayout

**Files:**
- Modify: `apps/storefront/src/modules/account/templates/account-layout.tsx`

**Interfaces:**
- Consumes : `AccountNav` restylée (Task 1), `InteractiveLink` retintée (plan Panier/Paiement).
- Produces : aucune interface modifiée (`AccountLayout` garde ses props `customer`/`children`).

- [ ] **Step 1 : Remplacer le fichier entier**

Remplacer le fichier `apps/storefront/src/modules/account/templates/account-layout.tsx` entier par :

```tsx
import React from "react"

import UnderlineLink from "@modules/common/components/interactive-link"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({ customer, children }) => {
  return (
    <div className="flex-1 py-8 small:py-12" data-testid="account-page">
      <div className="content-container max-w-5xl mx-auto flex flex-col gap-y-8">
        <div className="grid grid-cols-1 small:grid-cols-[240px_1fr] gap-8 items-start">
          <div>{customer && <AccountNav customer={customer} />}</div>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
        <div className="rounded-2xl border border-gm-border bg-white p-6 flex flex-col small:flex-row items-start small:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-gm-ink mb-1">
              Des questions ?
            </h3>
            <span className="text-sm text-gm-ink-muted">
              Retrouvez les réponses aux questions fréquentes sur notre page service client.
            </span>
          </div>
          <UnderlineLink href="/customer-service">Service client</UnderlineLink>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Commit**

```bash
git add apps/storefront/src/modules/account/templates/account-layout.tsx
git commit -m "Restyle la mise en page du compte et la carte service client"
```

---

## Task 3 : Restyler OrderCard et ajouter le badge de statut

**Files:**
- Modify: `apps/storefront/src/modules/account/components/order-card/index.tsx`

**Interfaces:**
- Consumes : `Badge` avec les couleurs `green`/`gold`/`amethyst` (plan Fondation), `Thumbnail` carrée (plan Accueil/Catalogue/Produit).
- Produces : `OrderCard` garde sa prop `order`. Consommé par Task 4 (`Overview`) en plus de son usage existant sur la page "Commandes" (`order-overview/index.tsx`, non modifié).

- [ ] **Step 1 : Remplacer le fichier entier**

Remplacer le fichier `apps/storefront/src/modules/account/components/order-card/index.tsx` entier par :

```tsx
import { Badge, Button } from "@modules/common/components/ui"
import { useMemo } from "react"

import Thumbnail from "@modules/products/components/thumbnail"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type OrderCardProps = {
  order: HttpTypes.StoreOrder
}

type OrderStatus = {
  label: string
  color: "green" | "gold" | "amethyst"
}

const getOrderStatus = (order: HttpTypes.StoreOrder): OrderStatus => {
  if (order.fulfillment_status === "delivered") {
    return { label: "Livrée", color: "green" }
  }

  if (order.payment_status === "captured" || order.payment_status === "partially_captured") {
    return { label: "Paiement reçu", color: "amethyst" }
  }

  return { label: "En cours", color: "gold" }
}

const OrderCard = ({ order }: OrderCardProps) => {
  const numberOfLines = useMemo(() => {
    return (
      order.items?.reduce((acc, item) => {
        return acc + item.quantity
      }, 0) ?? 0
    )
  }, [order])

  const numberOfProducts = useMemo(() => {
    return order.items?.length ?? 0
  }, [order])

  const status = getOrderStatus(order)

  return (
    <div
      className="rounded-2xl border border-gm-border bg-white p-4 small:p-5 flex flex-col gap-y-4"
      data-testid="order-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-gm-ink" data-testid="order-display-id">
            #{order.display_id}
          </span>
          <Badge color={status.color}>{status.label}</Badge>
        </div>
        <span className="font-display font-bold text-gm-ink" data-testid="order-amount">
          {convertToLocale({ amount: order.total, currency_code: order.currency_code })}
        </span>
      </div>
      <div className="text-sm text-gm-ink-muted">
        <span data-testid="order-created-at">{new Date(order.created_at).toDateString()}</span>
        <span className="mx-1.5">-</span>
        <span>{`${numberOfLines} ${numberOfLines > 1 ? "articles" : "article"}`}</span>
      </div>
      <div className="grid grid-cols-3 small:grid-cols-4 gap-3">
        {order.items?.slice(0, 3).map((i) => {
          return (
            <div key={i.id} className="flex flex-col gap-y-1.5" data-testid="order-item">
              <Thumbnail thumbnail={i.thumbnail} images={[]} size="square" />
              <span className="text-xs text-gm-ink-muted line-clamp-1" data-testid="item-title">
                {i.title} <span className="text-gm-ink" data-testid="item-quantity">x{i.quantity}</span>
              </span>
            </div>
          )
        })}
        {numberOfProducts > 3 && (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-gm-ivoire-2 aspect-square">
            <span className="text-sm font-semibold text-gm-ink-muted">+{numberOfProducts - 3}</span>
          </div>
        )}
      </div>
      <LocalizedClientLink href={`/account/orders/details/${order.id}`}>
        <Button data-testid="order-details-link" variant="secondary" size="small" className="w-full">
          Voir les détails
        </Button>
      </LocalizedClientLink>
    </div>
  )
}

export default OrderCard
```

Note : le seuil d'affichage de la vignette "+N" passe de
`numberOfProducts > 4` (bug existant : avec exactement 4 produits, le 4e
disparaissait sans indication puisque seuls 3 sont affichés) à
`numberOfProducts > 3`, cohérent avec le `slice(0, 3)` juste au-dessus.

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi. Si `fulfillment_status` ou `payment_status` ou l'une
des valeurs de chaîne comparées n'existe pas sur `HttpTypes.StoreOrder`,
TypeScript le signale ici : ajuster la comparaison sans changer la structure
de `getOrderStatus`.

- [ ] **Step 3 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/account/orders`
(au moins une commande passée doit exister). Chaque commande s'affiché en
carte avec numéro, badge de statut coloré, montant, date, vignettes produit
carrées, et bouton "Voir les détails".

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/account/components/order-card/index.tsx
git commit -m "Restyle la carte de commande et ajoute le badge de statut semantique"
```

---

## Task 4 : Restyler Overview (carte d'accueil, commandes récentes, teaser adresse)

**Files:**
- Modify: `apps/storefront/src/modules/account/components/overview/index.tsx`

**Interfaces:**
- Consumes : `OrderCard` restylée (Task 3), `Heading` (plan Fondation).
- Produces : aucune interface modifiée (`Overview` garde ses props `customer`/`orders`).

- [ ] **Step 1 : Remplacer le fichier entier**

Remplacer le fichier `apps/storefront/src/modules/account/components/overview/index.tsx` entier par :

```tsx
import { Heading } from "@modules/common/components/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderCard from "@modules/account/components/order-card"
import { HttpTypes } from "@medusajs/types"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  orders: HttpTypes.StoreOrder[] | null
}

const Overview = ({ customer, orders }: OverviewProps) => {
  const defaultAddress =
    customer?.addresses?.find((a) => a.is_default_shipping) ??
    customer?.addresses?.find((a) => a.is_default_billing)

  return (
    <div className="flex flex-col gap-y-8" data-testid="overview-page-wrapper">
      <div className="rounded-2xl bg-gm-violet p-6 small:p-8 flex flex-col small:flex-row small:items-center small:justify-between gap-4">
        <div>
          <Heading level="h2" className="text-gm-on-violet text-2xl">
            Bonjour {customer?.first_name}
          </Heading>
          <p
            className="text-gm-on-violet-muted text-sm mt-1"
            data-testid="customer-email"
            data-value={customer?.email}
          >
            Connecté en tant que {customer?.email}
          </p>
        </div>
        <LocalizedClientLink
          href="/account/profile"
          className="shrink-0 text-sm font-semibold text-gm-on-violet border border-white/40 rounded-full px-4 py-2 hover:bg-white/10 transition-colors"
        >
          Voir mon profil
        </LocalizedClientLink>
      </div>

      <div>
        <Heading level="h3" className="text-lg mb-4">
          Commandes récentes
        </Heading>
        <ul className="flex flex-col gap-y-4" data-testid="orders-wrapper">
          {orders && orders.length > 0 ? (
            orders.slice(0, 5).map((order) => (
              <li key={order.id} data-testid="order-wrapper" data-value={order.id}>
                <OrderCard order={order} />
              </li>
            ))
          ) : (
            <li>
              <p className="text-sm text-gm-ink-muted" data-testid="no-orders-message">
                Aucune commande pour le moment.
              </p>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-gm-border bg-white p-5 flex items-center justify-between gap-4">
        <div>
          <Heading level="h3" className="text-base">
            Adresse par défaut
          </Heading>
          {defaultAddress ? (
            <p className="text-sm text-gm-ink-muted mt-1">
              {defaultAddress.address_1}, {defaultAddress.city}
            </p>
          ) : (
            <p className="text-sm text-gm-ink-muted mt-1">Aucune adresse enregistrée.</p>
          )}
        </div>
        <LocalizedClientLink
          href="/account/addresses"
          className="shrink-0 text-sm font-semibold text-gm-amethyst hover:underline"
        >
          Gérer mes adresses
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default Overview
```

- [ ] **Step 2 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 3 : Vérification visuelle**

Run: `npm run storefront:dev`, ouvrir `http://localhost:8000/fr/account`
connecté. Carte violette en haut avec salutation et lien "Voir mon profil",
liste de commandes récentes en dessous (carte de Task 3), teaser d'adresse
par défaut en bas. Vérifier que ce contenu reste visible en réduisant la
largeur à ~375px (plus de `hidden small:block`).

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/src/modules/account/components/overview/index.tsx
git commit -m "Restyle la vue d'ensemble du compte avec la carte d'accueil et le teaser d'adresse"
```

---

## Task 5 : Restyler Login, Register et ForgotPassword

**Files:**
- Modify: `apps/storefront/src/modules/account/components/login/index.tsx`
- Modify: `apps/storefront/src/modules/account/components/register/index.tsx`
- Modify: `apps/storefront/src/modules/account/components/forgot-password/index.tsx`

**Interfaces:**
- Consumes : `Input`, `SubmitButton` déjà retintés (plan Panier/Paiement, Task 2), `Heading` (plan Fondation).
- Produces : aucune interface modifiée sur les trois composants.

- [ ] **Step 1 : Restyler `Login`**

Remplacer le fichier `apps/storefront/src/modules/account/components/login/index.tsx` entier par :

```tsx
import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { Heading } from "@modules/common/components/ui"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(login, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="login-page"
    >
      <Heading level="h1" className="text-xl mb-2">
        Content de vous revoir
      </Heading>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Connectez-vous pour profiter d&apos;une meilleure expérience d&apos;achat.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-sm text-gm-ink bg-gm-ivoire-2 border border-gm-border rounded-lg p-4"
          data-testid="login-verification-message"
        >
          Nous avons envoyé un lien de vérification à{" "}
          <strong>{message.email}</strong>. Vérifiez votre email, puis
          connectez-vous.
        </div>
      )}
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Entrez une adresse email valide."
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
            className="text-sm text-gm-amethyst hover:underline"
            data-testid="forgot-password-button"
          >
            Mot de passe oublié ?
          </button>
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="login-error-message"
        />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Se connecter
        </SubmitButton>
      </form>
      <span className="text-center text-sm text-gm-ink-muted mt-6">
        Pas encore membre ?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="text-gm-amethyst font-semibold hover:underline"
          data-testid="register-button"
        >
          Rejoignez-nous
        </button>
        .
      </span>
    </div>
  )
}

export default Login
```

- [ ] **Step 2 : Restyler `Register`**

Remplacer le fichier `apps/storefront/src/modules/account/components/register/index.tsx` entier par :

```tsx
"use client"

import { useActionState } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { signup } from "@lib/data/customer"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(signup, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="register-page"
    >
      <Heading level="h1" className="text-xl mb-2 text-center">
        Créer un compte Golden Market
      </Heading>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Créez votre profil pour profiter d&apos;une meilleure expérience
        d&apos;achat.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-sm text-gm-ink bg-gm-ivoire-2 border border-gm-border rounded-lg p-4"
          data-testid="register-verification-message"
        >
          Nous avons envoyé un lien de vérification à{" "}
          <strong>{message.email}</strong>. Vérifiez votre boîte de
          réception, puis connectez-vous.
        </div>
      )}
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Prénom"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="Nom"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="Téléphone"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label="Mot de passe"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="register-error"
        />
        <span className="text-center text-sm text-gm-ink-muted mt-6">
          En créant un compte, vous acceptez la{" "}
          <LocalizedClientLink
            href="/content/privacy-policy"
            className="text-gm-amethyst hover:underline"
          >
            politique de confidentialité
          </LocalizedClientLink>{" "}
          et les{" "}
          <LocalizedClientLink
            href="/content/terms-of-use"
            className="text-gm-amethyst hover:underline"
          >
            conditions d&apos;utilisation
          </LocalizedClientLink>{" "}
          de Golden Market.
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          Créer mon compte
        </SubmitButton>
      </form>
      <span className="text-center text-sm text-gm-ink-muted mt-6">
        Déjà membre ?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="text-gm-amethyst font-semibold hover:underline"
        >
          Se connecter
        </button>
        .
      </span>
    </div>
  )
}

export default Register
```

- [ ] **Step 3 : Restyler `ForgotPassword`**

Dans `apps/storefront/src/modules/account/components/forgot-password/index.tsx`,
remplacer la classe du conteneur racine :

```tsx
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="forgot-password-page"
    >
```

Par :

```tsx
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="forgot-password-page"
    >
```

Puis remplacer le titre :

```tsx
      <h1 className="text-large-semi uppercase mb-6">Mot de passe oublié</h1>
```

Par :

```tsx
      <h1 className="font-display font-bold text-xl text-gm-ink mb-2">Mot de passe oublié</h1>
```

Puis remplacer le paragraphe d'introduction :

```tsx
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Indiquez votre email, nous vous enverrons un lien pour réinitialiser
        votre mot de passe.
      </p>
```

Par :

```tsx
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Indiquez votre email, nous vous enverrons un lien pour réinitialiser
        votre mot de passe.
      </p>
```

Puis remplacer l'encart de succès :

```tsx
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="forgot-password-success-message"
        >
```

Par :

```tsx
        <div
          className="w-full mb-6 text-center text-sm text-gm-ink bg-gm-ivoire-2 border border-gm-border rounded-lg p-4"
          data-testid="forgot-password-success-message"
        >
```

Puis remplacer le lien de retour :

```tsx
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
          data-testid="back-to-sign-in-button"
        >
          Retour à la connexion
        </button>
      </span>
```

Par :

```tsx
      <span className="text-center text-sm text-gm-ink-muted mt-6">
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="text-gm-amethyst font-semibold hover:underline"
          data-testid="back-to-sign-in-button"
        >
          Retour à la connexion
        </button>
      </span>
```

Le reste du fichier (logique `requestPasswordReset`, `Input`, `SubmitButton`)
ne change pas : il consomme déjà `Input`/`SubmitButton` retintés par le plan
Panier/Paiement.

- [ ] **Step 4 : Vérifier qu'aucun tiret cadratin ne subsiste**

Run: `grep -rn "—" apps/storefront/src/modules/account/components/login apps/storefront/src/modules/account/components/register apps/storefront/src/modules/account/components/forgot-password`
Expected: aucune sortie.

- [ ] **Step 5 : Vérifier que le build passe**

Run: `cd apps/storefront && npm run build`
Expected: build réussi.

- [ ] **Step 6 : Vérification visuelle**

Run: `npm run storefront:dev`, se déconnecter puis ouvrir
`http://localhost:8000/fr/account`. Le formulaire de connexion s'affiché en
carte blanche avec bordure ivoire, champs retintés, bouton "Se connecter"
plein doré. Cliquer sur "Mot de passe oublié ?" puis "Rejoignez-nous" pour
vérifier que les trois écrans (connexion, inscription, mot de passe oublié)
partagent le même habillage de carte.

- [ ] **Step 7 : Commit**

```bash
git add apps/storefront/src/modules/account/components/login/index.tsx apps/storefront/src/modules/account/components/register/index.tsx apps/storefront/src/modules/account/components/forgot-password/index.tsx
git commit -m "Restyle et traduit en francais les ecrans de connexion inscription et mot de passe oublie"
```

---

## Task 6 : Vérification finale

**Files:**
- Aucun fichier modifié (vérification uniquement).

- [ ] **Step 1 : Vérifier qu'aucun tiret cadratin ne subsiste sur tout le périmètre de ce plan**

Run:

```bash
grep -rn "—" apps/storefront/src/modules/account
```

Expected: aucune sortie.

- [ ] **Step 2 : Vérifier que le build et le lint passent**

Run: `cd apps/storefront && npm run build && npm run lint`
Expected: les deux commandes réussissent sans erreur.

- [ ] **Step 3 : Verification visuelle complète du parcours Compte**

Run: `npm run storefront:dev`. Parcourir, aux largeurs ~375px, ~768px et
≥1280px :
- Connexion, inscription, mot de passe oublié (déconnecté).
- Vue d'ensemble (carte violette, commandes récentes avec badges de statut,
  teaser adresse) une fois connecté, avec au moins une commande passée.
- Navigation vers Commandes, Adresses, Profil via la barre latérale
  desktop et via le menu mobile : vérifier que ces pages, bien que non
  retouchées par ce plan, restent lisibles et cohérentes grâce aux
  composants `Button`/`Input`/`Badge` déjà retintés (aucune régression
  visuelle attendue, juste un habillage moins abouti que les pages
  explicitement redessinées, cf. Global Constraints).
- Déconnexion via le bouton terracotta.

- [ ] **Step 4 : Commit**

Aucun commit si aucune correction n'a été nécessaire à cette étape. Si une
correction a été appliquée suite à la vérification, la committer avec un
message décrivant le correctif exact.

---

## Fin de plan

Après ces 6 tâches, les 6 pages de la spec (Accueil, Catalogue, Fiche
produit, Panier, Paiement, Compte) portent l'identité visuelle complète de
Golden Market. Les quatre plans d'implémentation (Fondation ; Accueil,
Catalogue, Fiche produit ; Panier, Paiement ; Compte) couvrent l'intégralité
du périmètre défini par
`docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`.
