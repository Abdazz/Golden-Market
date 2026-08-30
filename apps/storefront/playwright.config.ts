import { defineConfig, devices } from "@playwright/test"

/**
 * Cible le storefront déjà démarré (voir AGENTS.md pour lancer la stack de
 * dev : Postgres/Redis Docker + `npm run backend:dev` + `npm run
 * storefront:dev`, ou les ports alternatifs documentés en cas de conflit).
 * Pas de `webServer` ici : la stack a besoin du backend Medusa + Postgres/
 * Redis en plus du serveur Next.js, hors du périmètre que Playwright peut
 * démarrer seul.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: {
    // Contre un environnement distant (staging/production réels), chaque
    // requête réseau (création panier, ligne de panier...) prend 1-2s de
    // plus qu'en local (latence internet réelle vs localhost) - constaté en
    // testant contre https://staging.golden-market.co, 5s (défaut Playwright)
    // était trop court et faisait échouer des assertions sur des actions
    // pourtant réussies côté backend (vérifié dans les logs : 200 partout).
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
