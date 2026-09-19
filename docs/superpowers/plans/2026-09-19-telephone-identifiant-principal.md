# Téléphone comme identifiant principal du compte client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phone the required, primary identifier for customer accounts (email becomes optional), let a customer log in with either if both are set, and gate phone-based signup behind a 6-digit WhatsApp verification code.

**Architecture:** Reuse Medusa's built-in `@medusajs/medusa/auth-emailpass` package for phone identifiers too (it does zero format validation on its "email" parameter — verified in the source), registered a **second time** under a separate provider id `"phone-pass"` (same code, different routing name — required so `authVerificationsPerActor` can gate phone without also gating the existing email account). When both phone and email are supplied, register two separate auth identities — one via `phone-pass`, one via `emailpass` — and link both to the same `customer.id` via Medusa's exported `setAuthAppMetadataWorkflow`. Add a new custom Medusa verification provider (`whatsapp-otp`) that generates and checks 6-digit codes, delivered through the WhatsApp webhook that already exists for order confirmations, and wire it as the required verification for the `phone-pass` provider via `projectConfig.http.authVerificationsPerActor`.

**Tech Stack:** Medusa v2 (`@medusajs/framework`, `@medusajs/auth`, `@medusajs/core-flows`), Next.js App Router storefront, Jest (`TEST_TYPE=unit`), existing n8n WhatsApp webhook (`N8N_ORDER_CONFIRMATION_WEBHOOK_URL`/`_SECRET`).

**Spec:** `docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md`

## Global Constraints

- Phone is required at signup; email is optional. (spec: Objectif)
- A customer with both must be able to log in with either. (spec: Objectif)
- Verification applies only to the phone identity — an email added alongside an already-verified phone is never separately verified. (spec: Décision — deux identités liées)
- Password-reset for a phone-only account is explicitly out of scope this iteration and must stay documented as a known gap, not silently fixed or silently left unmentioned. (spec: Non-objectifs)
- Phone numbers must be normalized (digits only, `+226` prefix) before any use as an auth identifier, to avoid duplicate accounts or failed logins from inconsistent formatting. (spec: Décision — normalisation)
- The Meta WhatsApp template `account_verification_code` needs external approval before the verification flow works end-to-end in production — this must never block merging/deploying the rest of the code. (spec: Rollout)
- Every backend module change must not regress existing email/password login — see Task 3's mandatory safety check.

---

## Task 1: Phone number normalization util

**Files:**
- Create: `apps/backend/src/lib/normalize-phone.ts`
- Test: `apps/backend/src/lib/__tests__/normalize-phone.unit.spec.ts`

