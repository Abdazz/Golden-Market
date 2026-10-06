# Événements d'achat Meta - plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** envoyer à l'API Conversions de Meta des achats complets (site : URL de page + données navigateur ; WhatsApp : `chat`, ou `business_messaging` avec `ctwa_clid` quand la configuration existe ; téléphone : `phone_call`).

**Architecture:** règles pures dans `src/lib/meta-conversions-mapping.ts` (source et construction de l'événement), client `src/lib/meta-conversions-client.ts` (jeton par appel, erreur détaillée), abonné `order-placed-meta-conversions-api.ts` (choix du jeton, renvoi en `chat` si `business_messaging` est refusé) ; site : `placeOrder` inscrit `cart.metadata.meta_browser` avant de valider le panier ; n8n (contrôleur) : `ctwa_clid` conservé et métadonnées posées sur le panier avant sa validation.

**Tech Stack:** Medusa v2.18, Jest ; Next.js 15 (actions serveur, `next/headers`) ; n8n (CLI sur le VPS).

**Spec:** `docs/superpowers/specs/2026-10-06-meta-evenements-achat-design.md`

## Global Constraints

- Français (code, commentaires, commits), pas d'emoji, pas de trailer `Co-Authored-By` ; pas de point-virgule, guillemets doubles, 2 espaces.
- Jamais de secret affiché ni commité ; ne pas toucher à la production, au VPS, à n8n ni aux `.env` (contrôleur).
- `event_id` reste `order.id` dans tous les cas.
- Champs Meta exacts : `action_source` ∈ `website` | `phone_call` | `chat` | `business_messaging` ; `messaging_channel: "whatsapp"` ; `user_data.client_user_agent`, `user_data.client_ip_address`, `user_data.fbp`, `user_data.fbc` (non hachés), `user_data.whatsapp_business_account_id`, `user_data.ctwa_clid`, `user_data.ph` (haché, inchangé) ; `event_source_url`.
- Variables d'environnement backend : `STOREFRONT_URL` (existe), `META_WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_WHATSAPP_EVENTS_ACCESS_TOKEN` (nouvelles, documentées dans `apps/backend/.env.template`).

## Review Focus

- Commande du site sans `meta_browser` (ancienne commande, échec de la mise à jour du panier) : l'événement part quand même, sans champ navigateur vide (`""` jamais envoyé).
- `STOREFRONT_URL` absent : pas d'`event_source_url` inventé (champ omis), l'événement part.
- Configuration WhatsApp partielle (identifiant sans jeton, ou l'inverse) : `chat`, jamais `business_messaging`.
- `business_messaging` refusé ET renvoi `chat` refusé : deux erreurs journalisées, aucune exception remontée.
- Site : métadonnées existantes du panier conservées (fusion, pas d'écrasement) ; mise à jour en échec -> la commande est quand même validée.

---

### Task 1: Règles de source et construction de l'événement (backend, pur)

**Files:**
- Modify: `apps/backend/src/lib/meta-conversions-mapping.ts`
- Test: `apps/backend/src/lib/__tests__/meta-conversions-mapping.unit.spec.ts`

**Interfaces:**
- Produces:
  - `type MetaActionSource = "website" | "phone_call" | "chat" | "business_messaging"`
  - `actionSourceFor(metadata: Record<string, unknown> | null | undefined, options: { whatsappEventsConfigured: boolean }): MetaActionSource`
  - `type PurchaseEventOptions = { storefrontUrl?: string | null; whatsappBusinessAccountId?: string | null; whatsappEventsConfigured?: boolean; forceActionSource?: MetaActionSource }`
  - `buildPurchaseEvent(order: OrderForMetaConversion, eventTime: number, options?: PurchaseEventOptions): MetaConversionEvent`
  - `OrderForMetaConversion` gagne `shipping_address.country_code?: string | null` ; `metadata` peut contenir `meta_browser?: { user_agent?: string; client_ip?: string; fbp?: string; fbc?: string }` et `ctwa_clid?: string`.
  - `MetaConversionEvent` gagne `event_source_url?: string`, `messaging_channel?: "whatsapp"` ; `user_data` : `ph?`, `client_user_agent?`, `client_ip_address?`, `fbp?`, `fbc?`, `whatsapp_business_account_id?`, `ctwa_clid?`.

- [ ] **Step 1: Failing tests** (remplacer les tests `actionSourceFor` existants par ceux-ci et ajouter les cas `buildPurchaseEvent` ; garder les tests existants de hachage, valeur et contenus) :

```ts
describe("actionSourceFor", () => {
  const off = { whatsappEventsConfigured: false }
  const on = { whatsappEventsConfigured: true }
  it("téléphone : phone_call", () => {
    expect(actionSourceFor({ source: "telephone" }, off)).toBe("phone_call")
  })
  it("WhatsApp avec ctwa_clid et configuration : business_messaging", () => {
    expect(actionSourceFor({ source: "whatsapp", ctwa_clid: "ARxx" }, on)).toBe("business_messaging")
  })
  it("WhatsApp sans ctwa_clid ou sans configuration : chat", () => {
    expect(actionSourceFor({ source: "whatsapp" }, on)).toBe("chat")
    expect(actionSourceFor({ source: "whatsapp", ctwa_clid: "ARxx" }, off)).toBe("chat")
    expect(actionSourceFor({ source: "whatsapp", ctwa_clid: "" }, on)).toBe("chat")
  })
  it("site ou métadonnées absentes : website", () => {
    expect(actionSourceFor({}, on)).toBe("website")
    expect(actionSourceFor(null, on)).toBe("website")
  })
})

describe("buildPurchaseEvent - sources", () => {
  const base: OrderForMetaConversion = {
    id: "order_1",
    currency_code: "xof",
    total: 9500,
    shipping_address: { phone: "70123456", country_code: "bf" },
    items: [{ variant_id: "variant_1", quantity: 1 }],
  }

  it("site : URL de la page de confirmation et données navigateur", () => {
    const event = buildPurchaseEvent(
      { ...base, metadata: { meta_browser: { user_agent: "Mozilla/5.0", client_ip: "102.1.2.3", fbp: "fb.1.1.1", fbc: "fb.1.1.abc" } } },
      1700000000,
      { storefrontUrl: "https://golden-market.co/" }
    )
    expect(event.action_source).toBe("website")
    expect(event.event_source_url).toBe("https://golden-market.co/bf/order/order_1/confirmed")
    expect(event.user_data).toEqual(
      expect.objectContaining({ client_user_agent: "Mozilla/5.0", client_ip_address: "102.1.2.3", fbp: "fb.1.1.1", fbc: "fb.1.1.abc" })
    )
    expect(event.user_data.ph).toHaveLength(1)
  })

  it("site sans données navigateur ni URL de boutique : champs omis, jamais vides", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { meta_browser: { user_agent: "", fbp: "fb.1" } } }, 1700000000, {})
    expect(event.event_source_url).toBeUndefined()
    expect(event.user_data).not.toHaveProperty("client_user_agent")
    expect(event.user_data).not.toHaveProperty("client_ip_address")
    expect(event.user_data.fbp).toBe("fb.1")
  })

  it("WhatsApp attribuée : business_messaging avec compte et ctwa_clid, sans champ web", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { source: "whatsapp", ctwa_clid: "ARclid" } }, 1700000000, {
      storefrontUrl: "https://golden-market.co",
      whatsappBusinessAccountId: "waba_1",
      whatsappEventsConfigured: true,
    })
    expect(event.action_source).toBe("business_messaging")
    expect(event.messaging_channel).toBe("whatsapp")
    expect(event.user_data).toEqual(expect.objectContaining({ whatsapp_business_account_id: "waba_1", ctwa_clid: "ARclid" }))
    expect(event.event_source_url).toBeUndefined()
  })

  it("source forcée (renvoi après refus) : chat sans champ business_messaging", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { source: "whatsapp", ctwa_clid: "ARclid" } }, 1700000000, {
      whatsappBusinessAccountId: "waba_1",
      whatsappEventsConfigured: true,
      forceActionSource: "chat",
    })
    expect(event.action_source).toBe("chat")
    expect(event).not.toHaveProperty("messaging_channel")
    expect(event.user_data).not.toHaveProperty("ctwa_clid")
    expect(event.user_data).not.toHaveProperty("whatsapp_business_account_id")
  })

  it("téléphone : phone_call, pas d'URL de page", () => {
    const event = buildPurchaseEvent({ ...base, metadata: { source: "telephone" } }, 1700000000, { storefrontUrl: "https://golden-market.co" })
    expect(event.action_source).toBe("phone_call")
    expect(event.event_source_url).toBeUndefined()
  })
})
```

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/meta-conversions-mapping.unit.spec.ts` -> FAIL.

- [ ] **Step 2: Implement** dans `meta-conversions-mapping.ts` :

```ts
export type MetaActionSource = "website" | "phone_call" | "chat" | "business_messaging"

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined

// Source Meta d'une commande (spec 2026-10-06 meta-evenements-achat) :
// téléphone -> phone_call ; WhatsApp venue d'une pub (ctwa_clid) avec la
// configuration WhatsApp -> business_messaging ; autre WhatsApp -> chat ;
// site -> website.
export const actionSourceFor = (
  metadata: Record<string, unknown> | null | undefined,
  options: { whatsappEventsConfigured: boolean }
): MetaActionSource => {
  if (metadata?.source === "telephone") return "phone_call"
  if (metadata?.source === "whatsapp") {
    return options.whatsappEventsConfigured && nonEmpty(metadata.ctwa_clid) ? "business_messaging" : "chat"
  }
  return "website"
}
```

Dans `buildPurchaseEvent(order, eventTime, options = {})` :
- `const actionSource = options.forceActionSource ?? actionSourceFor(order.metadata, { whatsappEventsConfigured: !!options.whatsappEventsConfigured })` ;
- `user_data` commence par `ph` comme aujourd'hui ;
- si `website` : ajouter depuis `order.metadata?.meta_browser` (objet) `client_user_agent`, `client_ip_address`, `fbp`, `fbc` via `nonEmpty` (omis si vides) ; si `nonEmpty(options.storefrontUrl)` et `order.shipping_address?.country_code`, `event_source_url = ${storefrontUrl sans "/" final}/${country_code en minuscules}/order/${order.id}/confirmed` ;
- si `business_messaging` : `messaging_channel: "whatsapp"`, `user_data.whatsapp_business_account_id = options.whatsappBusinessAccountId`, `user_data.ctwa_clid = nonEmpty(order.metadata.ctwa_clid)` ;
- `chat` et `phone_call` : aucun champ web ni WhatsApp.
- Ne jamais mettre une clé à `undefined` dans l'objet envoyé (construire l'objet en n'ajoutant que les valeurs définies) ; mettre à jour les types et le commentaire d'en-tête.

- [ ] **Step 3: Run tests** (même commande) : PASS ; `npx tsc --noEmit -p . 2>&1 | grep meta-conversions` ; eslint du fichier.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/meta-conversions-mapping.ts apps/backend/src/lib/__tests__/meta-conversions-mapping.unit.spec.ts
git commit -m "feat(meta): sources chat et business_messaging, URL de page et données navigateur pour le site"
```

---

### Task 2: Client et abonné (jeton, renvoi en chat)

**Files:**
- Modify: `apps/backend/src/lib/meta-conversions-client.ts`
- Modify: `apps/backend/src/subscribers/order-placed-meta-conversions-api.ts`
- Modify: `apps/backend/.env.template`
- Test: `apps/backend/src/lib/__tests__/meta-conversions-client.unit.spec.ts`, `apps/backend/src/subscribers/__tests__/order-placed-meta-conversions-api.unit.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`buildPurchaseEvent(order, eventTime, options)`, `MetaActionSource`).
- Produces: `sendConversionEvent(event, config, fetchImpl?)` inchangé en signature ; en cas de réponse non OK, l'erreur levée contient le statut ET le message Meta (`error.message` du corps JSON s'il existe, sans le jeton).

- [ ] **Step 1: Failing tests**

Client : une réponse `{ ok: false, status: 400, json: async () => ({ error: { message: "Invalid parameter" } }) }` -> `rejects.toThrow("Meta Conversions API a répondu 400 : Invalid parameter")` ; si `json()` échoue -> `"Meta Conversions API a répondu 400"`.

Abonné (dans le fichier existant, mêmes simulacres) :
- commande WhatsApp avec `ctwa_clid`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID=waba_1` et `META_WHATSAPP_EVENTS_ACCESS_TOKEN=wa_token` : un envoi `business_messaging` avec `{ pixelId: "pixel_123", accessToken: "wa_token" }` ;
- même cas où ce premier envoi rejette : un second envoi `chat` avec le jeton CAPI `token_abc`, même `event_id`, et `logger.error` appelé une fois pour le refus ;
- commande WhatsApp sans variables WhatsApp : un seul envoi `chat` avec `token_abc` ;
- commande du site avec `STOREFRONT_URL=https://golden-market.co` et `shipping_address.country_code: "bf"` : `event_source_url` présent ;
- `fields` demandés contiennent `"metadata"` et `"shipping_address.country_code"`.

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/meta-conversions-client.unit.spec.ts src/subscribers/__tests__/order-placed-meta-conversions-api.unit.spec.ts` -> FAIL.

- [ ] **Step 2: Implement**
  - Client : avant de lever, `let detail = ""; try { const body = await response.json(); detail = body?.error?.message ? \` : ${body.error.message}\` : "" } catch {}` puis `throw new Error(\`Meta Conversions API a répondu ${response.status}${detail}\`)`.
  - Abonné : lire `STOREFRONT_URL`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_WHATSAPP_EVENTS_ACCESS_TOKEN` ; `whatsappEventsConfigured = !!(wabaId && waToken)` ; ajouter `"shipping_address.country_code"` aux `fields` ; construire l'événement avec ces options ; si `event.action_source === "business_messaging"`, envoyer avec `waToken`, et en cas d'erreur : `logger.error` (« refus business_messaging, renvoi en chat ») puis reconstruire avec `forceActionSource: "chat"` et envoyer avec le jeton CAPI ; sinon envoyer avec le jeton CAPI. Message de succès : inclure la source (`événement Purchase (<source>) envoyé à Meta`). Toujours aucune exception remontée (try/catch existant). Mettre à jour le commentaire d'en-tête (déduplication pixel seulement pour le site).
  - `.env.template` : documenter les deux nouvelles variables (commentaire : facultatives ; jeton d'utilisateur système avec `whatsapp_business_manage_events`, jeu de données relié au compte WhatsApp Business).

- [ ] **Step 3: Run tests** (même commande) puis suite complète ; tsc filtré + eslint des fichiers.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/meta-conversions-client.ts apps/backend/src/lib/__tests__/meta-conversions-client.unit.spec.ts apps/backend/src/subscribers/order-placed-meta-conversions-api.ts apps/backend/src/subscribers/__tests__/order-placed-meta-conversions-api.unit.spec.ts apps/backend/.env.template
git commit -m "feat(meta): jeton WhatsApp pour business_messaging, renvoi en chat si refusé, erreurs détaillées"
```

---

### Task 3: Site - données navigateur sur le panier avant validation

**Files:**
- Modify: `apps/storefront/src/lib/data/cart.ts` (`placeOrder`)

Le site n'a pas de tests unitaires (voir `AGENTS.md`) : vérification par `tsc`/lint du storefront et contrôle du contrôleur.

- [ ] **Step 1: Implement** : charger le skill `medusa-dev:building-storefronts`. Dans `placeOrder`, après la résolution de `id` et avant `sdk.store.cart.complete` :

```ts
  // Données du navigateur pour l'API Conversions de Meta (spec 2026-10-06
  // meta-evenements-achat) : Meta exige le navigateur (user agent) pour un
  // achat du site. _fbp / _fbc n'existent que si le visiteur a accepté le
  // traçage. Recopiées par Medusa du panier vers la commande. Jamais bloquant.
  try {
    const requestHeaders = await headers()
    const cookieStore = await cookies()
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    const metaBrowser = Object.fromEntries(
      Object.entries({
        user_agent: requestHeaders.get("user-agent") ?? undefined,
        client_ip: forwardedFor || requestHeaders.get("x-real-ip") || undefined,
        fbp: cookieStore.get("_fbp")?.value,
        fbc: cookieStore.get("_fbc")?.value,
      }).filter(([, value]) => !!value)
    )
    if (Object.keys(metaBrowser).length) {
      const { cart: current } = await sdk.store.cart.retrieve(id, { fields: "id,metadata" }, headers)
      await sdk.store.cart.update(id, { metadata: { ...(current?.metadata ?? {}), meta_browser: metaBrowser } }, {}, headers)
    }
  } catch (error) {
    console.error("[placeOrder] données navigateur Meta non enregistrées :", error)
  }
```

Attention aux noms : la variable locale `headers` (en-têtes d'authentification) existe déjà dans `placeOrder` ; importer `headers as nextHeaders, cookies` depuis `next/headers` et utiliser `nextHeaders()` (ou renommer proprement), sans casser l'usage existant. Vérifier comment le reste du fichier lit les cookies (`lib/data/cookies.ts`) et suivre ce modèle si un utilitaire existe.

- [ ] **Step 2: Verify** : `cd apps/storefront && npx tsc --noEmit 2>&1 | grep -E "lib/data/cart" ; npm run lint 2>&1 | tail -5`.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/lib/data/cart.ts
git commit -m "feat(site): données navigateur Meta enregistrées sur le panier avant la commande"
```

---

### Task 4 (contrôleur) : base du chat, n8n, environnement, vérifications

- [ ] Base `golden_market` (production) : `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ctwa_clid text, ADD COLUMN IF NOT EXISTS ctwa_clid_at timestamptz` ; même chose dans `../n8n_automation/schema.sql` et la base locale de test.
- [ ] n8n principal (`i6KGA9BvK9unjxxj`) : enregistrer `referral.ctwa_clid` (si présent) dans `conversations` ; `place_order` (`EHll8zkvjwPJRJVz`) : avant `Complete Cart`, `POST /store/carts/:id` avec `metadata { source: "whatsapp", ctwa_clid si < 7 jours }` ; sauvegardes, import, publication, redémarrage ; test sur staging (commande `place_order` de test, métadonnées présentes, bon modèle de confirmation), commande de test annulée.
- [ ] Docs : `AGENTS.md`, guide n8n, `docs/HANDOFF-PROMPT.md` (action du propriétaire : jeton `whatsapp_business_manage_events`).
- [ ] Revue finale, staging, production ; contrôle de la prochaine commande réelle dans les journaux.
