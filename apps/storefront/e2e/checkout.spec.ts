import { expect, test } from "@playwright/test"

// Handle réel du catalogue Golden Market, produit à variante unique (pas de
// sélection Taille/Couleur à gérer) - voir apps/backend/src/scripts/
// import-catalog.ts. Région Burkina Faso : 3 moyens de paiement manuels
// (Orange Money, Moov Money, paiement à la réception à Ouagadougou - voir
// apps/backend/src/modules/{orange-money-manual,moov-money-manual,cash-on-delivery}.ts).
// Ce test couvre Orange Money ; les deux autres suivent le même flux.
//
// Doit rester un produit réellement en stock (manage_inventory activé pour
// tout le catalogue, voir activate-stock-tracking-old-catalog.ts) - l'ancien
// handle "diffuser-deau-de-cuisine" fait partie des 29 anciens produits
// intentionnellement en rupture (alignement staging/production, 2026-09-03),
// donc plus utilisable ici. Choisi parmi les produits récents réellement
// approvisionnés.
const REAL_PRODUCT_HANDLE = "roue-abdominale-automatique-avec-appui-coudes"

test.describe("Parcours d'achat complet (Orange Money)", () => {
  test("panier → livraison → Orange Money → commande confirmée", async ({ page }) => {
    const uniqueEmail = `playwright-${Date.now()}@golden-market.co`

    await test.step("Ajouter un produit réel au panier", async () => {
      await page.goto(`/bf/products/${REAL_PRODUCT_HANDLE}`)
      await page.getByTestId("add-product-button").click()
      // Le panier dérouant (cart-dropdown) s'ouvre automatiquement après ajout.
      await expect(page.getByTestId("cart-item").first()).toBeVisible()
    })

    await test.step("Aller au panier puis démarrer le checkout", async () => {
      await page.getByTestId("go-to-cart-button").click()
      await expect(page).toHaveURL(/\/bf\/cart/)
      await page.getByTestId("checkout-button").click()
      await expect(page).toHaveURL(/\/bf\/checkout/)
    })

    await test.step("Renseigner l'adresse de livraison", async () => {
      await page.getByTestId("shipping-email-input").fill(uniqueEmail)
      await page.getByTestId("shipping-first-name-input").fill("Playwright")
      await page.getByTestId("shipping-last-name-input").fill("Test")
      await page.getByTestId("shipping-address-input").fill("Rue de test")
      await page.getByTestId("shipping-city-input").fill("Ouagadougou")
      await page.getByTestId("shipping-phone-input").fill("+22670000000")
      // Champs Entreprise/Code postal/Pays retirés du formulaire (palier 3 du
      // backlog 2026-09-02) ; une seule option de livraison existe pour la
      // région BF ("Livraison — à convenir avec le marchand", 0 FCFA).
      await page.getByTestId("submit-address-button").click()
    })

    await test.step("Choisir l'unique option de livraison", async () => {
      await expect(page.getByTestId("delivery-options-container")).toBeVisible()
      await page.getByTestId("delivery-option-radio").first().click()
      await page.getByTestId("submit-delivery-option-button").click()
    })

    await test.step("Choisir Orange Money et voir les instructions de paiement", async () => {
      // Sélecteur précis : la page de paiement affiche aussi le footer
      // complet, qui contient d'autres mentions de moyens de paiement.
      await page
        .getByTestId("checkout-container")
        .getByText("Orange Money", { exact: true })
        .click()
      await expect(page.getByTestId("mobile-money-instructions")).toBeVisible()
      // Le numéro Orange Money diffère par environnement (ORANGE_MONEY_NUMBER
      // dans apps/backend/.env) - on vérifie le nom du titulaire, constant
      // partout, plutôt qu'une valeur codée en dur pour un seul environnement.
      await expect(page.getByTestId("mobile-money-instructions")).toContainText(
        "Golden Market"
      )
      await page.getByTestId("submit-payment-button").click()
    })

    await test.step("Confirmer la commande", async () => {
      await page.getByTestId("submit-order-button").click()
      await expect(page).toHaveURL(/\/bf\/order\/.+\/confirmed/, { timeout: 15_000 })
    })

    await test.step("Vérifier la page de confirmation", async () => {
      await expect(page.getByTestId("order-complete-container")).toBeVisible()
      await expect(page.getByTestId("order-id")).toBeVisible()
      await expect(page.getByTestId("order-email")).toContainText(uniqueEmail)
    })
  })
})