**Interfaces:**
- Produces: `normalizePhone(raw: string): string` — used by Task 3 (verification provider is agnostic to this, but storefront customer.ts in Task 8 imports the storefront-side equivalent), Task 6 (link-email-identity route doesn't need it), and Task 8/9/10 (storefront). Since the storefront and backend are separate apps with separate `node_modules`, this function is duplicated in both apps (see Task 8 for the storefront copy) — keep both implementations byte-for-byte identical.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/lib/__tests__/normalize-phone.unit.spec.ts
import { normalizePhone } from "../normalize-phone"

describe("normalizePhone", () => {
  it("garde un numéro déjà au format +226XXXXXXXX inchangé", () => {
    expect(normalizePhone("+22670000000")).toBe("+22670000000")
  })

  it("ajoute le préfixe +226 à un numéro local à 8 chiffres", () => {
    expect(normalizePhone("70000000")).toBe("+22670000000")
  })

  it("retire les espaces et tirets avant de normaliser", () => {
    expect(normalizePhone("70 00 00 00")).toBe("+22670000000")
    expect(normalizePhone("226-70-00-00-00")).toBe("+22670000000")
  })

  it("retire un préfixe international 00226", () => {
    expect(normalizePhone("0022670000000")).toBe("+22670000000")
  })

  it("retire un préfixe 226 sans le +", () => {
    expect(normalizePhone("22670000000")).toBe("+22670000000")
  })

  it("lève une erreur si la chaîne ne contient aucun chiffre", () => {
    expect(() => normalizePhone("abc")).toThrow("Numéro de téléphone invalide")
  })

  it("lève une erreur sur une chaîne vide", () => {
    expect(() => normalizePhone("")).toThrow("Numéro de téléphone invalide")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- normalize-phone`
Expected: FAIL with "Cannot find module '../normalize-phone'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/lib/normalize-phone.ts
// Le téléphone sert désormais d'identifiant d'authentification (voir
// docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md) :
// deux saisies différentes du même numéro réel ne doivent jamais produire
// deux identifiants distincts. Ne gère que le Burkina Faso (+226), seul pays
// desservi par ce store.
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "")

  if (!digitsOnly) {
    throw new Error("Numéro de téléphone invalide")
  }

  // 00226XXXXXXXX (préfixe international) -> 226XXXXXXXX
  const withoutInternationalPrefix = digitsOnly.startsWith("00226")
    ? digitsOnly.slice(2)
    : digitsOnly

  // 226XXXXXXXX (déjà préfixé, sans le +) -> garder tel quel
  // XXXXXXXX (8 chiffres locaux, sans préfixe) -> ajouter 226
  const withCountryCode = withoutInternationalPrefix.startsWith("226")
    ? withoutInternationalPrefix
    : `226${withoutInternationalPrefix}`

  return `+${withCountryCode}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- normalize-phone`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/normalize-phone.ts apps/backend/src/lib/__tests__/normalize-phone.unit.spec.ts
git commit -m "feat(auth): ajoute la normalisation des numéros de téléphone"
```

---

## Task 2: WhatsApp OTP verification provider

**Files:**
- Create: `apps/backend/src/modules/whatsapp-otp-verification.ts`
- Test: `apps/backend/src/modules/__tests__/whatsapp-otp-verification.unit.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WhatsappOtpVerificationProvider` class (default export wrapped via `ModuleProvider`), `identifier = "whatsapp-otp"` — referenced by Task 3 (`medusa-config.ts` registration) and by the storefront (Task 8) as the literal string `"whatsapp-otp"` passed as `code_provider`.

This mirrors Medusa's built-in `TokenVerificationProvider`
(`@medusajs/auth/dist/providers/verification/token.js`, read directly from
`node_modules` to confirm the exact contract) but generates a 6-digit numeric
code instead of an opaque token, and does NOT import anything from
`@medusajs/auth`'s internal (undocumented) path — only the public
`@medusajs/framework/types` interfaces plus Node's own `crypto`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/__tests__/whatsapp-otp-verification.unit.spec.ts
import { WhatsappOtpVerificationProvider } from "../whatsapp-otp-verification"

function createFakeAuthVerificationService() {
  const records: any[] = []
  return {
    list: jest.fn(async (filter: any) => {
      return records.filter((r) => {
        if (filter.auth_identity_id && r.auth_identity_id !== filter.auth_identity_id) return false
        if (filter.entity_id && r.entity_id !== filter.entity_id) return false
        if (filter.entity_type && r.entity_type !== filter.entity_type) return false
        if (filter.provider_metadata?.code_hash) {
          return r.provider_metadata?.code_hash === filter.provider_metadata.code_hash
        }
        return true
      })
    }),
    create: jest.fn(async (data: any) => {
      const record = { id: `authver_${records.length + 1}`, verified_at: null, ...data }
      records.push(record)
      return record
    }),
    update: jest.fn(async (data: any) => {
      const index = records.findIndex((r) => r.id === data.id)
      records[index] = { ...records[index], ...data }
      return records[index]
    }),
    _records: records,
  }
}

describe("WhatsappOtpVerificationProvider", () => {
  const baseRequestData = {
    entity_id: "+22670000000",
    auth_identity_id: "authid_1",
    entity_type: "phone",
    code_provider: "whatsapp-otp",
  }

  it("génère un code à 6 chiffres numériques lors d'une demande", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const result = await provider.request(baseRequestData)

    expect(result.code).toMatch(/^\d{6}$/)
    expect(result.expires_at).toBeInstanceOf(Date)
    expect(service.create).toHaveBeenCalledTimes(1)
  })

  it("ne stocke jamais le code en clair, seulement son hash", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const result = await provider.request(baseRequestData)

    const stored = service._records[0]
    expect(stored.provider_metadata.code_hash).toBeDefined()
    expect(stored.provider_metadata.code_hash).not.toBe(result.code)
  })

  it("retourne la vérification existante sans en créer une nouvelle si déjà confirmée", async () => {
    const service = createFakeAuthVerificationService()
    service._records.push({
      id: "authver_existing",
      auth_identity_id: "authid_1",
      entity_id: "+22670000000",
      entity_type: "phone",
      verified_at: new Date(),
      provider_metadata: { code_hash: "irrelevant" },
    })
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const result = await provider.request(baseRequestData)

    expect(result.id).toBe("authver_existing")
    expect(service.create).not.toHaveBeenCalled()
  })

  it("confirme un code valide et non expiré", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)
    const confirmed = await provider.confirm({ code, code_provider: "whatsapp-otp" })

    expect(confirmed.verified_at).not.toBeNull()
  })

  it("rejette un code invalide", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    await provider.request(baseRequestData)

    await expect(provider.confirm({ code: "000000" })).rejects.toThrow(
      "Verification code is invalid or already used"
    )
  })

  it("rejette un code déjà utilisé", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)
    await provider.confirm({ code })

    await expect(provider.confirm({ code })).rejects.toThrow(
      "Verification code is invalid or already used"
    )
  })

  it("rejette un code expiré (TTL de 10 minutes)", async () => {
    const service = createFakeAuthVerificationService()
    const provider = new WhatsappOtpVerificationProvider({ authVerificationService: service }, {})

    const { code } = await provider.request(baseRequestData)
    // Recule artificiellement la date de demande de 11 minutes.
    service._records[0].requested_at = new Date(Date.now() - 11 * 60 * 1000)

    await expect(provider.confirm({ code })).rejects.toThrow("Verification code has expired")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- whatsapp-otp-verification`
Expected: FAIL with "Cannot find module '../whatsapp-otp-verification'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/whatsapp-otp-verification.ts
import crypto from "node:crypto"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import type {
  IAuthVerificationProvider,
  RequestAuthVerificationDTO,
  RequestAuthVerificationResponse,
  ConfirmAuthVerificationDTO,
  ConfirmAuthVerificationResponse,
} from "@medusajs/framework/types"

// Code à 6 chiffres plus sensible au brute-force qu'un jeton opaque long :
// fenêtre d'expiration volontairement plus courte que le provider "token"
// natif de Medusa (15 min).
const CODE_TTL_MS = 10 * 60 * 1000

const generateCode = (): string => {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
}

const hashCode = (code: string): string => {
  return crypto.createHash("sha256").update(code).digest("hex")
}

/**
 * Provider de vérification Medusa (interface IAuthVerificationProvider,
 * @medusajs/types >= 2.16.0) qui génère un code à 6 chiffres au lieu du
 * jeton opaque du provider "token" natif. Miroir volontaire de
 * @medusajs/auth/dist/providers/verification/token.js (lu directement dans
 * node_modules pour confirmer le contrat exact : authVerificationService
 * injecté depuis le container du module Auth, mêmes méthodes
 * list/create/update) - sans importer quoi que ce soit du chemin interne
 * @medusajs/auth, qui n'est pas une API publique documentée.
 *
 * L'envoi effectif du code par WhatsApp n'a pas lieu ici : ce provider
 * retourne le code au workflow appelant, qui émet
 * AuthWorkflowEvents.VERIFICATION_REQUESTED - voir le subscriber
 * auth-verification-requested-whatsapp.ts pour la livraison.
 */
export class WhatsappOtpVerificationProvider implements IAuthVerificationProvider {
  static identifier = "whatsapp-otp"
  readonly identifier = WhatsappOtpVerificationProvider.identifier

  private authVerificationService_: any

  constructor({ authVerificationService }: { authVerificationService: any }, _options: Record<string, never>) {
    this.authVerificationService_ = authVerificationService
  }

  async request(data: RequestAuthVerificationDTO): Promise<RequestAuthVerificationResponse> {
    const existing = await this.authVerificationService_.list(
      {
        auth_identity_id: data.auth_identity_id,
        entity_id: data.entity_id,
        entity_type: data.entity_type,
      },
      { take: 1, skip: 0 }
    )

    if (existing.length && existing[0].verified_at) {
      return existing[0]
    }

    const code = generateCode()
    const codeHash = hashCode(code)
    const requestedAt = new Date(Date.now())
    const expiresAt = new Date(requestedAt.getTime() + CODE_TTL_MS)

    let verification
    if (existing.length) {
      verification = await this.authVerificationService_.update({
        id: existing[0].id,
        code_provider: data.code_provider,
        provider_metadata: { code_hash: codeHash },
        requested_at: requestedAt,
        verified_at: null,
      })
    } else {
      verification = await this.authVerificationService_.create({
        auth_identity_id: data.auth_identity_id,
        entity_id: data.entity_id,
        entity_type: data.entity_type,
        code_provider: data.code_provider,
        provider_metadata: { code_hash: codeHash },
        requested_at: requestedAt,
        metadata: data.metadata ?? null,
      })
    }

    return { ...verification, code, expires_at: expiresAt }
  }

  async confirm(data: ConfirmAuthVerificationDTO): Promise<ConfirmAuthVerificationResponse> {
    if (!data.code) {
      throw new Error("Verification code is required")
    }

    const [verification] = await this.authVerificationService_.list({
      provider_metadata: { code_hash: hashCode(data.code) },
    })

    if (!verification || verification.verified_at) {
      throw new Error("Verification code is invalid or already used")
    }

    if (data.code_provider && data.code_provider !== verification.code_provider) {
      throw new Error(`Verification code does not belong to provider "${data.code_provider}"`)
    }

    const expiresAt = new Date(verification.requested_at).getTime() + CODE_TTL_MS
    if (expiresAt <= Date.now()) {
      throw new Error("Verification code has expired")
    }

    return await this.authVerificationService_.update({
      id: verification.id,
      verified_at: new Date(Date.now()),
    })
  }
}

export default ModuleProvider(Modules.AUTH, {
  services: [WhatsappOtpVerificationProvider],
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- whatsapp-otp-verification`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/whatsapp-otp-verification.ts apps/backend/src/modules/__tests__/whatsapp-otp-verification.unit.spec.ts
git commit -m "feat(auth): ajoute le provider de vérification WhatsApp (code à 6 chiffres)"
```

---

## Task 3: Wire the auth module config — CRITICAL safety task

**Files:**
- Modify: `apps/backend/medusa-config.ts`

**Interfaces:**
- Consumes: `WhatsappOtpVerificationProvider` from Task 2 (via its file path, not a direct import — Medusa resolves it dynamically from the `resolve` string).
- Produces: the auth provider id `"phone-pass"` (registered here, resolves to the stock `@medusajs/medusa/auth-emailpass` package) — Task 8 calls `sdk.auth.register`/`sdk.auth.login("customer", "phone-pass", ...)` for every phone-based operation, and must use `"emailpass"` (unchanged) for every email-based one. Getting this provider id wrong in Task 8 silently disables the verification gate this task sets up.

**Why this task is dangerous if done wrong (two separate ways):**

1. Medusa's own config merging (`@medusajs/utils/dist/common/define-config.js`,
   read directly to confirm this) works by building an array of
   `[...defaultModules, ...yourModules]` and then folding it into an object
   **keyed by module name, last one wins, no deep merge**. Medusa's own
   default already registers `auth` with `options.providers: [{ resolve:
   "@medusajs/medusa/auth-emailpass", id: "emailpass" }]`. The moment this
   project's own `medusa-config.ts` adds *any* `modules.auth` entry, it
   **completely replaces** that default — including silently dropping
   `emailpass` — unless `emailpass` is re-declared explicitly. Getting this
   wrong breaks **all** customer and admin login in production. Step 3
   below re-declares it explicitly for exactly this reason.

2. Separately: Medusa only actually *enforces* the verification gate at
   login if `projectConfig.http.authVerificationsPerActor` names the auth
   provider (`@medusajs/medusa/dist/api/auth/utils/validate-verification.js`,
   also read directly — the lookup matches **only by provider name**, never
   by `entity_type`). If phone reused the `"emailpass"` id, there would be
   no way to require verification for phone without *also* requiring it for
   email — which would break login for the one existing production account
   (it has no verification record at all). This is why Step 3 registers
   the **same** `@medusajs/medusa/auth-emailpass` package a second time
   under a different id, `"phone-pass"` — same code, separate routing name,
   so the verification requirement can target phone only. Without this,
   the whole `whatsapp-otp` provider from Task 2 would be built and wired
   but **never actually invoked** — a customer would get a real, usable
   account immediately upon registering a phone, no code required, exactly
   like the already-dead email verification flow this project discovered
   during the spec phase.

Step 4 is a mandatory manual check that existing login still works, and
Step 5 is a mandatory manual check that the phone verification gate is
actually enforced — do not skip either, and do not mark this task done
without running both.

- [ ] **Step 1: Read the current file to confirm the insertion points**

Read `apps/backend/medusa-config.ts`. The `modules: { ... }` object currently
has `cache`, `eventBus`, `file`, `payment`, `notification` keys, no `auth`
key at all. The `projectConfig.http` object currently has `storeCors`,
`adminCors`, `authCors`, `jwtSecret`, `cookieSecret` — no
`authVerificationsPerActor`.

- [ ] **Step 2: Add the `auth` module entry**

Add this key inside the `modules: { ... }` object (alongside `cache`,
`eventBus`, etc. — order doesn't matter, but keep it readable):

```typescript
    // Le module auth n'a jamais été configuré explicitement avant ce jour
    // (Medusa enregistre "emailpass" par défaut tout seul). Le réenregistrer
    // ici EST OBLIGATOIRE dès qu'on ajoute quoi que ce soit sous modules.auth :
    // Medusa fusionne les modules par simple remplacement (dernier gagne, pas
    // de fusion profonde - voir @medusajs/utils/common/define-config.js), donc
    // omettre "emailpass" ici désactiverait silencieusement toute connexion
    // email/mot de passe existante (clients ET admin).
    //
    // "phone-pass" est le MÊME package (@medusajs/medusa/auth-emailpass),
    // enregistré une seconde fois sous un id de routage différent - pas un
    // provider distinct. Nécessaire car authVerificationsPerActor
    // (voir projectConfig.http ci-dessous) ne peut cibler que par nom de
    // provider, jamais par entity_type : sans ce second id, il serait
    // impossible d'exiger la vérification pour le téléphone sans l'exiger
    // aussi pour l'email existant. Voir
    // docs/superpowers/plans/2026-09-19-telephone-identifiant-principal.md
    // Task 3 pour le détail de cette investigation.
    auth: {
      resolve: '@medusajs/medusa/auth',
      options: {
        providers: [
          { resolve: '@medusajs/medusa/auth-emailpass', id: 'emailpass' },
          { resolve: '@medusajs/medusa/auth-emailpass', id: 'phone-pass' },
        ],
        verification: {
          providers: [
            { resolve: './src/modules/whatsapp-otp-verification', id: 'whatsapp-otp' },
          ],
        },
      },
    },
```

- [ ] **Step 3: Require verification for the `phone-pass` provider**

Add `authVerificationsPerActor` inside the existing `projectConfig.http`
object (alongside `storeCors`, `jwtSecret`, etc. — do not create a second
`http` key, extend the existing one):

```typescript
      // Sans ceci, Medusa ne bloque jamais le login même si un provider de
      // vérification (whatsapp-otp) existe : la vérification n'est
      // appliquée que pour les combinaisons actor_type/auth_provider
      // listées ici (voir @medusajs/medusa/dist/api/auth/utils/validate-verification.js).
      // Ne cible QUE "phone-pass" : l'email ("emailpass") garde son
      // comportement actuel (jamais bloqué), pour ne pas casser la
      // connexion du compte existant en production.
      authVerificationsPerActor: {
        customer: [{ entity_type: 'phone', auth_provider: 'phone-pass' }],
      },
```

- [ ] **Step 4: Verify the backend still builds**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 5: MANDATORY — verify existing login still works before continuing**

This step cannot be skipped or deferred to a later task.

Deploy this single change to staging (commit + push to `staging` branch,
wait for the deploy workflow, same circuit used throughout this project's
history — see recent git log for the exact pattern: `git checkout staging
&& git merge --ff-only main && git push origin staging`, then poll
`https://api.github.com/repos/Abdazz/Golden-Market/actions/runs?branch=staging&per_page=1`
until `status: completed`).

Once deployed, confirm the existing `emailpass` login path is unaffected:

```bash
curl -s -X POST "https://staging.golden-market.co/auth/customer/emailpass" \
  -H "Content-Type: application/json" \
  -d '{"email":"<a real staging customer email>","password":"<its real password>"}' \
  -w "\nHTTP:%{http_code}\n"
```

Expected: `HTTP:200` with a JWT token in the body (not a 401/500). If there
is no existing staging customer to test with, register one first via the
same endpoint's `/register` path, or via the storefront's own sign-up form,
then retry. Do not proceed until this returns 200.

- [ ] **Step 6: MANDATORY — verify the phone-pass verification gate actually blocks login**

```bash
# Register a throwaway phone-pass identity directly:
curl -s -X POST "https://staging.golden-market.co/auth/customer/phone-pass/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"+22670009999","password":"test-password-123"}' \
  -w "\nHTTP:%{http_code}\n"

# Attempt to log in with it immediately (no verification confirmed yet):
curl -s -X POST "https://staging.golden-market.co/auth/customer/phone-pass" \
  -H "Content-Type: application/json" \
  -d '{"email":"+22670009999","password":"test-password-123"}' \
  -w "\nHTTP:%{http_code}\n"
```

Expected on the second call: HTTP 200 (Medusa returns 200 with a body
shape, not an error status) but the **body** must contain
`"verification_required": true`, not a plain JWT string — this confirms
Medusa is actually gating this specific provider. If it returns a plain
token instead, Step 2 or Step 3 above has a mistake — stop and re-check
before continuing to any later task, since Tasks 2, 4, and 5 all become
pointless without this gate actually working.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/medusa-config.ts
git commit -m "feat(auth): enregistre le provider de vérification WhatsApp (emailpass explicitement réenregistré)"
```

---

## Task 4: Subscriber — deliver the code via WhatsApp

**Files:**
- Create: `apps/backend/src/subscribers/auth-verification-requested-whatsapp.ts`
- Test: `apps/backend/src/subscribers/__tests__/auth-verification-requested-whatsapp.unit.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (listens to a Medusa core
  event). Depends on `process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL` /
  `_SECRET` (already configured in both environments — see
  `order-placed-customer-whatsapp.ts` for the existing usage of the same two
  variables).
- Produces: nothing consumed by later tasks — this is a leaf subscriber.

The event payload shape below was confirmed by reading
`@medusajs/core-flows/dist/auth/workflows/request-verification.js` directly
(the public `.d.ts` doc comment for `AuthWorkflowEvents.VERIFICATION_REQUESTED`
in `@medusajs/utils` describes an older/different shape — the actual shipped
code is the source of truth here, so this subscriber defines its own local
type rather than trusting a generic Medusa type for this event).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/subscribers/__tests__/auth-verification-requested-whatsapp.unit.spec.ts
import handler from "../auth-verification-requested-whatsapp"

function createFakeLogger() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}

