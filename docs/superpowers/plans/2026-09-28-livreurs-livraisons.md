# Livreurs et livraisons — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confier chaque commande à un livreur (express à Ouagadougou ou expédition via une compagnie de transport), le prévenir par WhatsApp, suivre les statuts, et calculer chaque jour le montant exact que chaque livreur doit reverser.

**Architecture:** Nouveau module Medusa `delivery` (tables `courier`, `delivery`, `courier_settlement`) dans `apps/backend`. La logique métier (montants, règles de statut, report, message) vit dans des fonctions pures testées (`src/lib/delivery-*.ts`). Routes admin `/admin/couriers`, `/admin/deliveries/*`, `/admin/courier-settlements/*`. Effets sur la commande via workflows natifs (paiement marqué payé, fulfillment). Message au livreur via le webhook n8n existant `order-confirmation` (modèle Meta `nouvelle_livraison`). Job planifié de report nocturne. Écrans admin : widget fiche commande + page « Livraisons » (4 onglets).

**Tech Stack:** Medusa 2.18 (module DML `model.define`, `MedusaService`, workflows core-flows, scheduled jobs, Admin SDK), Jest unitaire, n8n (webhook existant), WhatsApp Cloud API.

**Spec:** `docs/superpowers/specs/2026-09-28-livreurs-livraisons-design.md`

## Global Constraints

