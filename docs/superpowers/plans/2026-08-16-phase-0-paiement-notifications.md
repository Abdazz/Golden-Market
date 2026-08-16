# Phase 0 — Paiement manuel & notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Débloquer le paiement manuel Orange Money (bug de compilation, instructions sur la confirmation de commande, notification marchand via n8n) et mettre en place l'infrastructure d'emails transactionnels (confirmation de commande, réinitialisation de mot de passe) qui manque actuellement.

**Architecture:** Backend Medusa v2 (subscribers + module de paiement custom + nouveau module de notification Resend) ; storefront Next.js (App Router, Server Actions via `useActionState`, SDK Medusa `sdk.auth`). Chaque sous-système (paiement, webhook marchand, email) reste un fichier/module isolé, testé indépendamment.

**Tech Stack:** Medusa v2.18, Next.js 15 / React 19, Jest + @swc/jest (backend uniquement — le storefront n'a pas de suite de tests), package npm `resend`.

**Spec:** `ROADMAP.md` (racine du dépôt), section "Phase 0 — Débloquer le paiement manuel Orange Money", complétée pendant le brainstorming par la décision d'inclure le flux complet de réinitialisation de mot de passe (page storefront manquante + email).

## Global Constraints

- Pas de point-virgule, guillemets doubles, indentation 2 espaces (backend et storefront) — `AGENTS.md`.
- Fichiers en kebab-case, types/classes en PascalCase, fonctions/variables en camelCase — `AGENTS.md`.
- Commentaires et messages de commit en français — `ARCHITECTURE.md`, section "Conventions Golden Market".
- Nouvelle dépendance backend : `cd apps/backend && npm install <pkg>`, jamais à la racine — `AGENTS.md`.
- Ne jamais désactiver une règle ESLint `@medusajs/*` pour faire passer le lint — `AGENTS.md`.
- `.env` / `.env.local` ne sont jamais commités ; documenter toute nouvelle variable dans `apps/backend/.env.template` — `AGENTS.md`.
- Aucun modèle de données custom n'est touché dans ce plan (le provider de paiement et le provider de notification n'ont pas de modèle) : pas de `medusa db:generate` / `db:migrate` nécessaire.
- Toutes les nouvelles pages/composants storefront créés dans ce plan sont rédigés en français, par cohérence avec le flux de paiement Orange Money déjà en français (`apps/storefront/src/modules/checkout/components/payment/index.tsx`). Les composants existants du starter (`Login`, `Register`) restent en anglais tels quels — les retoucher intégralement est hors périmètre.

---

## Task 1: Corriger le bug de double `export default` dans le module de paiement

**Files:**
- Modify: `apps/backend/src/modules/orange-money-manual.ts:45` (et non ligne 121 — un seul `export default` doit rester)
- Test: `apps/backend/src/modules/__tests__/orange-money-manual.unit.spec.ts`

**Interfaces:**
- Produces: `OrangeMoneyManualService` (export nommé) — utilisé uniquement en interne par ce fichier et par le test.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/__tests__/orange-money-manual.unit.spec.ts
import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { OrangeMoneyManualService } from "../orange-money-manual"

