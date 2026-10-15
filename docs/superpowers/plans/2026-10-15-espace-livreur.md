# Espace livreur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Un livreur se connecte (téléphone + PIN) sur une page mobile-first du storefront, déclare pour chaque commande confiée « livrée oui / non » et ses montants ; l'équipe valide ou renvoie pour correction les rapports « Oui » depuis un onglet « Rapports livreurs » de l'admin.

**Architecture :** Module `delivery` étendu (table `delivery_report`, colonne `courier.pin_hash`). Routes backend `/courier/*` (jeton signé HMAC, sans session admin) appelées uniquement par des route handlers du storefront (`/api/livreur/*`, cookie `httpOnly`). La validation réutilise `submitPaymentForm` (marquer payée + livrée) ; un rapport « Non » réutilise `completeDeliveryWorkflow` (échec). Écrans admin en HTML natif dans `/app/deliveries`.

**Tech Stack :** Medusa 2.18 (Node, MikroORM, Zod, Jest), Next.js (storefront, Tailwind, tokens `--gm-*`), React 18 admin sans `@medusajs/ui`.

**Spec :** `docs/superpowers/specs/2026-10-15-espace-livreur-design.md`

## Global Constraints

- Tout commentaire, message de commit et texte d'interface en **français** ; pas d'emoji dans le code, les commentaires ni les commits.
- **Aucun trailer `Co-Authored-By`** dans les commits.
- Pas de point-virgule dans le backend, guillemets doubles, indentation 2 espaces, fichiers en kebab-case (le storefront et l'admin existants gardent leur style actuel : points-virgules côté admin `page.tsx`/`delivery-ui`).
- « Frais compagnie de transport » devient **« Frais Expédition »** dans les écrans et libellés de caisse.
- Un livreur n'a jamais accès à l'admin Medusa ; une session livreur ne donne accès à aucune route `/admin` ni `/store`.
- Livraison Ouaga (`express`) : le livreur voit et renseigne « Montant encaissé » + « Course du livreur ». Expédition (`expedition`) : il renseigne « Course du livreur » + « Frais Expédition » et **ne voit jamais** « Montant encaissé » ni le montant à encaisser.
- La question « livrée ? » (Oui / Non) est posée d'abord, **sans réponse présélectionnée**. « Non » : motif obligatoire, appliqué sans validation (échec). « Oui » : rapport à valider par l'équipe.
- À la validation, tout est figé sauf le « Montant encaissé » d'une **expédition**, saisi par l'équipe. Renvoi pour correction : motif obligatoire.
- PIN à 4 chiffres, stocké haché (scrypt), jamais renvoyé par une route ; 5 essais ratés par téléphone -> blocage 15 minutes ; jeton livreur valable 12 h.
- Jamais de secret affiché ni commité (`.env`) ; secret de signature = `COOKIE_SECRET`.
- Migrations : générer avec `npx medusa db:generate delivery`, jamais réécrire une migration existante.
- Commandes : `cd apps/backend && npm run test:unit -- <chemin>` ; 2 tests `whatsapp-media-prepare` échouent déjà en local (ffmpeg absent), à ignorer.
- Dev local : backend `http://localhost:9002` (admin `/app`), storefront `http://localhost:8002` ; admin de test `admin-local@golden-market.test` (mot de passe donné par le propriétaire en session ; sinon en recréer un avec `npx medusa user`).

## Review Focus

1. Commande Ouaga déjà payée d'avance (`amount_to_collect = 0`) : le livreur saisit 0 -> refus clair (le formulaire « Marquer payée » exige un montant > 0) ; message « Indiquez le montant encaissé (nombre entier positif en F CFA) ».
2. Journée du livreur déjà validée (versement validé) : l'envoi d'un rapport « Non » ou la validation échoue avec le message existant « Journée déjà validée » au lieu d'une erreur 500 muette.
3. Double envoi (deux onglets, double clic) : un seul rapport par livraison (`delivery_id` unique) ; le second envoi met à jour le rapport tant qu'il n'est pas validé, et est refusé ensuite.
4. Livraison reprise à un autre livreur (changement de livreur) ou annulée pendant qu'un rapport existe : l'ancien livreur ne peut plus la rapporter (contrôle de propriétaire + statut `assigned` à chaque appel).
5. PIN : format invalide (lettres, 3 ou 5 chiffres), livreur désactivé ou sans PIN, 6e essai -> refus sans révéler si le numéro existe ; jeton expiré ou falsifié -> 401.

---

## File Structure

Backend (`apps/backend/src`)
- `lib/courier-report-rules.ts` (créer) : règles pures (champs visibles, analyse d'un rapport, état d'une ligne, synthèse du jour).
- `lib/courier-auth.ts` (créer) : PIN (format, hachage scrypt) et jeton HMAC.
- `lib/courier-reports.ts` (créer) : lecture du jour et écritures (envoyer, valider, renvoyer) ; seul fichier qui touche aux workflows existants.
- `modules/delivery/models/delivery-report.ts` (créer), `modules/delivery/models/courier.ts` (modifier : `pin_hash`), `modules/delivery/service.ts` (modifier), migration générée.
- `api/courier/middlewares.ts` (créer), `api/courier/login/route.ts`, `api/courier/deliveries/route.ts`, `api/courier/deliveries/[id]/report/route.ts` (créer).
- `api/admin/courier-reports/route.ts`, `api/admin/courier-reports/[id]/route.ts` (id = livreur), `api/admin/courier-reports/[id]/validate/route.ts`, `api/admin/courier-reports/[id]/return/route.ts` (créer) ; `api/admin/couriers/[id]/pin/route.ts` (créer) ; `api/admin/couriers/route.ts` (modifier : `has_pin`).
- `api/middlewares.ts` (modifier : brancher `courierMiddlewares`).

Admin
- `admin/lib/deliveries.ts` (modifier : types rapports), `admin/components/courier-reports-tab.tsx` (créer), `admin/routes/deliveries/page.tsx` (modifier : onglet + PIN), `admin/widgets/order-mark-paid.tsx` (renommer le libellé).

Storefront (`apps/storefront/src`)
- `app/api/livreur/[...path]/route.ts` (créer) : relais vers le backend.
- `app/[countryCode]/(livreur)/layout.tsx`, `.../livreur/page.tsx`, `modules/livreur/*` (créer) : page mobile-first.

---

### Task 1: Règles pures (rapport, PIN, jeton)

**Files:**
- Create: `apps/backend/src/lib/courier-report-rules.ts`
- Create: `apps/backend/src/lib/courier-auth.ts`
- Test: `apps/backend/src/lib/__tests__/courier-report-rules.unit.spec.ts`
- Test: `apps/backend/src/lib/__tests__/courier-auth.unit.spec.ts`

**Interfaces:**
- Produces (`courier-report-rules.ts`) :
  - `type DeliveryType = "express" | "expedition"`
  - `reportFields(type): { amount_collected: boolean; transport_fee: boolean; courier_fee: true }`
  - `parseReport(type, body): { ok: true; values: ReportValues } | { ok: false; message: string }`
  - `type ReportValues = { delivered: true; failure_reason: null; amount_collected: number | null; courier_fee: number; transport_fee: number | null } | { delivered: false; failure_reason: string; amount_collected: null; courier_fee: null; transport_fee: null }`
  - `type LineState = "todo" | "submitted" | "returned" | "validated" | "failed" | "canceled"`
  - `reportState(delivery: { status: string }, report: { status: string } | null): LineState`
  - `summarizeDay(states: LineState[]): { total: number; todo: number; submitted: number; returned: number; validated: number; failed: number }`
- Produces (`courier-auth.ts`) : `isValidPin(pin: unknown): pin is string`, `hashPin(pin: string): string`, `verifyPin(pin: string, stored: string): boolean`, `signCourierToken(courierId: string, secret: string, now?: number): string`, `verifyCourierToken(token: string, secret: string, now?: number): string | null` (retourne l'id du livreur), `COURIER_TOKEN_TTL_SECONDS = 43200`.

- [ ] **Step 1: Écrire les tests des règles de rapport**

`apps/backend/src/lib/__tests__/courier-report-rules.unit.spec.ts` :

```ts
import { parseReport, reportFields, reportState, summarizeDay } from "../courier-report-rules"

describe("reportFields", () => {
  it("Ouaga : montant encaissé et course, pas de frais d'expédition", () => {
    expect(reportFields("express")).toEqual({ amount_collected: true, transport_fee: false, courier_fee: true })
  })
  it("expédition : course et frais d'expédition, jamais de montant encaissé", () => {
    expect(reportFields("expedition")).toEqual({ amount_collected: false, transport_fee: true, courier_fee: true })
  })
})

describe("parseReport", () => {
  it("la question livrée est obligatoire (aucune réponse par défaut)", () => {
    expect(parseReport("express", {})).toEqual({ ok: false, message: "Indiquez si la commande a été livrée." })
    expect(parseReport("express", { delivered: "oui" })).toEqual({ ok: false, message: "Indiquez si la commande a été livrée." })
  })
  it("non livrée : motif obligatoire, montants ignorés", () => {
    expect(parseReport("express", { delivered: false, failure_reason: "  " })).toEqual({
      ok: false,
      message: "Indiquez pourquoi la commande n'a pas été livrée.",
    })
    expect(parseReport("express", { delivered: false, failure_reason: " Client absent ", amount_collected: 5000 })).toEqual({
      ok: true,
      values: { delivered: false, failure_reason: "Client absent", amount_collected: null, courier_fee: null, transport_fee: null },
    })
  })
  it("Ouaga livrée : montant encaissé entier positif et course obligatoires", () => {
    expect(parseReport("express", { delivered: true, amount_collected: 9500, courier_fee: 1000 })).toEqual({
      ok: true,
      values: { delivered: true, failure_reason: null, amount_collected: 9500, courier_fee: 1000, transport_fee: null },
    })
    expect(parseReport("express", { delivered: true, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("express", { delivered: true, amount_collected: 0, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("express", { delivered: true, amount_collected: 9500.5, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("express", { delivered: true, amount_collected: 9500 })).toMatchObject({ ok: false })
  })
  it("Ouaga : un Frais Expédition envoyé est ignoré", () => {
    const r = parseReport("express", { delivered: true, amount_collected: 9500, courier_fee: 1000, transport_fee: 700 })
    expect(r).toMatchObject({ ok: true, values: { transport_fee: null } })
  })
  it("expédition livrée : course et Frais Expédition obligatoires, montant encaissé refusé du livreur", () => {
    expect(parseReport("expedition", { delivered: true, courier_fee: 1000, transport_fee: 2000, amount_collected: 99999 })).toEqual({
      ok: true,
      values: { delivered: true, failure_reason: null, amount_collected: null, courier_fee: 1000, transport_fee: 2000 },
    })
    expect(parseReport("expedition", { delivered: true, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("expedition", { delivered: true, transport_fee: 2000 })).toMatchObject({ ok: false })
  })
  it("0 accepté pour une course ou des frais, négatif refusé", () => {
    expect(parseReport("expedition", { delivered: true, courier_fee: 0, transport_fee: 0 })).toMatchObject({ ok: true })
    expect(parseReport("expedition", { delivered: true, courier_fee: -1, transport_fee: 0 })).toMatchObject({ ok: false })
  })
})

describe("reportState et summarizeDay", () => {
  it("état d'une ligne", () => {
    expect(reportState({ status: "assigned" }, null)).toBe("todo")
    expect(reportState({ status: "assigned" }, { status: "submitted" })).toBe("submitted")
    expect(reportState({ status: "assigned" }, { status: "returned" })).toBe("returned")
    expect(reportState({ status: "delivered" }, { status: "validated" })).toBe("validated")
    expect(reportState({ status: "shipped" }, null)).toBe("validated")
    expect(reportState({ status: "failed" }, { status: "applied" })).toBe("failed")
    expect(reportState({ status: "canceled" }, null)).toBe("canceled")
  })
  it("synthèse du jour (les annulées ne comptent pas)", () => {
    expect(summarizeDay(["todo", "submitted", "submitted", "returned", "validated", "failed", "canceled"])).toEqual({
      total: 6,
      todo: 1,
      submitted: 2,
      returned: 1,
      validated: 1,
      failed: 1,
    })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-report-rules`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter les règles**

`apps/backend/src/lib/courier-report-rules.ts` :

```ts
// Rapport de livraison du livreur (spec 2026-10-15 espace-livreur) : règles pures,
// testées, partagées par les routes livreur, les routes admin et lib/courier-reports.ts.

export type DeliveryType = "express" | "expedition"

export type ReportValues =
  | { delivered: true; failure_reason: null; amount_collected: number | null; courier_fee: number; transport_fee: number | null }
  | { delivered: false; failure_reason: string; amount_collected: null; courier_fee: null; transport_fee: null }

// Champs montrés au livreur : en expédition le client paie l'entreprise par
// Mobile Money, le livreur ne connaît pas ce montant (il ne le voit jamais).
export const reportFields = (type: DeliveryType) => ({
  amount_collected: type === "express",
  transport_fee: type === "expedition",
  courier_fee: true as const,
})

const wholeAmount = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

export const parseReport = (
  type: DeliveryType,
  body: { delivered?: unknown; failure_reason?: unknown; amount_collected?: unknown; courier_fee?: unknown; transport_fee?: unknown }
): { ok: true; values: ReportValues } | { ok: false; message: string } => {
  if (typeof body.delivered !== "boolean") return { ok: false, message: "Indiquez si la commande a été livrée." }
  if (!body.delivered) {
    const reason = typeof body.failure_reason === "string" ? body.failure_reason.trim() : ""
    if (!reason) return { ok: false, message: "Indiquez pourquoi la commande n'a pas été livrée." }
    return {
      ok: true,
      values: { delivered: false, failure_reason: reason, amount_collected: null, courier_fee: null, transport_fee: null },
    }
  }
  const fields = reportFields(type)
  const courierFee = wholeAmount(body.courier_fee)
  if (courierFee === null) return { ok: false, message: "Course du livreur invalide : nombre entier en F CFA (0 si aucune)." }
  let amountCollected: number | null = null
  if (fields.amount_collected) {
    amountCollected = wholeAmount(body.amount_collected)
    if (amountCollected === null || amountCollected <= 0) {
      return { ok: false, message: "Indiquez le montant encaissé (nombre entier positif en F CFA)." }
    }
  }
  let transportFee: number | null = null
  if (fields.transport_fee) {
    transportFee = wholeAmount(body.transport_fee)
    if (transportFee === null) return { ok: false, message: "Frais Expédition invalides : nombre entier en F CFA (0 si aucun)." }
  }
  return {
    ok: true,
    values: { delivered: true, failure_reason: null, amount_collected: amountCollected, courier_fee: courierFee, transport_fee: transportFee },
  }
}

export type LineState = "todo" | "submitted" | "returned" | "validated" | "failed" | "canceled"

// État affiché d'une livraison du jour, d'après la livraison et son rapport éventuel.
export const reportState = (delivery: { status: string }, report: { status: string } | null): LineState => {
  if (delivery.status === "canceled") return "canceled"
  if (delivery.status === "delivered" || delivery.status === "shipped") return "validated"
  if (delivery.status === "failed") return "failed"
  if (report?.status === "submitted") return "submitted"
  if (report?.status === "returned") return "returned"
  return "todo"
}

export const summarizeDay = (states: LineState[]) => {
  const counted = states.filter((s) => s !== "canceled")
  const count = (state: LineState) => counted.filter((s) => s === state).length
  return {
    total: counted.length,
    todo: count("todo"),
    submitted: count("submitted"),
    returned: count("returned"),
    validated: count("validated"),
    failed: count("failed"),
  }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-report-rules`
Expected: PASS.

- [ ] **Step 5: Écrire les tests PIN et jeton**

`apps/backend/src/lib/__tests__/courier-auth.unit.spec.ts` :

```ts
import { hashPin, isValidPin, signCourierToken, verifyCourierToken, verifyPin } from "../courier-auth"

describe("PIN", () => {
  it("4 chiffres exactement", () => {
    expect(isValidPin("1234")).toBe(true)
    for (const bad of ["123", "12345", "12a4", "", " 1234", 1234, null, undefined]) expect(isValidPin(bad)).toBe(false)
  })
  it("haché (jamais en clair), vérifiable, sel différent à chaque fois", () => {
    const a = hashPin("1234")
    const b = hashPin("1234")
    expect(a).not.toContain("1234")
    expect(a).not.toEqual(b)
    expect(verifyPin("1234", a)).toBe(true)
    expect(verifyPin("1235", a)).toBe(false)
    expect(verifyPin("1234", "n-importe-quoi")).toBe(false)
  })
})

describe("jeton livreur", () => {
  const secret = "secret-de-test"
  const now = 1_800_000_000_000
  it("aller-retour", () => {
    expect(verifyCourierToken(signCourierToken("cour_1", secret, now), secret, now + 1000)).toBe("cour_1")
  })
  it("expiré après 12 h", () => {
    const token = signCourierToken("cour_1", secret, now)
    expect(verifyCourierToken(token, secret, now + 12 * 3600 * 1000 + 1000)).toBeNull()
  })
  it("falsifié ou mauvais secret", () => {
    const token = signCourierToken("cour_1", secret, now)
    const [payload, sig] = token.split(".")
    expect(verifyCourierToken(`${Buffer.from(JSON.stringify({ c: "cour_2", e: now + 5000 })).toString("base64url")}.${sig}`, secret, now)).toBeNull()
    expect(verifyCourierToken(token, "autre", now)).toBeNull()
    expect(verifyCourierToken("abc", secret, now)).toBeNull()
    expect(verifyCourierToken(`${payload}.`, secret, now)).toBeNull()
  })
})
```

- [ ] **Step 6: Vérifier l'échec puis implémenter**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-auth` -> FAIL.

`apps/backend/src/lib/courier-auth.ts` :

```ts
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"

// Authentification du livreur (spec 2026-10-15 espace-livreur) : PIN à 4 chiffres
// haché avec scrypt, jeton signé HMAC (id du livreur + expiration), sans session Medusa.

export const COURIER_TOKEN_TTL_SECONDS = 12 * 3600

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin)

export const hashPin = (pin: string): string => {
  const salt = randomBytes(16)
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`
}

export const verifyPin = (pin: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(":")
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length || 32)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url")

export const signCourierToken = (courierId: string, secret: string, now: number = Date.now()): string => {
  const payload = Buffer.from(JSON.stringify({ c: courierId, e: now + COURIER_TOKEN_TTL_SECONDS * 1000 })).toString("base64url")
  return `${payload}.${sign(payload, secret)}`
}

export const verifyCourierToken = (token: string, secret: string, now: number = Date.now()): string | null => {
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null
  const expected = sign(payload, secret)
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const { c, e } = JSON.parse(Buffer.from(payload, "base64url").toString())
    return typeof c === "string" && typeof e === "number" && e > now ? c : null
  } catch {
    return null
  }
}
```

- [ ] **Step 7: Tests verts puis commit**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-` -> PASS (2 suites).

