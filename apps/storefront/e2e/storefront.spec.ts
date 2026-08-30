import { expect, test } from "@playwright/test"

// Handle réel du catalogue Golden Market (29 produits importés, région
// Burkina Faso). Voir apps/backend/src/scripts/import-catalog.ts.
const REAL_PRODUCT_HANDLE = "diffuser-deau-de-cuisine"

test.describe("Navigation storefront", () => {
  test("la racine redirige vers la région Burkina Faso (/bf)", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/bf(\/)?$/)
  })

  test("la page d'accueil BF affiche le vrai contenu Golden Market", async ({ page }) => {
    await page.goto("/bf")
    await expect(page).toHaveTitle(/Golden Market/)
    // Pas de branding Medusa résiduel (retiré en Phase 1.5).
    await expect(page.getByText(/medusa/i)).toHaveCount(0)
  })

  test("une fiche produit réelle affiche un prix en XOF", async ({ page }) => {
    await page.goto(`/bf/products/${REAL_PRODUCT_HANDLE}`)
    await expect(page.getByTestId("product-title").first()).toBeVisible()
    await expect(page.getByTestId("product-price")).toContainText("CFA")
  })
})

test.describe("Header (conformité maquette)", () => {
  test("desktop : logo à gauche, navigation générique visible, pas de bouton Menu", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto("/bf")
    await expect(page.getByTestId("nav-store-link")).toBeVisible()
    await expect(page.getByTestId("nav-menu-button")).toBeHidden()
    await expect(page.getByTestId("nav-account-link")).toBeVisible()
    await expect(page.getByTestId("nav-cart-link")).toBeVisible()
    const desktopLinks = page.getByTestId("nav-desktop-link")
    await expect(desktopLinks).toHaveCount(4)
    await expect(desktopLinks).toContainText([
      "Accueil",
      "Catégories",
      "Promotions",
      "Suivre ma commande",
    ])
  })

  test("mobile : bouton Menu avec icône visible, navigation desktop masquée", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/bf")
    await expect(page.getByTestId("nav-menu-button")).toBeVisible()
    await expect(page.getByTestId("nav-desktop-link").first()).toBeHidden()
    await expect(page.getByTestId("nav-account-link")).toBeVisible()
    await expect(page.getByTestId("nav-cart-link")).toBeVisible()
  })
})

test.describe("Pages légales", () => {
  test("le lien 'Politique de confidentialité' du footer mène à la bonne page", async ({
    page,
  }) => {
    await page.goto("/bf")
    await page.getByTestId("footer-privacy-policy-link").click()
    await expect(page).toHaveURL(/\/bf\/politique-de-confidentialite$/)
    await expect(page.getByTestId("privacy-policy-content")).toBeVisible()
  })

  test("le lien 'Conditions générales de vente' du footer mène à la bonne page", async ({
    page,
  }) => {
    await page.goto("/bf")
    await page.getByTestId("footer-terms-link").click()
    await expect(page).toHaveURL(/\/bf\/conditions-generales$/)
    await expect(page.getByTestId("terms-of-service-content")).toBeVisible()
  })
})