describe("OrangeMoneyManualService", () => {
  const container = {}
  const options = {
    phone_number: "+22670000000",
    account_name: "Golden Market",
  }

  it("initiates a payment session with the transfer instructions", async () => {
    const service = new OrangeMoneyManualService(container, options)

    const result = await service.initiatePayment({} as any)

    expect(typeof result.id).toBe("string")
    expect(result.data).toMatchObject({
      provider: "orange-money-manual",
      phone_number: "+22670000000",
      account_name: "Golden Market",
    })
  })

  it("authorizes the payment session immediately", async () => {
    const service = new OrangeMoneyManualService(container, options)

    const result = await service.authorizePayment({} as any)

    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/modules/__tests__/orange-money-manual.unit.spec.ts`
Expected: FAIL — soit une erreur de parsing (deux `export default` dans `orange-money-manual.ts`), soit `OrangeMoneyManualService` est `undefined` (le fichier n'exporte actuellement pas de membre nommé de ce nom).

- [ ] **Step 3: Fix the export bug**

Dans `apps/backend/src/modules/orange-money-manual.ts`, ligne 45, remplacer :

```typescript
export default class OrangeMoneyManualService extends AbstractPaymentProvider<OrangeMoneyManualOptions> {
```

par :

```typescript
export class OrangeMoneyManualService extends AbstractPaymentProvider<OrangeMoneyManualOptions> {
```

Ne rien changer d'autre dans le fichier — la ligne 121 (`export default ModuleProvider(...)`) reste l'unique export par défaut.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/modules/__tests__/orange-money-manual.unit.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/backend
git add src/modules/orange-money-manual.ts src/modules/__tests__/orange-money-manual.unit.spec.ts
git commit -m "$(cat <<'EOF'
Corrige le double export par défaut du provider Orange Money

Le fichier exportait à la fois la classe du service et le
ModuleProvider en export par défaut, ce qui empêchait la compilation.
La classe devient un export nommé.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Notification marchand — webhook n8n sur `order.placed`

**Files:**
- Modify: `apps/backend/src/subscribers/order-placed.ts`
- Modify: `apps/backend/.env.template` (ajouter `N8N_ORDER_WEBHOOK_URL`)
- Test: `apps/backend/src/subscribers/__tests__/order-placed.unit.spec.ts`

**Interfaces:**
- Consumes: `process.env.N8N_ORDER_WEBHOOK_URL` (optionnel — si absent, le subscriber logue et ne fait aucun appel réseau).
- Produces: aucune interface consommée ailleurs (subscriber terminal).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/subscribers/__tests__/order-placed.unit.spec.ts
import orderPlacedHandler from "../order-placed"

describe("orderPlacedHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const container = { resolve: jest.fn(() => logger) }
  const originalWebhookUrl = process.env.N8N_ORDER_WEBHOOK_URL

  afterEach(() => {
    jest.restoreAllMocks()
    process.env.N8N_ORDER_WEBHOOK_URL = originalWebhookUrl
  })

  it("posts the order id to the n8n webhook when configured", async () => {
    process.env.N8N_ORDER_WEBHOOK_URL = "https://n8n.example.com/webhook/order-placed"
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true } as Response)

    await orderPlacedHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.com/webhook/order-placed",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          order_id: "order_123",
          provider: "orange-money-manual",
        }),
      })
    )
  })

  it("skips the webhook call and logs when N8N_ORDER_WEBHOOK_URL is not set", async () => {
    delete process.env.N8N_ORDER_WEBHOOK_URL
    const fetchMock = jest.spyOn(global, "fetch")

    await orderPlacedHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("order_123"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/subscribers/__tests__/order-placed.unit.spec.ts`
Expected: FAIL — le subscriber actuel ne fait qu'un `logger.info` et n'appelle jamais `fetch`.

- [ ] **Step 3: Implement the webhook call**

Remplacer tout le contenu de `apps/backend/src/subscribers/order-placed.ts` par :

```typescript
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

/**
 * Notification marchand (webhook n8n -> WhatsApp) à chaque commande placée.
 */
export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const webhookUrl = process.env.N8N_ORDER_WEBHOOK_URL

  if (!webhookUrl) {
    logger.info(
      `Commande ${event.data.id} placée — N8N_ORDER_WEBHOOK_URL non configuré, notification marchand ignorée`
    )
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: event.data.id,
        provider: "orange-money-manual",
      }),
    })

    if (!response.ok) {
      throw new Error(`Webhook n8n a répondu ${response.status}`)
    }

    logger.info(`Commande ${event.data.id} placée — notification marchand envoyée à n8n`)
  } catch (error) {
    logger.error(
      `Commande ${event.data.id} placée — échec de la notification marchand via n8n`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
```

Ajouter dans `apps/backend/.env.template`, sous la section Orange Money existante :

```
# --- Notification marchand (webhook n8n -> WhatsApp) ---
N8N_ORDER_WEBHOOK_URL=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/subscribers/__tests__/order-placed.unit.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/backend
git add src/subscribers/order-placed.ts .env.template src/subscribers/__tests__/order-placed.unit.spec.ts
git commit -m "$(cat <<'EOF'
Notifie le marchand via un webhook n8n à chaque commande placée

Le payload exact attendu par le workflow n8n (côté dépôt
n8n_automation) reste à confirmer ; { order_id, provider } est le
minimum exploitable pour déclencher un message WhatsApp.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Note pour l'exécutant :** le contrat exact du webhook (champs attendus, authentification éventuelle) vit dans le dépôt `n8n_automation`, hors de ce dépôt. Vérifier auprès de ce workflow avant la mise en prod (Phase 5 du `ROADMAP.md`).

---

## Task 3: Instructions Orange Money sur la page de confirmation de commande

**Files:**
- Modify: `apps/storefront/src/modules/order/components/payment-details/index.tsx`

**Interfaces:**
- Consumes: `isOrangeMoney` (déjà exporté par `apps/storefront/src/lib/constants.tsx`), `payment.data` (shape `{ phone_number, account_name, note }` produite par `OrangeMoneyManualService.getInstructions()`, Task 1).

Pas de suite de tests côté storefront (`AGENTS.md`) — la vérification est manuelle (Step 3).

- [ ] **Step 1: Modify the component**

Remplacer le contenu de `apps/storefront/src/modules/order/components/payment-details/index.tsx` par :

```tsx
import { Container, Heading, Text } from "@modules/common/components/ui"

import { isOrangeMoney, isStripeLike, paymentInfoMap } from "@lib/constants"
import Divider from "@modules/common/components/divider"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const payment = order.payment_collections?.[0].payments?.[0]

  return (
    <div>
      <Heading level="h2" className="flex flex-row text-3xl-regular my-6">
        Payment
      </Heading>
      <div>
        {payment && (
          <div className="flex items-start gap-x-1 w-full">
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method"
              >
                {paymentInfoMap[payment.provider_id].title}
              </Text>
            </div>
            <div className="flex flex-col w-2/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment details
              </Text>
              <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                  {paymentInfoMap[payment.provider_id].icon}
                </Container>
                <Text data-testid="payment-amount">
                  {isStripeLike(payment.provider_id) && payment.data?.card_last4
                    ? `**** **** **** ${payment.data.card_last4}`
                    : isOrangeMoney(payment.provider_id)
                      ? `${convertToLocale({
                          amount: payment.amount,
                          currency_code: order.currency_code,
                        })} en attente de confirmation`
                      : `${convertToLocale({
                          amount: payment.amount,
                          currency_code: order.currency_code,
                        })} paid at ${new Date(
                          payment.created_at ?? ""
                        ).toLocaleString()}`}
                </Text>
              </div>
            </div>
          </div>
        )}

        {payment && isOrangeMoney(payment.provider_id) && (
          <div
            className="mt-4 rounded-lg border border-brand-primary p-4 bg-brand-secondary"
            data-testid="orange-money-instructions"
          >
            <Text className="txt-medium-plus text-ui-fg-base mb-2">
              Paiement par Orange Money
            </Text>
            <Text className="mb-2">
              Envoyez le montant total au numéro{" "}
              <span className="font-semibold">
                {String(payment.data?.phone_number ?? "")}
              </span>{" "}
              —{" "}
              <span className="font-semibold">
                {String(payment.data?.account_name ?? "Golden Market")}
              </span>
            </Text>
            <Text className="text-ui-fg-subtle">
              {String(payment.data?.note ?? "")}
            </Text>
          </div>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default PaymentDetails
```

Le texte générique « paid at … » est conservé pour les autres providers (Stripe/manual du starter) ; seul le cas Orange Money est traité différemment, car le paiement est « autorisé » (pas réellement encaissé) tant que le marchand n'a pas confirmé la réception du transfert.

- [ ] **Step 2: Verify types**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: pas de nouvelle erreur sur ce fichier (les erreurs préexistantes ailleurs, s'il y en a, ne sont pas dans le périmètre de cette tâche).

- [ ] **Step 3: Manual verification**

1. `docker compose up -d` (Postgres + Redis), puis `cd apps/backend && npm run dev` et `cd apps/storefront && npm run dev -- -p 8001`.
2. Passer une commande complète en choisissant Orange Money au paiement.
3. Sur la page de confirmation (`/[countryCode]/order/confirmed/[id]`), vérifier que le bloc "Paiement par Orange Money" affiche le numéro, le nom du compte et la note — pas seulement au checkout.

- [ ] **Step 4: Commit**

```bash
cd apps/storefront
git add src/modules/order/components/payment-details/index.tsx
git commit -m "$(cat <<'EOF'
Affiche les instructions Orange Money sur la confirmation de commande

Jusqu'ici ces instructions n'étaient visibles qu'au checkout ; le
client qui revient sur sa commande n'avait plus le numéro à qui
envoyer le paiement.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Module de notification Resend (emails transactionnels)

**Files:**
- Create: `apps/backend/src/modules/resend/templates.ts`
- Create: `apps/backend/src/modules/resend/service.ts`
- Create: `apps/backend/src/modules/resend/index.ts`
- Modify: `apps/backend/medusa-config.ts`
- Modify: `apps/backend/.env.template`
- Test: `apps/backend/src/modules/__tests__/resend-service.unit.spec.ts`

**Interfaces:**
- Produces: `emailTemplates` (`Record<string, EmailTemplate>`, clés `"order-placed"` et `"password-reset"`) — consommé par `service.ts` uniquement. Provider identifier Medusa : `"resend"`, channel `"email"`. Ces deux clés de template (`"order-placed"`, `"password-reset"`) sont l'interface que les Tasks 6 et 7 utilisent pour appeler `notificationModuleService.createNotifications(...)`.

- [ ] **Step 1: Install the `resend` package**

Run: `cd apps/backend && npm install resend`
Expected: `resend` ajouté à `apps/backend/package.json` (dependencies) et au lockfile racine.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/backend/src/modules/__tests__/resend-service.unit.spec.ts
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn() },
  })),
}))

import ResendNotificationProviderService from "../resend/service"

describe("ResendNotificationProviderService", () => {
  const logger = { info: jest.fn(), error: jest.fn() }

  const buildService = () =>
    new (ResendNotificationProviderService as any)(
      { logger },
      { api_key: "re_test", from: "commandes@golden-market.co" }
    )

  it("sends the order-placed template through the Resend client", async () => {
    const service = buildService()
    const sendMock = (service as any).resendClient.emails.send as jest.Mock
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null })

    const result = await service.send({
      to: "client@example.com",
      channel: "email",
      template: "order-placed",
      data: { display_id: 42, total: 15000, currency_code: "xof" },
    })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "commandes@golden-market.co",
        to: ["client@example.com"],
        subject: expect.stringContaining("#42"),
      })
    )
    expect(result).toEqual({ id: "email_123" })
  })

  it("logs and returns an empty result when the template is unknown", async () => {
    const service = buildService()

    const result = await service.send({
      to: "client@example.com",
      channel: "email",
      template: "unknown-template",
      data: {},
    })

    expect(result).toEqual({})
    expect(logger.error).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/modules/__tests__/resend-service.unit.spec.ts`
Expected: FAIL — `../resend/service` n'existe pas encore.

- [ ] **Step 4: Implement the templates**

```typescript
// apps/backend/src/modules/resend/templates.ts
export type EmailTemplate = (data: Record<string, unknown>) => {
  subject: string
  html: string
}

function formatAmount(amount: unknown, currencyCode: string) {
  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : Number(amount)

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(numericAmount)
}

const orderPlaced: EmailTemplate = (data) => {
  const displayId = data.display_id as number | string
  const total = formatAmount(data.total, data.currency_code as string)

  return {
    subject: `Golden Market — Confirmation de votre commande #${displayId}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="font-size: 20px;">Merci pour votre commande !</h1>
        <p>Votre commande <strong>#${displayId}</strong> d'un montant de <strong>${total}</strong> a bien été enregistrée.</p>
        <p>Elle est en attente de confirmation du paiement Orange Money. Golden Market vous contactera dès réception du paiement.</p>
      </div>
    `,
  }
}

const passwordReset: EmailTemplate = (data) => {
  const resetUrl = data.reset_url as string

  return {
    subject: "Golden Market — Réinitialisation de votre mot de passe",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="font-size: 20px;">Réinitialisation de mot de passe</h1>
        <p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe. Ce lien expire rapidement pour votre sécurité.</p>
        <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      </div>
    `,
  }
}

export const emailTemplates: Record<string, EmailTemplate> = {
  "order-placed": orderPlaced,
  "password-reset": passwordReset,
}
```

```typescript
// apps/backend/src/modules/resend/service.ts
import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend } from "resend"
import { emailTemplates, type EmailTemplate } from "./templates"

type ResendOptions = {
  api_key: string
  from: string
}

type InjectedDependencies = {
  logger: Logger
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend"

  private resendClient: Resend
  private options: ResendOptions
  private logger: Logger
  private templates: Record<string, EmailTemplate>

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
    this.templates = emailTemplates
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const template = this.templates[notification.template]

    if (!template) {
      this.logger.error(
        `Aucun template email pour "${notification.template}". Templates disponibles : ${Object.keys(this.templates).join(", ")}`
      )
      return {}
    }

    const { subject, html } = template(notification.data ?? {})

    const { data, error } = await this.resendClient.emails.send({
      from: this.options.from,
      to: [notification.to],
      subject,
      html,
    })

    if (error || !data) {
      this.logger.error(
        `Échec de l'envoi de l'email "${notification.template}" à ${notification.to}`,
        error ?? undefined
      )
      return {}
    }

    return { id: data.id }
  }
}

export default ResendNotificationProviderService
```

```typescript
// apps/backend/src/modules/resend/index.ts
import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ResendNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [ResendNotificationProviderService],
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/modules/__tests__/resend-service.unit.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Register the module in medusa-config.ts**

Dans `apps/backend/medusa-config.ts`, ajouter une clé `notification` dans l'objet `modules`, après `payment` :

```typescript
    notification: {
      resolve: '@medusajs/medusa/notification',
      options: {
        providers: [
          {
            resolve: './src/modules/resend',
            id: 'resend',
            options: {
              channels: ['email'],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM_EMAIL,
            },
          },
        ],
      },
    },
```

Ajouter dans `apps/backend/.env.template` :

```
# --- Emails transactionnels (Resend) ---
RESEND_API_KEY=
RESEND_FROM_EMAIL=commandes@golden-market.co
```

- [ ] **Step 7: Verify the backend still boots**

Run: `cd apps/backend && npm run dev`
Expected: le serveur démarre sans erreur de résolution de module (`Ctrl+C` pour arrêter une fois le démarrage confirmé). Si `RESEND_API_KEY` est vide en dev, le module se charge quand même (l'appel réel à l'API Resend échouera seulement au moment d'un envoi, géré par le `try/catch` — pas au démarrage).

- [ ] **Step 8: Commit**

```bash
cd apps/backend
git add src/modules/resend medusa-config.ts .env.template package.json package-lock.json ../../package-lock.json
git commit -m "$(cat <<'EOF'
Ajoute un provider de notification Resend pour les emails

Aucun provider de notification n'était configuré : la confirmation de
commande et la réinitialisation de mot de passe étaient silencieusement
cassées. Deux templates HTML simples (pas de dépendance react-email).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Adapter la liste de fichiers du `git add` au chemin réel du lockfile modifié par `npm install` (racine du monorepo pour un lockfile npm workspaces).

---

## Task 5: Email de confirmation de commande

**Files:**
- Create: `apps/backend/src/subscribers/order-placed-customer-email.ts`
- Test: `apps/backend/src/subscribers/__tests__/order-placed-customer-email.unit.spec.ts`

**Interfaces:**
- Consumes: `Modules.ORDER` (`retrieveOrder(id, config)` → `OrderDTO`), `Modules.NOTIFICATION` (`createNotifications`, Task 4), template `"order-placed"` avec `data: { display_id, total, currency_code }` (contrat exact attendu par `templates.ts`, Task 4).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/subscribers/__tests__/order-placed-customer-email.unit.spec.ts
import { Modules } from "@medusajs/framework/utils"
import orderPlacedCustomerEmailHandler from "../order-placed-customer-email"

describe("orderPlacedCustomerEmailHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const retrieveOrder = jest.fn()
  const createNotifications = jest.fn()

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === Modules.ORDER) return { retrieveOrder }
      if (key === Modules.NOTIFICATION) return { createNotifications }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("sends an order confirmation email when the order has an email", async () => {
    retrieveOrder.mockResolvedValue({
      id: "order_123",
      display_id: 42,
      email: "client@example.com",
      currency_code: "xof",
      total: 15000,
    })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).toHaveBeenCalledWith({
      to: "client@example.com",
      channel: "email",
      template: "order-placed",
      data: { display_id: 42, total: 15000, currency_code: "xof" },
    })
  })

  it("skips sending when the order has no email", async () => {
    retrieveOrder.mockResolvedValue({ id: "order_123", email: null })

    await orderPlacedCustomerEmailHandler({
      event: { data: { id: "order_123" } } as any,
      container: container as any,
    })

    expect(createNotifications).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/subscribers/__tests__/order-placed-customer-email.unit.spec.ts`
Expected: FAIL — le fichier `../order-placed-customer-email` n'existe pas.

- [ ] **Step 3: Implement the subscriber**

```typescript
// apps/backend/src/subscribers/order-placed-customer-email.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * Email de confirmation de commande au client (distinct du subscriber
 * order-placed.ts qui notifie le marchand via n8n).
 */
export default async function orderPlacedCustomerEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const orderModuleService = container.resolve(Modules.ORDER)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const order = await orderModuleService.retrieveOrder(event.data.id, {
    select: ["id", "display_id", "email", "currency_code", "total"],
  })

  if (!order.email) {
    logger.info(
      `Commande ${order.id} placée — pas d'email client, confirmation ignorée`
    )
    return
  }

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: "order-placed",
      data: {
        display_id: order.display_id,
        total: order.total,
        currency_code: order.currency_code,
      },
    })
  } catch (error) {
    logger.error(
      `Commande ${order.id} placée — échec de l'envoi de l'email de confirmation`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/subscribers/__tests__/order-placed-customer-email.unit.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/backend
git add src/subscribers/order-placed-customer-email.ts src/subscribers/__tests__/order-placed-customer-email.unit.spec.ts
git commit -m "$(cat <<'EOF'
Envoie un email de confirmation au client à chaque commande placée

Subscriber séparé de order-placed.ts (notification marchand n8n) :
une responsabilité par fichier.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Email de réinitialisation de mot de passe (backend)

**Files:**
- Create: `apps/backend/src/subscribers/auth-password-reset.ts`
- Modify: `apps/backend/.env.template`
- Test: `apps/backend/src/subscribers/__tests__/auth-password-reset.unit.spec.ts`

**Interfaces:**
- Consumes: événement `auth.password_reset` (`{ entity_id, token, actor_type }`), `Modules.NOTIFICATION` (Task 4), template `"password-reset"` avec `data: { reset_url }`.
- Produces: l'URL `${STOREFRONT_URL}/reset-password?token=...&email=...` — c'est l'URL que la Task 8 (page storefront) doit savoir lire.
- Ne traite que `actor_type === "customer"` (la réinitialisation du mot de passe admin reste hors périmètre de ce plan).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/subscribers/__tests__/auth-password-reset.unit.spec.ts
import { Modules } from "@medusajs/framework/utils"
import passwordResetHandler from "../auth-password-reset"

describe("passwordResetHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const createNotifications = jest.fn()

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === Modules.NOTIFICATION) return { createNotifications }
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalStorefrontUrl = process.env.STOREFRONT_URL

  afterEach(() => {
    jest.clearAllMocks()
    process.env.STOREFRONT_URL = originalStorefrontUrl
  })

  it("sends a password reset email for customers", async () => {
    process.env.STOREFRONT_URL = "https://boutique.golden-market.co"

    await passwordResetHandler({
      event: {
        data: {
          entity_id: "client@example.com",
          token: "reset-token-123",
          actor_type: "customer",
        },
      } as any,
      container: container as any,
    })

    expect(createNotifications).toHaveBeenCalledWith({
      to: "client@example.com",
      channel: "email",
      template: "password-reset",
      data: {
        reset_url:
          "https://boutique.golden-market.co/reset-password?token=reset-token-123&email=client%40example.com",
      },
    })
  })

  it("ignores password reset events for non-customer actors", async () => {
    await passwordResetHandler({
      event: {
        data: {
          entity_id: "admin@golden-market.co",
          token: "reset-token-456",
          actor_type: "user",
        },
      } as any,
      container: container as any,
    })

    expect(createNotifications).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/subscribers/__tests__/auth-password-reset.unit.spec.ts`
Expected: FAIL — le fichier `../auth-password-reset` n'existe pas.

- [ ] **Step 3: Implement the subscriber**

```typescript
// apps/backend/src/subscribers/auth-password-reset.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

type PasswordResetEventData = {
  entity_id: string
  token: string
  actor_type: string
}

/**
 * N'envoie l'email que pour les clients (actor_type "customer") : la
 * réinitialisation du mot de passe admin reste hors périmètre.
 */
export default async function passwordResetHandler({
  event,
  container,
}: SubscriberArgs<PasswordResetEventData>) {
  if (event.data.actor_type !== "customer") {
    return
  }

  const logger = container.resolve("logger")
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:8001"
  const email = event.data.entity_id

  try {
    await notificationModuleService.createNotifications({
      to: email,
      channel: "email",
      template: "password-reset",
      data: {
        reset_url: `${storefrontUrl}/reset-password?token=${event.data.token}&email=${encodeURIComponent(email)}`,
      },
    })
  } catch (error) {
    logger.error(
      `Échec de l'envoi de l'email de réinitialisation à ${email}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
```

Ajouter dans `apps/backend/.env.template` :

```
# --- URL publique du storefront (liens dans les emails) ---
STOREFRONT_URL=http://localhost:8001
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/subscribers/__tests__/auth-password-reset.unit.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/backend
git add src/subscribers/auth-password-reset.ts .env.template src/subscribers/__tests__/auth-password-reset.unit.spec.ts
git commit -m "$(cat <<'EOF'
Envoie un email de réinitialisation de mot de passe aux clients

Le middleware Next.js du storefront préfixe automatiquement les URL
sans code pays (redirection vers /{countryCode}/...), donc le lien
généré ici n'a pas besoin de connaître la région du client.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Server actions storefront pour la réinitialisation de mot de passe

**Files:**
- Modify: `apps/storefront/src/lib/data/customer.ts`

**Interfaces:**
- Produces: `requestPasswordReset(_currentState, formData)` → `RequestPasswordResetState`, `resetPassword(_currentState, formData)` → `ResetPasswordState`. Ces deux signatures sont celles attendues par `useActionState` dans les Tasks 8 et 9.

Pas de suite de tests storefront — ces fonctions sont des Server Actions minces au-dessus du SDK Medusa (`sdk.auth.resetPassword`, `sdk.auth.updateProvider`), déjà couvertes indirectement par la vérification manuelle de la Task 9.

- [ ] **Step 1: Add the server actions**

À la fin de `apps/storefront/src/lib/data/customer.ts`, ajouter :

```typescript
export type RequestPasswordResetState =
  | { state: "success" }
  | { state: "error"; error: string }
  | null

export async function requestPasswordReset(
  _currentState: unknown,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const email = formData.get("email") as string

  try {
    await sdk.auth.resetPassword("customer", "emailpass", {
      identifier: email,
    })
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  return { state: "success" }
}

export type ResetPasswordState =
  | { state: "success" }
  | { state: "error"; error: string }
  | null

export async function resetPassword(
  _currentState: unknown,
  formData: FormData
): Promise<ResetPasswordState> {
  const token = formData.get("token") as string
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirm_password") as string

  if (password !== confirmPassword) {
    return { state: "error", error: "Passwords do not match." }
  }

  try {
    await sdk.auth.updateProvider("customer", "emailpass", { password }, token)
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  return { state: "success" }
}
```

- [ ] **Step 2: Verify types**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: pas de nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
cd apps/storefront
git add src/lib/data/customer.ts
git commit -m "$(cat <<'EOF'
Ajoute les server actions de réinitialisation de mot de passe

requestPasswordReset et resetPassword encapsulent sdk.auth.resetPassword
et sdk.auth.updateProvider, avec la même forme de retour que login/signup
(compatible useActionState).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Page "mot de passe oublié"

**Files:**
- Create: `apps/storefront/src/modules/account/components/forgot-password/index.tsx`
- Modify: `apps/storefront/src/modules/account/templates/login-template.tsx`
- Modify: `apps/storefront/src/modules/account/components/login/index.tsx:33-52`

**Interfaces:**
- Consumes: `requestPasswordReset` (Task 7), `LOGIN_VIEW` enum (étendu dans ce fichier).
- Produces: `LOGIN_VIEW.FORGOT_PASSWORD` — nouvelle valeur consommée par `login-template.tsx` et par le bouton ajouté dans `login/index.tsx`.

- [ ] **Step 1: Extend the LOGIN_VIEW enum and the template switch**

Remplacer le contenu de `apps/storefront/src/modules/account/templates/login-template.tsx` par :

```tsx
"use client"

import { useState } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ForgotPassword from "@modules/account/components/forgot-password"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot-password",
}

const LoginTemplate = () => {
  const [currentView, setCurrentView] = useState<LOGIN_VIEW>(LOGIN_VIEW.SIGN_IN)

  return (
    <div className="w-full flex justify-start px-8 py-8">
      {currentView === LOGIN_VIEW.SIGN_IN && (
        <Login setCurrentView={setCurrentView} />
      )}
      {currentView === LOGIN_VIEW.REGISTER && (
        <Register setCurrentView={setCurrentView} />
      )}
      {currentView === LOGIN_VIEW.FORGOT_PASSWORD && (
        <ForgotPassword setCurrentView={setCurrentView} />
      )}
    </div>
  )
}

export default LoginTemplate
```

- [ ] **Step 2: Add the "Forgot password?" link to Login**

Dans `apps/storefront/src/modules/account/components/login/index.tsx`, remplacer :

```tsx
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
```

par :

```tsx
          <Input
            label="Password"
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
            className="text-small-regular text-ui-fg-base underline"
            data-testid="forgot-password-button"
          >
            Forgot password?
          </button>
        </div>
        <ErrorMessage
```

- [ ] **Step 3: Create the ForgotPassword component**

```tsx
// apps/storefront/src/modules/account/components/forgot-password/index.tsx
"use client"

import { requestPasswordReset } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const ForgotPassword = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(requestPasswordReset, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="forgot-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Mot de passe oublié</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Indiquez votre email, nous vous enverrons un lien pour réinitialiser
        votre mot de passe.
      </p>

      {message?.state === "success" ? (
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="forgot-password-success-message"
        >
          Si un compte existe pour cet email, un lien de réinitialisation
          vient de vous être envoyé. Vérifiez votre boîte de réception.
        </div>
      ) : (
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
          </div>
          <ErrorMessage
            error={message?.state === "error" ? message.error : null}
            data-testid="forgot-password-error-message"
          />
          <SubmitButton
            data-testid="send-reset-link-button"
            className="w-full mt-6"
          >
            Envoyer le lien de réinitialisation
          </SubmitButton>
        </form>
      )}

      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
          data-testid="back-to-sign-in-button"
        >
          Retour à la connexion
        </button>
      </span>
    </div>
  )
}

export default ForgotPassword
```

- [ ] **Step 4: Verify types**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: pas de nouvelle erreur.

- [ ] **Step 5: Manual verification**

1. `cd apps/backend && npm run dev` puis `cd apps/storefront && npm run dev -- -p 8001`.
2. Aller sur `/[countryCode]/account`, cliquer "Forgot password?", vérifier que le formulaire "Mot de passe oublié" s'affiche.
3. Soumettre un email — vérifier le message de succès générique (ne doit pas révéler si le compte existe).
4. Vérifier "Retour à la connexion" revient au formulaire de connexion.

- [ ] **Step 6: Commit**

```bash
cd apps/storefront
git add src/modules/account/components/forgot-password src/modules/account/templates/login-template.tsx src/modules/account/components/login/index.tsx
git commit -m "$(cat <<'EOF'
Ajoute le formulaire "mot de passe oublié" au storefront

Le starter Medusa DTC n'avait aucune page de récupération de mot de
passe — seul un TODO non fonctionnel existait côté profil compte.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Page de réinitialisation du mot de passe

**Files:**
- Create: `apps/storefront/src/modules/account/components/reset-password/index.tsx`
- Create: `apps/storefront/src/app/[countryCode]/(main)/reset-password/page.tsx`

**Interfaces:**
- Consumes: `resetPassword` (Task 7), query params `token`/`email` (produits par le lien email de la Task 6).

- [ ] **Step 1: Create the ResetPassword component**

```tsx
// apps/storefront/src/modules/account/components/reset-password/index.tsx
"use client"

import { useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { resetPassword } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const ResetPassword = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [message, formAction] = useActionState(resetPassword, null)

  if (!token) {
    return (
      <div
        className="max-w-sm w-full flex flex-col items-center text-center gap-y-4"
        data-testid="reset-password-invalid"
      >
        <h1 className="text-large-semi uppercase">
          Réinitialisation de mot de passe
        </h1>
        <p className="text-base-regular text-ui-fg-base">
          Ce lien de réinitialisation est invalide ou a expiré.
        </p>
        <LocalizedClientLink href="/account">
          <Button variant="secondary">Retour à la connexion</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  if (message?.state === "success") {
    return (
      <div
        className="max-w-sm w-full flex flex-col items-center text-center gap-y-4"
        data-testid="reset-password-success"
      >
        <h1 className="text-large-semi uppercase">
          Mot de passe réinitialisé
        </h1>
        <p className="text-base-regular text-ui-fg-base">
          Votre mot de passe a bien été mis à jour.
        </p>
        <LocalizedClientLink href="/account">
          <Button variant="primary">Se connecter</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="reset-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Nouveau mot de passe</h1>
      <form className="w-full" action={formAction}>
        <input type="hidden" name="token" value={token} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Nouveau mot de passe"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            data-testid="password-input"
          />
          <Input
            label="Confirmer le mot de passe"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            data-testid="confirm-password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="reset-password-error-message"
        />
        <SubmitButton
          data-testid="reset-password-button"
          className="w-full mt-6"
        >
          Réinitialiser mon mot de passe
        </SubmitButton>
      </form>
    </div>
  )
}

export default ResetPassword
```

- [ ] **Step 2: Create the page**

```tsx
// apps/storefront/src/app/[countryCode]/(main)/reset-password/page.tsx
import { Metadata } from "next"
import { Suspense } from "react"

import ResetPassword from "@modules/account/components/reset-password"

export const metadata: Metadata = {
  title: "Réinitialisation du mot de passe",
  description: "Choisissez un nouveau mot de passe pour votre compte.",
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full flex justify-center px-8 py-12">
      <Suspense
        fallback={
          <p className="text-base-regular text-ui-fg-base">Chargement...</p>
        }
      >
        <ResetPassword />
      </Suspense>
    </div>
  )
}
```

Ce fichier suit le même patron que `apps/storefront/src/app/[countryCode]/(main)/verify-account/page.tsx` (page autonome hors du layout `account`, `Suspense` requis autour de `useSearchParams`).

- [ ] **Step 3: Verify types**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: pas de nouvelle erreur.

- [ ] **Step 4: Manual verification end-to-end**

1. Avec `RESEND_API_KEY` renseignée (compte Resend de test, domaine `onboarding@resend.dev` ou domaine vérifié) et `STOREFRONT_URL=http://localhost:8001`, démarrer backend + storefront.
2. Depuis `/[countryCode]/account`, demander une réinitialisation pour un compte client existant.
3. Ouvrir l'email reçu (ou les logs Resend si pas de vraie boîte mail en dev), suivre le lien.
4. Vérifier la redirection `/reset-password?token=...` → `/{countryCode}/reset-password?token=...` par le middleware.
5. Saisir un nouveau mot de passe, confirmer, vérifier le message de succès puis se connecter avec le nouveau mot de passe.
6. Tester aussi le cas lien invalide : ouvrir `/reset-password` sans `token` → message "lien invalide".

- [ ] **Step 5: Commit**

```bash
cd apps/storefront
git add src/modules/account/components/reset-password src/app/\[countryCode\]/\(main\)/reset-password
git commit -m "$(cat <<'EOF'
Ajoute la page de réinitialisation de mot de passe

Complète le flux commencé par le formulaire "mot de passe oublié" :
saisie du nouveau mot de passe via le token reçu par email.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Vérification bout en bout du paiement Orange Money et mise à jour du suivi

**Files:**
- Modify: `HANDOFF.md`

Pas de nouveau code — cette tâche vérifie l'ensemble de la Phase 0 tel que découpé dans `ROADMAP.md` et clôture le suivi.

- [ ] **Step 1: Full manual walkthrough**

1. `docker compose up -d`, backend (`npm run dev`), storefront (`npm run dev -- -p 8001`).
2. Parcours client : ajouter un produit au panier → checkout → choisir Orange Money → voir les instructions (Task 3 côté checkout, déjà en place) → passer la commande.
3. Vérifier la page de confirmation affiche les instructions Orange Money (Task 3).
4. Vérifier dans les logs backend que la notification marchand a été tentée (Task 2) — avec `N8N_ORDER_WEBHOOK_URL` vide en dev, le log doit indiquer qu'elle a été ignorée, sans erreur.
5. Si `RESEND_API_KEY` est configurée : vérifier la réception de l'email de confirmation de commande (Task 5).
6. Dans l'admin Medusa (`/app`), retrouver la commande, vérifier son statut `pending`, effectuer la capture manuelle du paiement, vérifier le passage à `paid`.

- [ ] **Step 2: Run the full backend test suite**

Run: `cd apps/backend && npm run test:unit`
Expected: tous les tests des Tasks 1, 2, 4, 5, 6 passent.

- [ ] **Step 3: Update HANDOFF.md**

Dans `HANDOFF.md`, section "Phase 0" : cocher chaque case terminée, passer le statut global à `fait`, et ajouter une entrée de journal résumant ce qui a été livré et tout ce qui reste en attente côté n8n (le contrat exact du webhook, cf. note de la Task 2).

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md
git commit -m "$(cat <<'EOF'
Marque la Phase 0 comme terminée dans le suivi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage :** les 5 points de la section "Phase 0" du `ROADMAP.md` sont couverts par les Tasks 1 (bug), 3 (confirmation), 2 (webhook n8n), 4-6 (provider email), 10 (vérification E2E). L'extension décidée pendant le brainstorming (flux complet mot de passe oublié, storefront inclus) est couverte par les Tasks 6-9.
- **Type consistency :** la clé de template `"order-placed"` / `"password-reset"` est identique entre `templates.ts` (Task 4), `order-placed-customer-email.ts` (Task 5) et `auth-password-reset.ts` (Task 6). Le champ `LOGIN_VIEW.FORGOT_PASSWORD` est défini une seule fois (Task 8, `login-template.tsx`) et consommé par `login/index.tsx` et `forgot-password/index.tsx`.
- **Hors périmètre explicite :** contrat exact du payload webhook n8n (à valider contre le dépôt `n8n_automation`), réinitialisation de mot de passe pour les comptes admin, i18n complète du storefront (Login/Register restent en anglais).

---

## Task 11: Corriger le bouton « Place order » pour Orange Money (ajoutée après Task 10)

**Contexte de l'ajout :** la vérification bout en bout de la Task 10 a révélé que
`apps/storefront/src/modules/checkout/components/payment-button/index.tsx` — code du
scaffold initial, jamais touché par aucune tâche de ce plan — ne gère pas le provider
Orange Money dans son `switch` : seuls `isStripeLike` et `isManual` sont couverts, donc
le bouton reste bloqué sur « Select a payment method » (`disabled`) dès qu'Orange Money
est sélectionné. Sans ce correctif, aucun client réel ne peut finaliser une commande
Orange Money, ce qui défait l'objectif même de la Phase 0. Confirmé par lecture directe
du code (pas seulement un artefact d'automatisation Playwright) : un vrai
`<button disabled>` React.

**Files:**
- Modify: `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`

**Interfaces:**
- Consumes: `isOrangeMoney` (déjà exporté par `apps/storefront/src/lib/constants.tsx`,
  committé en Task 10), `ManualTestPaymentButton` (composant local déjà défini dans ce
  même fichier, réutilisé tel quel — un paiement Orange Money est déjà `AUTHORIZED` dès
  l'initiation de la session, cf. `OrangeMoneyManualService.authorizePayment` en Task 1,
  donc le même flux « pas de saisie carte, appel direct à `placeOrder()` » s'applique).

- [ ] **Step 1: Modifier le switch du composant `PaymentButton`**

Dans `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`,
remplacer :

```tsx
import { isManual, isStripeLike } from "@lib/constants"
```

par :

```tsx
import { isManual, isOrangeMoney, isStripeLike } from "@lib/constants"
```

Puis, dans le `switch (true)` du composant `PaymentButton`, ajouter un cas juste après
celui de `isManual` :

```tsx
    case isManual(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton notReady={notReady} data-testid={dataTestId} />
      )
    case isOrangeMoney(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton notReady={notReady} data-testid={dataTestId} />
      )
    default:
      return <Button disabled>Select a payment method</Button>
```

Ne rien changer d'autre dans le fichier (ni `StripePaymentButton`, ni
`ManualTestPaymentButton`, ni leur logique interne).

- [ ] **Step 2: Vérifier les types**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: pas de nouvelle erreur.

- [ ] **Step 3: Vérification manuelle**

Avec les serveurs de dev backend (`:9001`) et storefront (`:8001`) démarrés (Postgres/
Redis Docker déjà actifs) : reprendre le parcours panier → checkout → Orange Money →
instructions affichées, et vérifier que le bouton « Place order » devient cliquable
(non `disabled`) une fois les conditions de `notReady` satisfaites (adresse, email,
méthode de livraison), puis qu'un clic passe effectivement la commande (redirection
vers la page de confirmation). Utiliser un outil navigateur si disponible dans
l'environnement d'exécution (une tâche précédente de ce plan a utilisé avec succès un
outil MCP Playwright contre ces mêmes serveurs).

- [ ] **Step 4: Commit**

```bash
cd apps/storefront
git add src/modules/checkout/components/payment-button/index.tsx
git commit -m "$(cat <<'EOF'
Corrige le bouton "Place order" resté désactivé pour Orange Money

Le switch du composant PaymentButton (code du scaffold initial) ne
gérait que Stripe et le provider manuel générique — Orange Money
tombait dans le cas par défaut (bouton désactivé), empêchant tout
client de finaliser une commande par ce moyen de paiement. Découvert
pendant la vérification bout en bout de la Phase 0 (Task 10).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