```bash
git add apps/backend/src/lib/courier-report-rules.ts apps/backend/src/lib/courier-auth.ts apps/backend/src/lib/__tests__/courier-report-rules.unit.spec.ts apps/backend/src/lib/__tests__/courier-auth.unit.spec.ts
git commit -m "feat(livreur): règles de rapport, PIN haché et jeton signé"
```

---

### Task 2: Modèle de données

**Files:**
- Create: `apps/backend/src/modules/delivery/models/delivery-report.ts`
- Modify: `apps/backend/src/modules/delivery/models/courier.ts`
- Modify: `apps/backend/src/modules/delivery/service.ts`
- Create (générée) : `apps/backend/src/modules/delivery/migrations/Migration<date>.ts`

**Interfaces:**
- Produces : service `DeliveryModuleService` avec `listDeliveryReports`, `createDeliveryReports`, `updateDeliveryReports`, `retrieveDeliveryReport` (générés par `MedusaService`) ; champ `courier.pin_hash: string | null` ; requête `query.graph({ entity: "delivery_report", ... })`.

- [ ] **Step 1: Créer le modèle du rapport**

`apps/backend/src/modules/delivery/models/delivery-report.ts` :

```ts
import { model } from "@medusajs/framework/utils"

// Rapport du livreur sur une livraison (spec 2026-10-15 espace-livreur).
// submitted : « Oui » en attente de validation ; returned : renvoyé pour
// correction ; validated : validé par l'équipe ; applied : « Non » appliqué
// sans validation (échec de livraison enregistré).
export const DeliveryReport = model
  .define("delivery_report", {
    id: model.id({ prefix: "drep" }).primaryKey(),
    delivery_id: model.text().unique(),
    courier_id: model.text(),
    status: model.enum(["submitted", "returned", "validated", "applied"]).default("submitted"),
    delivered: model.boolean(),
    failure_reason: model.text().nullable(),
    amount_collected: model.number().nullable(),
    courier_fee: model.number().nullable(),
    transport_fee: model.number().nullable(),
    return_reason: model.text().nullable(),
    submitted_at: model.dateTime(),
    validated_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["courier_id"] }, { on: ["status"] }])
```