- Français partout (commentaires, messages, commits) ; pas d'emoji dans le code ; jamais de trailer `Co-Authored-By`.
- Montants en XOF entiers (F CFA), pas de centimes.
- Raccourcis de frais : 1 000 et 1 500 F ; frais livreur par défaut d'une expédition : 1 000 F.
- Heure de référence : Africa/Ouagadougou (= UTC) ; `tour_date` au format `AAAA-MM-JJ`.
- Numéro de commande affiché : `orderNumberOf(order)` (`src/lib/order-number.ts`, custom_display_id sinon display_id).
- Téléphones normalisés avec `normalizePhone` (`src/lib/normalize-phone.ts`, format `+226XXXXXXXX`).
- Admin : aucun composant `@medusajs/ui` ni `<Link>`/`useNavigate` de react-router (conflit de types React 18/19 et navigation sans effet depuis une extension) — éléments HTML natifs, liens `<a href="/app/...">`, `window.location.assign`.
- Skills Medusa (`medusa-dev`, lus depuis `~/.claude/plugins/marketplaces/medusa/plugins/medusa-dev/skills/`) : backend = module → workflow → route (toutes les écritures par workflow, validation Zod `@medusajs/framework/zod` en middleware, GET/POST/DELETE seulement, un lien de module par fichier dans `src/links/`). Écarts assumés côté admin, conformes aux écrans existants du projet (`AGENTS.md` prime) : `fetch(..., { credentials: "include" })` au lieu du SDK JS, HTML natif + classes sémantiques `bg-ui-*`/`text-ui-fg-*` au lieu des composants `@medusajs/ui`.
- Zones de widget : `order.details.side.before` (les zones `*.before` principales s'affichent après le contenu en 2.18).
- Sessions admin en mémoire : chaque redémarrage du backend déconnecte (se reconnecter en local via `/auth/user/emailpass` + `/auth/session`, identifiants dans `$SCRATCH/local-admin.env`).
- Environnement local : `docker compose up -d` (Postgres 5433, Redis), `npm run backend:dev` (port 9001), admin `http://localhost:9001/app`. Aucun envoi WhatsApp/Meta configuré en local.

## Review Focus

1. **Deux passages à « Livrée » rapprochés** (double clic, deux onglets) → une seule collecte marquée payée, un seul fulfillment (Task 5 : `prepareCompletionStep` refuse une livraison déjà terminée ; Task 4 : lectures préalables).
2. **Journée d'un livreur sans aucune livraison terminée mais avec des livraisons reportées** → « À reverser : 0 F », les reportées listées mais non comptées (Task 2 test).
3. **Commande annulée après avoir été confiée** → ligne `canceled`, exclue du montant à reverser (Task 2 test + Task 6 route tour).
4. **Livreur désactivé ayant encore des livraisons en cours** → toujours visible dans sa tournée, plus proposé pour de nouvelles attributions (Task 5 `assertCanAssignStep`, Task 6).
5. **Saisie d'un montant encaissé vide ou négatif** → refus clair (Task 2 `validateCompletion` testée + schéma Zod Task 6).

---

### Task 1: Module `delivery` (modèles, service, migration)

**Files:**
- Create: `apps/backend/src/modules/delivery/models/courier.ts`
- Create: `apps/backend/src/modules/delivery/models/delivery.ts`
- Create: `apps/backend/src/modules/delivery/models/courier-settlement.ts`
- Create: `apps/backend/src/modules/delivery/service.ts`
- Create: `apps/backend/src/modules/delivery/index.ts`
- Create: `apps/backend/src/links/order-delivery.ts` (lien de module order ↔ delivery, skill building-with-medusa `arch-module-isolation`)
- Modify: `apps/backend/medusa-config.ts` (bloc `modules`)
- Generated: `apps/backend/src/modules/delivery/migrations/Migration*.ts`

**Interfaces:**
- Produces: `DELIVERY_MODULE = "delivery"`; service `DeliveryModuleService` avec les méthodes générées `createCouriers/listCouriers/updateCouriers/retrieveCourier`, `createDeliveries/listDeliveries/updateDeliveries/retrieveDelivery`, `createCourierSettlements/listCourierSettlements/updateCourierSettlements/deleteCourierSettlements`.

- [ ] **Step 1: Modèles**

`models/courier.ts` :
```ts
import { model } from "@medusajs/framework/utils"

// Livreur Golden Market : pas de compte, joint uniquement par WhatsApp
// (spec 2026-09-28 livreurs-livraisons).
export const Courier = model.define("courier", {
  id: model.id({ prefix: "cour" }).primaryKey(),
  name: model.text(),
  phone: model.text(),
  active: model.boolean().default(true),
  notes: model.text().nullable(),
})
```

`models/delivery.ts` :
```ts
import { model } from "@medusajs/framework/utils"

// Une livraison = une tentative (une reprogrammation après échec crée une
// nouvelle tentative). tour_date avance avec le report automatique nocturne.
export const Delivery = model
  .define("delivery", {
    id: model.id({ prefix: "deliv" }).primaryKey(),
    order_id: model.text(),
    courier_id: model.text(),
    tour_date: model.text(), // AAAA-MM-JJ, heure de Ouagadougou
    assigned_at: model.dateTime(),
    completed_at: model.dateTime().nullable(),
    postponed_count: model.number().default(0),
    first_tour_date: model.text(),
    type: model.enum(["express", "expedition"]),
    status: model.enum(["assigned", "delivered", "failed", "shipped", "canceled"]).default("assigned"),
    address: model.text().nullable(),
    transport_company: model.text().nullable(),
    destination_city: model.text().nullable(),
    parcel_reference: model.text().nullable(),
    failure_reason: model.text().nullable(),
    redeliver: model.boolean().default(false),
    amount_to_collect: model.number().default(0),
    amount_collected: model.number().nullable(),
    courier_fee: model.number().nullable(),
    transport_fee: model.number().nullable(),
    whatsapp_status: model.enum(["pending", "sent", "failed"]).default("pending"),
    whatsapp_error: model.text().nullable(),
    sync_warning: model.text().nullable(),
  })
  .indexes([
    { on: ["order_id"] },
    { on: ["courier_id", "tour_date"] },
    { on: ["status"] },
  ])
```

`models/courier-settlement.ts` :
```ts
import { model } from "@medusajs/framework/utils"

// Versement d'un livreur pour une journée : figé à la validation, verrouille
// les livraisons terminées ce jour-là jusqu'à "Rouvrir la journée".
export const CourierSettlement = model
  .define("courier_settlement", {
    id: model.id({ prefix: "csett" }).primaryKey(),
    courier_id: model.text(),
    day: model.text(), // AAAA-MM-JJ
    expected_amount: model.number(),
    received_amount: model.number(),
    validated_at: model.dateTime(),
    note: model.text().nullable(),
  })
  .indexes([{ on: ["courier_id", "day"], unique: true }])
```

- [ ] **Step 2: Service et module**

`service.ts` :
```ts
import { MedusaService } from "@medusajs/framework/utils"
import { Courier } from "./models/courier"
import { CourierSettlement } from "./models/courier-settlement"
import { Delivery } from "./models/delivery"

export default class DeliveryModuleService extends MedusaService({
  Courier,
  Delivery,
  CourierSettlement,
}) {}
```

`index.ts` :
```ts
import { Module } from "@medusajs/framework/utils"
import DeliveryModuleService from "./service"

export const DELIVERY_MODULE = "delivery"

export default Module(DELIVERY_MODULE, { service: DeliveryModuleService })
```

Dans `medusa-config.ts`, bloc `modules`, ajouter :
```ts
    // Livreurs et livraisons (spec 2026-09-28) : tables courier, delivery,
    // courier_settlement.
    delivery: {
      resolve: './src/modules/delivery',
    },
```

`src/links/order-delivery.ts` (une commande a plusieurs tentatives ; `order_id` reste aussi un champ texte indexé pour filtrer dans le module sans passer par l'index) :
```ts
import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import DeliveryModule from "../modules/delivery"

// Une commande -> plusieurs livraisons (une par tentative).
export default defineLink(OrderModule.linkable.order, {
  linkable: DeliveryModule.linkable.delivery,
  isList: true,
})
```

- [ ] **Step 3: Générer et appliquer la migration (local)**

Run: `cd apps/backend && npx medusa db:generate delivery && npx medusa db:migrate`
Expected: un fichier `src/modules/delivery/migrations/Migration*.ts` créé ; migration appliquée et lien synchronisé sans erreur ; `docker exec -i golden_market_medusa_postgres psql -U medusa -d medusa-backend -c '\dt *deliver*'` liste `delivery`, `courier_settlement` (via `\dt courier*`) et la table de lien `order_order_delivery_delivery`.

- [ ] **Step 4: Vérifier typage et suite**

Run: `cd apps/backend && npx tsc --noEmit -p . && npm run test:unit 2>&1 | grep -E "^Tests:"`
Expected: 0 erreur, tous les tests passent.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/delivery apps/backend/src/links/order-delivery.ts apps/backend/medusa-config.ts
git commit -m "feat(livraisons): module delivery (livreurs, livraisons, versements)"
```

---

### Task 2: Règles métier pures (`delivery-rules.ts`)

**Files:**
- Create: `apps/backend/src/lib/delivery-rules.ts`
- Test: `apps/backend/src/lib/__tests__/delivery-rules.unit.spec.ts`

**Interfaces:**
- Produces:
```ts
export type DeliveryType = "express" | "expedition"
export type DeliveryStatus = "assigned" | "delivered" | "failed" | "shipped" | "canceled"
export type DeliveryLike = {
  status: DeliveryStatus; type: DeliveryType; tour_date: string; completed_at: Date | string | null
  amount_to_collect: number; amount_collected: number | null; courier_fee: number | null; transport_fee: number | null
}
export const todayInOuaga: (now?: Date) => string                       // "AAAA-MM-JJ"
export const dayOf: (date: Date | string) => string                      // "AAAA-MM-JJ"
export const defaultTypeForCity: (city: string | null | undefined) => DeliveryType
export const computeAmountToCollect: (input: { type: DeliveryType; paymentStatus: string; outstanding: number }) => number
export const canAssign: (existing: { status: DeliveryStatus }[]) => boolean
export const computeSettlement: (deliveries: DeliveryLike[], day: string) => {
  collected: number; courierFees: number; transportFees: number; toRemit: number; completedCount: number
}
export const validateCompletion: (input: { status: "delivered" | "failed" | "shipped"; type: DeliveryType
  amount_collected?: unknown; courier_fee?: unknown; transport_fee?: unknown; failure_reason?: unknown }) =>
  { ok: true; values: { amount_collected: number | null; courier_fee: number | null; transport_fee: number | null; failure_reason: string | null } } | { ok: false; message: string }
```

- [ ] **Step 1: Écrire les tests**

```ts
import {
  canAssign,
  computeAmountToCollect,
  computeSettlement,
  dayOf,
  defaultTypeForCity,
  todayInOuaga,
  validateCompletion,
  type DeliveryLike,
} from "../delivery-rules"

const d = (over: Partial<DeliveryLike>): DeliveryLike => ({
  status: "delivered",
  type: "express",
  tour_date: "2026-09-28",
  completed_at: "2026-09-28T15:00:00Z",
  amount_to_collect: 6500,
  amount_collected: 6500,
  courier_fee: 1000,
  transport_fee: null,
  ...over,
})

describe("todayInOuaga / dayOf", () => {
  it("renvoie la date AAAA-MM-JJ à l'heure de Ouagadougou", () => {
    expect(todayInOuaga(new Date("2026-09-28T23:59:00Z"))).toBe("2026-09-28")
    expect(dayOf("2026-09-29T00:01:00Z")).toBe("2026-09-29")
  })
})

describe("defaultTypeForCity", () => {
  it.each([["Ouagadougou", "express"], ["ouaga", "express"], [" OUAGADOUGOU ", "express"], ["Koudougou", "expedition"], [null, "express"]])(
    "%s -> %s", (city, expected) => expect(defaultTypeForCity(city as any)).toBe(expected)
  )
})

describe("computeAmountToCollect", () => {
  it("encaisse le reste dû d'une livraison express non payée", () => {
    expect(computeAmountToCollect({ type: "express", paymentStatus: "not_paid", outstanding: 9500 })).toBe(9500)
  })
  it("n'encaisse rien si la commande est déjà payée", () => {
    expect(computeAmountToCollect({ type: "express", paymentStatus: "captured", outstanding: 0 })).toBe(0)
  })
  it("n'encaisse jamais rien pour une expédition", () => {
    expect(computeAmountToCollect({ type: "expedition", paymentStatus: "not_paid", outstanding: 9500 })).toBe(0)
  })
})

describe("canAssign", () => {
  it("refuse une deuxième livraison tant qu'une tentative est en cours", () => {
    expect(canAssign([{ status: "assigned" }])).toBe(false)
  })
  it("autorise après un échec, une livraison terminée ou annulée", () => {
    expect(canAssign([{ status: "failed" }, { status: "canceled" }])).toBe(true)
    expect(canAssign([])).toBe(true)
  })
})

describe("computeSettlement", () => {
  it("encaissé - frais livreur - frais compagnie, sur les livraisons terminées ce jour-là", () => {
    const result = computeSettlement(
      [
        d({}),
        d({ amount_to_collect: 9500, amount_collected: 9500, courier_fee: 1500 }),
        d({ type: "expedition", status: "shipped", amount_to_collect: 0, amount_collected: null, courier_fee: 1000, transport_fee: 1500 }),
      ],
      "2026-09-28"
    )
    expect(result).toEqual({ collected: 16000, courierFees: 3500, transportFees: 1500, toRemit: 11000, completedCount: 3 })
  })

  it("peut être négatif (journée d'expéditions : le propriétaire doit au livreur)", () => {
    const result = computeSettlement(
      [d({ type: "expedition", status: "shipped", amount_collected: null, amount_to_collect: 0, courier_fee: 1000, transport_fee: 1000 })],
      "2026-09-28"
    )
    expect(result.toRemit).toBe(-2000)
  })

  it("compte les frais d'un échec mais aucun encaissement", () => {
    const result = computeSettlement([d({ status: "failed", amount_collected: null, courier_fee: 1000 })], "2026-09-28")
    expect(result).toMatchObject({ collected: 0, courierFees: 1000, toRemit: -1000 })
  })

  it("exclut les livraisons reportées (non terminées), annulées ou terminées un autre jour", () => {
    const result = computeSettlement(
      [
        d({ status: "assigned", completed_at: null }),
        d({ status: "canceled", completed_at: null }),
        d({ completed_at: "2026-09-27T12:00:00Z" }),
      ],
      "2026-09-28"
    )
    expect(result).toEqual({ collected: 0, courierFees: 0, transportFees: 0, toRemit: 0, completedCount: 0 })
  })
})

describe("validateCompletion", () => {
  it("livrée : montant encaissé obligatoire, entier positif ou nul", () => {
    expect(validateCompletion({ status: "delivered", type: "express", amount_collected: 6500, courier_fee: 1000 })).toEqual({
      ok: true,
      values: { amount_collected: 6500, courier_fee: 1000, transport_fee: null, failure_reason: null },
    })
    expect(validateCompletion({ status: "delivered", type: "express", amount_collected: -5 }).ok).toBe(false)
    expect(validateCompletion({ status: "delivered", type: "express", amount_collected: "" }).ok).toBe(false)
  })
  it("échec : motif obligatoire", () => {
    expect(validateCompletion({ status: "failed", type: "express", failure_reason: " " }).ok).toBe(false)
    expect(validateCompletion({ status: "failed", type: "express", failure_reason: "Client absent", courier_fee: 1000 })).toMatchObject({ ok: true })
  })
  it("déposée : réservé aux expéditions", () => {
    expect(validateCompletion({ status: "shipped", type: "express" }).ok).toBe(false)
    expect(validateCompletion({ status: "shipped", type: "expedition", courier_fee: 1000, transport_fee: 1500 })).toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/delivery-rules.unit.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// Règles métier des livraisons (spec 2026-09-28 livreurs-livraisons) :
// fonctions pures, testées, utilisées par les routes admin et le job de report.

export type DeliveryType = "express" | "expedition"
export type DeliveryStatus = "assigned" | "delivered" | "failed" | "shipped" | "canceled"

export type DeliveryLike = {
  status: DeliveryStatus
  type: DeliveryType
  tour_date: string
  completed_at: Date | string | null
  amount_to_collect: number
  amount_collected: number | null
  courier_fee: number | null
  transport_fee: number | null
}

// Burkina Faso : UTC+0 toute l'année.
export const dayOf = (date: Date | string): string => new Date(date).toISOString().slice(0, 10)
export const todayInOuaga = (now: Date = new Date()): string => dayOf(now)

// Ouagadougou -> livraison express ; toute autre ville -> expédition.
export const defaultTypeForCity = (city: string | null | undefined): DeliveryType => {
  const c = (city ?? "").trim().toLowerCase()
  return c === "" || c.startsWith("ouaga") ? "express" : "expedition"
}

// Figé au moment de confier la commande. Une expédition n'est jamais encaissée
// par le livreur (le client paie par Orange/Moov Money avant ou après l'envoi).
export const computeAmountToCollect = (input: {
  type: DeliveryType
  paymentStatus: string
  outstanding: number
}): number => {
  if (input.type === "expedition") return 0
  if (input.paymentStatus === "captured" || input.paymentStatus === "completed") return 0
  return Math.max(0, Math.round(input.outstanding))
}

// Une seule tentative en cours par commande.
export const canAssign = (existing: { status: DeliveryStatus }[]): boolean =>
  !existing.some((d) => d.status === "assigned")

const TERMINAL: DeliveryStatus[] = ["delivered", "failed", "shipped"]

// Montant que le livreur doit reverser pour une journée : seules comptent les
// livraisons terminées ce jour-là (une livraison reportée n'est jamais comptée
// avant d'avoir été faite). Peut être négatif.
export const computeSettlement = (deliveries: DeliveryLike[], day: string) => {
  const done = deliveries.filter(
    (d) => TERMINAL.includes(d.status) && d.completed_at && dayOf(d.completed_at) === day
  )
  const sum = (pick: (d: DeliveryLike) => number | null) => done.reduce((s, d) => s + (pick(d) ?? 0), 0)
  const collected = sum((d) => (d.status === "delivered" ? d.amount_collected : 0))
  const courierFees = sum((d) => d.courier_fee)
  const transportFees = sum((d) => d.transport_fee)
  return { collected, courierFees, transportFees, toRemit: collected - courierFees - transportFees, completedCount: done.length }
}

const amount = (value: unknown): number | null | "invalid" => {
  if (value === undefined || value === null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isInteger(n) && n >= 0 ? n : "invalid"
}

export const validateCompletion = (input: {
  status: "delivered" | "failed" | "shipped"
  type: DeliveryType
  amount_collected?: unknown
  courier_fee?: unknown
  transport_fee?: unknown
  failure_reason?: unknown
}):
  | { ok: true; values: { amount_collected: number | null; courier_fee: number | null; transport_fee: number | null; failure_reason: string | null } }
  | { ok: false; message: string } => {
  const collected = amount(input.amount_collected)
  const courierFee = amount(input.courier_fee)
  const transportFee = amount(input.transport_fee)
  if (collected === "invalid" || courierFee === "invalid" || transportFee === "invalid") {
    return { ok: false, message: "Montants invalides : nombres entiers positifs en F CFA." }
  }
  const reason = typeof input.failure_reason === "string" ? input.failure_reason.trim() : ""
  if (input.status === "delivered" && collected === null) {
    return { ok: false, message: "Indiquez le montant encaissé (0 si rien n'a été encaissé)." }
  }
  if (input.status === "failed" && !reason) {
    return { ok: false, message: "Indiquez le motif de l'échec." }
  }
  if (input.status === "shipped" && input.type !== "expedition") {
    return { ok: false, message: "« Déposée à la gare » est réservé aux expéditions." }
  }
  return {
    ok: true,
    values: {
      amount_collected: input.status === "delivered" ? collected : null,
      courier_fee: courierFee,
      transport_fee: input.type === "expedition" ? transportFee : null,
      failure_reason: input.status === "failed" ? reason : null,
    },
  }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/delivery-rules.unit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/delivery-rules.ts apps/backend/src/lib/__tests__/delivery-rules.unit.spec.ts
git commit -m "feat(livraisons): règles métier (montant à encaisser, versement, validations)"
```

---

### Task 3: Message au livreur et modèle Meta

**Files:**
- Create: `apps/backend/src/lib/delivery-message.ts`
- Test: `apps/backend/src/lib/__tests__/delivery-message.unit.spec.ts`

**Interfaces:**
- Produces: `buildCourierMessageParams(input: { orderNumber: string; customerName: string; customerPhone: string; type: DeliveryType; address: string | null; transportCompany: string | null; destinationCity: string | null; items: { title: string; quantity: number }[]; amountToCollect: number }): string[]` (5 paramètres : numéro, client, lieu, articles, encaissement) ; `sendCourierMessage(input: { phone: string; params: string[] }, deps?: { url?: string; secret?: string; fetchImpl?: typeof fetch }): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Soumettre le modèle Meta (une fois, WABA de l'agent `1559398689065795`)**

Corps (5 variables, sans retour à la ligne dans les variables) :
`Nouvelle livraison Golden Market - Commande {{1}}. Client : {{2}}. Lieu : {{3}}. Articles : {{4}}. {{5}}`
Exemple : `20260928001` / `Awa Ouédraogo, +22670000000` / `Pissy, près de la pharmacie` / `1 x Balai-éponge (Avec seau)` / `À encaisser : 9 500 F`.

```bash
ssh admin@144.91.110.105 'docker exec golden_market_n8n sh -c "node -e \"
const T=process.env.WHATSAPP_ACCESS_TOKEN;
const body={name:\\\"nouvelle_livraison\\\",language:\\\"fr\\\",category:\\\"UTILITY\\\",components:[{type:\\\"BODY\\\",text:\\\"Nouvelle livraison Golden Market - Commande {{1}}. Client : {{2}}. Lieu : {{3}}. Articles : {{4}}. {{5}}\\\",example:{body_text:[[\\\"20260928001\\\",\\\"Awa Ouedraogo, +22670000000\\\",\\\"Pissy, pres de la pharmacie\\\",\\\"1 x Balai-eponge (Avec seau)\\\",\\\"A encaisser : 9 500 F\\\"]]}}]};
fetch(\\\"https://graph.facebook.com/v20.0/1559398689065795/message_templates\\\",{method:\\\"POST\\\",headers:{Authorization:\\\"Bearer \\\"+T,\\\"content-type\\\":\\\"application/json\\\"},body:JSON.stringify(body)}).then(async r=>console.log(r.status, await r.text()))\""'
```
Expected: `200 {"id":"…","status":"PENDING"…}`. Noter l'id dans `HANDOFF.md` (Task 9).

- [ ] **Step 2: Tests**

```ts
import { buildCourierMessageParams, sendCourierMessage } from "../delivery-message"

describe("buildCourierMessageParams", () => {
  it("livraison express : adresse et montant à encaisser", () => {
    expect(
      buildCourierMessageParams({
        orderNumber: "20260928001",
        customerName: "Awa Ouédraogo",
        customerPhone: "+22670000000",
        type: "express",
        address: "Pissy,\nprès de la pharmacie",
        transportCompany: null,
        destinationCity: null,
        items: [{ title: "Balai-éponge (Avec seau)", quantity: 1 }, { title: "Seau", quantity: 2 }],
        amountToCollect: 9500,
      })
    ).toEqual([
      "20260928001",
      "Awa Ouédraogo, +22670000000",
      "Pissy, près de la pharmacie",
      "1 x Balai-éponge (Avec seau), 2 x Seau",
      "À encaisser : 9 500 F",
    ])
  })

  it("expédition : compagnie et destination, rien à encaisser", () => {
    const params = buildCourierMessageParams({
      orderNumber: "20260928002", customerName: "Ali", customerPhone: "+22676000000", type: "expedition",
      address: null, transportCompany: "STAF", destinationCity: "Bobo-Dioulasso",
      items: [{ title: "Ventilateur", quantity: 1 }], amountToCollect: 0,
    })
    expect(params[2]).toBe("Expédition STAF vers Bobo-Dioulasso")
    expect(params[4]).toBe("Rien à encaisser")
  })
})

describe("sendCourierMessage", () => {
  it("appelle le webhook n8n générique avec le modèle nouvelle_livraison", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await sendCourierMessage({ phone: "+22670000000", params: ["a", "b", "c", "d", "e"] }, { url: "https://n8n/x", secret: "s", fetchImpl })
    expect(result).toEqual({ ok: true })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ phone: "+22670000000", template_name: "nouvelle_livraison", params: ["a", "b", "c", "d", "e"] })
    expect(fetchImpl.mock.calls[0][1].headers["x-webhook-secret"]).toBe("s")
  })

  it("renvoie l'erreur sans lever si n8n refuse ou si la configuration manque", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 502 })
    expect(await sendCourierMessage({ phone: "+226", params: [] }, { url: "https://n8n/x", secret: "s", fetchImpl })).toEqual({ ok: false, error: "Webhook n8n a répondu 502" })
    expect((await sendCourierMessage({ phone: "+226", params: [] }, { url: undefined, secret: undefined, fetchImpl })).ok).toBe(false)
  })
})
```

- [ ] **Step 3: Vérifier l'échec** — Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/delivery-message.unit.spec.ts` — Expected: FAIL (module introuvable).

- [ ] **Step 4: Implémenter**

```ts
import type { DeliveryType } from "./delivery-rules"

// Message WhatsApp au livreur quand une commande lui est confiée : modèle Meta
// "nouvelle_livraison" (5 variables) envoyé par le webhook n8n générique
// order-confirmation (template_name + params), déjà utilisé pour les
// confirmations de commande. Les paramètres de modèle Meta refusent les
// retours à la ligne et les tabulations : espaces simples uniquement.
const clean = (text: string) => text.replace(/\s+/g, " ").trim()
const formatXof = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount).replace(/ | /g, " ")} F`

export const buildCourierMessageParams = (input: {
  orderNumber: string
  customerName: string
  customerPhone: string
  type: DeliveryType
  address: string | null
  transportCompany: string | null
  destinationCity: string | null
  items: { title: string; quantity: number }[]
  amountToCollect: number
}): string[] => [
  clean(input.orderNumber),
  clean(`${input.customerName}, ${input.customerPhone}`),
  clean(
    input.type === "expedition"
      ? `Expédition ${input.transportCompany ?? ""} vers ${input.destinationCity ?? ""}`
      : input.address ?? ""
  ),
  clean(input.items.map((i) => `${i.quantity} x ${i.title}`).join(", ")),
  input.amountToCollect > 0 ? `À encaisser : ${formatXof(input.amountToCollect)}` : "Rien à encaisser",
]

export async function sendCourierMessage(
  input: { phone: string; params: string[] },
  deps: { url?: string; secret?: string; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = "url" in deps ? deps.url : process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
  const secret = "secret" in deps ? deps.secret : process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET
  const fetchImpl = deps.fetchImpl ?? fetch
  if (!url) return { ok: false, error: "Envoi WhatsApp non configuré (N8N_ORDER_CONFIRMATION_WEBHOOK_URL)" }
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { "x-webhook-secret": secret } : {}) },
      body: JSON.stringify({ phone: input.phone, template_name: "nouvelle_livraison", params: input.params }),
    })
    return response.ok ? { ok: true } : { ok: false, error: `Webhook n8n a répondu ${response.status}` }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
```

Note : `formatXof(9500)` doit produire `9 500 F` (espace normale) — le test le vérifie.

- [ ] **Step 5: Vérifier le succès** — même commande, Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/delivery-message.ts apps/backend/src/lib/__tests__/delivery-message.unit.spec.ts
git commit -m "feat(livraisons): message WhatsApp au livreur (modèle nouvelle_livraison)"
```

---

### Task 4: Effets sur la commande Medusa (paiement, fulfillment)

**Files:**
- Create: `apps/backend/src/lib/delivery-order-sync.ts`

**Interfaces:**
- Consumes: workflows `markPaymentCollectionAsPaid`, `createOrderFulfillmentWorkflow`, `createOrderShipmentWorkflow`, `markOrderFulfillmentAsDeliveredWorkflow` (`@medusajs/medusa/core-flows`).
- Produces: `syncOrderAfterDelivery(container, { orderId: string; status: "delivered" | "shipped"; collected: number }): Promise<string | null>` — renvoie `null` si tout s'est bien passé, sinon un avertissement lisible (jamais d'exception).

- [ ] **Step 1: Implémenter** (logique d'orchestration de workflows natifs, vérifiée en local en Task 8 ; les cas d'idempotence sont gérés par les lectures préalables)

```ts
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows"

// Répercute une livraison terminée sur la commande Medusa : paiement marqué
// payé (livraison express encaissée) et colonne native "Fulfillment" (livrée
// / expédiée). Tolérant : un échec ne bloque jamais la livraison, il renvoie
// un avertissement affiché dans l'admin (le statut de livraison fait foi).
// Idempotent : relit l'état de la commande avant chaque action.
export async function syncOrderAfterDelivery(
  container: any,
  input: { orderId: string; status: "delivered" | "shipped"; collected: number }
): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const warnings: string[] = []
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.id",
      "payment_collections.status",
      "items.id",
      "items.quantity",
      "fulfillments.id",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
    ],
    filters: { id: input.orderId },
  })
  if (!order) return "Commande introuvable pour la synchronisation."

  if (input.status === "delivered" && input.collected > 0) {
    const pending = (order.payment_collections ?? []).find((pc: any) => pc.status === "not_paid")
    if (pending) {
      try {
        await markPaymentCollectionAsPaid(container).run({ input: { order_id: order.id, payment_collection_id: pending.id } })
      } catch (e) {
        warnings.push(`Paiement non marqué payé : ${(e as Error).message}`)
      }
    }
  }

  try {
    let fulfillment = (order.fulfillments ?? [])[0]
    if (!fulfillment) {
      const { result } = await createOrderFulfillmentWorkflow(container).run({
        input: { order_id: order.id, items: (order.items ?? []).map((i: any) => ({ id: i.id, quantity: i.quantity })) },
      })
      fulfillment = result
    }
    if (!fulfillment.shipped_at) {
      await createOrderShipmentWorkflow(container).run({
        input: {
          order_id: order.id,
          fulfillment_id: fulfillment.id,
          items: (order.items ?? []).map((i: any) => ({ id: i.id, quantity: i.quantity })),
        },
      })
    }
    if (input.status === "delivered" && !fulfillment.delivered_at) {
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({ input: { orderId: order.id, fulfillmentId: fulfillment.id } })
    }
  } catch (e) {
    warnings.push(`Statut « Fulfillment » non mis à jour : ${(e as Error).message}`)
  }

  return warnings.length ? warnings.join(" ") : null
}
```

- [ ] **Step 2: Typage** — Run: `cd apps/backend && npx tsc --noEmit -p .` — Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/lib/delivery-order-sync.ts
git commit -m "feat(livraisons): répercussion sur la commande (paiement, fulfillment)"
```

---

### Task 5: Workflows (toutes les écritures)

Règles des skills Medusa (`building-with-medusa`) : **toute mutation passe par un workflow** (jamais d'appel direct au service du module depuis une route), **validation métier dans les étapes** (`MedusaError`), une mutation par étape avec compensation, fonction de composition synchrone `function` sans `if`/`?:`/`??`/spread/`new Date()` (utiliser `transform`/`when`), étape réutilisée → `.config({ name })`, liens via `createRemoteLinkStep` dans l'ordre du `defineLink` (order puis delivery).

**Files:**
- Create: `apps/backend/src/workflows/steps/delivery-steps.ts` (étapes : `createCourierStep`, `updateCourierStep`, `assertCanAssignStep`, `createDeliveryStep`, `updateDeliveryStep`, `assertDayNotLockedStep`, `createSettlementStep`, `deleteSettlementStep`)
- Create: `apps/backend/src/workflows/couriers.ts` (`createCourierWorkflow`, `updateCourierWorkflow`)
- Create: `apps/backend/src/workflows/assign-delivery.ts` (`assignDeliveryWorkflow` : une commande ; la route boucle sur `order_ids`)
- Create: `apps/backend/src/workflows/complete-delivery.ts` (`completeDeliveryWorkflow`)
- Create: `apps/backend/src/workflows/update-delivery.ts` (`updateDeliveryWorkflow` : statut WhatsApp, avertissement de synchro, statut `canceled`, report)
- Create: `apps/backend/src/workflows/courier-settlements.ts` (`validateSettlementWorkflow`, `reopenSettlementWorkflow`)

**Interfaces:**
- Consumes: Task 1 (`DELIVERY_MODULE`, service), Task 2 (`canAssign`, `validateCompletion`, `computeSettlement`, `dayOf`, `todayInOuaga`, `parseCourierInput`).
- Produces:
  - `createCourierWorkflow(container).run({ input: { name, phone, notes? } })` → `{ result: courier }`
  - `updateCourierWorkflow(...).run({ input: { id, name?, phone?, active?, notes? } })` → `{ result: courier }`
  - `assignDeliveryWorkflow(...).run({ input: { order_id, courier_id, type, address, transport_company, destination_city, amount_to_collect, order_canceled: boolean } })` → `{ result: delivery }` — erreurs `MedusaError.Types.NOT_ALLOWED` (commande annulée, tentative en cours, livreur inactif).
  - `completeDeliveryWorkflow(...).run({ input: { id, status, amount_collected?, courier_fee?, transport_fee?, failure_reason?, redeliver? } })` → `{ result: delivery }` — `INVALID_DATA` (validation), `NOT_ALLOWED` (déjà terminée, journée validée).
  - `updateDeliveryWorkflow(...).run({ input: { id, ...champs } })` et `{ input: [{ id, ... }] }` (lot, pour le report) → `{ result: delivery[] }`
  - `validateSettlementWorkflow(...).run({ input: { courier_id, day, received_amount, note? } })` → `{ result: settlement }` (`expected_amount` recalculé dans l'étape) ; `reopenSettlementWorkflow(...).run({ input: { id } })`.

- [ ] **Step 1: Test des validations des étapes** — les règles sont déjà couvertes par les fonctions pures (Task 2) ; ajouter à `delivery-rules.unit.spec.ts` le test de `parseCourierInput` (normalisation du numéro, nom obligatoire) :
```ts
import { parseCourierInput } from "../delivery-rules"
describe("parseCourierInput", () => {
  it("normalise le numéro et exige un nom", () => {
    expect(parseCourierInput({ name: " Zakaria ", phone: "70 00 00 00" })).toEqual({ ok: true, values: { name: "Zakaria", phone: "+22670000000", notes: null } })
    expect(parseCourierInput({ name: "", phone: "70000000" }).ok).toBe(false)
    expect(parseCourierInput({ name: "Zakaria", phone: "12" }).ok).toBe(false)
  })
})
```
Run → FAIL ; implémenter dans `delivery-rules.ts` :
```ts
import { normalizePhone } from "./normalize-phone"
export const parseCourierInput = (body: any):
  | { ok: true; values: { name: string; phone: string; notes: string | null } }
  | { ok: false; message: string } => {
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return { ok: false, message: "Le nom du livreur est obligatoire." }
  try {
    return { ok: true, values: { name, phone: normalizePhone(String(body?.phone ?? "")), notes: body?.notes ? String(body.notes) : null } }
  } catch {
    return { ok: false, message: "Numéro WhatsApp invalide (8 chiffres, avec ou sans +226)." }
  }
}
```
Run → PASS. (Vérifier d'abord la signature réelle de `normalizePhone` dans `src/lib/normalize-phone.ts` : si elle renvoie `null` au lieu de lever, tester `null`.)

- [ ] **Step 2: Étapes** — `workflows/steps/delivery-steps.ts` (extraits représentatifs ; les autres étapes suivent le même modèle : lecture → validation `MedusaError` → une mutation → compensation qui restaure l'état précédent) :
```ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { canAssign, computeSettlement, dayOf, todayInOuaga, validateCompletion } from "../../lib/delivery-rules"

export const assertCanAssignStep = createStep(
  "assert-can-assign-delivery",
  async (input: { order_id: string; courier_id: string; order_canceled: boolean }, { container }) => {
    const svc: DeliveryModuleService = container.resolve(DELIVERY_MODULE)
    if (input.order_canceled) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Commande annulée : elle ne peut plus être confiée.")
    }
    const courier = await svc.retrieveCourier(input.courier_id)
    if (!courier.active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Le livreur ${courier.name} est désactivé.`)
    }
    const existing = await svc.listDeliveries({ order_id: input.order_id })
    if (!canAssign(existing as any)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette commande a déjà une livraison en cours.")
    }
    return new StepResponse(courier)
  }
)

export const createDeliveryStep = createStep(
  "create-delivery",
  async (input: Record<string, unknown>, { container }) => {
    const svc: DeliveryModuleService = container.resolve(DELIVERY_MODULE)
    const today = todayInOuaga()
    const delivery = await svc.createDeliveries({ ...(input as any), tour_date: today, first_tour_date: today, assigned_at: new Date() })
    return new StepResponse(delivery, delivery.id)
  },
  async (id, { container }) => {
    if (!id) return
    await (container.resolve(DELIVERY_MODULE) as DeliveryModuleService).deleteDeliveries(id)
  }
)

// Refus si la journée du livreur est validée (verrou) ou si la livraison
// n'est plus "Confiée" (double clic, deux onglets : la 2e requête échoue).
export const prepareCompletionStep = createStep(
  "prepare-delivery-completion",
  async (input: { id: string; status: "delivered" | "failed" | "shipped"; [k: string]: unknown }, { container }) => {
    const svc: DeliveryModuleService = container.resolve(DELIVERY_MODULE)
    const delivery = await svc.retrieveDelivery(input.id)
    if (delivery.status !== "assigned") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cette livraison est déjà terminée.")
    }
    const day = todayInOuaga()
    const [locked] = await svc.listCourierSettlements({ courier_id: delivery.courier_id, day })
    if (locked) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Journée déjà validée : rouvrez-la pour modifier.")
    }
    const check = validateCompletion({ ...input, type: delivery.type } as any)
    if (!check.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, check.message)
    return new StepResponse({
      id: delivery.id,
      status: input.status,
      redeliver: input.status === "failed" ? Boolean(input.redeliver) : false,
      completed_at: new Date(),
      ...check.values,
    })
  }
)

export const updateDeliveryStep = createStep(
  "update-delivery",
  async (input: { id: string; [k: string]: unknown } | { id: string; [k: string]: unknown }[], { container }) => {
    const svc: DeliveryModuleService = container.resolve(DELIVERY_MODULE)
    const list = Array.isArray(input) ? input : [input]
    const previous = await svc.listDeliveries({ id: list.map((d) => d.id) })
    const updated = await svc.updateDeliveries(list as any)
    return new StepResponse(updated, previous)
  },
  async (previous, { container }) => {
    if (!previous?.length) return
    await (container.resolve(DELIVERY_MODULE) as DeliveryModuleService).updateDeliveries(previous as any)
  }
)

export const computeSettlementStep = createStep(
  "compute-courier-settlement",
  async (input: { courier_id: string; day: string }, { container }) => {
    const svc: DeliveryModuleService = container.resolve(DELIVERY_MODULE)
    const [existing] = await svc.listCourierSettlements({ courier_id: input.courier_id, day: input.day })
    if (existing) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Versement déjà validé pour cette journée.")
    const deliveries = await svc.listDeliveries({ courier_id: input.courier_id })
    return new StepResponse(computeSettlement(deliveries as any, input.day).toRemit)
  }
)
```
Plus `createCourierStep` (utilise `parseCourierInput`, `INVALID_DATA` si refus ; compensation `deleteCouriers`), `updateCourierStep` (compensation : valeurs précédentes), `createSettlementStep` (compensation `deleteCourierSettlements`), `deleteSettlementStep` (compensation : recrée le versement supprimé). `dayOf` sert au filtre des terminées du jour dans `computeSettlement`.

- [ ] **Step 3: Workflows** — exemple `complete-delivery.ts` ; les autres suivent la même forme :
```ts
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { prepareCompletionStep, updateDeliveryStep } from "./steps/delivery-steps"

export type CompleteDeliveryInput = {
  id: string
  status: "delivered" | "failed" | "shipped"
  amount_collected?: number | null
  courier_fee?: number | null
  transport_fee?: number | null
  failure_reason?: string | null
  redeliver?: boolean
}

export const completeDeliveryWorkflow = createWorkflow(
  "complete-delivery",
  function (input: CompleteDeliveryInput) {
    const changes = prepareCompletionStep(input)
    const [delivery] = updateDeliveryStep(changes) as any
    return new WorkflowResponse(delivery)
  }
)
```
`assign-delivery.ts` : `assertCanAssignStep(input)` → `createDeliveryStep(transform(...champs de livraison...))` → `createRemoteLinkStep(transform({ delivery, input }, ({ delivery, input }) => [{ [Modules.ORDER]: { order_id: input.order_id }, [DELIVERY_MODULE]: { delivery_id: delivery.id } }]))`.
`courier-settlements.ts` : `validateSettlementWorkflow` = `computeSettlementStep` → `createSettlementStep(transform({ input, expected }, ...))` avec `validated_at` créé **dans l'étape** (pas dans la composition) ; `reopenSettlementWorkflow` = `deleteSettlementStep`.

- [ ] **Step 4: Build** — Run: `cd apps/backend && npx tsc --noEmit -p . && npm run test:unit 2>&1 | grep -E "^Tests:"` — Expected: 0 erreur, suite verte. (Les workflows sont exercés de bout en bout en Task 6 Step 5.)

- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/workflows apps/backend/src/lib/delivery-rules.ts apps/backend/src/lib/__tests__/delivery-rules.unit.spec.ts
git commit -m "feat(livraisons): workflows (livreurs, confier, terminer, versements)"
```

---

### Task 6: Routes admin

Règles des skills : validation des corps par Zod (`import { z } from "@medusajs/framework/zod"`, Zod v4) et `validateAndTransformBody` dans un fichier `middlewares.ts` de la fonctionnalité, exporté en tableau nommé et ajouté à `src/api/middlewares.ts` ; `MedusaRequest<Schema>` pour `req.validatedBody` ; routes = interface HTTP seulement (lecture via `query.graph`, écriture via les workflows de Task 5) ; méthodes GET/POST/DELETE uniquement.

**Files:**
- Create: `apps/backend/src/api/admin/deliveries/middlewares.ts` (schémas Zod `CreateCourierSchema`, `UpdateCourierSchema`, `AssignDeliveriesSchema`, `CompleteDeliverySchema`, `ValidateSettlementSchema` + tableau `deliveryMiddlewares`)
- Modify: `apps/backend/src/api/middlewares.ts` (ajouter `...deliveryMiddlewares` aux routes)
- Create: `apps/backend/src/api/admin/couriers/route.ts` (GET liste, POST création)
- Create: `apps/backend/src/api/admin/couriers/[id]/route.ts` (POST modification)
- Create: `apps/backend/src/api/admin/deliveries/route.ts` (POST confier)
- Create: `apps/backend/src/api/admin/deliveries/[id]/complete/route.ts` (POST livrée/échec/déposée)
- Create: `apps/backend/src/api/admin/deliveries/[id]/resend/route.ts` (POST renvoyer le message)
- Create: `apps/backend/src/api/admin/deliveries/by-order/[order_id]/route.ts` (GET tentatives d'une commande)
- Create: `apps/backend/src/api/admin/deliveries/tour/route.ts` (GET tournée : `courier_id`, `date`)
- Create: `apps/backend/src/api/admin/deliveries/to-assign/route.ts` (GET commandes à confier)
- Create: `apps/backend/src/api/admin/deliveries/unpaid-expeditions/route.ts` (GET)
- Create: `apps/backend/src/api/admin/courier-settlements/route.ts` (POST valider)
- Create: `apps/backend/src/api/admin/courier-settlements/[id]/reopen/route.ts` (POST rouvrir)
- Create: `apps/backend/src/lib/delivery-service-helpers.ts` (chargement commande + construction des lignes de tournée, partagé)

**Interfaces:**
- Consumes: Task 1 (service `DELIVERY_MODULE`, lecture seule), Task 2 (règles), Task 3 (message), Task 4 (sync), Task 5 (workflows), `orderNumberOf`.
- Produces (contrat HTTP consommé par Task 8) :
  - `GET /admin/couriers` → `{ couriers: { id, name, phone, active, notes }[] }` ; `POST /admin/couriers` `{ name, phone, notes? }` → `{ courier }` (400 si nom vide ou numéro invalide) ; `POST /admin/couriers/:id` `{ name?, phone?, active?, notes? }`.
  - `POST /admin/deliveries` `{ order_ids: string[], courier_id, type?, address?, transport_company?, destination_city? }` → `{ deliveries: { id, order_id, whatsapp_status, whatsapp_error }[] }` (une commande déjà confiée ou annulée, ou un livreur inactif → erreur par commande dans `errors` ; `type` absent → `defaultTypeForCity(ville de livraison)`).
  - `POST /admin/deliveries/:id/complete` `{ status, amount_collected?, courier_fee?, transport_fee?, failure_reason?, redeliver? }` → `{ delivery, sync_warning }` (400 si validation, livraison déjà terminée ou journée validée).
  - `POST /admin/deliveries/:id/resend` → `{ whatsapp_status, whatsapp_error }`.
  - `GET /admin/deliveries/by-order/:order_id` → `{ deliveries: TourLine[] }`.
  - `GET /admin/deliveries/tour?courier_id&date` → `{ lines: TourLine[], settlement: { collected, courierFees, transportFees, toRemit, completedCount }, validated: { id, received_amount, expected_amount, validated_at } | null }` avec `TourLine = { id, order_id, order_number, customer_name, customer_phone, place, items: {title, quantity}[], type, status, order_canceled, postponed_from: string | null, amount_to_collect, amount_collected, courier_fee, transport_fee, failure_reason, whatsapp_status, whatsapp_error, sync_warning }`. La tournée d'un jour = livraisons `tour_date = date` **plus** livraisons terminées ce jour-là (`completed_at`).
  - `GET /admin/deliveries/to-assign` → `{ orders: { id, order_number, customer_name, city, address, total, payment_status, redeliver: boolean }[] }` : commandes non annulées, non livrées (`fulfillment_status` ≠ `delivered`), sans tentative `assigned`.
  - `GET /admin/deliveries/unpaid-expeditions` → `{ lines: { order_id, order_number, customer_name, customer_phone, destination_city, shipped_at, total }[] }`.
  - `POST /admin/courier-settlements` `{ courier_id, day, received_amount, note? }` → `{ settlement }` (`expected_amount` recalculé côté serveur, 400 si déjà validé) ; `POST /admin/courier-settlements/:id/reopen` → supprime le versement (déverrouille).

- [ ] **Step 1: Schémas Zod et middlewares** — `api/admin/deliveries/middlewares.ts` :
```ts
import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework"
import { z } from "@medusajs/framework/zod"

const amount = z.number().int().min(0)

export const CreateCourierSchema = z.object({ name: z.string().trim().min(1), phone: z.string().min(8), notes: z.string().nullish() })
export type CreateCourierSchema = z.infer<typeof CreateCourierSchema>
export const UpdateCourierSchema = CreateCourierSchema.partial().extend({ active: z.boolean().optional() })
export type UpdateCourierSchema = z.infer<typeof UpdateCourierSchema>
export const AssignDeliveriesSchema = z.object({
  order_ids: z.array(z.string()).min(1),
  courier_id: z.string(),
  type: z.enum(["express", "expedition"]).optional(),
  address: z.string().nullish(),
  transport_company: z.string().nullish(),
  destination_city: z.string().nullish(),
})
export type AssignDeliveriesSchema = z.infer<typeof AssignDeliveriesSchema>
export const CompleteDeliverySchema = z.object({
  status: z.enum(["delivered", "failed", "shipped"]),
  amount_collected: amount.nullish(),
  courier_fee: amount.nullish(),
  transport_fee: amount.nullish(),
  failure_reason: z.string().nullish(),
  redeliver: z.boolean().optional(),
})
export type CompleteDeliverySchema = z.infer<typeof CompleteDeliverySchema>
export const ValidateSettlementSchema = z.object({
  courier_id: z.string(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  received_amount: z.number().int(),
  note: z.string().nullish(),
})
export type ValidateSettlementSchema = z.infer<typeof ValidateSettlementSchema>

export const deliveryMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/couriers", method: "POST", middlewares: [validateAndTransformBody(CreateCourierSchema)] },
  { matcher: "/admin/couriers/:id", method: "POST", middlewares: [validateAndTransformBody(UpdateCourierSchema)] },
  { matcher: "/admin/deliveries", method: "POST", middlewares: [validateAndTransformBody(AssignDeliveriesSchema)] },
  { matcher: "/admin/deliveries/:id/complete", method: "POST", middlewares: [validateAndTransformBody(CompleteDeliverySchema)] },
  { matcher: "/admin/courier-settlements", method: "POST", middlewares: [validateAndTransformBody(ValidateSettlementSchema)] },
]
```
Dans `src/api/middlewares.ts` : `import { deliveryMiddlewares } from "./admin/deliveries/middlewares"` et ajouter `...deliveryMiddlewares` au tableau `routes` de `defineMiddlewares`. Les routes `/admin/*` sont déjà authentifiées par Medusa (pas de `authenticate` à ajouter). Un montant négatif ou vide est refusé ici (400) avant même le workflow ; `validateCompletion` (Task 2) garde les règles qui dépendent du statut et du type.

- [ ] **Step 2: Helpers partagés** — `delivery-service-helpers.ts` :

```ts
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { orderNumberOf } from "./order-number"

export const ORDER_FIELDS = [
  "id", "display_id", "custom_display_id", "status", "payment_status", "fulfillment_status", "total",
  "shipping_address.first_name", "shipping_address.last_name", "shipping_address.phone",
  "shipping_address.address_1", "shipping_address.city",
  "items.product_title", "items.variant_title", "items.quantity",
  "summary.pending_difference",
]

export async function loadOrders(container: any, ids: string[]) {
  if (!ids.length) return new Map<string, any>()
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: ids } })
  return new Map<string, any>(data.map((o: any) => [o.id, o]))
}

export const customerName = (o: any) =>
  [o?.shipping_address?.first_name, o?.shipping_address?.last_name].filter(Boolean).join(" ") || "Client"

export const itemsOf = (o: any) =>
  (o?.items ?? []).map((i: any) => ({
    title: i.variant_title && i.variant_title !== "Default Title" && i.variant_title !== i.product_title
      ? `${i.product_title} (${i.variant_title})` : i.product_title,
    quantity: Number(i.quantity),
  }))

export const toTourLine = (d: any, o: any) => ({
  id: d.id,
  order_id: d.order_id,
  order_number: o ? orderNumberOf(o) : d.order_id,
  customer_name: customerName(o),
  customer_phone: o?.shipping_address?.phone ?? "",
  place: d.type === "expedition" ? `${d.transport_company ?? ""} → ${d.destination_city ?? ""}` : d.address ?? "",
  items: itemsOf(o),
  type: d.type,
  status: d.status,
  order_canceled: o?.status === "canceled",
  postponed_from: d.postponed_count > 0 ? d.first_tour_date : null,
  amount_to_collect: d.amount_to_collect,
  amount_collected: d.amount_collected,
  courier_fee: d.courier_fee,
  transport_fee: d.transport_fee,
  failure_reason: d.failure_reason,
  whatsapp_status: d.whatsapp_status,
  whatsapp_error: d.whatsapp_error,
  sync_warning: d.sync_warning,
})
```

- [ ] **Step 3: Routes** — lectures via `query.graph` (entités `courier`, `delivery`, `courier_settlement` du module + `order`), écritures uniquement via les workflows de Task 5 ; `MedusaRequest<Schema>` + `req.validatedBody`. Les erreurs `MedusaError` des workflows remontent telles quelles (message en français affiché par l'admin). Points précis :
  - **Confier** (`POST /admin/deliveries`) : `loadOrders(order_ids)` ; pour chaque commande, calculer `type = body.type ?? defaultTypeForCity(city)`, `amount_to_collect = computeAmountToCollect({ type, paymentStatus: o.payment_status, outstanding: o.summary?.pending_difference ?? o.total })`, `address = body.address ?? shipping_address.address_1`, puis `assignDeliveryWorkflow(req.scope).run({ input: { ..., order_canceled: o.status === "canceled" } })` (boucle dans la route, conforme au skill : un workflow par élément) ; ensuite `sendCourierMessage(...)` et `updateDeliveryWorkflow` pour `whatsapp_status`/`whatsapp_error`. Une commande refusée n'empêche pas les autres : réponse `{ deliveries, errors: { order_id, message }[] }`.
  - **Terminer** (`/complete`) : `completeDeliveryWorkflow` ; si `delivered`/`shipped` → `sync_warning = await syncOrderAfterDelivery(req.scope, { orderId, status, collected })` (Task 4, workflows natifs) puis `updateDeliveryWorkflow({ id, sync_warning })`.
  - **Renvoyer** (`/resend`) : relit livraison + commande + livreur, `sendCourierMessage`, `updateDeliveryWorkflow`.
  - **Tournée** : livraisons du livreur avec `tour_date = date` ∪ terminées ce jour (`completed_at` entre `date 00:00Z` et `date+1 00:00Z`), dédupliquées ; si la commande est annulée et la ligne encore `assigned` → `updateDeliveryWorkflow({ id, status: "canceled" })` ; `settlement = computeSettlement(lignes, date)` ; `validated` = versement existant.
  - **À confier** : commandes (`query.graph` entité `order`, `status` ≠ `canceled`, 200 plus récentes) dont `fulfillment_status` ≠ `delivered`/`shipped` et sans livraison `assigned` (liste `listDeliveries({ status: "assigned" })` lue une fois) ; `redeliver = true` si la dernière tentative est un échec « à relivrer ».
  - **Versement** : `validateSettlementWorkflow` ; **Rouvrir** : `reopenSettlementWorkflow`.
  - **Livreurs** : `GET` trie actifs d'abord puis par nom ; `POST` → `createCourierWorkflow` / `updateCourierWorkflow`.

- [ ] **Step 4: Typage, lint, suite** — Run: `cd apps/backend && npx tsc --noEmit -p . && npx eslint src/api/admin/couriers src/api/admin/deliveries src/api/admin/courier-settlements src/lib/delivery-*.ts && npm run test:unit 2>&1 | grep -E "^Tests:"` — Expected: 0 erreur, suite verte.

- [ ] **Step 5: Vérification API en local** (serveur local lancé, session admin locale) :
```bash
# créer 2 livreurs, confier une commande locale, la terminer, lire la tournée et valider le versement
```
Exécuter depuis la console du navigateur (onglet admin local connecté) : `POST /admin/couriers` ×2, `POST /admin/deliveries` avec une commande locale non livrée, `POST /admin/deliveries/:id/complete` (`delivered`, `amount_collected` = montant, `courier_fee: 1000`), `GET /admin/deliveries/tour?...` → `settlement.toRemit` = montant − 1000 ; `POST /admin/courier-settlements` → 200 ; nouveau `complete` sur la même journée → refus « Journée déjà validée » ; second `complete` sur une livraison terminée → refus « déjà terminée ». Expected : chaque réponse conforme au contrat ; `whatsapp_status = "failed"` en local (pas de webhook configuré) sans bloquer.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/api/middlewares.ts apps/backend/src/api/admin/couriers apps/backend/src/api/admin/deliveries apps/backend/src/api/admin/courier-settlements apps/backend/src/lib/delivery-service-helpers.ts
git commit -m "feat(livraisons): routes admin (livreurs, confier, terminer, tournée, versements)"
```

---

### Task 7: Report automatique nocturne

**Files:**
- Create: `apps/backend/src/jobs/postpone-deliveries.ts`
- Modify: `apps/backend/src/lib/delivery-rules.ts` (+ test)
- Consumes: `updateDeliveryWorkflow` (Task 5), qui accepte un lot `{ id, tour_date, postponed_count }[]`

**Interfaces:**
- Produces: `postponeUpdates(deliveries: { id: string; status: string; tour_date: string; postponed_count: number }[], today: string): { id: string; tour_date: string; postponed_count: number }[]`.

- [ ] **Step 1: Test**

```ts
import { postponeUpdates } from "../delivery-rules"
describe("postponeUpdates", () => {
  it("reporte à aujourd'hui les livraisons encore confiées d'un jour passé", () => {
    expect(
      postponeUpdates(
        [
          { id: "a", status: "assigned", tour_date: "2026-09-27", postponed_count: 0 },
          { id: "b", status: "assigned", tour_date: "2026-09-28", postponed_count: 0 },
          { id: "c", status: "delivered", tour_date: "2026-09-27", postponed_count: 0 },
          { id: "d", status: "assigned", tour_date: "2026-09-25", postponed_count: 2 },
        ],
        "2026-09-28"
      )
    ).toEqual([
      { id: "a", tour_date: "2026-09-28", postponed_count: 1 },
      { id: "d", tour_date: "2026-09-28", postponed_count: 3 },
    ])
  })
})
```
Run → FAIL ; implémenter :
```ts
// Report automatique : une livraison confiée et pas faite le jour prévu passe
// au jour courant (même livreur) - ni échec ni nouvelle tentative, pas de frais.
export const postponeUpdates = (
  deliveries: { id: string; status: string; tour_date: string; postponed_count: number }[],
  today: string
) =>
  deliveries
    .filter((d) => d.status === "assigned" && d.tour_date < today)
    .map((d) => ({ id: d.id, tour_date: today, postponed_count: d.postponed_count + 1 }))
```
Run → PASS.

- [ ] **Step 2: Job**

```ts
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../modules/delivery"
import { postponeUpdates, todayInOuaga } from "../lib/delivery-rules"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// Chaque nuit (00 h 05, heure de Ouagadougou = UTC) : les livraisons encore
// "Confiées" d'un jour passé sont reportées à la tournée du jour. Lecture
// directe du module, écriture via workflow (règle Medusa). Ne lève jamais :
// un échec est journalisé et retenté la nuit suivante.
export default async function postponeDeliveries(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const svc = container.resolve(DELIVERY_MODULE) as any
    const assigned = await svc.listDeliveries({ status: "assigned" })
    const updates = postponeUpdates(assigned, todayInOuaga())
    if (updates.length) {
      await updateDeliveryWorkflow(container).run({ input: updates })
    }
    logger.info(`Livraisons reportées au ${todayInOuaga()} : ${updates.length}`)
  } catch (error) {
    logger.error(`Report des livraisons échoué : ${(error as Error).message}`)
  }
}

export const config = {
  name: "postpone-deliveries",
  schedule: "5 0 * * *",
}
```

- [ ] **Step 3: Vérifier en local** — créer une livraison, `UPDATE delivery SET tour_date='2026-09-01' WHERE id=…` (psql local), exécuter `npx medusa exec ./src/jobs/postpone-deliveries.ts` n'est pas possible pour un job : à la place, script jetable `src/scripts/zz-run-postpone.ts` qui appelle la fonction du job avec le container, l'exécuter, vérifier `tour_date` = aujourd'hui et `postponed_count = 1`, puis supprimer le script.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/jobs/postpone-deliveries.ts apps/backend/src/lib/delivery-rules.ts apps/backend/src/lib/__tests__/delivery-rules.unit.spec.ts
git commit -m "feat(livraisons): report automatique nocturne des livraisons non faites"
```

---

### Task 8: Écrans admin

**Files:**
- Create: `apps/backend/src/admin/widgets/order-delivery.tsx` (zone `order.details.side.before`)
- Create: `apps/backend/src/admin/routes/deliveries/page.tsx` (menu « Livraisons », icône `TruckFast` de `@medusajs/icons` passée à `defineRouteConfig` uniquement)

**Interfaces:**
- Consumes: contrat HTTP Task 6.

- [ ] **Step 1: Widget fiche commande** — encadré « Livraison » :
  - `GET /admin/deliveries/by-order/:id` au chargement ; tentative en cours affichée (livreur, type, statut, message WhatsApp envoyé/échoué + bouton « Renvoyer le message ») ; historique des tentatives (date, livreur, statut, motif d'échec).
  - Si aucune tentative en cours et commande non annulée : formulaire « Confier à un livreur » : livreurs actifs (`GET /admin/couriers`), type pré-sélectionné (`Ouagadougou` → express), champs compagnie (liste `STAF`, `TSR`, `Rakieta`, `SOGEBAF`, `TCV` + saisie libre) et ville de destination si expédition ; `POST /admin/deliveries` ; afficher l'avertissement si `whatsapp_status = "failed"`.
  - Éléments HTML natifs, classes utilitaires Medusa (`bg-ui-bg-base`, `txt-compact-small`…), comme `widgets/order-number.tsx`.

- [ ] **Step 2: Page « Livraisons »** — onglets (état local, onglet mémorisé dans `?tab=`) :
  - **À confier** : tableau des commandes (`GET /admin/deliveries/to-assign`), cases à cocher, sélecteur de livreur, type (auto par ville, modifiable par ligne), bouton « Confier » (`POST /admin/deliveries` avec `order_ids`).
  - **Tournée du jour** : sélecteurs livreur + date (aujourd'hui par défaut) ; lignes `TourLine` : N° de commande (lien `/app/orders/:id`), client, lieu, articles `q x titre`, badge type, badge statut (+ « Reportée depuis le JJ/MM »), montants ; pour une ligne `assigned` : boutons **Livrée** (champ encaissé pré-rempli = à encaisser, frais livreur avec boutons 1 000 / 1 500), **Échec** (motif : Client absent / Injoignable / Refus / Autre, case « à relivrer », frais facultatifs), **Déposée à la gare** (expédition : frais livreur défaut 1 000, frais compagnie 1 000 / 1 500) → `POST /complete` ; pied : totaux, **« À reverser : X F »** en grand (rouge si négatif avec « Vous devez X F au livreur »), champ « Montant reçu » + « Valider le versement » → `POST /admin/courier-settlements` ; si validé : récapitulatif + écart (rouge si ≠ 0) + « Rouvrir la journée ».
  - **Expéditions à faire payer** : `GET /admin/deliveries/unpaid-expeditions`, lien vers la commande et numéro du client.
  - **Livreurs** : liste, formulaire ajout/modification (nom, numéro WhatsApp, notes), bouton activer/désactiver.
  - Mise en page responsive : tableaux en cartes sous 1024 px.

- [ ] **Step 3: Typage, lint, build admin** — Run: `cd apps/backend/src/admin && npx tsc --noEmit -p . && cd ../.. && npx eslint src/admin && npx medusa build 2>&1 | tail -2` — Expected: 0 erreur, build OK.

- [ ] **Step 4: Parcours complet en local (navigateur, admin local connecté)** — deux livreurs ; confier 3 commandes locales (2 express, 1 expédition) depuis « À confier » ; en marquer une livrée (frais 1 000), une en échec « à relivrer » (frais 1 000), l'expédition déposée (1 000 + 1 500) ; vérifier le total « À reverser » = encaissé − 4 500 ; valider le versement avec un montant différent → écart affiché ; tenter une modification → refus ; « Rouvrir la journée » → modifiable ; la commande en échec réapparaît dans « À confier » ; l'expédition apparaît dans « Expéditions à faire payer » ; widget de la fiche commande cohérent ; colonne « Fulfillment » et paiement à jour dans la liste des commandes. Vérifier aussi le report : livraison confiée antidatée (psql) + script jetable Task 7 → « Reportée ».

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/admin/widgets/order-delivery.tsx apps/backend/src/admin/routes/deliveries/page.tsx
git commit -m "feat(livraisons): écrans admin (fiche commande, page Livraisons)"
```

---

### Task 9: Staging, production, documentation

- [ ] **Step 1: Staging** — `git push origin staging` ; attendre le redéploiement (migration `delivery` appliquée par `db:migrate`) ; via l'API admin staging (clé `MEDUSA_ADMIN_KEY_STAGING` dans le conteneur n8n) : créer un livreur test avec le **numéro du propriétaire** (+22677406101), confier une commande test ; si le modèle `nouvelle_livraison` est approuvé, vérifier la réception réelle sur WhatsApp (sinon `whatsapp_status = failed` avec le message Meta, attendu) ; terminer, vérifier la tournée ; annuler la commande test.
- [ ] **Step 2: Production** — `git push origin staging:main` ; vérifier que `\dt delivery` existe en production et que la page « Livraisons » répond (`GET /admin/couriers` via la clé admin) ; aucun livreur réel créé sans les numéros du propriétaire.
- [ ] **Step 3: Documentation** — `AGENTS.md` (module `delivery`, job de report, modèle `nouvelle_livraison`), `HANDOFF.md` (entrée datée : livré, vérifié, id du modèle Meta, limites) ; commit + push.