function createFakeContainer(overrides: { logger?: ReturnType<typeof createFakeLogger> } = {}) {
  const logger = overrides.logger ?? createFakeLogger()
  return {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      throw new Error(`Clé de résolution inattendue dans le test : ${key}`)
    }),
    logger,
  }
}

describe("auth-verification-requested-whatsapp subscriber", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/whatsapp-order"
    process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET = "test-secret"
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it("ignore les événements dont le code_provider n'est pas whatsapp-otp", async () => {
    global.fetch = jest.fn() as any
    const container = createFakeContainer()

    await handler({
      event: { data: { entity_id: "+22670000000", code_provider: "token", code: "123456" } },
      container: container as any,
    } as any)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("envoie le code via le webhook n8n existant pour un événement whatsapp-otp", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any
    const container = createFakeContainer()

    await handler({
      event: {
        data: {
          entity_id: "+22670000000",
          code_provider: "whatsapp-otp",
          code: "482913",
        },
      },
      container: container as any,
    } as any)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("https://n8n.example.com/webhook/whatsapp-order")
    expect(init.method).toBe("POST")
    expect(init.headers["x-webhook-secret"]).toBe("test-secret")
    expect(JSON.parse(init.body)).toEqual({
      phone: "+22670000000",
      template_name: "account_verification_code",
      params: ["482913"],
    })
  })

  it("ne relance jamais d'exception si le webhook échoue", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    const logger = createFakeLogger()
    const container = createFakeContainer({ logger })

    await expect(
      handler({
        event: { data: { entity_id: "+22670000000", code_provider: "whatsapp-otp", code: "111111" } },
        container: container as any,
      } as any)
    ).resolves.not.toThrow()

    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it("ne fait rien si N8N_ORDER_CONFIRMATION_WEBHOOK_URL n'est pas configuré", async () => {
    delete process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
    global.fetch = jest.fn() as any
    const logger = createFakeLogger()
    const container = createFakeContainer({ logger })

    await handler({
      event: { data: { entity_id: "+22670000000", code_provider: "whatsapp-otp", code: "111111" } },
      container: container as any,
    } as any)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- auth-verification-requested-whatsapp`
Expected: FAIL with "Cannot find module '../auth-verification-requested-whatsapp'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/subscribers/auth-verification-requested-whatsapp.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Forme réelle de l'événement émise par
// @medusajs/core-flows/dist/auth/workflows/request-verification.js (lu
// directement dans node_modules - le commentaire JSDoc public de
// AuthWorkflowEvents.VERIFICATION_REQUESTED décrit une forme différente et
// plus ancienne, non fiable ici).
type VerificationRequestedData = {
  entity_id: string
  entity_type?: string
  code_provider: string
  auth_identity_id?: string
  code: string
  expires_at?: string
}

/**
 * Livre le code de vérification whatsapp-otp (voir
 * modules/whatsapp-otp-verification.ts) par WhatsApp, via le même webhook
 * n8n générique déjà utilisé pour les confirmations de commande (accepte
 * {phone, template_name, params} sans être spécifique aux commandes malgré
 * son nom de variable d'environnement - voir
 * order-placed-customer-whatsapp.ts). Ignore tout autre code_provider :
 * le chemin "token" (email) natif de Medusa n'est délibérément pas touché
 * par cette itération (voir spec, section Non-objectifs).
 */
export default async function authVerificationRequestedWhatsappHandler({
  event,
  container,
}: SubscriberArgs<VerificationRequestedData>) {
  if (event.data.code_provider !== "whatsapp-otp") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const webhookUrl = process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
  const webhookSecret = process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET

  if (!webhookUrl) {
    logger.info(
      `Code de vérification WhatsApp demandé pour ${event.data.entity_id} — N8N_ORDER_CONFIRMATION_WEBHOOK_URL non configuré, envoi ignoré`
    )
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify({
        phone: event.data.entity_id,
        template_name: "account_verification_code",
        params: [event.data.code],
      }),
    })

    if (!response.ok) {
      throw new Error(`Webhook n8n a répondu ${response.status}`)
    }

    logger.info(`Code de vérification WhatsApp envoyé à n8n pour ${event.data.entity_id}`)
  } catch (error) {
    logger.error(
      `Échec de l'envoi du code de vérification WhatsApp pour ${event.data.entity_id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- auth-verification-requested-whatsapp`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/subscribers/auth-verification-requested-whatsapp.ts apps/backend/src/subscribers/__tests__/auth-verification-requested-whatsapp.unit.spec.ts
git commit -m "feat(auth): livre le code de vérification whatsapp-otp via le webhook n8n existant"
```

---

## Task 5: Rate limit the verification request endpoint

**Files:**
- Modify: `apps/backend/src/api/middlewares.ts`
- Modify: `apps/backend/src/api/__tests__/middlewares.unit.spec.ts`

**Interfaces:**
- Consumes: `checkRateLimit` from `./middlewares/rate-limiter` (already imported in this file).
- Produces: `whatsappOtpVerificationRateLimitMiddleware` — registered on the route matcher only, not consumed by other files.

- [ ] **Step 1: Write the failing test**

Append to the existing `apps/backend/src/api/__tests__/middlewares.unit.spec.ts`
(reuse the existing `createFakeCache`/`createFakeLogger`/`createFakeReq`/`createFakeRes`/`createFakeScope`
helpers already defined at the top of that file):

```typescript
import { whatsappOtpVerificationRateLimitMiddleware } from "../middlewares"

describe("whatsappOtpVerificationRateLimitMiddleware", () => {
  it("laisse passer les requêtes tant que la limite (5/15min) n'est pas atteinte", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000000" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(5)
  })

  it("bloque au-delà de la limite et répond 429", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000000" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope })
    req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000000" }
    const res = createFakeRes()
    await whatsappOtpVerificationRateLimitMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.headers["Retry-After"]).toBeDefined()
    expect(next).toHaveBeenCalledTimes(5)
  })

  it("ne limite jamais une demande pour un autre code_provider (ex: token)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 10; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "token", entity_id: "someone@example.com" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    }

    expect(next).toHaveBeenCalledTimes(10)
  })

  it("applique un bucket indépendant par entity_id (numéro de téléphone)", async () => {
    const cache = createFakeCache()
    const scope = createFakeScope({ cache })
    const next = jest.fn()

    for (let i = 0; i < 5; i++) {
      const req = createFakeReq({ scope })
      req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000001" }
      const res = createFakeRes()
      await whatsappOtpVerificationRateLimitMiddleware(req, res, next)
    }

    const req = createFakeReq({ scope })
    req.body = { code_provider: "whatsapp-otp", entity_id: "+22670000002" }
    const res = createFakeRes()
    await whatsappOtpVerificationRateLimitMiddleware(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- middlewares`
Expected: FAIL with "whatsappOtpVerificationRateLimitMiddleware is not a function" (or similar import error)

- [ ] **Step 3: Write minimal implementation**

Add near the other rate-limit constants at the top of `apps/backend/src/api/middlewares.ts`:

```typescript
const WHATSAPP_OTP_MAX_REQUESTS = 5
const WHATSAPP_OTP_WINDOW_SECONDS = 15 * 60
```

Add this middleware function (same file, alongside `resetPasswordRateLimitMiddleware`/`semanticSearchRateLimitMiddleware`):

```typescript
// Limite uniquement les demandes de vérification whatsapp-otp (nouveau
// provider, code livré par un vrai message WhatsApp facturé) - ne touche
// jamais au comportement du provider "token" par défaut, non concerné par
// cette itération. La route /auth/verification/request est générique à
// tous les code_provider, donc le filtre se fait ici sur le corps de la
// requête plutôt que sur l'URL.
export async function whatsappOtpVerificationRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const codeProvider = (req.body as Record<string, unknown> | undefined)?.code_provider

  if (codeProvider !== "whatsapp-otp") {
    return next()
  }

  try {
    const cache = req.scope.resolve(Modules.CACHE)
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"
    const rateLimitOptions = {
      maxRequests: WHATSAPP_OTP_MAX_REQUESTS,
      windowSeconds: WHATSAPP_OTP_WINDOW_SECONDS,
    }

    const ipResult = await checkRateLimit(cache, `rate-limit:auth-whatsapp-otp:${ip}`, rateLimitOptions)

    const rawEntityId = (req.body as Record<string, unknown> | undefined)?.entity_id
    const entityResult =
      typeof rawEntityId === "string"
        ? await checkRateLimit(cache, `rate-limit:auth-whatsapp-otp:entity:${rawEntityId}`, rateLimitOptions)
        : null

    const blockedResult = !ipResult.allowed ? ipResult : entityResult && !entityResult.allowed ? entityResult : null

    if (blockedResult) {
      res.setHeader("Retry-After", String(blockedResult.retryAfterSeconds))
      res.status(429).json({
        type: "rate_limit_exceeded",
        message: "Trop de demandes de code de vérification. Réessayez plus tard.",
      })
      return
    }
  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Limiteur de débit indisponible pour la vérification whatsapp-otp, requête laissée passer : ${errorMessage}`)
  }

  next()
}
```

Add to the `routes` array inside `defineMiddlewares({ ... })`:

```typescript
    {
      matcher: "/auth/verification/request",
      methods: ["POST"],
      middlewares: [whatsappOtpVerificationRateLimitMiddleware],
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- middlewares`
Expected: PASS (all previous tests + 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/middlewares.ts apps/backend/src/api/__tests__/middlewares.unit.spec.ts
git commit -m "feat(auth): limite le débit des demandes de code whatsapp-otp"
```

---

## Task 6: Route to link a secondary email identity

**Files:**
- Create: `apps/backend/src/lib/link-email-identity.ts`
- Create: `apps/backend/src/api/store/customers/me/link-email-identity/route.ts`
- Test: `apps/backend/src/lib/__tests__/link-email-identity.unit.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `linkEmailIdentity(authModuleService, input: {email: string, password: string, customerId: string}): Promise<{success: true} | {success: false, error: string}>` — used only by the route file in this same task; no other task depends on it.

**Important — this route needs explicit auth middleware, or it will always 401:**
custom Medusa routes do **not** automatically populate `req.auth_context`
just by being under `/store/customers/me/*` — that only happens if the
`authenticate(...)` middleware (`@medusajs/framework/http`, confirmed by
reading `authenticate-middleware.js` directly) is explicitly registered for
the route's matcher in `middlewares.ts`. Without Step 4 below, this route
would compile and deploy fine but reject every request with 401, even with
a valid bearer token.

The pure logic (identity creation + linking + the "already taken by another
customer" check) lives in `lib/link-email-identity.ts` so it can be unit
tested with a fake `authModuleService`, matching this project's established
pattern of keeping side-effecting logic in a plain, injectable function
(see `storefront-revalidate-client.ts`, `meta-conversions-client.ts`). The
route file itself is a thin HTTP wrapper with no independent test — the
Medusa route layer (auth, body parsing, zod validation of the generic shape)
is exercised by every other `/store/customers/me/*` route already and isn't
re-tested here.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/lib/__tests__/link-email-identity.unit.spec.ts
import { linkEmailIdentity } from "../link-email-identity"

function createFakeAuthModuleService(overrides: { existingIdentityCustomerId?: string | null } = {}) {
  return {
    register: jest.fn(async () => ({
      success: true,
      authIdentity: { id: "authid_email_1" },
    })),
    listAuthIdentities: jest.fn(async () => {
      if (overrides.existingIdentityCustomerId === undefined) {
        return []
      }
      return [
        {
          id: "authid_email_existing",
          app_metadata: overrides.existingIdentityCustomerId
            ? { customer_id: overrides.existingIdentityCustomerId }
            : {},
        },
      ]
    }),
  }
}

jest.mock("@medusajs/core-flows", () => ({
  setAuthAppMetadataWorkflow: () => ({
    run: jest.fn(async () => ({ result: {} })),
  }),
}))

describe("linkEmailIdentity", () => {
  const container = { resolve: jest.fn() } as any

  it("crée une identité email et la lie au client donné", async () => {
    const authModuleService = createFakeAuthModuleService()

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "motdepasse123",
      customerId: "cus_1",
    })

    expect(result).toEqual({ success: true })
    expect(authModuleService.register).toHaveBeenCalledWith("emailpass", {
      body: { email: "client@example.com", password: "motdepasse123" },
    })
  })

  it("refuse si l'email est déjà lié à un autre client", async () => {
    const authModuleService = createFakeAuthModuleService({ existingIdentityCustomerId: "cus_other" })

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "motdepasse123",
      customerId: "cus_1",
    })

    expect(result).toEqual({
      success: false,
      error: "Cet email est déjà associé à un autre compte.",
    })
    expect(authModuleService.register).not.toHaveBeenCalled()
  })

  it("autorise si l'email existe déjà mais appartient déjà au même client", async () => {
    const authModuleService = createFakeAuthModuleService({ existingIdentityCustomerId: "cus_1" })

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "motdepasse123",
      customerId: "cus_1",
    })

    expect(result).toEqual({ success: true })
  })

  it("retourne une erreur si l'enregistrement de l'identité échoue", async () => {
    const authModuleService = createFakeAuthModuleService()
    authModuleService.register = jest.fn(async () => ({
      success: false,
      error: "Password should be a string",
    }))

    const result = await linkEmailIdentity(authModuleService as any, container, {
      email: "client@example.com",
      password: "",
      customerId: "cus_1",
    })

    expect(result).toEqual({ success: false, error: "Password should be a string" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- link-email-identity`
Expected: FAIL with "Cannot find module '../link-email-identity'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/lib/link-email-identity.ts
import { setAuthAppMetadataWorkflow } from "@medusajs/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"

export type LinkEmailIdentityInput = {
  email: string
  password: string
  customerId: string
}

export type LinkEmailIdentityResult = { success: true } | { success: false; error: string }

/**
 * Enregistre une seconde identité emailpass (en plus de celle du téléphone,
 * déjà liée au client via le flux d'inscription normal) et la lie au même
 * customer_id, pour permettre la connexion par email ou par téléphone - voir
 * docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md,
 * section "Décision : deux identités liées au même client".
 */
export async function linkEmailIdentity(
  authModuleService: any,
  container: MedusaContainer,
  input: LinkEmailIdentityInput
): Promise<LinkEmailIdentityResult> {
  const existingIdentities = await authModuleService.listAuthIdentities({
    entity_id: input.email,
    provider: "emailpass",
  })

  const existingCustomerId = existingIdentities[0]?.app_metadata?.customer_id

  if (existingCustomerId && existingCustomerId !== input.customerId) {
    return { success: false, error: "Cet email est déjà associé à un autre compte." }
  }

  if (existingCustomerId === input.customerId) {
    return { success: true }
  }

  const registerResult = await authModuleService.register("emailpass", {
    body: { email: input.email, password: input.password },
  })

  if (!registerResult.success || !registerResult.authIdentity) {
    return { success: false, error: registerResult.error ?? "Échec de la création de l'identité email." }
  }

  await setAuthAppMetadataWorkflow(container).run({
    input: {
      authIdentityId: registerResult.authIdentity.id,
      actorType: "customer",
      value: input.customerId,
    },
  })

  return { success: true }
}
```

Create the route:

```typescript
// apps/backend/src/api/store/customers/me/link-email-identity/route.ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { linkEmailIdentity } from "../../../../../lib/link-email-identity"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { email, password } = (req.body as Record<string, unknown>) ?? {}

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ message: "Email invalide." })
    return
  }

  if (typeof password !== "string" || !password) {
    res.status(400).json({ message: "Mot de passe requis." })
    return
  }

  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    res.status(401).json({ message: "Non authentifié." })
    return
  }

  const authModuleService = req.scope.resolve(Modules.AUTH)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const result = await linkEmailIdentity(authModuleService, req.scope, {
      email,
      password,
      customerId,
    })

    if (!result.success) {
      res.status(400).json({ message: result.error })
      return
    }

    res.status(200).json({ success: true })
  } catch (error) {
    logger.error("Échec de la liaison d'une identité email secondaire", error as Error)
    res.status(500).json({ message: "Une erreur est survenue." })
  }
}
```

- [ ] **Step 4: Register the authentication middleware for the new route**

In `apps/backend/src/api/middlewares.ts`, add this import at the top:

```typescript
import { authenticate } from "@medusajs/framework/http"
```

Add this entry to the `routes` array inside `defineMiddlewares({ ... })`:

```typescript
    {
      matcher: "/store/customers/me/link-email-identity",
      methods: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- link-email-identity`
Expected: PASS (4 tests)

- [ ] **Step 6: Manually verify the route rejects unauthenticated requests and accepts authenticated ones**

Deploy to staging (same circuit as Task 3 Step 4), then:

```bash
# No token: expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://staging.golden-market.co/store/customers/me/link-email-identity" \
  -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"x"}'

# With a valid customer bearer token (from a real staging login): expect 200 or a 400 with a clear message, never 401
curl -s -X POST "https://staging.golden-market.co/store/customers/me/link-email-identity" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid staging customer JWT>" \
  -d '{"email":"test@example.com","password":"x"}'
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib/link-email-identity.ts apps/backend/src/lib/__tests__/link-email-identity.unit.spec.ts apps/backend/src/api/store/customers/me/link-email-identity/route.ts apps/backend/src/api/middlewares.ts
git commit -m "feat(auth): ajoute la route de liaison d'une identité email secondaire"
```

---

## Task 7: Documentation

**Files:**
- Modify: `apps/backend/.env.template`
- Modify: `AGENTS.md` (repo root)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Document the new WhatsApp template dependency**

Add near the existing `N8N_ORDER_CONFIRMATION_WEBHOOK_URL` documentation in
`apps/backend/.env.template` (find that section first by reading the file):

```
# --- Vérification de compte par téléphone (WhatsApp) ---
# Réutilise N8N_ORDER_CONFIRMATION_WEBHOOK_URL/_SECRET ci-dessus (webhook
# générique, pas spécifique aux commandes). Nécessite le template Meta
# "account_verification_code" approuvé - voir
# docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md
```

- [ ] **Step 2: Add a short section to AGENTS.md**

Read `AGENTS.md` first to find where similar one-shot/infra notes live (see
the existing "Recherche sémantique produits" section for the style to
match), then add a short section:

```markdown
### Téléphone comme identifiant principal du compte client

Le téléphone est l'identifiant d'authentification principal (obligatoire à
l'inscription), l'email est facultatif — voir
`docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md`.
Nouveau provider de vérification Medusa `whatsapp-otp`
(`apps/backend/src/modules/whatsapp-otp-verification.ts`, code à 6 chiffres,
livré par le webhook n8n existant). **Nécessite le template Meta
`account_verification_code` approuvé** pour fonctionner en conditions
réelles - sans lui, le code est généré et stocké côté backend mais jamais
livré au client.

**Non traité, limite connue et documentée** : réinitialisation de mot de
passe pour un compte inscrit uniquement par téléphone (le subscriber
`auth-password-reset.ts` traite l'identifiant comme un email et échoue
silencieusement sinon).
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/.env.template AGENTS.md
git commit -m "docs: documente le provider de vérification whatsapp-otp et sa dépendance au template Meta"
```

---

## Task 8: Storefront — `customer.ts` signup/login/verification logic

**Files:**
- Create: `apps/storefront/src/lib/util/normalize-phone.ts`
- Create: `apps/storefront/src/lib/util/__tests__/normalize-phone.unit.spec.ts` (only if a test runner exists — see Step 0)
- Modify: `apps/storefront/src/lib/data/customer.ts`

**Interfaces:**
- Produces: `normalizePhone(raw: string): string` (byte-for-byte identical
  logic to Task 1's backend copy — the storefront and backend are separate
  Next.js/Medusa apps with no shared package, so this is a deliberate,
  documented duplication, not an oversight).
- Produces (on `customer.ts`): `CustomerAuthState` extended with a new
  `"phone_verification_required"` variant; `signup`, `login` behavior
  changed as described below; new exports `confirmPhoneVerification(code:
  string): Promise<CustomerAuthState>` and `resendPhoneVerification(phone:
  string): Promise<{ success: boolean }>` — both consumed by Task 11's new
  `VerifyPhone` component.

- [ ] **Step 0: Confirm there is no unit test runner for the storefront**

Run: `cd apps/storefront && cat package.json | grep -A3 '"scripts"'`

As of this plan, the storefront has no `test`/`jest`/`vitest` script (only
`test:e2e` via Playwright) — confirmed during the spec's research phase.
If this is still true, skip creating a unit test file for
`normalize-phone.ts` here and instead verify it manually in Step 2 below.
If a unit test runner has since been added, write the same 7 test cases as
Task 1's backend copy before implementing.

- [ ] **Step 1: Write `normalize-phone.ts`**

```typescript
// apps/storefront/src/lib/util/normalize-phone.ts
// Copie volontaire de apps/backend/src/lib/normalize-phone.ts : les deux
// apps sont des projets Next.js/Medusa séparés sans package partagé. Garder
// les deux implémentations identiques si l'une des deux change (voir
// docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md).
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "")

  if (!digitsOnly) {
    throw new Error("Numéro de téléphone invalide")
  }

  const withoutInternationalPrefix = digitsOnly.startsWith("00226")
    ? digitsOnly.slice(2)
    : digitsOnly

  const withCountryCode = withoutInternationalPrefix.startsWith("226")
    ? withoutInternationalPrefix
    : `226${withoutInternationalPrefix}`

  return `+${withCountryCode}`
}
```

- [ ] **Step 2: Manually verify (no test runner)**

Run: `cd apps/storefront && npx tsx -e "
import { normalizePhone } from './src/lib/util/normalize-phone'
console.log(normalizePhone('70 00 00 00'))
console.log(normalizePhone('+22670000000'))
console.log(normalizePhone('0022670000000'))
"`

Expected output: `+22670000000` printed three times. If `tsx` isn't
available, use `npx ts-node` with the same inline script, or a scratch
`.ts` file executed via `npx tsx path/to/file.ts` — either way, confirm
before moving on.

- [ ] **Step 3: Read the current `customer.ts` in full**

Read `apps/storefront/src/lib/data/customer.ts` completely before editing —
the changes below touch `signup`, `login`, `completeLogin`,
`requestVerificationEmail`, and the `CustomerAuthState` type, which are
interleaved with unrelated functions (`retrieveCustomer`,
`updateCustomer`, address helpers) that must not be touched.

- [ ] **Step 4: Update `CustomerAuthState` and add the phone verification helpers**

Replace:

```typescript
export type CustomerAuthState =
  | { state: "error"; error: string }
  | { state: "verification_required"; email: string }
  | { state: "success" }
  | null
```

With:

```typescript
export type CustomerAuthState =
  | { state: "error"; error: string }
  | { state: "verification_required"; email: string }
  | { state: "phone_verification_required"; phone: string }
  | { state: "success" }
  | null
```

Add near `requestVerificationEmail` (keep that function unchanged — it's
still reachable, just never triggered in practice, per the spec's
Non-objectifs):

```typescript
async function requestPhoneVerification(phone: string, token: string) {
  await sdk.auth.verification.request(
    { entity_id: phone, entity_type: "phone", code_provider: "whatsapp-otp" },
    { authorization: `Bearer ${token}` }
  )
}

// Exposé pour le bouton "Renvoyer le code" du nouvel écran de vérification
// (Task 11) - le customer n'existe pas encore à ce stade, donc pas de
// session à réutiliser : on ré-enregistre (idempotent, voir emailpass côté
// backend) pour récupérer un token non vérifié, puis on redemande le code.
export async function resendPhoneVerification(phone: string): Promise<{ success: boolean }> {
  const pending = await getPendingCustomer()

  if (!pending) {
    return { success: false }
  }

  try {
    const loginResult = await sdk.auth.login("customer", "phone-pass", {
      email: phone,
      password: (pending as unknown as { password?: string }).password ?? "",
    })

    if (typeof loginResult !== "string") {
      return { success: false }
    }

    await requestPhoneVerification(phone, loginResult)
    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function confirmPhoneVerification(code: string): Promise<CustomerAuthState> {
  try {
    await sdk.auth.verification.confirm({ code, code_provider: "whatsapp-otp" })
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  const pending = await getPendingCustomer()

  if (!pending?.phone) {
    return { state: "error", error: "Session d'inscription expirée, recommencez." }
  }

  return completeLogin(pending.phone, (pending as unknown as { password?: string }).password ?? "")
}
```

- [ ] **Step 5: Update `signup` to require and normalize phone**

Replace the body of `signup`:

```typescript
export async function signup(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const password = formData.get("password") as string
  const rawPhone = formData.get("phone") as string

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch {
    return { state: "error", error: "Numéro de téléphone invalide." }
  }

  const customerForm = {
    email: formData.get("email") as string,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    phone,
    // Le mot de passe est nécessaire à resendPhoneVerification (ré-inscription
    // idempotente) et confirmPhoneVerification (relance login()) - jamais
    // affiché, jamais envoyé ailleurs qu'aux appels sdk.auth.* déjà existants.
    password,
  }

  try {
    // "phone-pass" (pas "emailpass") : voir Task 3 pour pourquoi le
    // téléphone utilise un id de provider séparé (même package, requis pour
    // que la vérification WhatsApp cible uniquement le téléphone).
    await sdk.auth.register("customer", "phone-pass", {
      email: phone,
      password,
    })
  } catch (error) {
    const fetchError = error as FetchError
    if (
      fetchError.statusText !== "Unauthorized" ||
      fetchError.message !== "Identity with email already exists"
    ) {
      return { state: "error", error: String(error) }
    }
  }

  await setPendingCustomer(customerForm as unknown as PendingCustomer)

  return completeLogin(phone, password)
}
```

Add `password` to the `PendingCustomer` type (find it in this same file,
near `setPendingCustomer`/`getPendingCustomer`):

```typescript
export type PendingCustomer = {
  email: string
  first_name?: string
  last_name?: string
  phone?: string
  password?: string
}
```

Note: this type is defined in `cookies.ts`, not `customer.ts` — check the
import at the top of `customer.ts` (`import { ..., setPendingCustomer,
getPendingCustomer, PendingCustomer, ... } from "./cookies"`) and make this
edit in `apps/storefront/src/lib/data/cookies.ts` instead, at the
`PendingCustomer` type definition found in Task discovery (grep confirmed
its exact location: `apps/storefront/src/lib/data/cookies.ts`, alongside
`setPendingCustomer`/`getPendingCustomer`).

Add the import at the top of `customer.ts`:

```typescript
import { normalizePhone } from "@lib/util/normalize-phone"
```

- [ ] **Step 6: Update `completeLogin` to call the right provider, branch on `verification_required` for phone vs. email, and link an email identity when present**

Find the top of `completeLogin`:

```typescript
async function completeLogin(
  email: string,
  password: string
): Promise<CustomerAuthState> {
  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", "emailpass", { email, password })
  } catch (error) {
    return { state: "error", error: String(error) }
  }
```

Replace with:

```typescript
async function completeLogin(
  email: string,
  password: string
): Promise<CustomerAuthState> {
  // "email" ici est en réalité soit un vrai email, soit un numéro de
  // téléphone normalisé (toujours préfixé "+") - voir Task 3 pour pourquoi
  // ça détermine un provider d'authentification différent ("phone-pass" vs
  // "emailpass"), pas juste une différence cosmétique de nom de champ.
  const provider = email.startsWith("+") ? "phone-pass" : "emailpass"

  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", provider, { email, password })
  } catch (error) {
    return { state: "error", error: String(error) }
  }
```

Find this block further down inside the same function:

```typescript
  if (
    typeof result === "object" &&
    "verification_required" in result &&
    result.verification_required
  ) {
    try {
      await requestVerificationEmail(email, result.token)
    } catch {
      // Ignore: the customer can resend from the verification page.
    }
    return { state: "verification_required", email }
  }
```

Replace with:

```typescript
  if (
    typeof result === "object" &&
    "verification_required" in result &&
    result.verification_required
  ) {
    const isPhone = provider === "phone-pass"

    try {
      if (isPhone) {
        await requestPhoneVerification(email, result.token)
      } else {
        await requestVerificationEmail(email, result.token)
      }
    } catch {
      // Ignore: the customer can resend from the verification page.
    }

    return isPhone
      ? { state: "phone_verification_required", phone: email }
      : { state: "verification_required", email }
  }
```

Find this block further down (customer creation after a successful/verified login):

```typescript
  if (!customerExists) {
    const pending = await getPendingCustomer()

    try {
      await sdk.store.customer.create(
        {
          email,
          first_name: pending?.first_name,
          last_name: pending?.last_name,
          phone: pending?.phone,
        },
        {},
        { authorization: `Bearer ${token}` }
      )

      token = (await sdk.auth.login("customer", "emailpass", {
        email,
        password,
      })) as string
    } catch (error) {
      return { state: "error", error: String(error) }
    }

    await removePendingCustomer()
  }
```

Replace with:

```typescript
  if (!customerExists) {
    const pending = await getPendingCustomer()
    const isPhoneLogin = provider === "phone-pass"

    try {
      const createdCustomer = await sdk.store.customer.create(
        {
          // Un login par téléphone ne doit jamais écrire le numéro dans le
          // champ email du client - seul un email fourni par le client
          // (pending.email) va dans customer.email.
          email: isPhoneLogin ? pending?.email : email,
          first_name: pending?.first_name,
          last_name: pending?.last_name,
          phone: isPhoneLogin ? email : pending?.phone,
        },
        {},
        { authorization: `Bearer ${token}` }
      )

      token = (await sdk.auth.login("customer", provider, {
        email,
        password,
      })) as string

      // Client inscrit par téléphone ET ayant renseigné un email : lie une
      // seconde identité emailpass au même client pour permettre la
      // connexion par les deux (voir spec, "Décision : deux identités liées").
      if (isPhoneLogin && pending?.email) {
        await sdk.client.fetch("/store/customers/me/link-email-identity", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: { email: pending.email, password },
        })
      }
    } catch (error) {
      return { state: "error", error: String(error) }
    }

    await removePendingCustomer()
  }
```

- [ ] **Step 7: Update `login` to accept a phone-or-email identifier**

Replace:

```typescript
export async function login(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  return completeLogin(email, password)
}
```

With:

```typescript
export async function login(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const rawIdentifier = formData.get("identifier") as string
  const password = formData.get("password") as string

  // Une chaîne qui, une fois débarrassée des séparateurs habituels, ne
  // contient que des chiffres est traitée comme un téléphone (et normalisée
  // en conséquence) ; sinon elle est envoyée telle quelle (email).
  const looksLikePhone = /^[\d\s()+-]+$/.test(rawIdentifier.trim())
  let identifier = rawIdentifier

  if (looksLikePhone) {
    try {
      identifier = normalizePhone(rawIdentifier)
    } catch {
      return { state: "error", error: "Identifiant invalide." }
    }
  }

  return completeLogin(identifier, password)
}
```

- [ ] **Step 8: Verify the storefront still builds**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (fix any type errors surfaced by the edits above
before moving on — in particular, confirm `PendingCustomer`'s `password`
field addition in `cookies.ts` doesn't conflict with anything else reading
that type).

- [ ] **Step 9: Commit**

```bash
git add apps/storefront/src/lib/util/normalize-phone.ts apps/storefront/src/lib/data/customer.ts apps/storefront/src/lib/data/cookies.ts
git commit -m "feat(auth): téléphone obligatoire à l'inscription, connexion par téléphone ou email"
```

---

## Task 9: Storefront — register form

**Files:**
- Modify: `apps/storefront/src/modules/account/components/register/index.tsx`

**Interfaces:**
- Consumes: `signup` from Task 8 (unchanged signature — still a
  `useActionState` action).
- Produces: adds `VERIFY_PHONE = "verify-phone"` to the `LOGIN_VIEW` enum
  in `apps/storefront/src/modules/account/templates/login-template.tsx`
  (this task runs before Task 11, which renders that view but does not
  redefine the enum member — do not add it twice).

- [ ] **Step 0: Add the new view to `LOGIN_VIEW`**

In `apps/storefront/src/modules/account/templates/login-template.tsx`,
add to the enum:

```typescript
export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot-password",
  VERIFY_PHONE = "verify-phone",
}
```

Task 11 adds the render branch and the `VerifyPhone` component itself —
this step only adds the enum member, since `Register` (this task) needs to
reference it in Step 2 below before that component exists.

- [ ] **Step 1: Make phone required and labeled, email optional**

In `apps/storefront/src/modules/account/components/register/index.tsx`,
replace the two `Input` blocks for email and phone:

```typescript
          <Input
            label="Email (facultatif)"
            name="email"
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="Téléphone (WhatsApp)"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            data-testid="phone-input"
          />
```

(This is the same two `Input` elements already in the file, at the
`email`/`phone` `name` props — just remove `required` from email, add it to
phone, and update both labels. Order in the form doesn't need to change.)

- [ ] **Step 2: Redirect to the code screen when a phone verification is required**

Add a `useEffect` right after the `useActionState` call:

```typescript
  useEffect(() => {
    if (message?.state === "phone_verification_required") {
      setCurrentView(LOGIN_VIEW.VERIFY_PHONE)
    }
  }, [message, setCurrentView])
```

Add `useEffect` to the existing `import { useActionState } from "react"` line:

```typescript
import { useActionState, useEffect } from "react"
```

- [ ] **Step 3: Remove the now-dead inline verification message**

Delete this block (it only ever matched the old, always-required-email
flow's `verification_required` state, which is unreachable for phone
signups after Task 8's changes — the new `phone_verification_required`
state now navigates away via Step 2 instead of rendering inline):

```typescript
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
```

- [ ] **Step 4: Verify the storefront still builds**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/modules/account/components/register/index.tsx
git commit -m "feat(auth): téléphone obligatoire (WhatsApp) et email facultatif au formulaire d'inscription"
```

---

## Task 10: Storefront — login form

**Files:**
- Modify: `apps/storefront/src/modules/account/components/login/index.tsx`

**Interfaces:**
- Consumes: `login` from Task 8 (now reads `formData.get("identifier")` instead of `"email"`).

- [ ] **Step 1: Replace the email field with a single identifier field**

Replace:

```typescript
          <Input
            label="Email"
            name="email"
            type="email"
            title="Entrez une adresse email valide."
            autoComplete="email"
            required
            data-testid="email-input"
          />
```

With:

```typescript
          <Input
            label="Téléphone (WhatsApp) ou email"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            data-testid="identifier-input"
          />
```

(`type="text"` is required here, not `type="email"` — a phone number fails
native HTML5 email validation, which would block the form from submitting
at all for a phone-based login attempt.)

- [ ] **Step 2: Update the dead inline verification message's data-testid usage (no functional change needed)**

The `message?.state === "verification_required"` block in this file stays
as-is (email login can still theoretically require verification, even
though nothing sends the email today — same Non-objectif as Task 8). No
edit needed here beyond Step 1.

- [ ] **Step 3: Verify the storefront still builds**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/modules/account/components/login/index.tsx
git commit -m "feat(auth): le formulaire de connexion accepte le téléphone ou l'email"
```

---

## Task 11: Storefront — phone verification code screen

**Files:**
- Create: `apps/storefront/src/modules/account/components/verify-phone/index.tsx`
- Modify: `apps/storefront/src/modules/account/templates/login-template.tsx`

**Interfaces:**
- Consumes: `confirmPhoneVerification`, `resendPhoneVerification` from Task 8,
  and the `LOGIN_VIEW.VERIFY_PHONE` enum member added by Task 9 Step 0
  (already present in `login-template.tsx` by the time this task runs — do
  not redefine the enum here).

- [ ] **Step 1: Render the new view in `login-template.tsx`**

Add the import and render branch to
`apps/storefront/src/modules/account/templates/login-template.tsx`
(the `VERIFY_PHONE` enum member itself already exists, added by Task 9):

```typescript
import VerifyPhone from "@modules/account/components/verify-phone"
```

```typescript
      {currentView === LOGIN_VIEW.VERIFY_PHONE && (
        <VerifyPhone setCurrentView={setCurrentView} />
      )}
```

- [ ] **Step 2: Write the `VerifyPhone` component**

```typescript
// apps/storefront/src/modules/account/components/verify-phone/index.tsx
"use client"

import { useActionState, useState } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { Heading } from "@modules/common/components/ui"
import { confirmPhoneVerification, resendPhoneVerification } from "@lib/data/customer"
import { getPendingCustomer } from "@lib/data/cookies"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const VerifyPhone = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(
    async (_currentState: unknown, formData: FormData) => confirmPhoneVerification(formData.get("code") as string),
    null
  )
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle")

  const handleResend = async () => {
    setResendState("sending")
    const pending = await getPendingCustomer()
    if (pending?.phone) {
      await resendPhoneVerification(pending.phone)
    }
    setResendState("sent")
  }

  if (message?.state === "success") {
    setCurrentView(LOGIN_VIEW.SIGN_IN)
  }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="verify-phone-page"
    >
      <Heading level="h1" className="text-xl mb-2 text-center">
        Vérifiez votre numéro
      </Heading>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Nous vous avons envoyé un code à 6 chiffres par WhatsApp. Entrez-le
        ci-dessous pour activer votre compte.
      </p>
      <form className="w-full flex flex-col" action={formAction}>
        <Input
          label="Code de vérification"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          data-testid="verification-code-input"
        />
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="verify-phone-error"
        />
        <SubmitButton className="w-full mt-6" data-testid="verify-phone-button">
          Vérifier
        </SubmitButton>
      </form>
      <button
        type="button"
        onClick={handleResend}
        disabled={resendState !== "idle"}
        className="text-center text-sm text-gm-amethyst font-semibold hover:underline mt-6 disabled:opacity-50"
        data-testid="resend-code-button"
      >
        {resendState === "sent" ? "Code renvoyé" : "Renvoyer le code"}
      </button>
    </div>
  )
}

export default VerifyPhone
```

- [ ] **Step 3: Verify the storefront still builds**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors. If `getPendingCustomer` isn't exported from
`@lib/data/cookies` (check the existing export list in that file first),
add `export` to its declaration — it's likely already internal-only since
only `customer.ts` used it before this task.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/modules/account/components/verify-phone/index.tsx apps/storefront/src/modules/account/templates/login-template.tsx apps/storefront/src/lib/data/cookies.ts
git commit -m "feat(auth): ajoute l'écran de saisie du code de vérification WhatsApp"
```

---

## Task 12: Storefront — forgot-password label (documented limitation, not a fix)

**Files:**
- Modify: `apps/storefront/src/modules/account/components/forgot-password/index.tsx`

**Interfaces:** none.

- [ ] **Step 1: Update the label and add the limitation comment**

Replace:

```typescript
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Indiquez votre email, nous vous enverrons un lien pour réinitialiser
        votre mot de passe.
      </p>
```

With:

```typescript
      {/* La réinitialisation ne fonctionne aujourd'hui que pour un compte
          ayant un email : voir docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md,
          section Non-objectifs. Le libellé reste volontairement générique
          (cohérent avec le reste du flux de connexion) plutôt que d'exposer
          cette limitation interne au client. */}
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Indiquez votre téléphone (WhatsApp) ou email, nous vous enverrons un
        lien pour réinitialiser votre mot de passe.
      </p>
```

Note: the underlying `requestPasswordReset` call is NOT changed by this
task — only the label. A phone-only customer using this form will not
receive anything, silently, until the follow-up work described in the
spec's Non-objectifs is done. This is intentional per that decision, not an
oversight.

- [ ] **Step 2: Verify the storefront still builds**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/modules/account/components/forgot-password/index.tsx
git commit -m "docs(auth): met à jour le libellé mot de passe oublié (limitation téléphone documentée)"
```

---

## Task 13: Backend — register-from-order and claim-order routes

**Files:**
- Create: `apps/backend/src/lib/register-customer-from-order.ts`
- Create: `apps/backend/src/lib/__tests__/register-customer-from-order.unit.spec.ts`
- Create: `apps/backend/src/api/store/register-from-order/route.ts`
- Create: `apps/backend/src/api/store/customers/me/claim-order/route.ts`
- Modify: `apps/backend/src/api/middlewares.ts`

**Interfaces:**
- Consumes: `normalizePhone` from Task 1.
- Produces: `registerCustomerFromOrder(authModuleService, input: {phone: string, password: string}): Promise<{success: true, authIdentityId: string} | {success: false, error: string}>` — used only by the `register-from-order` route in this task.

**Context — why account creation and order claiming are two separate calls:**
at the moment `register-from-order` runs, no customer record exists yet —
the storefront (Task 14) still has to call the *existing* `completeLogin`
logic (Task 8) to actually create the customer and, if an email was also
given, link it. Only once that customer is real and the storefront holds a
session for it does claiming the order make sense — hence `claim-order` is
a second, authenticated call the storefront makes right after.

**Context — why this bypasses the code screen:** per the approved design,
an order confirmation already sent by WhatsApp to this exact number is
treated as sufficient proof of phone ownership — no code is shown to the
customer here. This is done by calling the auth module's public
`requestAuthVerification`/`confirmAuthVerification` methods **directly**
(not the HTTP `/auth/verification/*` routes, which go through
`requestVerificationWorkflow` and would emit
`AuthWorkflowEvents.VERIFICATION_REQUESTED` — read directly in
`@medusajs/medusa/dist/api/auth/verification/request/route.js` to confirm
only the *workflow* emits that event, not the plain module method). Calling
the module methods directly generates the code and immediately confirms it
server-side, in one request, without ever triggering the WhatsApp
subscriber from Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/lib/__tests__/register-customer-from-order.unit.spec.ts
import { registerCustomerFromOrder } from "../register-customer-from-order"

function createFakeAuthModuleService() {
  return {
    register: jest.fn(async () => ({
      success: true,
      authIdentity: { id: "authid_phone_1" },
    })),
    requestAuthVerification: jest.fn(async () => ({
      code: "482913",
      expires_at: new Date(),
    })),
    confirmAuthVerification: jest.fn(async () => ({ verified_at: new Date() })),
  }
}

describe("registerCustomerFromOrder", () => {
  it("enregistre l'identité phone-pass puis confirme la vérification sans jamais afficher de code", async () => {
    const authModuleService = createFakeAuthModuleService()

    const result = await registerCustomerFromOrder(authModuleService as any, {
      phone: "+22670000000",
      password: "motdepasse123",
    })

    expect(result).toEqual({ success: true, authIdentityId: "authid_phone_1" })
    expect(authModuleService.register).toHaveBeenCalledWith("phone-pass", {
      body: { email: "+22670000000", password: "motdepasse123" },
    })
    expect(authModuleService.requestAuthVerification).toHaveBeenCalledWith({
      entity_id: "+22670000000",
      auth_identity_id: "authid_phone_1",
      entity_type: "phone",
      code_provider: "whatsapp-otp",
    })
    expect(authModuleService.confirmAuthVerification).toHaveBeenCalledWith({
      code: "482913",
      code_provider: "whatsapp-otp",
    })
  })

  it("retourne une erreur si l'enregistrement de l'identité échoue", async () => {
    const authModuleService = createFakeAuthModuleService()
    authModuleService.register = jest.fn(async () => ({
      success: false,
      error: "Identity with email already exists",
    }))

    const result = await registerCustomerFromOrder(authModuleService as any, {
      phone: "+22670000000",
      password: "motdepasse123",
    })

    expect(result).toEqual({
      success: false,
      error: "Identity with email already exists",
    })
    expect(authModuleService.requestAuthVerification).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npm run test:unit -- register-customer-from-order`
Expected: FAIL with "Cannot find module '../register-customer-from-order'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/lib/register-customer-from-order.ts
export type RegisterCustomerFromOrderInput = {
  phone: string
  password: string
}

export type RegisterCustomerFromOrderResult =
  | { success: true; authIdentityId: string }
  | { success: false; error: string }

/**
 * Enregistre une identité phone-pass et confirme immédiatement sa
 * vérification côté serveur (sans jamais générer de message WhatsApp
 * visible) - voir Task 13 pour la justification : une commande déjà reçue
 * par WhatsApp sur ce numéro est traitée comme preuve suffisante.
 */
export async function registerCustomerFromOrder(
  authModuleService: any,
  input: RegisterCustomerFromOrderInput
): Promise<RegisterCustomerFromOrderResult> {
  const registerResult = await authModuleService.register("phone-pass", {
    body: { email: input.phone, password: input.password },
  })

  if (!registerResult.success || !registerResult.authIdentity) {
    return { success: false, error: registerResult.error ?? "Échec de la création du compte." }
  }

  const verification = await authModuleService.requestAuthVerification({
    entity_id: input.phone,
    auth_identity_id: registerResult.authIdentity.id,
    entity_type: "phone",
    code_provider: "whatsapp-otp",
  })

  await authModuleService.confirmAuthVerification({
    code: verification.code,
    code_provider: "whatsapp-otp",
  })

  return { success: true, authIdentityId: registerResult.authIdentity.id }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npm run test:unit -- register-customer-from-order`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the `register-from-order` route**

```typescript
// apps/backend/src/api/store/register-from-order/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizePhone } from "../../../lib/normalize-phone"
import { registerCustomerFromOrder } from "../../../lib/register-customer-from-order"

type OrderForRegistration = {
  id: string
  customer_id: string | null
  email: string | null
  shipping_address?: { first_name?: string; last_name?: string; phone?: string }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { order_id, password } = (req.body as Record<string, unknown>) ?? {}

  if (typeof order_id !== "string" || !order_id) {
    res.status(400).json({ message: "order_id requis." })
    return
  }

  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ message: "Mot de passe invalide (8 caractères minimum)." })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "email", "shipping_address.first_name", "shipping_address.last_name", "shipping_address.phone"],
    filters: { id: order_id },
  })

  const typedOrder = order as unknown as OrderForRegistration | undefined

  if (!typedOrder) {
    res.status(404).json({ message: "Commande introuvable." })
    return
  }

  if (typedOrder.customer_id) {
    res.status(400).json({ message: "Cette commande est déjà associée à un compte." })
    return
  }

  const rawPhone = typedOrder.shipping_address?.phone

  if (!rawPhone) {
    res.status(400).json({ message: "Aucun numéro de téléphone sur cette commande." })
    return
  }

  const phone = normalizePhone(rawPhone)
  const authModuleService = req.scope.resolve(Modules.AUTH)

  try {
    const result = await registerCustomerFromOrder(authModuleService, { phone, password })

    if (!result.success) {
      res.status(400).json({ message: result.error })
      return
    }

    res.status(200).json({
      phone,
      email: typedOrder.email,
      first_name: typedOrder.shipping_address?.first_name,
      last_name: typedOrder.shipping_address?.last_name,
    })
  } catch (error) {
    logger.error("Échec de la création de compte depuis une commande", error as Error)
    res.status(500).json({ message: "Une erreur est survenue." })
  }
}
```

- [ ] **Step 6: Write the `claim-order` route**

```typescript
// apps/backend/src/api/store/customers/me/claim-order/route.ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizePhone } from "../../../../../lib/normalize-phone"

type OrderForClaim = {
  id: string
  customer_id: string | null
  shipping_address?: { phone?: string }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { order_id } = (req.body as Record<string, unknown>) ?? {}

  if (typeof order_id !== "string" || !order_id) {
    res.status(400).json({ message: "order_id requis." })
    return
  }

  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    res.status(401).json({ message: "Non authentifié." })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  const [
    {
      data: [order],
    },
    {
      data: [customer],
    },
  ] = await Promise.all([
    query.graph({
      entity: "order",
      fields: ["id", "customer_id", "shipping_address.phone"],
      filters: { id: order_id },
    }),
    query.graph({
      entity: "customer",
      fields: ["id", "phone"],
      filters: { id: customerId },
    }),
  ])

  const typedOrder = order as unknown as OrderForClaim | undefined

  if (!typedOrder) {
    res.status(404).json({ message: "Commande introuvable." })
    return
  }

  if (typedOrder.customer_id) {
    res.status(400).json({ message: "Cette commande est déjà associée à un compte." })
    return
  }

  const orderPhone = typedOrder.shipping_address?.phone
  const customerPhone = (customer as unknown as { phone?: string } | undefined)?.phone

  if (!orderPhone || !customerPhone || normalizePhone(orderPhone) !== normalizePhone(customerPhone)) {
    res.status(403).json({ message: "Cette commande n'appartient pas à ce compte." })
    return
  }

  try {
    const orderModuleService = req.scope.resolve(Modules.ORDER)
    await orderModuleService.updateOrders(order_id, { customer_id: customerId })
    res.status(200).json({ success: true })
  } catch (error) {
    logger.error("Échec du rattachement d'une commande au compte créé", error as Error)
    res.status(500).json({ message: "Une erreur est survenue." })
  }
}
```

- [ ] **Step 7: Register auth middleware for `claim-order`**

In `apps/backend/src/api/middlewares.ts`, add to the `routes` array (the
`authenticate` import already exists from Task 6):

```typescript
    {
      matcher: "/store/customers/me/claim-order",
      methods: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
```

- [ ] **Step 8: Verify the backend still builds**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/lib/register-customer-from-order.ts apps/backend/src/lib/__tests__/register-customer-from-order.unit.spec.ts apps/backend/src/api/store/register-from-order/route.ts apps/backend/src/api/store/customers/me/claim-order/route.ts apps/backend/src/api/middlewares.ts
git commit -m "feat(auth): ajoute la création de compte post-commande et le rattachement de commande"
```

---

## Task 14: Storefront — account creation prompt on order confirmation

**Files:**
- Modify: `apps/storefront/src/lib/data/orders.ts`
- Modify: `apps/storefront/src/lib/data/customer.ts`
- Create: `apps/storefront/src/modules/order/components/create-account-prompt/index.tsx`
- Modify: `apps/storefront/src/modules/order/templates/order-completed-template.tsx`

**Interfaces:**
- Consumes: the `register-from-order` and `claim-order` routes from Task 13, and the local (unexported) `completeLogin` function already defined in `customer.ts` by Task 8.
- Produces: `createAccountFromOrder(_currentState: unknown, formData: FormData): Promise<CustomerAuthState>`, a new `useActionState`-compatible action.

- [ ] **Step 1: Ensure `retrieveOrder` fetches the fields this prompt needs**

Read `apps/storefront/src/lib/data/orders.ts`. Find the `fields` string
passed to `sdk.client.fetch` inside `retrieveOrder` (currently
`"*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product"`)
and add the missing fields:

```typescript
        fields:
          "*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product,+customer_id,+email,+shipping_address.first_name,+shipping_address.last_name,+shipping_address.phone",
```

- [ ] **Step 2: Add `createAccountFromOrder` to `customer.ts`**

Add this new export to `apps/storefront/src/lib/data/customer.ts` (it calls
the existing, unexported `completeLogin` directly — no export needed for
that function, since this new code lives in the same file):

```typescript
type RegisterFromOrderResponse = {
  phone: string
  email: string | null
  first_name?: string
  last_name?: string
}

export async function createAccountFromOrder(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const orderId = formData.get("order_id") as string
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirm_password") as string

  if (password !== confirmPassword) {
    return { state: "error", error: "Les mots de passe ne correspondent pas." }
  }

  if (password.length < 8) {
    return { state: "error", error: "Le mot de passe doit contenir au moins 8 caractères." }
  }

  let registration: RegisterFromOrderResponse

  try {
    registration = await sdk.client.fetch<RegisterFromOrderResponse>(
      "/store/register-from-order",
      {
        method: "POST",
        body: { order_id: orderId, password },
      }
    )
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  // completeLogin (Task 8) lit first_name/last_name/phone/email depuis
  // getPendingCustomer() au moment de créer le client - on les y dépose
  // avant de l'appeler, exactement comme signup() le fait déjà.
  await setPendingCustomer({
    email: registration.email ?? undefined,
    first_name: registration.first_name,
    last_name: registration.last_name,
    phone: registration.phone,
  } as unknown as PendingCustomer)

  const loginResult = await completeLogin(registration.phone, password)

  if (loginResult?.state !== "success") {
    return loginResult
  }

  try {
    await sdk.client.fetch("/store/customers/me/claim-order", {
      method: "POST",
      headers: { ...(await getAuthHeaders()) },
      body: { order_id: orderId },
    })
  } catch {
    // Le compte est créé et utilisable même si le rattachement de cette
    // commande précise échoue - ne jamais faire échouer toute l'opération
    // pour ça.
  }

  return { state: "success" }
}
```

- [ ] **Step 3: Write the `CreateAccountPrompt` component**

```typescript
// apps/storefront/src/modules/order/components/create-account-prompt/index.tsx
"use client"

import { useActionState } from "react"
import Input from "@modules/common/components/input"
import { Heading } from "@modules/common/components/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { createAccountFromOrder } from "@lib/data/customer"

type Props = {
  orderId: string
  phone?: string
}

const CreateAccountPrompt = ({ orderId, phone }: Props) => {
  const [message, formAction] = useActionState(createAccountFromOrder, null)

  if (message?.state === "success") {
    return (
      <div
        className="w-full rounded-2xl border border-gm-border bg-white p-6 text-center text-sm text-gm-ink"
        data-testid="create-account-success"
      >
        Votre compte a été créé. Vous pouvez suivre vos commandes depuis
        votre espace client.
      </div>
    )
  }

  return (
    <div
      className="w-full rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="create-account-prompt"
    >
      <Heading level="h2" className="text-xl mb-2">
        Créez votre compte
      </Heading>
      <p className="text-sm text-gm-ink-muted mb-6">
        {phone
          ? `Retrouvez toutes vos commandes en créant un compte avec le numéro ${phone}. Choisissez simplement un mot de passe.`
          : "Retrouvez toutes vos commandes en créant un compte. Choisissez simplement un mot de passe."}
      </p>
      <form action={formAction} className="flex flex-col gap-y-2">
        <input type="hidden" name="order_id" value={orderId} />
        <Input
          label="Mot de passe"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          data-testid="create-account-password-input"
        />
        <Input
          label="Confirmer le mot de passe"
          name="confirm_password"
          type="password"
          required
          autoComplete="new-password"
          data-testid="create-account-confirm-password-input"
        />
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="create-account-error"
        />
        <SubmitButton className="mt-4" data-testid="create-account-button">
          Créer mon compte
        </SubmitButton>
      </form>
    </div>
  )
}

export default CreateAccountPrompt
```

- [ ] **Step 4: Render it on the order confirmation page for guest orders**

In `apps/storefront/src/modules/order/templates/order-completed-template.tsx`,
add the import:

```typescript
import CreateAccountPrompt from "@modules/order/components/create-account-prompt"
```

Add, right after the closing `</div>` of the `data-testid="order-complete-container"`
block (as a sibling inside the outer `flex flex-col ... gap-y-10` container):

```typescript
        {!order.customer_id && (
          <CreateAccountPrompt
            orderId={order.id}
            phone={(order as unknown as { shipping_address?: { phone?: string } }).shipping_address?.phone}
          />
        )}
```

`order.customer_id` needs to be on the type Next.js infers for `order` —
`HttpTypes.StoreOrder` already declares `customer_id` as an optional field
(standard Medusa type, unaffected by this plan), so no cast is needed for
that specific check; the cast above is only for `shipping_address.phone`,
which is read the same way `ShippingDetails`/`PaymentDetails` already do
elsewhere in this same file (check either of those two components' props
for the exact existing pattern and match it instead of introducing a new
one, if they already narrow this field cleanly).

- [ ] **Step 5: Verify the storefront still builds**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/lib/data/orders.ts apps/storefront/src/lib/data/customer.ts apps/storefront/src/modules/order/components/create-account-prompt/index.tsx apps/storefront/src/modules/order/templates/order-completed-template.tsx
git commit -m "feat(auth): propose la création de compte à la fin d'une commande invité"
```

---

## Rollout (after all 14 tasks)

1. Push the full branch to `staging`, wait for deploy, re-run Task 3 Step 5's
   login check and Task 3 Step 6's verification-gate check, plus a full
   manual pass: register with phone only, register with phone + email,
   confirm login works with both identifiers for the second account.
2. The WhatsApp code will not actually arrive until the
   `account_verification_code` Meta template is approved — if it isn't yet,
   verify the code path with `curl` directly against
   `/auth/verification/request` and `/auth/verification/confirm` (the code
   is visible in the backend's own generated response before Meta delivery
   is wired in for real use, and in subscriber logs via `docker logs`).
3. Manually test Task 13/14's flow end-to-end on staging: place a real
   guest order (no login), land on the confirmation page, confirm the
   prompt appears, set a password, confirm the account is created and the
   just-placed order appears under "Mes commandes" — with no WhatsApp
   message sent for this specific flow (per the approved design).
4. Once verified on staging, merge to `main` and deploy to production
   following this project's usual circuit.
5. Update `HANDOFF.md` with a session entry, and update the project's
   memory file for the WhatsApp agent audit / Meta catalog sync topics if
   the new template's approval status becomes relevant there later.