- [ ] **Step 2: Étendre le livreur et le service**

`models/courier.ts` : ajouter dans `model.define("courier", {...})` la ligne `pin_hash: model.text().nullable(),` après `notes`, et mettre à jour le commentaire d'en-tête : `// Livreur Golden Market : joint par WhatsApp ; se connecte à /livreur avec téléphone + PIN (pin_hash, spec 2026-10-15).`

`service.ts` : importer `import { DeliveryReport } from "./models/delivery-report"` et ajouter `DeliveryReport,` à la liste de `MedusaService({ ... })`.

- [ ] **Step 3: Générer et appliquer la migration**

Run :
```bash
cd apps/backend && npx medusa db:generate delivery && npx medusa db:migrate
```
Expected : un nouveau fichier dans `modules/delivery/migrations/` qui crée `delivery_report` et ajoute `pin_hash` à `courier` ; `db:migrate` sans erreur. Ouvrir le fichier : il ne doit contenir **que** ces deux changements (sinon, supprimer le fichier généré, relire l'erreur, relancer).

- [ ] **Step 4: Vérifier la table**

Run : `docker exec golden_market_medusa_postgres psql -U medusa -d medusa-backend -c "\d delivery_report" -c "\d courier"`
Expected : colonnes `delivery_report.*` ci-dessus et `courier.pin_hash text null`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/delivery
git commit -m "feat(livreur): table delivery_report et PIN du livreur"
```

---

### Task 3: Connexion du livreur (routes, middleware, PIN admin)

**Files:**
- Create: `apps/backend/src/api/courier/middlewares.ts`
- Create: `apps/backend/src/api/courier/login/route.ts`
- Create: `apps/backend/src/api/admin/couriers/[id]/pin/route.ts`
- Modify: `apps/backend/src/api/middlewares.ts:6,312` (import et ajout de `...courierMiddlewares`)
- Modify: `apps/backend/src/api/admin/couriers/route.ts` (ajouter `has_pin`, ne jamais renvoyer `pin_hash`)
- Modify: `apps/backend/src/api/admin/deliveries/middlewares.ts` (schéma `SetPinSchema`)

**Interfaces:**
- Consumes : `isValidPin`, `hashPin`, `verifyPin`, `signCourierToken`, `verifyCourierToken` (Task 1) ; `checkRateLimit(cache, key, { maxRequests, windowSeconds })` de `api/middlewares/rate-limiter.ts`.
- Produces : `POST /courier/login {phone, pin} -> {token, courier: {id, name}}` ; middleware qui pose `req.courier_id` pour toute route `/courier/deliveries*` ; `POST /admin/couriers/:id/pin {pin}` ; `GET /admin/couriers` renvoie `has_pin: boolean`.

- [ ] **Step 1: Middleware d'authentification livreur**

`apps/backend/src/api/courier/middlewares.ts` :

```ts
import type { MedusaNextFunction, MedusaRequest, MedusaResponse, MiddlewareRoute } from "@medusajs/framework/http"
import { verifyCourierToken } from "../../lib/courier-auth"

// Routes /courier/* (spec 2026-10-15 espace-livreur) : jeton livreur en
// `Authorization: Bearer`, appelées par le storefront uniquement. Un jeton
// livreur ne donne accès à rien d'autre (les routes /admin exigent leur
// propre session).
export type CourierRequest = MedusaRequest & { courier_id: string }

export function authenticateCourier(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  const courierId = token ? verifyCourierToken(token, process.env.COOKIE_SECRET ?? "") : null
  if (!courierId || !process.env.COOKIE_SECRET) {
    res.status(401).json({ message: "Session expirée : reconnectez-vous." })
    return
  }
  ;(req as CourierRequest).courier_id = courierId
  next()
}

export const courierMiddlewares: MiddlewareRoute[] = [
  { matcher: "/courier/deliveries*", middlewares: [authenticateCourier] },
]
```

Dans `api/middlewares.ts`, ajouter `import { courierMiddlewares } from "./courier/middlewares"` à côté de l'import ligne 6 et `...courierMiddlewares,` juste après `...deliveryMiddlewares,` (ligne 312).

- [ ] **Step 2: Route de connexion**

`apps/backend/src/api/courier/login/route.ts` :

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { isValidPin, signCourierToken, verifyPin } from "../../../lib/courier-auth"
import { normalizePhone } from "../../../lib/normalize-phone"
import { checkRateLimit } from "../../middlewares/rate-limiter"

const DENIED = { message: "Téléphone ou code incorrect." }

// Connexion du livreur : téléphone + PIN. 5 essais par téléphone et par
// 15 minutes ; même réponse que le numéro existe ou non.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { phone?: unknown; pin?: unknown }
  let phone: string
  try {
    phone = normalizePhone(String(body.phone ?? ""))
  } catch {
    res.status(401).json(DENIED)
    return
  }
  const cache = req.scope.resolve(Modules.CACHE)
  const limit = await checkRateLimit(cache, `rate-limit:courier-login:${phone}`, { maxRequests: 5, windowSeconds: 15 * 60 })
  if (!limit.allowed) {
    res.status(429).json({ message: `Trop d'essais. Réessayez dans ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` })
    return
  }
  const secret = process.env.COOKIE_SECRET
  if (!secret || !isValidPin(body.pin)) {
    res.status(401).json(DENIED)
    return
  }
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const couriers = await svc.listCouriers({ active: true })
  const courier = couriers.find((c) => {
    try {
      return normalizePhone(c.phone) === phone
    } catch {
      return false
    }
  })
  if (!courier?.pin_hash || !verifyPin(body.pin, courier.pin_hash)) {
    res.status(401).json(DENIED)
    return
  }
  res.json({ token: signCourierToken(courier.id, secret), courier: { id: courier.id, name: courier.name } })
}
```

Vérifier avant d'écrire : `grep -n "export" apps/backend/src/lib/normalize-phone.ts` — `normalizePhone` doit exister et lever une erreur sur un numéro invalide (utilisé par `lib/phone-order.ts`). Si la signature diffère, adapter l'import et le `try/catch`.

- [ ] **Step 3: Route admin du PIN et liste des livreurs**

Dans `api/admin/deliveries/middlewares.ts`, ajouter avant `export const deliveryMiddlewares` :

```ts
export const SetPinSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "Le code PIN doit comporter 4 chiffres.") })
export type SetPinSchema = z.infer<typeof SetPinSchema>
```
et dans le tableau : `{ matcher: "/admin/couriers/:id/pin", methods: ["POST"], middlewares: [validateAndTransformBody(SetPinSchema)] },`.

`apps/backend/src/api/admin/couriers/[id]/pin/route.ts` :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type DeliveryModuleService from "../../../../../modules/delivery/service"
import { hashPin } from "../../../../../lib/courier-auth"
import type { SetPinSchema } from "../../../deliveries/middlewares"

// Créer ou réinitialiser le PIN d'un livreur (spec 2026-10-15 espace-livreur).
export async function POST(req: AuthenticatedMedusaRequest<SetPinSchema>, res: MedusaResponse) {
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const courier = await svc.retrieveCourier(req.params.id)
  await svc.updateCouriers({ id: courier.id, pin_hash: hashPin(req.validatedBody.pin) })
  res.json({ ok: true })
}
```

Dans `api/admin/couriers/route.ts` : `COURIER_FIELDS` reste sans `pin_hash` ; ajouter `"pin_hash"` à la requête puis ne renvoyer que `has_pin` :

```ts
const COURIER_FIELDS = ["id", "name", "phone", "active", "notes", "pin_hash"]
...
  const couriers = [...data]
    .map(({ pin_hash, ...c }: any) => ({ ...c, has_pin: Boolean(pin_hash) }))
    .sort((a: any, b: any) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"))
```
Vérifier aussi `api/admin/couriers/[id]/route.ts` : sa réponse ne doit pas contenir `pin_hash` (le retirer avec la même déstructuration si le livreur entier est renvoyé), et le workflow `createCourierWorkflow` retourne un livreur sans PIN (rien à faire).

- [ ] **Step 4: Vérifier à la main (backend lancé : `cd apps/backend && npm run dev`)**

Depuis l'onglet Chrome connecté à l'admin (ou `curl` avec le cookie), créer le PIN puis tester la connexion :

