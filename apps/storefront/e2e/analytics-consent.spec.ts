import { expect, test } from "@playwright/test"

// Ces tests vérifient le comportement du bandeau de consentement lui-même,
// pas Matomo : NEXT_PUBLIC_MATOMO_URL est absent en dev/staging (tracking
// production uniquement, voir docker-compose.prod.yml), donc le bandeau ne
// s'affiche jamais dans cet environnement de test - ce test documente et
// verrouille ce comportement plutôt que de simuler une variable d'env qui
// n'existe nulle part hors production.
test.describe("Bandeau de consentement analytics", () => {
  test("ne s'affiche pas quand Matomo n'est pas configuré (dev/staging)", async ({ page }) => {
    await page.goto("/bf")
    await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0)
  })
})