```js
const j=async(u,m='GET',b,h={})=>{const r=await fetch(u,{method:m,credentials:'include',headers:{'content-type':'application/json',...h},body:b?JSON.stringify(b):undefined});return [r.status,await r.json()]};
const c=(await j('/admin/couriers'))[1].couriers[0];
[await j(`/admin/couriers/${c.id}/pin`,'POST',{pin:'1234'}), await j('/admin/couriers'), await j('/courier/login','POST',{phone:c.phone,pin:'1234'}), await j('/courier/login','POST',{phone:c.phone,pin:'0000'})]
```
Expected : PIN `200`; la liste porte `has_pin: true` sans `pin_hash` ; login correct `200` avec `token` ; mauvais PIN `401` ; après 5 mauvais essais `429`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api
git commit -m "feat(livreur): connexion par téléphone et PIN, PIN géré depuis l'admin"
```

---

### Task 4: Logique des rapports et routes livreur

**Files:**
- Create: `apps/backend/src/lib/courier-reports.ts`
- Create: `apps/backend/src/api/courier/deliveries/route.ts`
- Create: `apps/backend/src/api/courier/deliveries/[id]/report/route.ts`

**Interfaces:**
- Consumes : `parseReport`, `reportFields`, `reportState`, `summarizeDay`, `LineState` (Task 1) ; `CourierRequest` (Task 3) ; `completeDeliveryWorkflow`, `finishDelivery`, `submitPaymentForm`, `DELIVERY_FIELDS`, `loadOrders`, `toTourLine`, `todayInOuaga`.
- Produces (`courier-reports.ts`) :
  - `type ReportLine = ReturnType<typeof toTourLine> & { state: LineState; report: ReportView | null }`
  - `type ReportView = { id: string; status: string; delivered: boolean; failure_reason: string | null; amount_collected: number | null; courier_fee: number | null; transport_fee: number | null; return_reason: string | null; submitted_at: string }`
  - `loadCourierDay(scope, courierId, date): Promise<ReportLine[]>` (livraisons confiées au livreur ce jour, ou encore en cours, ou terminées ce jour)
  - `listCouriersOfDay(scope, date): Promise<{ courier_id: string; courier_name: string; phone: string; summary: ReturnType<typeof summarizeDay> }[]>`
  - `submitCourierReport(scope, courierId, deliveryId, body): Promise<{ report: ReportView; warning: string | null }>`
  - `validateCourierReport(scope, reportId, input: { amount_collected?: unknown }): Promise<{ warning: string | null }>`
  - `returnCourierReport(scope, reportId, reason: unknown): Promise<void>`
  - Routes livreur : `GET /courier/deliveries -> { courier, date, deliveries: CourierLine[] }`, `POST /courier/deliveries/:id/report -> { report, warning }`.

- [ ] **Step 1: Écrire `lib/courier-reports.ts`**

```ts
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"
import { completeDeliveryWorkflow } from "../workflows/complete-delivery"
import { parseReport, reportState, summarizeDay, type DeliveryType, type LineState } from "./courier-report-rules"
import { todayInOuaga } from "./delivery-rules"
import { DELIVERY_FIELDS, loadOrders, toTourLine } from "./delivery-service-helpers"
import { finishDelivery } from "./delivery-completion"
import { submitPaymentForm } from "./order-payment-form"

// Rapports des livreurs (spec 2026-10-15 espace-livreur) : lecture de la
// journée et écritures (envoyer, valider, renvoyer). Les écritures de fin de
// livraison passent par le code existant (échec : completeDeliveryWorkflow ;
// validation : submitPaymentForm = marquer payée + livrée).

export type ReportView = {
  id: string
  status: string
  delivered: boolean
  failure_reason: string | null
  amount_collected: number | null
  courier_fee: number | null
  transport_fee: number | null
  return_reason: string | null
  submitted_at: string
}
export type ReportLine = ReturnType<typeof toTourLine> & { state: LineState; report: ReportView | null }

const svcOf = (scope: any) => scope.resolve(DELIVERY_MODULE) as DeliveryModuleService

const toView = (r: any): ReportView => ({
  id: r.id,
  status: r.status,
  delivered: r.delivered,
  failure_reason: r.failure_reason ?? null,
  amount_collected: r.amount_collected ?? null,
  courier_fee: r.courier_fee ?? null,
  transport_fee: r.transport_fee ?? null,
  return_reason: r.return_reason ?? null,
  submitted_at: new Date(r.submitted_at).toISOString(),
})

// Livraisons d'un livreur pour un jour : prévues ce jour-là, encore en cours
// (le report nocturne les ramène à aujourd'hui) ou terminées ce jour-là.
export async function loadCourierDay(scope: any, courierId: string, date: string): Promise<ReportLine[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const [{ data: planned }, { data: completed }] = await Promise.all([
    query.graph({ entity: "delivery", fields: DELIVERY_FIELDS, filters: { courier_id: courierId, tour_date: date } }),
    query.graph({ entity: "delivery", fields: DELIVERY_FIELDS, filters: { courier_id: courierId, completed_at: { $gte: start, $lt: end } } }),
  ])
  const byId = new Map<string, any>()
  for (const d of [...planned, ...completed]) byId.set(d.id, d)
  const deliveries = [...byId.values()]
  if (!deliveries.length) return []
  const orders = await loadOrders(scope, deliveries.map((d) => d.order_id))
  const reports = await svcOf(scope).listDeliveryReports({ delivery_id: deliveries.map((d) => d.id) })
  const reportOf = new Map(reports.map((r) => [r.delivery_id, r]))
  return deliveries
    .map((d) => {
      const report = reportOf.get(d.id) ?? null
      return { ...toTourLine(d, orders.get(d.order_id)), state: reportState(d, report), report: report ? toView(report) : null }
    })
    .sort((a, b) => String(a.assigned_at).localeCompare(String(b.assigned_at)))
}

// Livreurs à qui des commandes ont été confiées ce jour-là, avec leur synthèse.
export async function listCouriersOfDay(scope: any, date: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const [{ data: planned }, { data: completed }] = await Promise.all([
    query.graph({ entity: "delivery", fields: ["courier_id"], filters: { tour_date: date } }),
    query.graph({ entity: "delivery", fields: ["courier_id"], filters: { completed_at: { $gte: start, $lt: end } } }),
  ])
  const ids = [...new Set([...planned, ...completed].map((d: any) => d.courier_id))] as string[]
  if (!ids.length) return []
  const couriers = await svcOf(scope).listCouriers({ id: ids })
  const out = []
  for (const c of couriers) {
    const lines = await loadCourierDay(scope, c.id, date)
    if (!lines.length) continue
    out.push({ courier_id: c.id, courier_name: c.name, phone: c.phone, summary: summarizeDay(lines.map((l) => l.state)) })
  }
  return out.sort((a, b) => a.courier_name.localeCompare(b.courier_name, "fr"))
}

// Le livreur envoie (ou corrige) son rapport. « Non » : échec enregistré tout de
// suite (la commande revient à confier, rien à valider). « Oui » : en attente de
// validation de l'équipe.
export async function submitCourierReport(scope: any, courierId: string, deliveryId: string, body: Record<string, unknown>) {
  const svc = svcOf(scope)
  const delivery = await svc.retrieveDelivery(deliveryId).catch(() => null)
  if (!delivery || delivery.courier_id !== courierId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Livraison introuvable.")
  if (delivery.status !== "assigned") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
  const parsed = parseReport(delivery.type as DeliveryType, body)
  if (!parsed.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.message)
  const values = parsed.values
  const [existing] = await svc.listDeliveryReports({ delivery_id: deliveryId })
  if (existing && existing.status !== "submitted" && existing.status !== "returned") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport est déjà traité.")
  }
  let warning: string | null = null
  if (!values.delivered) {
    const { result: completed } = await completeDeliveryWorkflow(scope).run({
      input: { id: deliveryId, status: "failed", failure_reason: values.failure_reason, redeliver: true },
    })
    ;({ warning } = await finishDelivery(scope, completed))
  }
  const data = {
    delivery_id: deliveryId,
    courier_id: courierId,
    status: values.delivered ? "submitted" : "applied",
    delivered: values.delivered,
    failure_reason: values.failure_reason,
    amount_collected: values.amount_collected,
    courier_fee: values.courier_fee,
    transport_fee: values.transport_fee,
    return_reason: null,
    submitted_at: new Date(),
  } as const
  const report = existing ? await svc.updateDeliveryReports({ id: existing.id, ...data }) : await svc.createDeliveryReports(data)
  return { report: toView(report), warning }
}

// Validation d'un rapport « Oui » : tout est figé sauf le montant encaissé d'une
// expédition (le client a payé l'entreprise par Mobile Money, saisi ici).
export async function validateCourierReport(scope: any, reportId: string, input: { amount_collected?: unknown }) {
  const svc = svcOf(scope)
  const report = await svc.retrieveDeliveryReport(reportId).catch(() => null)
  if (!report) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Rapport introuvable.")
  if (report.status !== "submitted" || !report.delivered) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport n'est pas en attente de validation.")
  }
  const delivery = await svc.retrieveDelivery(report.delivery_id)
  if (delivery.status !== "assigned") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
  let amount = report.amount_collected
  if (delivery.type === "expedition") {
    const typed = Number(input.amount_collected)
    if (!Number.isInteger(typed) || typed <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Indiquez le montant encaissé (nombre entier positif en F CFA).")
    }
    amount = typed
  }
  if (amount === null || amount === undefined) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Montant encaissé manquant.")
  const { warning } = await submitPaymentForm(
    scope,
    delivery.order_id,
    { amount, courier_fee: report.courier_fee ?? 0, transport_fee: report.transport_fee ?? 0 },
    { delivered: true }
  )
  await svc.updateDeliveryReports({ id: report.id, status: "validated", amount_collected: amount, validated_at: new Date() })
  return { warning }
}

export async function returnCourierReport(scope: any, reportId: string, reason: unknown) {
  const svc = svcOf(scope)
  const text = typeof reason === "string" ? reason.trim() : ""
  if (!text) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Indiquez le motif du renvoi.")
  const report = await svc.retrieveDeliveryReport(reportId).catch(() => null)
  if (!report) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Rapport introuvable.")
  if (report.status !== "submitted") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce rapport n'est pas en attente de validation.")
  await svc.updateDeliveryReports({ id: report.id, status: "returned", return_reason: text })
}

export { todayInOuaga }
```

- [ ] **Step 2: Routes livreur**

`apps/backend/src/api/courier/deliveries/route.ts` :

```ts
import type { MedusaResponse } from "@medusajs/framework/http"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { reportFields } from "../../../lib/courier-report-rules"
import { loadCourierDay, todayInOuaga } from "../../../lib/courier-reports"
import type { CourierRequest } from "../middlewares"

// Commandes du jour du livreur connecté. Seules les informations utiles au
// livreur sortent : jamais le montant à encaisser d'une expédition (il ne le
// connaît pas), ni les autres livreurs, ni la caisse.
export async function GET(req: CourierRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const courier = await svc.retrieveCourier(req.courier_id).catch(() => null)
  if (!courier || !courier.active) {
    res.status(401).json({ message: "Session expirée : reconnectez-vous." })
    return
  }
  const date = todayInOuaga()
  const lines = await loadCourierDay(req.scope, courier.id, date)
  res.json({
    courier: { id: courier.id, name: courier.name },
    date,
    deliveries: lines.map((l) => ({
      id: l.id,
      order_number: l.order_number,
      customer_name: l.customer_name,
      customer_phone: l.customer_phone,
      place: l.place,
      type: l.type,
      items: l.items,
      amount_to_collect: l.type === "express" ? l.amount_to_collect : null,
      fields: reportFields(l.type),
      state: l.state,
      failure_reason: l.failure_reason,
      report: l.report && {
        delivered: l.report.delivered,
        failure_reason: l.report.failure_reason,
        amount_collected: l.report.amount_collected,
        courier_fee: l.report.courier_fee,
        transport_fee: l.report.transport_fee,
        return_reason: l.report.return_reason,
        status: l.report.status,
      },
    })),
  })
}
```

`apps/backend/src/api/courier/deliveries/[id]/report/route.ts` :

```ts
import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { submitCourierReport } from "../../../../../lib/courier-reports"
import type { CourierRequest } from "../../../middlewares"

// Le livreur envoie ou corrige le rapport d'une de ses livraisons.
export async function POST(req: CourierRequest, res: MedusaResponse) {
  try {
    const { report, warning } = await submitCourierReport(req.scope, req.courier_id, req.params.id, (req.body ?? {}) as Record<string, unknown>)
    // L'avertissement de synchronisation est pour l'équipe, pas pour le livreur.
    res.json({ report: { status: report.status, delivered: report.delivered } })
    void warning
  } catch (error) {
    const status = error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 400
    res.status(status).json({ message: (error as Error).message })
  }
}
```

- [ ] **Step 3: Vérification manuelle (jetons obtenus à la Task 3)**

Avec une livraison confiée au livreur du test (voir Task 3, livreur avec PIN `1234`) : `GET /courier/deliveries` (en-tête `Authorization: Bearer <token>`), puis `POST /courier/deliveries/<id>/report`. Contrôler :
1. Sans en-tête : `401`.
2. Réponse du GET d'une **expédition** : `amount_to_collect: null`, `fields.amount_collected: false`.
3. `POST {}` -> `400 "Indiquez si la commande a été livrée."` ; `POST {delivered:false}` -> `400` motif ; `POST {delivered:false, failure_reason:"Client absent"}` -> `200`, la livraison passe `failed` et la commande réapparaît dans « À confier » (admin).
4. Sur une autre livraison Ouaga : `POST {delivered:true, amount_collected:9500, courier_fee:1000}` -> `200` ; un second `POST` avec `courier_fee:1500` met à jour (statut `submitted`).
5. Le jeton d'un autre livreur sur `/courier/deliveries/<id>/report` -> `404`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/courier-reports.ts apps/backend/src/api/courier
git commit -m "feat(livreur): rapports du livreur (Non appliqué tout de suite, Oui à valider)"
```

---

### Task 5: Routes admin des rapports

**Files:**
- Create: `apps/backend/src/api/admin/courier-reports/route.ts`
- Create: `apps/backend/src/api/admin/courier-reports/[id]/route.ts` (id = livreur)
- Create: `apps/backend/src/api/admin/courier-reports/[id]/validate/route.ts`
- Create: `apps/backend/src/api/admin/courier-reports/[id]/return/route.ts`

**Interfaces:**
- Consumes : `listCouriersOfDay`, `loadCourierDay`, `validateCourierReport`, `returnCourierReport`, `todayInOuaga` (Task 4).
- Produces : `GET /admin/courier-reports?date= -> { date, couriers: [...] }` ; `GET /admin/courier-reports/:id?date= -> { date, courier: {id,name,phone}, lines: ReportLine[] }` ; `POST /admin/courier-reports/:id/validate {amount_collected?} -> {ok, warning}` ; `POST /admin/courier-reports/:id/return {reason} -> {ok}`.

Note : Medusa n'accepte qu'un seul nom de paramètre dynamique à un niveau donné : `[id]/route.ts` désigne le **livreur**, et `[id]/validate`, `[id]/return` le **rapport**.

- [ ] **Step 1: Routes de lecture**

`api/admin/courier-reports/route.ts` :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listCouriersOfDay, todayInOuaga } from "../../../lib/courier-reports"

// Livreurs à qui des commandes ont été confiées un jour donné (défaut : aujourd'hui), avec leur synthèse.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? "")) ? String(req.query.date) : todayInOuaga()
  res.json({ date, couriers: await listCouriersOfDay(req.scope, date) })
}
```

`api/admin/courier-reports/[id]/route.ts` (`id` = livreur) :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DELIVERY_MODULE } from "../../../../modules/delivery"
import type DeliveryModuleService from "../../../../modules/delivery/service"
import { loadCourierDay, todayInOuaga } from "../../../../lib/courier-reports"

// Commandes du jour d'un livreur avec leur rapport (toutes les informations utiles au tableau).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? "")) ? String(req.query.date) : todayInOuaga()
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const courier = await svc.retrieveCourier(req.params.id).catch(() => null)
  if (!courier) {
    res.status(404).json({ message: "Livreur introuvable." })
    return
  }
  res.json({
    date,
    courier: { id: courier.id, name: courier.name, phone: courier.phone },
    lines: await loadCourierDay(req.scope, courier.id, date),
  })
}
```

- [ ] **Step 2: Routes d'écriture**

`api/admin/courier-reports/[id]/validate/route.ts` :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { validateCourierReport } from "../../../../../lib/courier-reports"

// Valider un rapport « Oui » : montant encaissé saisi ici pour une expédition seulement.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const { warning } = await validateCourierReport(req.scope, req.params.id, (req.body ?? {}) as { amount_collected?: unknown })
    res.json({ ok: true, warning })
  } catch (error) {
    const status = error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 400
    res.status(status).json({ message: (error as Error).message })
  }
}
```

`api/admin/courier-reports/[id]/return/route.ts` :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { returnCourierReport } from "../../../../../lib/courier-reports"

// Renvoyer un rapport au livreur pour correction (motif obligatoire).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    await returnCourierReport(req.scope, req.params.id, (req.body as { reason?: unknown } | undefined)?.reason)
    res.json({ ok: true })
  } catch (error) {
    const status = error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 400
    res.status(status).json({ message: (error as Error).message })
  }
}
```

- [ ] **Step 3: Vérification manuelle (session admin dans Chrome)**

Reprendre les livraisons de la Task 4 :
1. `GET /admin/courier-reports` : le livreur apparaît avec `summary` (un `submitted`, un `failed`, etc.).
2. `GET /admin/courier-reports/<courier_id>` : chaque ligne porte `state`, `report`, client, place, produits, `amount_to_collect`.
3. `POST .../<rapport Oui, Ouaga>/validate {}` -> `200` : la commande est payée et livrée, la caisse a une vente de 9 500 F et la course ; le rapport passe `validated`. Rejouer -> `400 "n'est pas en attente"`.
4. Rapport Oui d'une **expédition** : `validate {}` -> `400` (montant manquant) ; `validate {amount_collected: 12000}` -> `200`.
5. `POST .../<rapport>/return {}` -> `400` ; `return {reason:"Course à revoir"}` -> `200`, le livreur voit `state: "returned"` et `return_reason` ; il renvoie un rapport corrigé -> retour à `submitted`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/api/admin/courier-reports
git commit -m "feat(livreur): routes admin des rapports (liste du jour, validation, renvoi)"
```

---

### Task 6: Onglet « Rapports livreurs », PIN et libellé « Frais Expédition » (admin)

**Files:**
- Modify: `apps/backend/src/admin/lib/deliveries.ts` (types)
- Create: `apps/backend/src/admin/components/courier-reports-tab.tsx`
- Modify: `apps/backend/src/admin/routes/deliveries/page.tsx` (onglet `reports`, PIN dans la fiche livreur, libellés lignes 434 et 607)
- Modify: `apps/backend/src/admin/widgets/order-mark-paid.tsx:124` (libellé) et ligne 81 (message d'erreur)
- Modify: `apps/backend/src/lib/cashbook-rules.ts:390` (libellé) et `apps/backend/src/lib/__tests__/cashbook-rules.unit.spec.ts:157` (attendu)

**Interfaces:**
- Consumes : routes de la Task 5 ; `api`, `formatXof`, `TYPE_LABELS`, `Courier` (`admin/lib/deliveries.ts`) ; `card`, `inputClass`, `primaryButton`, `secondaryButton`, `Badge` (`admin/components/delivery-ui.tsx`).
- Produces : `CourierReportsTab` ; type `Courier` avec `has_pin?: boolean`.

- [ ] **Step 1: Renommer « Frais compagnie »**

- `order-mark-paid.tsx:124` : `Frais compagnie de transport (F CFA)` -> `Frais Expédition (F CFA)` ; ligne 81 : `"Frais de la compagnie invalides…"` -> `"Frais Expédition invalides : nombre entier en F CFA (0 si aucun)."` (même changement dans `lib/cashbook-rules.ts:367`).
- `page.tsx:434` : `Frais compagnie :` -> `Frais Expédition :` ; `page.tsx:607` idem.
- `lib/cashbook-rules.ts:390` : `Frais compagnie de transport${suffix}` -> `Frais Expédition${suffix}` ; test `cashbook-rules.unit.spec.ts:157` : `label: "Frais Expédition - commande 20261011001"`.
- Run : `cd apps/backend && npm run test:unit -- src/lib/__tests__/cashbook-rules` -> PASS.

- [ ] **Step 2: Types admin**

Dans `admin/lib/deliveries.ts`, remplacer la ligne 9 par :

```ts
export type Courier = { id: string; name: string; phone: string; active: boolean; notes: string | null; has_pin?: boolean };

export type ReportState = "todo" | "submitted" | "returned" | "validated" | "failed" | "canceled";
export type CourierReport = {
  id: string;
  status: "submitted" | "returned" | "validated" | "applied";
  delivered: boolean;
  failure_reason: string | null;
  amount_collected: number | null;
  courier_fee: number | null;
  transport_fee: number | null;
  return_reason: string | null;
  submitted_at: string;
};
export type ReportLine = TourLine & { state: ReportState; report: CourierReport | null };
export type CourierDaySummary = { total: number; todo: number; submitted: number; returned: number; validated: number; failed: number };
```

- [ ] **Step 3: Composant de l'onglet**

`admin/components/courier-reports-tab.tsx` :

```tsx
import { useCallback, useEffect, useState } from "react";
import { api, formatXof, TYPE_LABELS } from "../lib/deliveries";
import type { CourierDaySummary, ReportLine, ReportState } from "../lib/deliveries";
import { Badge, card, inputClass, primaryButton, secondaryButton } from "./delivery-ui";

// Onglet « Rapports livreurs » (spec 2026-10-15 espace-livreur) : 1) livreurs du
// jour, 2) tableau des commandes d'un livreur avec Valider / Renvoyer pour
// correction. Pas de composant @medusajs/ui (conflit de types React 18/19).

type DayCourier = { courier_id: string; courier_name: string; phone: string; summary: CourierDaySummary };

const STATE_LABEL: Record<ReportState, string> = {
  todo: "Pas encore de rapport",
  submitted: "À valider",
  returned: "Renvoyé au livreur",
  validated: "Validé",
  failed: "Non livrée",
  canceled: "Annulée",
};
const STATE_BADGE: Record<ReportState, string> = {
  todo: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
  submitted: "bg-ui-tag-orange-bg text-ui-tag-orange-text",
  returned: "bg-ui-tag-red-bg text-ui-tag-red-text",
  validated: "bg-ui-tag-green-bg text-ui-tag-green-text",
  failed: "bg-ui-tag-red-bg text-ui-tag-red-text",
  canceled: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
};

const ReportRow = ({ line, onChanged }: { line: ReportLine; onChanged: () => void }) => {
  const report = line.report;
  const isExpedition = line.type === "expedition";
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body });
      setReason(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-t border-ui-border-base align-top">
      <td className="px-3 py-2">
        <a href={`/app/orders/${line.order_id}`} className="text-ui-fg-interactive">{line.order_number}</a>
        <div className="txt-compact-xsmall text-ui-fg-subtle">{TYPE_LABELS[line.type]}</div>
      </td>
      <td className="px-3 py-2">
        {line.customer_name}
        <div className="txt-compact-xsmall text-ui-fg-subtle">{line.customer_phone}</div>
      </td>
      <td className="px-3 py-2">{line.place || "—"}</td>
      <td className="px-3 py-2">{line.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")}</td>
      <td className="px-3 py-2">{isExpedition ? "—" : formatXof(line.amount_to_collect)}</td>
      <td className="px-3 py-2">
        <Badge className={STATE_BADGE[line.state]}>{STATE_LABEL[line.state]}</Badge>
        {line.state === "returned" && report?.return_reason && (
          <div className="txt-compact-xsmall text-ui-fg-subtle">Motif : {report.return_reason}</div>
        )}
      </td>
      <td className="px-3 py-2">
        {line.state === "failed" && <span>Motif : {line.failure_reason ?? report?.failure_reason ?? "—"}</span>}
        {report?.delivered && (
          <div className="flex flex-col">
            {!isExpedition && <span>Encaissé : {formatXof(report.amount_collected)}</span>}
            <span>Course : {formatXof(report.courier_fee)}</span>
            {isExpedition && <span>Frais Expédition : {formatXof(report.transport_fee)}</span>}
            <span className="txt-compact-xsmall text-ui-fg-subtle">
              Envoyé à {new Date(report.submitted_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {line.state === "submitted" && report && (
          <div className="flex flex-col gap-y-2">
            {isExpedition && (
              <input
                className={`${inputClass} max-w-[140px]`}
                inputMode="numeric"
                placeholder="Montant encaissé"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
            {reason === null ? (
              <div className="flex gap-x-2">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy}
                  onClick={() => call(`/admin/courier-reports/${report.id}/validate`, isExpedition ? { amount_collected: amount } : {})}
                >
                  Valider
                </button>
                <button type="button" className={secondaryButton} disabled={busy} onClick={() => setReason("")}>
                  Renvoyer pour correction
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-y-2">
                <input className={inputClass} placeholder="Motif du renvoi" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-x-2">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy}
                    onClick={() => call(`/admin/courier-reports/${report.id}/return`, { reason })}
                  >
                    Envoyer le renvoi
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => setReason(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
            {error && <span className="txt-compact-small text-ui-fg-error">{error}</span>}
          </div>
        )}
      </td>
    </tr>
  );
};

const CourierLines = ({ courierId, onBack }: { courierId: string; onBack: () => void }) => {
  const [data, setData] = useState<{ courier: { name: string }; lines: ReportLine[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ courier: { name: string }; lines: ReportLine[] }>(`/admin/courier-reports/${courierId}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [courierId]);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center gap-x-3">
        <button type="button" className={secondaryButton} onClick={onBack}>
          ‹ Livreurs
        </button>
        <span className="txt-compact-small-plus text-ui-fg-base">{data?.courier.name ?? "…"} · commandes du jour</span>
      </div>
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      {data && (
        <div className={`${card} overflow-x-auto`}>
          <table className="txt-compact-small w-full text-left text-ui-fg-base">
            <thead className="txt-compact-xsmall-plus text-ui-fg-subtle">
              <tr>
                {["Commande", "Client", "Lieu", "Produits", "À encaisser", "État", "Rapport", ""].map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <ReportRow key={line.id} line={line} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const CourierReportsTab = () => {
  const [couriers, setCouriers] = useState<DayCourier[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected) return;
    api<{ couriers: DayCourier[] }>("/admin/courier-reports")
      .then((r) => setCouriers(r.couriers))
      .catch(() => setCouriers([]));
  }, [selected]);

  if (selected) return <CourierLines courierId={selected} onBack={() => setSelected(null)} />;
  if (couriers === null) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>;
  if (!couriers.length) {
    return <p className="txt-compact-small text-ui-fg-subtle">Aucune commande confiée à un livreur aujourd'hui.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {couriers.map((c) => (
        <button
          key={c.courier_id}
          type="button"
          onClick={() => setSelected(c.courier_id)}
          className={`${card} flex flex-col gap-y-1 px-4 py-3 text-left`}
        >
          <span className="txt-compact-small-plus text-ui-fg-base">{c.courier_name}</span>
          <span className="txt-compact-small text-ui-fg-subtle">{c.summary.total} commande(s) aujourd'hui</span>
          <span className="txt-compact-small text-ui-fg-subtle">
            {c.summary.submitted} à valider · {c.summary.returned} renvoyé(s) · {c.summary.validated} validé(s) · {c.summary.failed} non livrée(s) · {c.summary.todo} sans rapport
          </span>
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Brancher l'onglet et le PIN dans `page.tsx`**

1. Importer : `import { CourierReportsTab } from "../../components/courier-reports-tab"`.
2. `type Tab = "to-assign" | "tour" | "unpaid" | "reports" | "stock" | "couriers"` ; ajouter `{ id: "reports", label: "Rapports livreurs" },` dans `TABS` (après « Expéditions à faire payer ») ; dans le rendu, à côté des autres onglets : `{tab === "reports" && <CourierReportsTab />}`.
3. Dans `CouriersTab`, sous le bloc téléphone / notes de chaque livreur, ajouter un état `pinFor: string | null` et `pin: string`, un bouton `{c.has_pin ? "Changer le PIN" : "Créer le PIN"}` qui affiche un `<input inputMode="numeric" maxLength={4}>` + bouton « Enregistrer » appelant `api(\`/admin/couriers/${c.id}/pin\`, { method: "POST", body: { pin } })`, puis `reload()` ; afficher l'erreur renvoyée si le PIN n'a pas 4 chiffres ; afficher « PIN défini » en texte discret quand `c.has_pin`.

- [ ] **Step 5: Vérification visuelle dans Chrome (backend + admin lancés)**

Ouvrir `http://localhost:9002/app/deliveries?tab=reports` : liste des livreurs du jour, clic sur un livreur, tableau complet, boutons **Valider** / **Renvoyer pour correction** (champ motif), champ « Montant encaissé » seulement sur les expéditions. Valider un rapport de chaque type et en renvoyer un ; contrôler `Caisse` (écriture « Frais Expédition - commande … »). Onglet « Livreurs » : créer un PIN. Si la capture d'écran expire, lire le DOM par JavaScript (limite connue de l'extension) mais regarder au moins une capture réussie du tableau.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src
git commit -m "feat(livreur): onglet Rapports livreurs, PIN dans la fiche livreur, libellé Frais Expédition"
```

---

### Task 7: Page `/livreur` du storefront (mobile-first)

**Files:**
- Create: `apps/storefront/src/app/api/livreur/[...path]/route.ts`
- Create: `apps/storefront/src/app/[countryCode]/(livreur)/layout.tsx`
- Create: `apps/storefront/src/app/[countryCode]/(livreur)/livreur/page.tsx`
- Create: `apps/storefront/src/modules/livreur/livreur-app.tsx` (composant client)

**Interfaces:**
- Consumes : `POST /courier/login`, `GET /courier/deliveries`, `POST /courier/deliveries/:id/report` (Tasks 3-4) ; tokens CSS `--gm-*` (`src/styles/tokens.css`) ; variable `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
- Produces : URL `/<pays>/livreur` (le middleware redirige `/livreur` vers `/bf/livreur`) ; relais `/api/livreur/login`, `/api/livreur/deliveries`, `/api/livreur/deliveries/<id>/report`, `/api/livreur/logout`.

Avant d'écrire : lire `apps/storefront/src/app/layout.tsx` et un layout existant `(checkout)/layout.tsx` pour la structure (police, `<html>`, classes) et `src/modules/common` pour les composants de bouton ; réutiliser les classes Tailwind du site (couleurs via `rgb(var(--gm-violet))`, etc.).

- [ ] **Step 1: Relais vers le backend**

`apps/storefront/src/app/api/livreur/[...path]/route.ts` :

```ts
import { NextRequest, NextResponse } from "next/server"

// Relais de la page /livreur vers les routes backend /courier/* (spec
// 2026-10-15 espace-livreur). Le jeton livreur reste dans un cookie httpOnly du
// site : le JavaScript de la page ne le voit jamais.
const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const COOKIE = "_gm_courier"
const MAX_AGE = 12 * 3600

async function relay(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const route = path.join("/")
  if (route === "logout") {
    const res = NextResponse.json({ ok: true })
    res.cookies.delete(COOKIE)
    return res
  }
  const allowed =
    route === "login" ||
    route === "deliveries" ||
    /^deliveries\/[A-Za-z0-9_]+\/report$/.test(route)
  if (!BACKEND_URL || !allowed) return NextResponse.json({ message: "Introuvable." }, { status: 404 })

  const token = req.cookies.get(COOKIE)?.value
  const hasBody = req.method === "POST"
  const backend = await fetch(`${BACKEND_URL}/courier/${route}`, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      ...(token && route !== "login" ? { authorization: `Bearer ${token}` } : {}),
    },
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  })
  const json = await backend.json().catch(() => ({ message: "Erreur du serveur." }))
  if (route === "login" && backend.ok) {
    const { token: issued, courier } = json as { token: string; courier: { id: string; name: string } }
    const res = NextResponse.json({ courier })
    res.cookies.set(COOKIE, issued, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: MAX_AGE, path: "/" })
    return res
  }
  const res = NextResponse.json(json, { status: backend.status })
  if (backend.status === 401) res.cookies.delete(COOKIE)
  return res
}

export const GET = relay
export const POST = relay
```

- [ ] **Step 2: Layout sans en-tête ni pied de page, non indexé**

`apps/storefront/src/app/[countryCode]/(livreur)/layout.tsx` :

```tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Espace livreur - Golden Market",
  robots: { index: false, follow: false },
}

export default function LivreurLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[rgb(var(--gm-ivoire))] text-[rgb(var(--gm-ink))]">{children}</div>
}
```
(Si le layout racine impose déjà `<html>`/`<body>`, ne pas les répéter. Ajouter `export const viewport = { width: "device-width", initialScale: 1 }` si le projet ne le fait pas déjà.)

`.../livreur/page.tsx` :

```tsx
import { LivreurApp } from "@modules/livreur/livreur-app"

export default function LivreurPage() {
  return <LivreurApp />
}
```
(Vérifier l'alias `@modules` dans `tsconfig.json` du storefront ; sinon utiliser le chemin relatif.)

- [ ] **Step 3: Composant client**

`apps/storefront/src/modules/livreur/livreur-app.tsx` : composant `"use client"` qui gère trois vues. Contenu exact :

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"

type Fields = { amount_collected: boolean; transport_fee: boolean; courier_fee: true }
type Line = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  place: string
  type: "express" | "expedition"
  items: { title: string; quantity: number }[]
  amount_to_collect: number | null
  fields: Fields
  state: "todo" | "submitted" | "returned" | "validated" | "failed" | "canceled"
  failure_reason: string | null
  report: { delivered: boolean; failure_reason: string | null; amount_collected: number | null; courier_fee: number | null; transport_fee: number | null; return_reason: string | null } | null
}

const xof = (n: number | null | undefined) => `${new Intl.NumberFormat("fr-FR").format(n ?? 0)} F`
const field =
  "w-full rounded-xl border border-[rgb(var(--gm-border))] bg-white px-4 py-3 text-base outline-none focus:border-[rgb(var(--gm-amethyst))]"
const primary =
  "w-full rounded-xl bg-[rgb(var(--gm-violet))] px-4 py-3.5 text-base font-semibold text-[rgb(var(--gm-on-violet))] active:bg-[rgb(var(--gm-violet-hover))] disabled:opacity-50"
const secondary =
  "w-full rounded-xl border border-[rgb(var(--gm-border))] bg-white px-4 py-3.5 text-base font-semibold text-[rgb(var(--gm-ink))] disabled:opacity-50"

const STATE: Record<Line["state"], { label: string; tone: string }> = {
  todo: { label: "À renseigner", tone: "bg-[rgb(var(--gm-gold-soft))] text-[rgb(var(--gm-ink))]" },
  submitted: { label: "Envoyé, en attente de validation", tone: "bg-[rgb(var(--gm-ivoire-2))] text-[rgb(var(--gm-ink-muted))]" },
  returned: { label: "À corriger", tone: "bg-[rgb(var(--gm-terracotta))] text-white" },
  validated: { label: "Validé", tone: "bg-green-100 text-green-800" },
  failed: { label: "Non livrée", tone: "bg-[rgb(var(--gm-ivoire-2))] text-[rgb(var(--gm-ink-muted))]" },
  canceled: { label: "Annulée", tone: "bg-[rgb(var(--gm-ivoire-2))] text-[rgb(var(--gm-ink-muted))]" },
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/livreur/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.message ?? "Erreur."), { status: res.status })
  return json as T
}

const Login = ({ onLogged }: { onLogged: () => void }) => {
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await call("login", { phone, pin })
      onLogged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--gm-gold-strong))]">Golden Market</p>
        <h1 className="mt-1 text-3xl font-bold">Espace livreur</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Votre téléphone
          <input className={field} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="70 00 00 00" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Code PIN
          <input className={field} type="password" inputMode="numeric" maxLength={4} autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 chiffres" />
        </label>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button className={primary} disabled={busy || !phone || pin.length !== 4}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  )
}

const ReportSheet = ({ line, onClose, onSent }: { line: Line; onClose: () => void; onSent: () => void }) => {
  const prev = line.report
  const [delivered, setDelivered] = useState<boolean | null>(prev ? prev.delivered : null)
  const [reason, setReason] = useState(prev?.failure_reason ?? "")
  const [amount, setAmount] = useState(prev?.amount_collected ? String(prev.amount_collected) : "")
  const [courierFee, setCourierFee] = useState(prev?.courier_fee !== null && prev?.courier_fee !== undefined ? String(prev.courier_fee) : "")
  const [transportFee, setTransportFee] = useState(prev?.transport_fee !== null && prev?.transport_fee !== undefined ? String(prev.transport_fee) : "")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await call(`deliveries/${line.id}/report`, {
        delivered,
        failure_reason: reason,
        amount_collected: amount,
        courier_fee: courierFee,
        transport_fee: transportFee,
      })
      onSent()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[rgb(var(--gm-ivoire))] px-5 pb-8 pt-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[rgb(var(--gm-ink-muted))]">Commande {line.order_number}</p>
            <h2 className="text-xl font-bold">{line.customer_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-2xl leading-none" aria-label="Fermer">×</button>
        </div>
        {line.state === "returned" && prev?.return_reason && (
          <p className="mb-4 rounded-xl bg-[rgb(var(--gm-terracotta))] px-4 py-3 text-sm text-white">À corriger : {prev.return_reason}</p>
        )}
        <p className="mb-2 text-base font-semibold">La commande a-t-elle été livrée ?</p>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setDelivered(true)} className={delivered === true ? primary : secondary}>Oui</button>
          <button type="button" onClick={() => setDelivered(false)} className={delivered === false ? primary : secondary}>Non</button>
        </div>

        {delivered === false && (
          <label className="mb-5 flex flex-col gap-1.5 text-sm font-semibold">
            Pourquoi n'a-t-elle pas été livrée ?
            <textarea className={field} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client absent, injoignable, refus…" />
          </label>
        )}
        {delivered === true && (
          <div className="mb-5 flex flex-col gap-4">
            {line.fields.amount_collected && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Montant encaissé (F CFA)
                <input className={field} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Course du livreur (F CFA)
              <input className={field} inputMode="numeric" value={courierFee} onChange={(e) => setCourierFee(e.target.value.replace(/\D/g, ""))} />
            </label>
            {line.fields.transport_fee && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Frais Expédition (F CFA)
                <input className={field} inputMode="numeric" value={transportFee} onChange={(e) => setTransportFee(e.target.value.replace(/\D/g, ""))} />
              </label>
            )}
          </div>
        )}
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="button" className={primary} disabled={busy || delivered === null} onClick={send}>
          {busy ? "Envoi…" : "Envoyer le rapport"}
        </button>
      </div>
    </div>
  )
}

export const LivreurApp = () => {
  const [state, setState] = useState<"loading" | "login" | "ready">("loading")
  const [courier, setCourier] = useState<string>("")
  const [lines, setLines] = useState<Line[]>([])
  const [open, setOpen] = useState<Line | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await call<{ courier: { name: string }; deliveries: Line[] }>("deliveries")
      setCourier(r.courier.name)
      setLines(r.deliveries)
      setState("ready")
      setError(null)
    } catch (err) {
      if ((err as { status?: number }).status === 401) setState("login")
      else {
        setError((err as Error).message)
        setState("ready")
      }
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (state === "loading") return <p className="p-6 text-[rgb(var(--gm-ink-muted))]">Chargement…</p>
  if (state === "login") return <Login onLogged={load} />

  const logout = async () => {
    await call("logout", {})
    setState("login")
  }
  const editable = (l: Line) => l.state === "todo" || l.state === "returned" || l.state === "submitted"

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--gm-gold-strong))]">Golden Market</p>
          <h1 className="text-2xl font-bold">Bonjour {courier}</h1>
        </div>
        <button type="button" onClick={logout} className="text-sm font-semibold text-[rgb(var(--gm-amethyst))]">Quitter</button>
      </header>
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!lines.length && <p className="rounded-2xl bg-white px-4 py-6 text-center text-[rgb(var(--gm-ink-muted))]">Aucune commande aujourd'hui.</p>}
      <ul className="flex flex-col gap-3">
        {lines.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              disabled={!editable(l)}
              onClick={() => setOpen(l)}
              className="w-full rounded-2xl border border-[rgb(var(--gm-border))] bg-white p-4 text-left shadow-sm disabled:opacity-70"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-bold">{l.customer_name}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATE[l.state].tone}`}>{STATE[l.state].label}</span>
              </div>
              <p className="mt-1 text-sm text-[rgb(var(--gm-ink-muted))]">
                {l.type === "express" ? "Livraison Ouaga" : "Expédition"} · Commande {l.order_number}
              </p>
              {l.place && <p className="mt-1 text-sm">{l.place}</p>}
              <p className="mt-1 text-sm">{l.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")}</p>
              {l.amount_to_collect !== null && l.amount_to_collect > 0 && (
                <p className="mt-2 text-base font-bold text-[rgb(var(--gm-violet))]">À encaisser : {xof(l.amount_to_collect)}</p>
              )}
              {l.state === "returned" && l.report?.return_reason && (
                <p className="mt-2 text-sm font-semibold text-[rgb(var(--gm-terracotta))]">À corriger : {l.report.return_reason}</p>
              )}
              <a href={`tel:${l.customer_phone}`} onClick={(e) => e.stopPropagation()} className="mt-2 inline-block text-sm font-semibold text-[rgb(var(--gm-amethyst))]">
                Appeler {l.customer_phone}
              </a>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <ReportSheet
          line={open}
          onClose={() => setOpen(null)}
          onSent={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </main>
  )
}
```

Note : un `<a>` dans un `<button>` n'est pas valide en HTML ; remplacer le `<button>` de la carte par un `<div role="button" tabIndex={0}>` (ou sortir le lien d'appel de la carte) avant de commiter, puis vérifier qu'aucun avertissement d'hydratation n'apparaît dans la console.

- [ ] **Step 4: Vérification (backend + storefront lancés)**

1. `http://localhost:8002/livreur` redirige vers `/bf/livreur` et affiche la connexion.
2. Mauvais PIN : message « Téléphone ou code incorrect. » ; 5 essais ratés : message d'attente.
3. Bon PIN : liste des commandes du jour ; **expédition : aucun montant à encaisser affiché** ; le formulaire n'affiche pas « Montant encaissé » pour une expédition.
4. Ouvrir une commande : aucune réponse présélectionnée ; « Non » -> zone de motif ; « Oui » -> champs selon le type ; envoi sans motif -> message d'erreur lisible.
5. Envoyer « Oui » : l'état devient « Envoyé, en attente de validation » ; l'admin le montre « À valider » ; « Renvoyer pour correction » côté admin -> le livreur voit « À corriger » + motif et peut renvoyer.
6. Redimensionner la fenêtre Chrome à **360 x 740** puis **390 x 844** (outil `resize_window`) : pas de défilement horizontal, cibles tactiles >= 44 px, texte >= 16 px dans les champs (pas de zoom automatique iOS). Prendre une capture de chaque vue (connexion, liste, formulaire Oui, formulaire Non) et les regarder.
7. Le cookie `_gm_courier` est `httpOnly` (`document.cookie` ne le montre pas) ; recharger la page garde la session ; « Quitter » la termine.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src
git commit -m "feat(livreur): page /livreur mobile-first dans le storefront"
```

---

### Task 8: Contrôle de bout en bout, documentation, mise en production

**Files:**
- Modify: `HANDOFF.md` (section « Dernière mise à jour »), `AGENTS.md` (nouvelle section « Espace livreur »), `docs/HANDOFF-PROMPT.md`, `docs/claude-memory/mini-saas-gestion-livreurs.md` + `MEMORY.md` si l'index change.

- [ ] **Step 1: Tests et types**

Run : `cd apps/backend && npm run test:unit` -> tout vert hors les 2 tests `whatsapp-media-prepare` (ffmpeg). `cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -E "courier|delivery"` -> aucune erreur. `cd apps/storefront && npx tsc --noEmit -p . 2>&1 | grep livreur` -> aucune erreur. `cd apps/backend && npm run lint` et `cd apps/storefront && npm run lint` -> pas de nouvelle erreur.

- [ ] **Step 2: Parcours complet (Chrome, deux onglets : admin + téléphone 390 px)**

Scénario : créer 2 livreurs (PIN), confier 3 commandes à l'un (une Ouaga, une expédition, une troisième), puis :
1. Le livreur envoie : Ouaga « Oui » (9 500 / 1 000), expédition « Oui » (course 1 000, Frais Expédition 2 000), troisième « Non » (client absent).
2. Admin : « À confier » contient de nouveau la troisième (échec enregistré, aucune validation demandée) ; l'onglet Rapports livreurs montre le livreur du jour avec 2 à valider et 1 non livrée.
3. Renvoyer l'expédition pour correction avec un motif ; le livreur corrige (Frais Expédition 2 500) ; admin valide en saisissant le montant encaissé (12 000).
4. Valider la livraison Ouaga. Vérifier : commandes payées et livrées, stock livreur déstocké, Caisse du jour (ventes 9 500 et 12 000, sorties : courses, « Frais Expédition »), « Marquer payée » n'est plus proposé.
5. Journée déjà validée (versement) : tenter un rapport « Non » après validation du versement -> message « Journée déjà validée… » lisible côté livreur.
6. Livraison reprise par un autre livreur (« Changer de livreur ») : l'ancien livreur reçoit 404 sur son rapport.

- [ ] **Step 3: Documentation**

- `AGENTS.md` : nouvelle sous-section « Espace livreur (2026-10-15) » dans « Livreurs et livraisons » : architecture (routes `/courier/*`, relais `/api/livreur/*`, cookie `_gm_courier`, PIN haché, limiteur), règles Ouaga / expédition, flux Oui / Non / renvoi, onglet admin, variables (`COOKIE_SECRET` doit exister en production), lien vers la spec et ce plan.
- `HANDOFF.md` : entrée datée avec les décisions du propriétaire (PIN à 4 chiffres, Oui / Non d'abord, Non sans validation, renvoi pour correction, onglet par livreur du jour, libellé « Frais Expédition ») et les 5 améliorations du 2026-10-15 (suppression d'une commande saisie à la main, changement de livreur, caisse : jour par défaut / Résultat / heure). `docs/HANDOFF-PROMPT.md` : mettre à jour l'état et « À vérifier ».
- `docs/claude-memory/mini-saas-gestion-livreurs.md` : ajouter l'espace livreur ; mettre à jour la ligne de `MEMORY.md`.

- [ ] **Step 4: Commit et déploiement**

```bash
git add AGENTS.md HANDOFF.md docs
git commit -m "docs: espace livreur (AGENTS, handoff, mémoire)"
git push origin staging && git push origin staging:main
```
(Consigne du propriétaire : chaque push sur `staging` enchaîne la production. Avant de pousser : vérifier que `COOKIE_SECRET` existe dans les `.env` du VPS, que `NEXT_PUBLIC_MEDUSA_BACKEND_URL` du storefront de production pointe sur le backend, et appliquer la migration (`medusa db:migrate` est joué par le déploiement ; sinon le lancer dans le conteneur backend). Surveiller le déploiement (~20 min) puis tester `https://<site>/livreur` sur un vrai téléphone avec un livreur de test, sans valider de rapport réel.)

---

## Self-Review

- **Couverture de la spec** : connexion téléphone + PIN (Tasks 1, 3, 7) ; page storefront mobile-first avec relais et cookie `httpOnly` (7) ; question Oui / Non d'abord sans présélection (1, 7) ; motif obligatoire pour « Non », appliqué sans validation (1, 4) ; champs selon Ouaga / expédition et « Frais Expédition » (1, 6, 7) ; validation figée sauf montant d'expédition (4, 5, 6) ; renvoi pour correction avec motif et correction par le livreur (4, 5, 6, 7) ; onglet à deux niveaux, livreurs du jour puis tableau complet (5, 6) ; PIN dans la fiche livreur (3, 6) ; limiteur et blocage 15 min (3) ; tests (1) et vérifications visuelles mobiles (7, 8). Aucun écart.
- **Placeholders** : aucun « TBD » ; les deux points à confirmer sur place sont explicités (signature de `normalizePhone` à l'étape 2 de la Task 3 ; structure du layout racine et alias `@modules` à la Task 7) avec l'action de repli.
- **Cohérence des types** : `ReportValues`, `LineState`, `reportState`, `summarizeDay`, `ReportView`, `ReportLine`, `loadCourierDay`, `listCouriersOfDay`, `submitCourierReport`, `validateCourierReport`, `returnCourierReport`, `CourierRequest`, `SetPinSchema`, `has_pin` portent les mêmes noms dans toutes les tâches. Le type admin `ReportLine` (Task 6) reflète le `ReportLine` backend (Task 4).
- **Review Focus** : points 1 (montant 0 refusé : tests `parseReport`), 2 (message « Journée déjà validée » : Task 8 étape 2.5), 3 (double envoi / `delivery_id` unique : Task 4 étape 3.4), 4 (changement de livreur : Task 8 étape 2.6), 5 (PIN : Tasks 1 et 3) ont chacun une vérification dans la tâche qui possède le code.
