# Reprise manuelle des conversations WhatsApp — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au propriétaire de prendre la main sur une conversation WhatsApp, d'y répondre lui-même (ou de relancer le client hors fenêtre 24 h) depuis l'admin Medusa, et faire taire l'IA pendant ce temps avec reprise automatique après 2 h.

**Architecture:** Medusa (admin) lit la base `golden_market` en lecture seule comme aujourd'hui et déclenche chaque action via un nouveau webhook n8n protégé par secret partagé ; n8n reste le seul écrivain de la base et le seul détenteur du jeton WhatsApp. Le workflow principal n8n lit le statut de la conversation avant d'appeler l'IA.

**Tech Stack:** Medusa v2 (TypeScript, Jest unitaire, Admin SDK React), n8n 2.33 (workflows importés/publiés par CLI dans le conteneur `golden_market_n8n`), Postgres (`golden_market_postgres`), WhatsApp Cloud API Graph v20.0.

**Spec:** `docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md`

## Global Constraints

- Tout commentaire, message de commit et documentation en **français** ; pas d'emoji dans le code ; **jamais** de trailer `Co-Authored-By` dans les commits (`AGENTS.md`).
- Délai de reprise automatique par l'IA : **2 h** après `human_last_action_at`.
- Plafond d'alerte propriétaire : **une alerte / 30 min / conversation**.
- Fenêtre de réponse libre WhatsApp : **24 h** après le dernier message `role = 'user'`.
- Texte manuel : non vide après `trim`, **≤ 4 096 caractères**.
- Template de relance : nom `reprise_conversation`, langue `fr`, sans variable, corps exact : `Bonjour, ici l'équipe Golden Market. Nous revenons vers vous suite à votre message. Répondez à ce message pour poursuivre la conversation.`
- `conversations.phone_number` est stocké **tel que fourni par Meta** (chiffres sans `+`, ex. `22677382424`) : ne jamais le normaliser dans ce chantier.
- Base `golden_market` : Medusa n'y écrit **jamais** (rôle `medusa_whatsapp_reader`, `SELECT` au niveau table sur `conversations`/`messages`, vérifié le 2026-09-27).
- n8n : `onError: "continueErrorOutput"` au niveau **racine** du nœud (sœur de `id`/`name`), jamais dans `parameters` ; pas de constructeur `URL` dans les nœuds Code ; publication par `n8n publish:workflow --id=...` puis `docker restart golden_market_n8n`.
- Variables Medusa (production uniquement) : `N8N_ADMIN_ACTIONS_WEBHOOK_URL`, `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET`. Variable n8n : `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET` (même valeur).
- Accès VPS : `ssh admin@144.91.110.105`. Credential Postgres n8n : `{"postgres": {"id": "6KTv30JcX465t9lg", "name": "Postgres account"}}`. Workflow d'erreur n8n : `Lmc05RkUp20Pw4ra`.
- Page admin : **aucun import de `@medusajs/ui` ni rendu JSX d'icône `@medusajs/icons`** (conflit de types React 18/19 documenté dans la page existante).

## Review Focus

1. **Texte avec emoji, retour à la ligne, guillemets et apostrophe courbe** envoyé depuis l'admin → arrive intact chez le client et en base (Task 7, étape de test dédiée).
2. **Rafraîchissement automatique pendant la saisie** → le texte en cours de rédaction et l'erreur affichée ne sont jamais effacés par le polling (Task 6, vérification manuelle dédiée).
3. **Lien direct vers un numéro inconnu** (`?phone=` d'une conversation supprimée) → message « Conversation introuvable », pas de page blanche (Task 5 test 404 + Task 6).
4. **Double clic sur Envoyer / sur Prendre la main** → une seule requête (bouton désactivé tant que la requête est en cours) (Task 6).
5. **Conversation sans aucun message client** (jamais de `user`) → fenêtre considérée fermée, seul le bouton de relance est proposé (Task 2 test + Task 7 test `window_expired`).

---

### Task 1: Migration de la base `golden_market` et soumission du template de relance

**Files:**
- Modify: `/home/abdazz/CODE/perso/golden_market_projects/n8n_automation/schema.sql` (tables `conversations` l. 50-80 et `messages` l. 82-95)

**Interfaces:**
- Produces: colonnes `conversations.human_last_action_at TIMESTAMPTZ NULL`, `conversations.owner_alerted_at TIMESTAMPTZ NULL` ; `messages.role` accepte `'human'` ; template Meta `reprise_conversation` soumis.

- [ ] **Step 1: Vérifier l'état actuel en production (doit montrer l'ancien schéma)**

```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -At -c "SELECT column_name FROM information_schema.columns WHERE table_name='"'"'conversations'"'"' AND column_name IN ('"'"'human_last_action_at'"'"','"'"'owner_alerted_at'"'"');" -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='"'"'messages_role_check'"'"';"'
```
Expected : aucune colonne listée ; contrainte `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))`.

- [ ] **Step 2: Mettre à jour `schema.sql` (création neuve + migration idempotente)**

Dans `CREATE TABLE IF NOT EXISTS messages`, remplacer la ligne `role` par :
```sql
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'human')),
```
Puis ajouter à la fin du fichier :
```sql
-- Reprise manuelle des conversations depuis l'admin Medusa (2026-09-27, voir
-- medusa-golden-market/docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md).
-- status = 'escalated' signifie désormais "un humain a la main, l'IA se tait".
-- human_last_action_at : dernière prise de main / envoi manuel / escalade
-- (base du délai de 2 h avant reprise par l'IA). owner_alerted_at : dernière
-- alerte WhatsApp au propriétaire pour cette conversation (plafond 30 min).
-- role 'human' : message écrit par le propriétaire depuis l'admin.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_last_action_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS owner_alerted_at TIMESTAMPTZ;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'human'));
```

- [ ] **Step 3: Appliquer la migration en production**

```bash
cat > /tmp/migration-reprise.sql <<'EOF'
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_last_action_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS owner_alerted_at TIMESTAMPTZ;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'human'));
EOF
cat /tmp/migration-reprise.sql | ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec -i $C psql -U $U -d golden_market -v ON_ERROR_STOP=1 -1'
```
Expected : `ALTER TABLE` ×4, aucune erreur.

- [ ] **Step 4: Vérifier (relancer la commande du Step 1)**

Expected : les deux colonnes listées ; contrainte contenant `'human'::text`. Vérifier aussi que le rôle de lecture voit les colonnes :
```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -At -c "SET ROLE medusa_whatsapp_reader; SELECT human_last_action_at, owner_alerted_at FROM conversations LIMIT 1;"'
```
Expected : une ligne (valeurs vides), pas d'erreur de permission.

- [ ] **Step 5: Soumettre le template `reprise_conversation` à Meta**

```bash
ssh admin@144.91.110.105 'docker exec golden_market_n8n sh -c "node -e \"
const T=process.env.WHATSAPP_ACCESS_TOKEN;
const g=async(p,o)=>{const r=await fetch(\\\"https://graph.facebook.com/v20.0/\\\"+p,o);return r.json()};
(async()=>{
 const d=await g(\\\"debug_token?input_token=\\\"+T+\\\"&access_token=\\\"+T);
 const waba=d.data.granular_scopes.find(s=>s.scope===\\\"whatsapp_business_management\\\").target_ids[0];
 const body={name:\\\"reprise_conversation\\\",language:\\\"fr\\\",category:\\\"UTILITY\\\",components:[{type:\\\"BODY\\\",text:\\\"Bonjour, ici l\u2019équipe Golden Market. Nous revenons vers vous suite à votre message. Répondez à ce message pour poursuivre la conversation.\\\"}]};
 console.log(\\\"waba\\\",waba, JSON.stringify(await g(waba+\\\"/message_templates\\\",{method:\\\"POST\\\",headers:{Authorization:\\\"Bearer \\\"+T,\\\"content-type\\\":\\\"application/json\\\"},body:JSON.stringify(body)})));
})()\""'
```
Expected : `{"id":"…","status":"PENDING"|"APPROVED","category":"UTILITY"|"MARKETING"}`. Noter l'id et la catégorie retenue par Meta (à reporter dans `HANDOFF.md`, Task 10). Si Meta renvoie une erreur de texte, corriger l'apostrophe (droite `'` au lieu de `’`) et relancer. **Le texte exact envoyé ici doit être recopié à l'identique dans la constante `REENGAGEMENT_TEXT` de la Task 7.**

- [ ] **Step 6: Commit (dépôt `n8n_automation`)**

```bash
cd /home/abdazz/CODE/perso/golden_market_projects/n8n_automation
git add schema.sql
git commit -m "feat(schema): reprise manuelle des conversations - colonnes human_last_action_at/owner_alerted_at et rôle human"
```

---

### Task 2: Fenêtre de réponse WhatsApp (`computeReplyWindow`)

**Files:**
- Create: `apps/backend/src/lib/whatsapp-reply-window.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-reply-window.unit.spec.ts`

**Interfaces:**
- Produces: `computeReplyWindow(lastUserMessageAt: Date | string | null, now?: Date): { open: boolean; expiresAt: Date | null }` et `REPLY_WINDOW_MS = 86_400_000`.

- [ ] **Step 1: Écrire le test**

```ts
import { REPLY_WINDOW_MS, computeReplyWindow } from "../whatsapp-reply-window"

describe("computeReplyWindow", () => {
  const now = new Date("2026-09-27T12:00:00Z")

  it("est fermée quand le client n'a jamais écrit", () => {
    expect(computeReplyWindow(null, now)).toEqual({ open: false, expiresAt: null })
  })

  it("est ouverte moins de 24 h après le dernier message client", () => {
    const last = new Date(now.getTime() - 23 * 3600 * 1000)
    expect(computeReplyWindow(last, now)).toEqual({
      open: true,
      expiresAt: new Date(last.getTime() + REPLY_WINDOW_MS),
    })
  })

  it("est fermée exactement 24 h après (borne exclue)", () => {
    const last = new Date(now.getTime() - REPLY_WINDOW_MS)
    expect(computeReplyWindow(last, now).open).toBe(false)
  })

  it("accepte une date ISO (valeur sérialisée par pg ou par l'API)", () => {
    const last = new Date(now.getTime() - 3600 * 1000).toISOString()
    expect(computeReplyWindow(last, now).open).toBe(true)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-reply-window.unit.spec.ts`
Expected: FAIL — `Cannot find module '../whatsapp-reply-window'`.

- [ ] **Step 3: Implémenter**

```ts
// Fenêtre de service client WhatsApp : une réponse libre (non-template)
// n'est acceptée par Meta que dans les 24 h qui suivent le dernier message
// du client. Calculée, jamais stockée (voir spec 2026-09-27 reprise manuelle).
// Côté admin, sert uniquement à l'affichage : n8n revérifie avant tout envoi.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

export const computeReplyWindow = (
  lastUserMessageAt: Date | string | null,
  now: Date = new Date()
): { open: boolean; expiresAt: Date | null } => {
  if (!lastUserMessageAt) {
    return { open: false, expiresAt: null }
  }
  const expiresAt = new Date(new Date(lastUserMessageAt).getTime() + REPLY_WINDOW_MS)
  return { open: now.getTime() < expiresAt.getTime(), expiresAt }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-reply-window.unit.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/whatsapp-reply-window.ts apps/backend/src/lib/__tests__/whatsapp-reply-window.unit.spec.ts
git commit -m "feat(whatsapp-admin): calcul de la fenêtre de réponse WhatsApp de 24 h"
```

---

### Task 3: Lecture enrichie des conversations (`whatsapp-chat-db.ts`)

**Files:**
- Modify: `apps/backend/src/lib/whatsapp-chat-db.ts` (types l. 13-27, `LIST_CONVERSATIONS_QUERY` l. 62-78, `listConversations` l. 80-105, remplacer `GET_CONVERSATION_MESSAGES_QUERY`/`getConversationMessages` l. 107-137)
- Test: `apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `ChatMessage = { role: "user" | "assistant" | "system" | "human"; content: string; createdAt: Date }`
  - `ConversationSummary` + `awaitingReply: boolean`
  - `ConversationDetail = { phoneNumber: string; customerName: string | null; status: string; humanLastActionAt: Date | null; lastUserMessageAt: Date | null; messages: ChatMessage[] }`
  - `getConversation(phoneNumber: string, executor?): Promise<ConversationDetail | "not_found" | null>` (`null` = base indisponible). `getConversationMessages` est **supprimée**.

- [ ] **Step 1: Adapter les tests**

Dans `whatsapp-chat-db.unit.spec.ts` :
1. Remplacer l'import par `import { getConversation, listConversations } from "../whatsapp-chat-db"`.
2. Dans le test « maps rows into conversation summaries… », ajouter `awaiting_reply: true` à la ligne simulée et `awaitingReply: true` à l'objet attendu.
3. Supprimer le bloc `describe("getConversationMessages", …)` et ajouter :

```ts
describe("getConversation", () => {
  it("returns null when no executor is configured", async () => {
    expect(await getConversation("22670000000", null)).toBeNull()
  })

  it("returns not_found when the conversation does not exist", async () => {
    const queryMock = jest.fn().mockResolvedValueOnce({ rows: [] })

    expect(await getConversation("22670000000", { query: queryMock })).toBe("not_found")
  })

  it("maps the conversation and its messages, human role included, ordered by the query", async () => {
    const humanAt = new Date("2026-09-27T10:00:00Z")
    const userAt = new Date("2026-09-27T09:00:00Z")
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "conv-1",
            phone_number: "22670000000",
            customer_name: null,
            status: "escalated",
            human_last_action_at: humanAt,
            last_user_message_at: userAt,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { role: "user", content: "Bonjour", created_at: userAt },
          { role: "human", content: "Je m'en occupe", created_at: humanAt },
        ],
      })

    const result = await getConversation("22670000000", { query: queryMock })

    expect(result).toEqual({
      phoneNumber: "22670000000",
      customerName: null,
      status: "escalated",
      humanLastActionAt: humanAt,
      lastUserMessageAt: userAt,
      messages: [
        { role: "user", content: "Bonjour", createdAt: userAt },
        { role: "human", content: "Je m'en occupe", createdAt: humanAt },
      ],
    })
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("ORDER BY seq ASC"), ["conv-1"])
  })

  it("returns null when a query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    expect(await getConversation("22670000000", { query: queryMock })).toBeNull()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-chat-db.unit.spec.ts`
Expected: FAIL — `getConversation` n'est pas exporté ; `awaitingReply` absent.

- [ ] **Step 3: Implémenter**

Types (remplacent `ConversationSummary` et `ChatMessage`) :
```ts
export type ConversationSummary = {
  phoneNumber: string
  customerName: string | null
  status: string
  lastMessageAt: Date
  lastMessagePreview: string | null
  messageCount: number
  // Dernier message venu du client alors qu'un humain a la main : le
  // propriétaire doit répondre (point "en attente de votre réponse").
  awaitingReply: boolean
}

export type ChatMessage = {
  // "human" = message écrit par le propriétaire depuis l'admin (via n8n).
  role: "user" | "assistant" | "system" | "human"
  content: string
  createdAt: Date
}

export type ConversationDetail = {
  phoneNumber: string
  customerName: string | null
  status: string
  humanLastActionAt: Date | null
  lastUserMessageAt: Date | null
  messages: ChatMessage[]
}
```

`LIST_CONVERSATIONS_QUERY` : dans le `LATERAL`, sélectionner aussi le rôle, et ajouter la colonne calculée :
```sql
  SELECT
    c.phone_number,
    c.customer_name,
    c.status,
    c.last_message_at,
    m.content AS last_message_preview,
    COALESCE(mc.message_count, 0) AS message_count,
    (m.role = 'user' AND c.status = 'escalated') AS awaiting_reply
  FROM conversations c
  LEFT JOIN LATERAL (
    SELECT content, role FROM messages WHERE conversation_id = c.id ORDER BY seq DESC LIMIT 1
  ) m ON true
  LEFT JOIN (
    SELECT conversation_id, COUNT(*) AS message_count FROM messages GROUP BY conversation_id
  ) mc ON mc.conversation_id = c.id
  WHERE ($1::text IS NULL OR c.phone_number ILIKE '%' || $1 || '%')
  ORDER BY c.last_message_at DESC
```
Dans le `map` de `listConversations`, ajouter : `awaitingReply: row.awaiting_reply === true,`

Remplacer la lecture du fil par :
```ts
const GET_CONVERSATION_QUERY = `
  SELECT
    c.id,
    c.phone_number,
    c.customer_name,
    c.status,
    c.human_last_action_at,
    (SELECT max(created_at) FROM messages WHERE conversation_id = c.id AND role = 'user')
      AS last_user_message_at
  FROM conversations c
  WHERE c.phone_number = $1
`

const GET_MESSAGES_QUERY = `
  SELECT role, content, created_at
  FROM messages
  WHERE conversation_id = $1
  ORDER BY seq ASC
`

// null = base indisponible ; "not_found" = aucune conversation pour ce
// numéro (lien direct vers une conversation supprimée, par exemple).
export async function getConversation(
  phoneNumber: string,
  executor: QueryExecutor | null = getDefaultExecutor()
): Promise<ConversationDetail | "not_found" | null> {
  if (!executor) {
    return null
  }

  try {
    const { rows } = await executor.query(GET_CONVERSATION_QUERY, [phoneNumber])
    const conversation = rows[0]
    if (!conversation) {
      return "not_found"
    }

    const messages = await executor.query(GET_MESSAGES_QUERY, [conversation.id])

    return {
      phoneNumber: conversation.phone_number as string,
      customerName: (conversation.customer_name as string | null) ?? null,
      status: conversation.status as string,
      humanLastActionAt: (conversation.human_last_action_at as Date | null) ?? null,
      lastUserMessageAt: (conversation.last_user_message_at as Date | null) ?? null,
      messages: messages.rows.map((row) => ({
        role: row.role as ChatMessage["role"],
        content: row.content as string,
        createdAt: row.created_at as Date,
      })),
    }
  } catch (error) {
    console.error("[whatsapp-chat-db] Échec de getConversation :", error)
    return null
  }
}
```
Mettre à jour le commentaire d'en-tête du fichier : « Client de lecture seule […] » reste vrai (aucune écriture ajoutée ici).

- [ ] **Step 4: Vérifier le succès**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-chat-db.unit.spec.ts`
Expected: PASS. (La route `[phone]/route.ts` ne compile plus tant que la Task 5 n'est pas faite : normal, ne pas lancer `tsc` ici.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/whatsapp-chat-db.ts apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts
git commit -m "feat(whatsapp-admin): lecture du statut, de la fenêtre et des messages humains d'une conversation"
```

---

### Task 4: Client du webhook d'actions n8n

**Files:**
- Create: `apps/backend/src/lib/whatsapp-admin-actions-client.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-admin-actions-client.unit.spec.ts`
- Modify: `apps/backend/.env.template` (après le bloc `WHATSAPP_CHAT_DATABASE_URL=`, l. 105)

**Interfaces:**
- Produces:
```ts
export type AdminAction = "take_over" | "hand_back" | "send_text" | "send_reengagement"
export type SentMessage = { role: "human"; content: string; createdAt: string }
export type AdminActionErrorKind = "window_expired" | "whatsapp_error" | "not_found" | "invalid_request" | "unavailable"
export type AdminActionResult =
  | { kind: "ok"; message: SentMessage | null; warning: string | null }
  | { kind: AdminActionErrorKind; message: string }
export function runAdminAction(
  input: { action: AdminAction; phoneNumber: string; text?: string },
  deps?: { url?: string; secret?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<AdminActionResult>
```

- [ ] **Step 1: Écrire le test**

```ts
import { runAdminAction } from "../whatsapp-admin-actions-client"

const jsonResponse = (status: number, body: unknown) =>
  ({ status, ok: status < 400, json: async () => body }) as unknown as Response

describe("runAdminAction", () => {
  const deps = { url: "https://n8n.test/webhook/admin-conversation-action", secret: "s3cret" }

  it("renvoie unavailable sans appeler n8n quand la configuration est absente", async () => {
    const fetchImpl = jest.fn()
    const result = await runAdminAction(
      { action: "take_over", phoneNumber: "22670000000" },
      { url: undefined, secret: undefined, fetchImpl }
    )
    expect(result.kind).toBe("unavailable")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("envoie l'action, le numéro, le texte et le secret en en-tête", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, message: null, warning: null }))
    await runAdminAction({ action: "send_text", phoneNumber: "22670000000", text: "Bonjour 👋\nÀ bientôt" }, { ...deps, fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith(
      deps.url,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-actions-secret": "s3cret" },
        body: JSON.stringify({ action: "send_text", phone_number: "22670000000", text: "Bonjour 👋\nÀ bientôt" }),
      })
    )
  })

  it("traduit un succès avec le message enregistré", async () => {
    const message = { role: "human", content: "Bonjour", createdAt: "2026-09-27T10:00:00.000Z" }
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, message, warning: null }))
    expect(await runAdminAction({ action: "send_text", phoneNumber: "1", text: "Bonjour" }, { ...deps, fetchImpl })).toEqual({
      kind: "ok",
      message,
      warning: null,
    })
  })

  it.each(["window_expired", "whatsapp_error", "not_found", "invalid_request"])(
    "traduit l'erreur métier %s avec son message",
    async (code) => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(409, { ok: false, error_code: code, message: "détail" }))
      expect(await runAdminAction({ action: "send_text", phoneNumber: "1", text: "x" }, { ...deps, fetchImpl })).toEqual({
        kind: code,
        message: "détail",
      })
    }
  )

  it("renvoie unavailable sur 401 (secret refusé) ou code d'erreur inconnu", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, { ok: false, error_code: "unauthorized", message: "x" }))
    expect((await runAdminAction({ action: "take_over", phoneNumber: "1" }, { ...deps, fetchImpl })).kind).toBe("unavailable")
  })

  it("renvoie unavailable sur réponse non-JSON", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 502, ok: false, json: async () => { throw new SyntaxError("bad") } })
    expect((await runAdminAction({ action: "take_over", phoneNumber: "1" }, { ...deps, fetchImpl })).kind).toBe("unavailable")
  })

  it("renvoie unavailable quand n8n est injoignable ou trop lent", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("aborted"))
    expect((await runAdminAction({ action: "take_over", phoneNumber: "1" }, { ...deps, fetchImpl })).kind).toBe("unavailable")
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-admin-actions-client.unit.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// Déclenche une action de reprise manuelle (prise de main, envoi, relance...)
// sur le webhook n8n "Admin - actions conversation" - n8n reste le seul
// écrivain de la base golden_market et le seul détenteur du jeton WhatsApp
// (spec docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md).
// Variables présentes en production uniquement, comme WHATSAPP_CHAT_DATABASE_URL.

export type AdminAction = "take_over" | "hand_back" | "send_text" | "send_reengagement"

export type SentMessage = { role: "human"; content: string; createdAt: string }

export type AdminActionErrorKind =
  | "window_expired"
  | "whatsapp_error"
  | "not_found"
  | "invalid_request"
  | "unavailable"

export type AdminActionResult =
  | { kind: "ok"; message: SentMessage | null; warning: string | null }
  | { kind: AdminActionErrorKind; message: string }

const BUSINESS_ERRORS: AdminActionErrorKind[] = [
  "window_expired",
  "whatsapp_error",
  "not_found",
  "invalid_request",
]

const UNAVAILABLE_MESSAGE = "Service WhatsApp injoignable pour le moment, réessayez."

export async function runAdminAction(
  input: { action: AdminAction; phoneNumber: string; text?: string },
  deps: { url?: string; secret?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<AdminActionResult> {
  const url = "url" in deps ? deps.url : process.env.N8N_ADMIN_ACTIONS_WEBHOOK_URL
  const secret = "secret" in deps ? deps.secret : process.env.N8N_ADMIN_ACTIONS_WEBHOOK_SECRET
  const fetchImpl = deps.fetchImpl ?? fetch

  if (!url || !secret) {
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? 20_000)

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-actions-secret": secret },
      body: JSON.stringify({ action: input.action, phone_number: input.phoneNumber, text: input.text }),
      signal: controller.signal,
    })
    const body = (await response.json()) as {
      ok?: boolean
      error_code?: string
      message?: unknown
      warning?: string | null
    }

    if (body.ok === true) {
      return {
        kind: "ok",
        message: (body.message as SentMessage | null) ?? null,
        warning: body.warning ?? null,
      }
    }
    if (body.ok === false && BUSINESS_ERRORS.includes(body.error_code as AdminActionErrorKind)) {
      return {
        kind: body.error_code as AdminActionErrorKind,
        message: typeof body.message === "string" ? body.message : "Erreur",
      }
    }
    console.error("[whatsapp-admin-actions] Réponse inattendue de n8n :", response.status, body)
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
  } catch (error) {
    console.error("[whatsapp-admin-actions] Appel du webhook n8n en échec :", error)
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
  } finally {
    clearTimeout(timeout)
  }
}
```

Note : `"url" in deps` distingue « non fourni » (lire l'env) de « fourni à `undefined` » (test de configuration absente).

Dans `.env.template`, après `WHATSAPP_CHAT_DATABASE_URL=` :
```
# --- Reprise manuelle des conversations WhatsApp depuis l'admin (production
# uniquement) : webhook n8n "Admin - actions conversation". Le secret doit
# être identique à N8N_ADMIN_ACTIONS_WEBHOOK_SECRET côté n8n. Voir
# docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md.
N8N_ADMIN_ACTIONS_WEBHOOK_URL=
N8N_ADMIN_ACTIONS_WEBHOOK_SECRET=
```

- [ ] **Step 4: Vérifier le succès**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-admin-actions-client.unit.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/whatsapp-admin-actions-client.ts apps/backend/src/lib/__tests__/whatsapp-admin-actions-client.unit.spec.ts apps/backend/.env.template
git commit -m "feat(whatsapp-admin): client du webhook n8n d'actions de reprise manuelle"
```

---

### Task 5: Routes admin (détail enrichi + 4 actions)

**Files:**
- Create: `apps/backend/src/lib/whatsapp-admin-action-http.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-admin-action-http.unit.spec.ts`
- Modify: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/route.ts`
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/take-over/route.ts`
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/hand-back/route.ts`
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/messages/route.ts`
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/reengagement/route.ts`

**Interfaces:**
- Consumes: `runAdminAction`, `AdminActionResult` (Task 4) ; `getConversation` (Task 3) ; `computeReplyWindow` (Task 2).
- Produces (contrat HTTP consommé par la page, Task 6) :
  - `GET /admin/whatsapp-conversations/:phone` → `200 { available: false }` | `404 { available: true, found: false }` | `200 { available: true, found: true, conversation: ConversationDetail & { replyWindow: { open: boolean; expiresAt: string | null } } }`
  - `POST …/take-over`, `…/hand-back`, `…/reengagement`, `…/messages` (`{ text }`) → `200 { ok: true, message, warning }` | `4xx/5xx { ok: false, error_code, message }`
  - `toHttpResponse(result: AdminActionResult): { status: number; body: Record<string, unknown> }` ; `parseSendTextBody(body: unknown): { ok: true; text: string } | { ok: false; message: string }`

- [ ] **Step 1: Écrire le test des helpers**

```ts
import { parseSendTextBody, toHttpResponse } from "../whatsapp-admin-action-http"

describe("toHttpResponse", () => {
  it("renvoie 200 avec le message et l'avertissement en cas de succès", () => {
    const message = { role: "human" as const, content: "Bonjour", createdAt: "2026-09-27T10:00:00.000Z" }
    expect(toHttpResponse({ kind: "ok", message, warning: "not_saved" })).toEqual({
      status: 200,
      body: { ok: true, message, warning: "not_saved" },
    })
  })

  it.each([
    ["invalid_request", 400],
    ["not_found", 404],
    ["window_expired", 409],
    ["whatsapp_error", 502],
    ["unavailable", 503],
  ] as const)("associe %s au statut %i", (kind, status) => {
    expect(toHttpResponse({ kind, message: "détail" })).toEqual({
      status,
      body: { ok: false, error_code: kind, message: "détail" },
    })
  })
})

describe("parseSendTextBody", () => {
  it("accepte un texte et retire les espaces autour", () => {
    expect(parseSendTextBody({ text: "  Bonjour 👋\nÀ bientôt  " })).toEqual({ ok: true, text: "Bonjour 👋\nÀ bientôt" })
  })

  it.each([[{}], [{ text: "   " }], [{ text: 42 }], [null]])("refuse un corps invalide %j", (body) => {
    expect(parseSendTextBody(body).ok).toBe(false)
  })

  it("refuse plus de 4096 caractères", () => {
    expect(parseSendTextBody({ text: "a".repeat(4097) }).ok).toBe(false)
    expect(parseSendTextBody({ text: "a".repeat(4096) }).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-admin-action-http.unit.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter les helpers**

```ts
import { z } from "zod"
import type { AdminActionResult } from "./whatsapp-admin-actions-client"

// Traduction des résultats du webhook n8n en réponses HTTP des routes admin
// de reprise manuelle - la page admin s'appuie sur ces statuts pour choisir
// le message à afficher (409 -> proposer la relance, 503 -> réessayer...).
const STATUS_BY_KIND: Record<AdminActionResult["kind"], number> = {
  ok: 200,
  invalid_request: 400,
  not_found: 404,
  window_expired: 409,
  whatsapp_error: 502,
  unavailable: 503,
}

export const toHttpResponse = (
  result: AdminActionResult
): { status: number; body: Record<string, unknown> } =>
  result.kind === "ok"
    ? { status: 200, body: { ok: true, message: result.message, warning: result.warning } }
    : {
        status: STATUS_BY_KIND[result.kind],
        body: { ok: false, error_code: result.kind, message: result.message },
      }

// 4096 caractères : limite d'un message texte WhatsApp Cloud API.
const SendTextBody = z.object({ text: z.string().trim().min(1).max(4096) })

export const parseSendTextBody = (
  body: unknown
): { ok: true; text: string } | { ok: false; message: string } => {
  const parsed = SendTextBody.safeParse(body)
  return parsed.success
    ? { ok: true, text: parsed.data.text }
    : { ok: false, message: "Message vide ou trop long (4 096 caractères maximum)." }
}
```

- [ ] **Step 4: Vérifier le succès des helpers**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-admin-action-http.unit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Écrire les routes**

`[phone]/route.ts` (remplace le contenu) :
```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getConversation } from "../../../../lib/whatsapp-chat-db"
import { computeReplyWindow } from "../../../../lib/whatsapp-reply-window"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const conversation = await getConversation(req.params.phone)

  if (conversation === null) {
    res.json({ available: false })
    return
  }
  if (conversation === "not_found") {
    res.status(404).json({ available: true, found: false })
    return
  }

  const replyWindow = computeReplyWindow(conversation.lastUserMessageAt)
  res.json({
    available: true,
    found: true,
    conversation: {
      ...conversation,
      replyWindow: { open: replyWindow.open, expiresAt: replyWindow.expiresAt?.toISOString() ?? null },
    },
  })
}
```

`[phone]/take-over/route.ts` :
```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { status, body } = toHttpResponse(
    await runAdminAction({ action: "take_over", phoneNumber: req.params.phone })
  )
  res.status(status).json(body)
}
```

`[phone]/hand-back/route.ts` : identique à `take-over` avec `action: "hand_back"`.

`[phone]/reengagement/route.ts` : identique à `take-over` avec `action: "send_reengagement"`.

`[phone]/messages/route.ts` :
```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAdminAction } from "../../../../../lib/whatsapp-admin-actions-client"
import { parseSendTextBody, toHttpResponse } from "../../../../../lib/whatsapp-admin-action-http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = parseSendTextBody(req.body)
  if (!parsed.ok) {
    const { status, body } = toHttpResponse({ kind: "invalid_request", message: parsed.message })
    res.status(status).json(body)
    return
  }

  const { status, body } = toHttpResponse(
    await runAdminAction({ action: "send_text", phoneNumber: req.params.phone, text: parsed.text })
  )
  res.status(status).json(body)
}
```

- [ ] **Step 6: Vérifier typage, lint et suite complète**

Run:
```bash
cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -E "whatsapp" ; npx eslint src/api/admin/whatsapp-conversations src/lib/whatsapp-*.ts ; npm run test:unit 2>&1 | grep -E "^Tests:|✕"
```
Expected : aucune erreur `tsc` sur ces fichiers, aucune erreur eslint, tous les tests passent.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib/whatsapp-admin-action-http.ts apps/backend/src/lib/__tests__/whatsapp-admin-action-http.unit.spec.ts apps/backend/src/api/admin/whatsapp-conversations
git commit -m "feat(whatsapp-admin): routes de prise de main, rendu à l'IA, envoi et relance"
```

---

### Task 6: Page admin refaite (réponse manuelle, responsive)

**Files:**
- Modify (réécriture complète): `apps/backend/src/admin/routes/whatsapp-conversations/page.tsx`

**Interfaces:**
- Consumes: contrat HTTP de la Task 5 ; liste `GET /admin/whatsapp-conversations?q=` renvoyant `ConversationSummary` (+ `awaitingReply`).

- [ ] **Step 1: Réécrire la page**

Conserver de l'existant, **sans modification** : `formatTime`, `formatListTimestamp`, `GenericAvatarIcon` et leurs commentaires. Remplacer le reste du fichier par :

```tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { useCallback, useEffect, useRef, useState } from "react"

// Conversations WhatsApp de l'agent IA (base golden_market, propriété de
// n8n_automation) : lecture + reprise manuelle (prendre la main, répondre,
// relancer, rendre la main à l'IA). Toute écriture passe par les routes
// admin -> webhook n8n. Voir docs/superpowers/specs/
// 2026-09-07-whatsapp-conversations-viewer-design.md et
// 2026-09-27-whatsapp-reprise-manuelle-design.md.
//
// Deux colonnes >= 1024 px (liste | conversation), une seule à la fois en
// dessous (téléphone), avec bouton retour.
//
// N'importe aucun composant de @medusajs/ui - conflit de types React 18/19
// déjà documenté dans widgets/analytics-summary.tsx. Éléments HTML natifs
// avec les classes utilitaires Medusa à la place.

type ConversationSummary = {
  phoneNumber: string
  customerName: string | null
  status: string
  lastMessageAt: string
  lastMessagePreview: string | null
  messageCount: number
  awaitingReply: boolean
}

type ChatMessage = {
  role: "user" | "assistant" | "system" | "human"
  content: string
  createdAt: string
}

type ConversationDetail = {
  phoneNumber: string
  customerName: string | null
  status: string
  humanLastActionAt: string | null
  lastUserMessageAt: string | null
  messages: ChatMessage[]
  replyWindow: { open: boolean; expiresAt: string | null }
}

type ListResponse = { available: false } | { available: true; conversations: ConversationSummary[] }
type DetailResponse =
  | { available: false }
  | { available: true; found: false }
  | { available: true; found: true; conversation: ConversationDetail }
type ActionResponse = { ok: true; warning: string | null } | { ok: false; error_code: string; message: string }

const LIST_REFRESH_MS = 30_000
const DETAIL_REFRESH_MS = 10_000

// (formatTime, formatListTimestamp, GenericAvatarIcon : inchangés, recopiés ici)

// "encore 5 h 12" - temps restant pour répondre librement (fenêtre WhatsApp 24 h).
const formatRemaining = (expiresAt: string) => {
  const minutes = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`
}

// Rafraîchissement périodique suspendu quand l'onglet n'est pas visible.
const usePolling = (callback: () => void, intervalMs: number, enabled: boolean) => {
  const saved = useRef(callback)
  saved.current = callback

  useEffect(() => {
    if (!enabled) {
      return
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        saved.current()
      }
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
}

const postAction = async (phoneNumber: string, path: string, body?: unknown): Promise<ActionResponse> => {
  try {
    const res = await fetch(`/admin/whatsapp-conversations/${encodeURIComponent(phoneNumber)}/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return (await res.json()) as ActionResponse
  } catch {
    return { ok: false, error_code: "unavailable", message: "Service injoignable, réessayez." }
  }
}

const ConversationRow = ({
  conversation,
  active,
  onSelect,
}: {
  conversation: ConversationSummary
  active: boolean
  onSelect: () => void
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`flex w-full items-start gap-x-3 border-b border-ui-border-base px-4 py-3 text-left hover:bg-ui-bg-subtle ${
      active ? "bg-ui-bg-subtle" : ""
    }`}
  >
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ui-tag-neutral-bg text-ui-fg-base txt-compact-small-plus">
      {conversation.customerName ? (
        conversation.customerName.slice(0, 1).toUpperCase()
      ) : (
        // Pas de nom client enregistré : l'initiale du numéro de téléphone
        // n'a aucun sens (tous les numéros BF commencent par le même
        // indicatif) - icône générique plutôt qu'une lettre trompeuse.
        <GenericAvatarIcon />
      )}
      {conversation.awaitingReply && (
        <span
          title="En attente de votre réponse"
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ui-bg-base bg-ui-tag-red-icon"
        />
      )}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
      <span className="flex items-center justify-between gap-x-2">
        <span className="truncate text-ui-fg-base txt-compact-small-plus">
          {conversation.customerName ?? conversation.phoneNumber}
        </span>
        <span className="shrink-0 text-ui-fg-subtle txt-compact-xsmall">
          {formatListTimestamp(conversation.lastMessageAt)}
        </span>
      </span>
      <span className="truncate text-ui-fg-subtle txt-compact-small">
        {conversation.lastMessagePreview ?? "—"}
      </span>
      <span className="flex items-center gap-x-2 text-ui-fg-muted txt-compact-xsmall">
        {conversation.messageCount} message{conversation.messageCount > 1 ? "s" : ""}
        {conversation.status === "escalated" && (
          <span className="rounded-full bg-ui-tag-orange-bg px-2 text-ui-tag-orange-text">Vous avez la main</span>
        )}
      </span>
    </span>
  </button>
)

const ConversationListPanel = ({
  selectedPhone,
  onSelect,
  refreshKey,
}: {
  selectedPhone: string | null
  onSelect: (phoneNumber: string) => void
  refreshKey: number
}) => {
  const [search, setSearch] = useState("")
  const [list, setList] = useState<ListResponse | null>(null)

  const load = useCallback(() => {
    const query = search ? `?q=${encodeURIComponent(search)}` : ""
    fetch(`/admin/whatsapp-conversations${query}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then(setList)
      .catch(() => setList({ available: false }))
  }, [search])

  useEffect(load, [load, refreshKey])
  usePolling(load, LIST_REFRESH_MS, true)

  // Sur grand écran uniquement : sélectionne la conversation la plus récente
  // quand rien n'est sélectionné. Sur téléphone, la liste reste affichée.
  useEffect(() => {
    if (selectedPhone !== null || !window.matchMedia("(min-width: 1024px)").matches) {
      return
    }
    if (list?.available && list.conversations.length > 0) {
      onSelect(list.conversations[0].phoneNumber)
    }
  }, [list, selectedPhone, onSelect])

  return (
    <div
      className={`${selectedPhone ? "hidden lg:flex" : "flex"} h-full w-full shrink-0 flex-col border-r border-ui-border-base lg:w-[340px]`}
    >
      <div className="border-b border-ui-border-base p-4">
        <h1 className="text-ui-fg-base txt-large-plus mb-3">Conversations WhatsApp</h1>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par numéro de téléphone"
          className="txt-compact-small w-full rounded-md border border-ui-border-base px-3 py-2"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {list === null && <p className="text-ui-fg-subtle p-4">Chargement…</p>}
        {list && !list.available && (
          <p className="text-ui-fg-subtle p-4">Conversations indisponibles pour le moment.</p>
        )}
        {list?.available && list.conversations.length === 0 && (
          <p className="text-ui-fg-subtle p-4">Aucune conversation trouvée.</p>
        )}
        {list?.available &&
          list.conversations.map((conversation) => (
            <ConversationRow
              key={conversation.phoneNumber}
              conversation={conversation}
              active={conversation.phoneNumber === selectedPhone}
              onSelect={() => onSelect(conversation.phoneNumber)}
            />
          ))}
      </div>
    </div>
  )
}

const MessageBubble = ({ message }: { message: ChatMessage }) => {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <span className="text-ui-fg-muted txt-compact-xsmall bg-ui-bg-subtle rounded-full px-3 py-1">
          {message.content}
        </span>
      </div>
    )
  }

  const fromClient = message.role === "user"
  const fromHuman = message.role === "human"
  const bubbleClass = fromClient
    ? "bg-ui-bg-component text-ui-fg-base"
    : fromHuman
      ? "bg-ui-tag-blue-bg text-ui-tag-blue-text"
      : "bg-ui-tag-green-bg text-ui-tag-green-text"

  return (
    <div className={`flex ${fromClient ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 lg:max-w-[70%] ${bubbleClass}`}>
        {!fromClient && (
          <p className="txt-compact-xsmall-plus mb-0.5 opacity-70">{fromHuman ? "Vous" : "IA"}</p>
        )}
        <p className="txt-compact-small whitespace-pre-wrap break-words">{message.content}</p>
        <p className="txt-compact-xsmall mt-1 text-right opacity-70">{formatTime(message.createdAt)}</p>
      </div>
    </div>
  )
}

const Composer = ({
  phoneNumber,
  replyWindow,
  onSent,
}: {
  phoneNumber: string
  replyWindow: ConversationDetail["replyWindow"]
  onSent: (warning: string | null) => void
}) => {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Si n8n signale la fenêtre expirée (409) alors que l'affichage la croyait
  // ouverte, on bascule sur la relance sans attendre le prochain rafraîchissement.
  const [windowClosed, setWindowClosed] = useState(false)

  // Réinitialise la zone de saisie uniquement au changement de conversation,
  // jamais sur un rafraîchissement périodique.
  useEffect(() => {
    setText("")
    setError(null)
    setWindowClosed(false)
  }, [phoneNumber])

  const run = async (path: string, body?: unknown) => {
    setSending(true)
    setError(null)
    const result = await postAction(phoneNumber, path, body)
    setSending(false)
    if (result.ok) {
      if (path === "messages") {
        setText("")
      }
      onSent(result.warning)
      return
    }
    if (result.error_code === "window_expired") {
      setWindowClosed(true)
    }
    setError(result.message)
  }

  const open = replyWindow.open && !windowClosed

  return (
    <div className="border-t border-ui-border-base p-3">
      {error && <p className="txt-compact-small mb-2 text-ui-fg-error">{error}</p>}
      {open ? (
        <div className="flex items-end gap-x-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            maxLength={4096}
            placeholder="Votre réponse au client…"
            className="txt-compact-small flex-1 resize-none rounded-md border border-ui-border-base px-3 py-2"
          />
          <button
            type="button"
            disabled={sending || text.trim().length === 0}
            onClick={() => run("messages", { text })}
            className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted disabled:opacity-50"
          >
            {sending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-y-2">
          <p className="txt-compact-small text-ui-fg-subtle">
            Le client n'a pas écrit depuis plus de 24 h : WhatsApp n'autorise plus de réponse libre.
            Envoyez le message de relance ; dès que le client répond, vous pourrez de nouveau lui écrire.
          </p>
          <button
            type="button"
            disabled={sending}
            onClick={() => run("reengagement")}
            className="txt-compact-small-plus self-start rounded-md bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted disabled:opacity-50"
          >
            {sending ? "Envoi…" : "Envoyer le message de relance"}
          </button>
        </div>
      )}
    </div>
  )
}

const ConversationThreadPanel = ({
  phoneNumber,
  onBack,
  onChanged,
}: {
  phoneNumber: string | null
  onBack: () => void
  onChanged: () => void
}) => {
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!phoneNumber) {
      return
    }
    fetch(`/admin/whatsapp-conversations/${encodeURIComponent(phoneNumber)}`, { credentials: "include" })
      .then((res) => res.json())
      .then(setDetail)
      .catch(() => setDetail({ available: false }))
  }, [phoneNumber])

  useEffect(() => {
    setDetail(null)
    setNotice(null)
    load()
  }, [load])
  usePolling(load, DETAIL_REFRESH_MS, phoneNumber !== null)

  const messageCount = detail && "conversation" in detail ? detail.conversation.messages.length : 0
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messageCount])

  if (!phoneNumber) {
    return (
      <div className="hidden flex-1 items-center justify-center lg:flex">
        <p className="text-ui-fg-subtle">Sélectionnez une conversation à gauche.</p>
      </div>
    )
  }

  const conversation = detail && "conversation" in detail ? detail.conversation : null
  const humanHasHand = conversation?.status === "escalated"

  const toggleHand = async () => {
    setBusy(true)
    setNotice(null)
    const result = await postAction(phoneNumber, humanHasHand ? "hand-back" : "take-over")
    setBusy(false)
    if (!result.ok) {
      setNotice(result.message)
    }
    load()
    onChanged()
  }

  const afterSend = (warning: string | null) => {
    setNotice(warning === "not_saved" ? "Message envoyé, mais absent de l'historique (erreur d'enregistrement)." : null)
    load()
    onChanged()
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ui-border-base px-4 py-3">
        <button type="button" onClick={onBack} className="txt-compact-small text-ui-fg-interactive lg:hidden">
          ← Retour
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-ui-fg-base txt-large-plus">
            {conversation?.customerName ?? phoneNumber}
          </h2>
          {conversation && (
            <p className="txt-compact-xsmall text-ui-fg-subtle">
              {humanHasHand ? "Vous avez la main — l'IA ne répond pas" : "L'IA répond automatiquement"}
              {conversation.replyWindow.open && conversation.replyWindow.expiresAt
                ? ` · encore ${formatRemaining(conversation.replyWindow.expiresAt)} pour répondre librement`
                : " · fenêtre de réponse libre expirée"}
            </p>
          )}
        </div>
        {conversation && (
          <button
            type="button"
            disabled={busy}
            onClick={toggleHand}
            className="txt-compact-small-plus rounded-md border border-ui-border-base px-3 py-1.5 disabled:opacity-50"
          >
            {humanHasHand ? "Rendre la main à l'IA" : "Prendre la main"}
          </button>
        )}
      </div>

      {notice && <p className="txt-compact-small border-b border-ui-border-base px-4 py-2 text-ui-fg-error">{notice}</p>}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {detail === null && <p className="text-ui-fg-subtle">Chargement…</p>}
        {detail && !detail.available && (
          <p className="text-ui-fg-subtle">Conversation indisponible pour le moment.</p>
        )}
        {detail && detail.available && !detail.found && (
          <p className="text-ui-fg-subtle">Conversation introuvable.</p>
        )}
        {conversation && conversation.messages.length === 0 && (
          <p className="text-ui-fg-subtle">Aucun message dans cette conversation.</p>
        )}
        {conversation && conversation.messages.length > 0 && (
          <div className="flex flex-col gap-y-3">
            {conversation.messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {conversation && (
        <Composer phoneNumber={phoneNumber} replyWindow={conversation.replyWindow} onSent={afterSend} />
      )}
    </div>
  )
}

// Lien direct depuis l'alerte WhatsApp : /app/whatsapp-conversations?phone=<numéro>
const readPhoneFromUrl = () => new URLSearchParams(window.location.search).get("phone")

const WhatsappConversationsPage = () => {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(readPhoneFromUrl)
  const [listRefreshKey, setListRefreshKey] = useState(0)

  const select = useCallback((phoneNumber: string | null) => {
    setSelectedPhone(phoneNumber)
    const url = new URL(window.location.href)
    if (phoneNumber) {
      url.searchParams.set("phone", phoneNumber)
    } else {
      url.searchParams.delete("phone")
    }
    window.history.replaceState(null, "", url.toString())
  }, [])

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex h-[calc(100vh-120px)] overflow-hidden rounded-lg">
      <ConversationListPanel selectedPhone={selectedPhone} onSelect={select} refreshKey={listRefreshKey} />
      <ConversationThreadPanel
        phoneNumber={selectedPhone}
        onBack={() => select(null)}
        onChanged={() => setListRefreshKey((key) => key + 1)}
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Conversations WhatsApp",
  icon: ChatBubbleLeftRight,
})

export default WhatsappConversationsPage
```

(Le constructeur `URL` est ici exécuté dans le navigateur, pas dans n8n : autorisé.)

- [ ] **Step 2: Vérifier typage et lint**

Run: `cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep whatsapp-conversations ; npx eslint src/admin/routes/whatsapp-conversations/page.tsx`
Expected : aucune erreur.

- [ ] **Step 3: Vérifier que l'admin se construit**

Run: `cd apps/backend && npx medusa build 2>&1 | tail -5`
Expected : build réussi (`Admin build completed` / pas d'erreur Vite). La vérification visuelle se fait en Task 9 (production uniquement).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin/routes/whatsapp-conversations/page.tsx
git commit -m "feat(whatsapp-admin): répondre, relancer et prendre la main depuis la page des conversations"
```

---

### Task 7: Workflow n8n « Admin - actions conversation »

**Files (hors dépôt Medusa):**
- Create (scratchpad, non versionné) : `build_admin_actions_workflow.py` → `admin-actions.json`
- Modify (VPS) : `/var/www/n8n/.env` et `/var/www/n8n/docker-compose.yml` (bloc `environment:` du service n8n)
- Modify (dépôt `n8n_automation`) : `docker-compose.yml`, `.env.example`

**Interfaces:**
- Consumes: migration Task 1 ; template `reprise_conversation` (texte exact du Step 5 de la Task 1).
- Produces: `POST https://n8n.golden-market.co/webhook/admin-conversation-action`, en-tête `x-admin-actions-secret`, corps `{ action, phone_number, text? }`, réponses `{ ok: true, message: {role, content, createdAt} | null, warning: null | "not_saved" }` ou `{ ok: false, error_code, message }` avec statuts 400/401/404/409/500/502 — exactement ce que parse `runAdminAction` (Task 4).

- [ ] **Step 1: Générer et installer le secret partagé**

```bash
SECRET=$(openssl rand -hex 32)
ssh admin@144.91.110.105 "cd /var/www/n8n && grep -q '^N8N_ADMIN_ACTIONS_WEBHOOK_SECRET=' .env || echo 'N8N_ADMIN_ACTIONS_WEBHOOK_SECRET=$SECRET' >> .env && grep -n 'N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET' docker-compose.yml"
```
Ajouter dans `/var/www/n8n/docker-compose.yml`, juste sous la ligne `N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET` du bloc `environment:` (même indentation) :
```yaml
      - N8N_ADMIN_ACTIONS_WEBHOOK_SECRET=${N8N_ADMIN_ACTIONS_WEBHOOK_SECRET}
```
(adapter à la syntaxe `clé: valeur` si le bloc l'utilise). Puis :
```bash
ssh admin@144.91.110.105 'cd /var/www/n8n && docker compose up -d n8n && sleep 20 && docker exec golden_market_n8n sh -c "test -n \"\$N8N_ADMIN_ACTIONS_WEBHOOK_SECRET\" && echo SECRET_OK"'
```
Expected : `SECRET_OK`. Reporter la même ligne dans `n8n_automation/docker-compose.yml` et `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET=` dans `.env.example` (sans valeur). **Ne jamais afficher la valeur du secret.**

- [ ] **Step 2: Écrire le générateur du workflow**

`build_admin_actions_workflow.py` (dans le scratchpad) :

```python
import json, uuid

U = lambda: str(uuid.uuid4())
PG = {"postgres": {"id": "6KTv30JcX465t9lg", "name": "Postgres account"}}
GRAPH = "=https://graph.facebook.com/v20.0/{{ $env.WHATSAPP_PHONE_NUMBER_ID }}/messages"
AUTH = {"parameters": [
    {"name": "Authorization", "value": "=Bearer {{ $env.WHATSAPP_ACCESS_TOKEN }}"},
    {"name": "Content-Type", "value": "application/json"}]}
# Doit être identique au corps du template soumis en Task 1 Step 5.
REENGAGEMENT_TEXT = ("Bonjour, ici l\u2019équipe Golden Market. Nous revenons vers vous suite à "
                     "votre message. Répondez à ce message pour poursuivre la conversation.")

def node(name, type_, version, pos, params, **extra):
    n = {"id": U(), "name": name, "type": type_, "typeVersion": version, "position": pos, "parameters": params}
    n.update(extra)
    return n

def respond(name, pos, body_expr, code_expr):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "json", "responseBody": body_expr,
        "options": {"responseCode": code_expr}})

def pg(name, pos, query, replacement, **extra):
    return node(name, "n8n-nodes-base.postgres", 2.5, pos, {
        "operation": "executeQuery", "query": query,
        "options": {"queryReplacement": replacement}}, credentials=PG, **extra)

def if_equals(value_expr, right):
    return {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": U(), "leftValue": value_expr, "rightValue": right,
                        "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"}}

VALIDATE = r"""
const req = $('Normalize Payload').first().json;
const conv = $input.first().json;
const ACTIONS = ['take_over', 'hand_back', 'send_text', 'send_reengagement'];
const fail = (status, error_code, message) => [{ json: { route: 'error', status, error_code, message } }];

if (!ACTIONS.includes(req.action)) return fail(400, 'invalid_request', 'Action inconnue.');
if (!conv.id) return fail(404, 'not_found', 'Conversation introuvable.');

const text = String(req.text || '').trim();
if (req.action === 'send_text') {
  if (!text || text.length > 4096) return fail(400, 'invalid_request', 'Message vide ou trop long (4 096 caractères maximum).');
  // Fenêtre de service client WhatsApp : 24 h après le dernier message du client.
  const last = conv.last_user_message_at ? new Date(conv.last_user_message_at).getTime() : null;
  if (!last || Date.now() - last >= 24 * 60 * 60 * 1000) {
    return fail(409, 'window_expired', "Le client n'a pas écrit depuis plus de 24 h : envoyez le message de relance.");
  }
}
return [{ json: { route: req.action, conversation_id: conv.id, phone_number: req.phone_number, text } }];
"""

PREPARE = r"""
const req = $('Validate Request').first().json;
const content = req.route === 'send_reengagement' ? %s : req.text;
return [{ json: { conversation_id: req.conversation_id, content, wamid: $input.first().json.messages[0].id } }];
""" % json.dumps(REENGAGEMENT_TEXT, ensure_ascii=False)

WA_ERROR = r"""
// Erreur Graph API : n8n expose le corps de la réponse Meta dans error.description
// ou error.message selon la version ; on en extrait le message lisible.
const e = $input.first().json.error || {};
let message = String(e.description || e.message || 'Erreur WhatsApp inconnue.');
const brace = message.indexOf('{');
if (brace >= 0) {
  try {
    const meta = JSON.parse(message.slice(brace)).error || {};
    message = (meta.error_data && meta.error_data.details) || meta.message || message;
  } catch (err) {}
}
return [{ json: { ok: false, error_code: 'whatsapp_error', message } }];
"""

SAVE_SQL = """WITH ins AS (
  INSERT INTO messages (conversation_id, role, content, whatsapp_msg_id)
  VALUES ($1::uuid, 'human', $2, $3)
  RETURNING content, created_at
), upd AS (
  UPDATE conversations
  SET status = 'escalated', human_last_action_at = now(), last_message_at = now()
  WHERE id = $1::uuid
)
SELECT content, created_at FROM ins;"""

switch_rules = {"values": [
    {"conditions": if_equals("={{ $json.route }}", r)["conditions"], "renameOutput": True, "outputKey": r}
    for r in ["take_over", "hand_back", "send_text", "send_reengagement", "error"]]}

nodes = [
    node("Admin Action Webhook", "n8n-nodes-base.webhook", 2, [0, 0],
         {"httpMethod": "POST", "path": "admin-conversation-action", "responseMode": "responseNode", "options": {}},
         webhookId=U()),
    node("Normalize Payload", "n8n-nodes-base.set", 3.4, [220, 0], {"assignments": {"assignments": [
        {"id": U(), "name": "received_secret", "value": "={{ $json.headers['x-admin-actions-secret'] ?? '' }}", "type": "string"},
        {"id": U(), "name": "action", "value": "={{ $json.body?.action ?? '' }}", "type": "string"},
        {"id": U(), "name": "phone_number", "value": "={{ String($json.body?.phone_number ?? '') }}", "type": "string"},
        {"id": U(), "name": "text", "value": "={{ $json.body?.text ?? '' }}", "type": "string"}]}, "options": {}}),
    node("Check Secret", "n8n-nodes-base.if", 2.2, [440, 0], {"conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [
            {"id": U(), "leftValue": "={{ $env.N8N_ADMIN_ACTIONS_WEBHOOK_SECRET ?? '' }}", "rightValue": "",
             "operator": {"type": "string", "operation": "notEmpty", "singleValue": True}},
            {"id": U(), "leftValue": "={{ $json.received_secret }}", "rightValue": "={{ $env.N8N_ADMIN_ACTIONS_WEBHOOK_SECRET }}",
             "operator": {"type": "string", "operation": "equals"}}],
        "combinator": "and"}, "options": {}}),
    respond("Respond Unauthorized", [660, 200],
            "={{ { ok: false, error_code: 'unauthorized', message: 'Secret invalide' } }}", 401),
    pg("Load Conversation", [660, 0],
       "SELECT c.id, c.status,\n  (SELECT max(created_at) FROM messages WHERE conversation_id = c.id AND role = 'user') AS last_user_message_at\nFROM conversations c\nWHERE c.phone_number = $1;",
       "={{ [ $json.phone_number ] }}", alwaysOutputData=True, onError="continueErrorOutput"),
    respond("Respond Internal Error", [880, 200],
            "={{ { ok: false, error_code: 'internal_error', message: 'Erreur interne n8n' } }}", 500),
    node("Validate Request", "n8n-nodes-base.code", 2, [880, 0], {"jsCode": VALIDATE}),
    node("Route Action", "n8n-nodes-base.switch", 3.2, [1100, 0], {"rules": switch_rules, "options": {}}),
    respond("Respond Error", [1320, 400],
            "={{ { ok: false, error_code: $json.error_code, message: $json.message } }}", "={{ $json.status }}"),
    pg("Take Over", [1320, -300],
       "UPDATE conversations SET status = 'escalated', human_last_action_at = now() WHERE id = $1::uuid;",
       "={{ [ $json.conversation_id ] }}", alwaysOutputData=True, onError="continueErrorOutput"),
    pg("Hand Back", [1320, -150],
       "UPDATE conversations SET status = 'active', consecutive_search_misses = 0 WHERE id = $1::uuid;",
       "={{ [ $json.conversation_id ] }}", alwaysOutputData=True, onError="continueErrorOutput"),
    respond("Respond Ok Empty", [1540, -225], "={{ { ok: true, message: null, warning: null } }}", 200),
    node("Send Text", "n8n-nodes-base.httpRequest", 4.5, [1320, 0], {
        "method": "POST", "url": GRAPH, "sendHeaders": True, "headerParameters": AUTH, "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.phone_number, type: 'text', text: { body: $json.text, preview_url: true } }) }}",
        "options": {}}, onError="continueErrorOutput"),
    node("Send Reengagement Template", "n8n-nodes-base.httpRequest", 4.5, [1320, 150], {
        "method": "POST", "url": GRAPH, "sendHeaders": True, "headerParameters": AUTH, "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.phone_number, type: 'template', template: { name: 'reprise_conversation', language: { code: 'fr' } } }) }}",
        "options": {}}, onError="continueErrorOutput"),
    node("Format WhatsApp Error", "n8n-nodes-base.code", 2, [1540, 250], {"jsCode": WA_ERROR}),
    respond("Respond WhatsApp Error", [1760, 250], "={{ $json }}", 502),
    node("Prepare Human Message", "n8n-nodes-base.code", 2, [1540, 50], {"jsCode": PREPARE}),
    pg("Save Human Message", [1760, 50], SAVE_SQL,
       "={{ [ $json.conversation_id, $json.content, $json.wamid ] }}", onError="continueErrorOutput"),
    respond("Respond Sent", [1980, 0],
            "={{ { ok: true, warning: null, message: { role: 'human', content: $json.content, createdAt: $json.created_at } } }}", 200),
    respond("Respond Sent Not Saved", [1980, 150],
            "={{ { ok: true, warning: 'not_saved', message: null } }}", 200),
    node("Fail For Error Alert", "n8n-nodes-base.stopAndError", 1, [2200, 150],
         {"errorMessage": "Message WhatsApp envoyé depuis l'admin mais non enregistré dans messages"}),
]

main = lambda *targets: {"main": [[{"node": t, "type": "main", "index": 0}] if t else [] for t in targets]}
connections = {
    "Admin Action Webhook": main("Normalize Payload"),
    "Normalize Payload": main("Check Secret"),
    "Check Secret": main("Load Conversation", "Respond Unauthorized"),
    "Load Conversation": main("Validate Request", "Respond Internal Error"),
    "Validate Request": main("Route Action"),
    "Route Action": main("Take Over", "Hand Back", "Send Text", "Send Reengagement Template", "Respond Error"),
    "Take Over": main("Respond Ok Empty", "Respond Internal Error"),
    "Hand Back": main("Respond Ok Empty", "Respond Internal Error"),
    "Send Text": main("Prepare Human Message", "Format WhatsApp Error"),
    "Send Reengagement Template": main("Prepare Human Message", "Format WhatsApp Error"),
    "Format WhatsApp Error": main("Respond WhatsApp Error"),
    "Prepare Human Message": main("Save Human Message"),
    "Save Human Message": main("Respond Sent", "Respond Sent Not Saved"),
    "Respond Sent Not Saved": main("Fail For Error Alert"),
}

wf = {"id": "AdmConvAction7Qx", "name": "Admin - actions conversation",
      "description": "Actions de reprise manuelle déclenchées depuis l'admin Medusa (prendre/rendre la main, envoyer, relancer). Voir medusa-golden-market/docs/superpowers/specs/2026-09-27-whatsapp-reprise-manuelle-design.md.",
      "active": False, "isArchived": False, "nodes": nodes, "connections": connections,
      "settings": {"errorWorkflow": "Lmc05RkUp20Pw4ra", "executionOrder": "v1"},
      "pinData": {}, "staticData": None, "meta": None, "tags": []}
json.dump([wf], open("admin-actions.json", "w"), ensure_ascii=False, indent=1)
print("ok", len(nodes), "nodes")
```

Run: `python3 build_admin_actions_workflow.py` — Expected : `ok 21 nodes`.

- [ ] **Step 3: Importer et publier**

```bash
scp admin-actions.json admin@144.91.110.105:/tmp/admin-actions.json
ssh admin@144.91.110.105 'docker cp /tmp/admin-actions.json golden_market_n8n:/tmp/admin-actions.json && docker exec golden_market_n8n n8n import:workflow --input=/tmp/admin-actions.json && docker exec golden_market_n8n n8n publish:workflow --id=AdmConvAction7Qx && docker restart golden_market_n8n; rm -f /tmp/admin-actions.json'
```
Expected : `Successfully imported 1 workflow`, `Publishing workflow…`.

- [ ] **Step 4: Tester chaque chemin (conversation de test à numéro fictif)**

Préparer la conversation de test et un helper d'appel (secret lu dans le conteneur, jamais affiché) :
```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -c "INSERT INTO conversations (phone_number) VALUES ('"'"'22600000099'"'"') ON CONFLICT DO NOTHING; INSERT INTO messages (conversation_id, role, content) SELECT id, '"'"'user'"'"', '"'"'Bonjour (test)'"'"' FROM conversations WHERE phone_number='"'"'22600000099'"'"';"'
cat > act.sh <<'EOF'
#!/bin/bash
# Usage : ./act.sh '<json>' [secret-override]
ssh admin@144.91.110.105 "S=\${2:-\$(docker exec golden_market_n8n printenv N8N_ADMIN_ACTIONS_WEBHOOK_SECRET)}; curl -s -w ' HTTP%{http_code}\n' -X POST https://n8n.golden-market.co/webhook/admin-conversation-action -H 'content-type: application/json' -H \"x-admin-actions-secret: \$S\" -d '$1'"
EOF
chmod +x act.sh
```
Puis, un par un (Expected après chaque flèche) :
```bash
./act.sh '{"action":"take_over","phone_number":"22600000099"}' mauvais   # -> {"ok":false,"error_code":"unauthorized"...} HTTP401
./act.sh '{"action":"take_over","phone_number":"22600000000"}'          # -> error_code not_found HTTP404
./act.sh '{"action":"explode","phone_number":"22600000099"}'            # -> invalid_request HTTP400
./act.sh '{"action":"take_over","phone_number":"22600000099"}'          # -> {"ok":true,...} HTTP200
./act.sh '{"action":"send_text","phone_number":"22600000099","text":"Bonjour 👋\nC’est l’équipe \"Golden\" !"}'  # -> ok:true, message.content identique au texte (emoji, retour ligne, guillemets, apostrophe courbe) HTTP200
./act.sh '{"action":"send_text","phone_number":"22600000099","text":"   "}'  # -> invalid_request HTTP400
./act.sh '{"action":"hand_back","phone_number":"22600000099"}'          # -> ok HTTP200
```
Vérifier en base après ces appels :
```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -At -c "SELECT status, human_last_action_at IS NOT NULL, consecutive_search_misses FROM conversations WHERE phone_number='"'"'22600000099'"'"';" -c "SELECT role, content, whatsapp_msg_id IS NOT NULL FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.phone_number='"'"'22600000099'"'"' ORDER BY seq;"'
```
Expected : `active|t|0` ; messages `user|Bonjour (test)|f` puis `human|Bonjour 👋⏎C’est l’équipe "Golden" !|t` (texte intact).

Fenêtre expirée (antidater le message client), puis relance :
```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -c "UPDATE messages SET created_at = now() - interval '"'"'25 hours'"'"' WHERE role='"'"'user'"'"' AND conversation_id=(SELECT id FROM conversations WHERE phone_number='"'"'22600000099'"'"');"'
./act.sh '{"action":"send_text","phone_number":"22600000099","text":"test"}'   # -> window_expired HTTP409
./act.sh '{"action":"send_reengagement","phone_number":"22600000099"}'       # -> ok:true HTTP200 si le template est approuvé ; sinon whatsapp_error HTTP502 avec le message Meta (template en attente)
```

- [ ] **Step 5: Nettoyer la conversation de test**

```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -c "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE phone_number='"'"'22600000099'"'"'); DELETE FROM conversations WHERE phone_number='"'"'22600000099'"'"';"'
```

- [ ] **Step 6: Commit (dépôt `n8n_automation`)**

```bash
cd /home/abdazz/CODE/perso/golden_market_projects/n8n_automation
git add docker-compose.yml .env.example
git commit -m "feat(n8n): secret du webhook d'actions de reprise manuelle depuis l'admin Medusa"
```

---

### Task 8: Workflow principal et escalades — l'IA se tait quand un humain a la main

**Files (hors dépôt Medusa):**
- Create (scratchpad) : `patch_main_workflow.py`
- Workflows n8n modifiés : `Golden Market Sales Automation Workflow` (`i6KGA9BvK9unjxxj`), `Tool - find_products` (`s6Ef6xBRxBeF6dgW`), `Tool - escalate_to_human` (`ho253xg11t9NVxX7`)

**Interfaces:**
- Consumes: colonnes de la Task 1.
- Produces: comportement décrit en spec § 2b.

- [ ] **Step 1: Exporter l'état courant des trois workflows (sauvegarde + base du patch)**

```bash
for id in i6KGA9BvK9unjxxj s6Ef6xBRxBeF6dgW ho253xg11t9NVxX7; do
  ssh admin@144.91.110.105 "docker exec golden_market_n8n sh -c 'n8n export:workflow --id=$id --output=/tmp/w.json >/dev/null 2>&1; cat /tmp/w.json; rm -f /tmp/w.json'" > backup-$id.json
done
python3 -c "import json;[json.load(open(f'backup-{i}.json')) for i in ['i6KGA9BvK9unjxxj','s6Ef6xBRxBeF6dgW','ho253xg11t9NVxX7']];print('backups ok')"
```

- [ ] **Step 2: Écrire le patch**

`patch_main_workflow.py` :

```python
import json, uuid, copy
U = lambda: str(uuid.uuid4())
PG = {"postgres": {"id": "6KTv30JcX465t9lg", "name": "Postgres account"}}
GRAPH = "=https://graph.facebook.com/v20.0/{{ $env.WHATSAPP_PHONE_NUMBER_ID }}/messages"
AUTH = {"parameters": [
    {"name": "Authorization", "value": "=Bearer {{ $env.WHATSAPP_ACCESS_TOKEN }}"},
    {"name": "Content-Type", "value": "application/json"}]}

def load(i):
    return json.load(open(f"backup-{i}.json"))

def by_name(w, name):
    return next(n for n in w["nodes"] if n["name"] == name)

# ---------- Workflow principal ----------
d = load("i6KGA9BvK9unjxxj"); w = d[0]
assert "Decide Handler" not in [n["name"] for n in w["nodes"]], "patch déjà appliqué"

q1 = by_name(w, "SQL_query_1")
q1["parameters"]["query"] = q1["parameters"]["query"].replace(
    "RETURNING id;", "RETURNING id, status, human_last_action_at, owner_alerted_at;")
assert "owner_alerted_at" in q1["parameters"]["query"]

q2 = by_name(w, "SQL_query_2")
# Ne dépend plus de l'item entrant (qui peut venir de Decide Handler, Resume AI
# ou de la sortie d'erreur de Decide Handler).
q2["parameters"]["options"]["queryReplacement"] = "={{ $('SQL_query_1').item.json.id }}"

x, y = q1["position"]
DECIDE = r"""
// Qui répond à ce message ? (spec 2026-09-27 reprise manuelle)
// escalated + dernière action humaine < 2 h -> mode humain (l'IA se tait)
// escalated + >= 2 h (ou jamais d'action humaine) -> l'IA reprend la main
const c = $input.first().json;
const HUMAN_HOLD_MS = 2 * 60 * 60 * 1000;
if (c.status !== 'escalated') return [{ json: { ...c, mode: 'ai' } }];
const last = c.human_last_action_at ? new Date(c.human_last_action_at).getTime() : null;
if (last && Date.now() - last < HUMAN_HOLD_MS) return [{ json: { ...c, mode: 'human' } }];
return [{ json: { ...c, mode: 'resume' } }];
"""
ALERT_BODY = r"""={{ JSON.stringify({
  messaging_product: 'whatsapp',
  to: $env.OWNER_WHATSAPP_NUMBER,
  type: 'template',
  template: {
    name: 'escalation_alert',
    language: { code: 'fr' },
    components: [{ type: 'body', parameters: [
      { type: 'text', text: $('Edit Fields').item.json.from },
      { type: 'text', text: ('Nouveau message pendant que vous avez la main : « ' + String($('Edit Fields').item.json.message_text || '').replace(/\s+/g, ' ').slice(0, 200) + ' » - Répondre : https://golden-market.co/app/whatsapp-conversations?phone=' + $('Edit Fields').item.json.from) }
    ] }]
  }
}) }}"""

new_nodes = [
    {"id": U(), "name": "Decide Handler", "type": "n8n-nodes-base.code", "typeVersion": 2,
     "position": [x + 110, y + 220], "parameters": {"jsCode": DECIDE}, "onError": "continueErrorOutput"},
    {"id": U(), "name": "Route By Handler", "type": "n8n-nodes-base.switch", "typeVersion": 3.2,
     "position": [x + 330, y + 220], "parameters": {"rules": {"values": [
         {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                         "conditions": [{"id": U(), "leftValue": "={{ $json.mode }}", "rightValue": m,
                                         "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"},
          "renameOutput": True, "outputKey": m} for m in ["ai", "resume", "human"]]}, "options": {}}},
    {"id": U(), "name": "Resume AI", "type": "n8n-nodes-base.postgres", "typeVersion": 2.5,
     "position": [x + 550, y + 220], "credentials": PG, "alwaysOutputData": True, "onError": "continueRegularOutput",
     "parameters": {"operation": "executeQuery",
                    "query": "UPDATE conversations SET status = 'active', consecutive_search_misses = 0 WHERE id = $1::uuid;",
                    "options": {"queryReplacement": "={{ [ $('SQL_query_1').item.json.id ] }}"}}},
    {"id": U(), "name": "Save Client Message Only", "type": "n8n-nodes-base.postgres", "typeVersion": 2.5,
     "position": [x + 550, y + 400], "credentials": PG, "alwaysOutputData": True, "onError": "continueRegularOutput",
     "parameters": {"operation": "executeQuery",
                    "query": "INSERT INTO messages (conversation_id, role, content, whatsapp_msg_id)\nVALUES ($1::uuid, 'user', $2, $3)\nON CONFLICT (whatsapp_msg_id) WHERE whatsapp_msg_id IS NOT NULL DO NOTHING;",
                    "options": {"queryReplacement": "={{ [ $('SQL_query_1').item.json.id, $('Edit Fields').item.json.message_text, $('Edit Fields').item.json.whatsapp_msg_id ] }}"}}},
    {"id": U(), "name": "Should Alert Owner", "type": "n8n-nodes-base.if", "typeVersion": 2.2,
     "position": [x + 770, y + 400], "parameters": {"conditions": {
         "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
         "conditions": [{"id": U(),
             "leftValue": "={{ !$('Decide Handler').first().json.owner_alerted_at || (Date.now() - new Date($('Decide Handler').first().json.owner_alerted_at).getTime()) >= 30 * 60 * 1000 }}",
             "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
         "combinator": "and"}, "options": {}}},
    {"id": U(), "name": "Alert Owner", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.5,
     "position": [x + 990, y + 400], "onError": "continueErrorOutput",
     "parameters": {"method": "POST", "url": GRAPH, "sendHeaders": True, "headerParameters": AUTH,
                    "sendBody": True, "specifyBody": "json", "jsonBody": ALERT_BODY, "options": {}}},
    {"id": U(), "name": "Mark Owner Alerted", "type": "n8n-nodes-base.postgres", "typeVersion": 2.5,
     "position": [x + 1210, y + 400], "credentials": PG, "onError": "continueRegularOutput",
     "parameters": {"operation": "executeQuery",
                    "query": "UPDATE conversations SET owner_alerted_at = now() WHERE id = $1::uuid;",
                    "options": {"queryReplacement": "={{ [ $('SQL_query_1').item.json.id ] }}"}}},
]
w["nodes"].extend(new_nodes)
C = w["connections"]
to = lambda t: [{"node": t, "type": "main", "index": 0}]
C["SQL_query_1"] = {"main": [to("Decide Handler")]}
C["Decide Handler"] = {"main": [to("Route By Handler"), to("SQL_query_2")]}   # erreur -> IA (fail-open)
C["Route By Handler"] = {"main": [to("SQL_query_2"), to("Resume AI"), to("Save Client Message Only")]}
C["Resume AI"] = {"main": [to("SQL_query_2")]}
C["Save Client Message Only"] = {"main": [to("Should Alert Owner")]}
C["Should Alert Owner"] = {"main": [to("Alert Owner"), []]}
C["Alert Owner"] = {"main": [to("Mark Owner Alerted"), []]}

hist = by_name(w, "Code in JavaScript1")
old_map = "    role: item.json.role,\n    content: item.json.content\n"
assert old_map in hist["parameters"]["jsCode"]
hist["parameters"]["jsCode"] = hist["parameters"]["jsCode"].replace(old_map,
    "    // Réponses écrites par le propriétaire depuis l'admin : présentées\n"
    "    // comme messages de l'assistant, signalées, pour que l'IA sache ce qui\n"
    "    // a été dit ou promis quand elle reprend la main.\n"
    "    role: item.json.role === 'human' ? 'assistant' : item.json.role,\n"
    "    content: item.json.role === 'human'\n"
    "      ? '[Message de l\\'équipe Golden Market] ' + item.json.content\n"
    "      : item.json.content\n")

agent = by_name(w, "AI Agent")
assert agent["parameters"]["text"].startswith("={{ $json.history.length")
NOTE = ("{{ (() => { try { return $('Decide Handler').first().json.mode === 'resume' ? "
        "'Note interne : un membre de l\\'équipe avait pris la main mais n\\'a pas répondu depuis plus de 2 h. "
        "Reprends la conversation avec tact, sans contredire ce que l\\'équipe a dit.\\n\\n' : '' } "
        "catch (e) { return '' } })() }}")
agent["parameters"]["text"] = "=" + NOTE + agent["parameters"]["text"][1:]

json.dump(d, open("main-patched.json", "w"), ensure_ascii=False)

# ---------- find_products : Mark Escalated ----------
d = load("s6Ef6xBRxBeF6dgW"); w = d[0]
me = by_name(w, "Mark Escalated")
assert me["parameters"]["query"] == "UPDATE conversations SET status = 'escalated' WHERE id = $1::uuid;"
me["parameters"]["query"] = "UPDATE conversations SET status = 'escalated', human_last_action_at = now() WHERE id = $1::uuid;"
json.dump(d, open("find-products-patched.json", "w"), ensure_ascii=False)

# ---------- escalate_to_human : poser le statut ----------
d = load("ho253xg11t9NVxX7"); w = d[0]
assert "Mark Escalated" not in [n["name"] for n in w["nodes"]]
http = by_name(w, "HTTP Request")
w["nodes"].append({"id": U(), "name": "Mark Escalated", "type": "n8n-nodes-base.postgres", "typeVersion": 2.5,
    "position": [http["position"][0] + 220, http["position"][1] + 200], "credentials": PG,
    "alwaysOutputData": True, "onError": "continueRegularOutput",
    "parameters": {"operation": "executeQuery",
                   "query": "UPDATE conversations SET status = 'escalated', human_last_action_at = now() WHERE id = $1::uuid;",
                   "options": {"queryReplacement": "={{ [ $('When Executed by Another Workflow').first().json.conversation_id ] }}"}}})
# Les deux sorties du HTTP (succès et erreur) passent par Mark Escalated puis
# le message au client - l'écriture ne bloque jamais la réponse.
w["connections"]["HTTP Request"] = {"main": [[{"node": "Mark Escalated", "type": "main", "index": 0}]] * 2}
w["connections"]["Mark Escalated"] = {"main": [[{"node": "Code in JavaScript", "type": "main", "index": 0}]]}
json.dump(d, open("escalate-patched.json", "w"), ensure_ascii=False)
print("patches ok")
```

Run: `python3 patch_main_workflow.py` — Expected : `patches ok` (toutes les assertions passent ; si une assertion échoue, le workflow a changé depuis l'écriture du plan : relire le nœud concerné avant d'adapter).

- [ ] **Step 3: Importer et publier les trois workflows**

```bash
for f in main-patched find-products-patched escalate-patched; do scp $f.json admin@144.91.110.105:/tmp/$f.json; done
ssh admin@144.91.110.105 'for f in main-patched find-products-patched escalate-patched; do docker cp /tmp/$f.json golden_market_n8n:/tmp/$f.json && docker exec golden_market_n8n n8n import:workflow --input=/tmp/$f.json | tail -1; rm -f /tmp/$f.json; done; for id in i6KGA9BvK9unjxxj s6Ef6xBRxBeF6dgW ho253xg11t9NVxX7; do docker exec golden_market_n8n n8n publish:workflow --id=$id | grep -i publish; done; docker restart golden_market_n8n'
```
Puis vérifier que les 13 workflows actifs le sont toujours :
```bash
ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); sleep 20; docker exec $C psql -U $U -d golden_market -At -c "SELECT name FROM n8n.workflow_entity WHERE active AND \"activeVersionId\" = \"versionId\" ORDER BY name;"'
```
Expected : les 12 workflows actifs d'avant + `Admin - actions conversation`.

- [ ] **Step 4: Tester le mode humain par webhooks signés (numéro fictif 22600000099)**

Helper d'envoi de message client signé (même recette que le guide § 4) :
```bash
cat > client.sh <<'EOF'
#!/bin/bash
ssh admin@144.91.110.105 "SECRET=\$(docker exec golden_market_n8n printenv WHATSAPP_APP_SECRET); BODY='{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"22600000099\",\"id\":\"wamid.TESTHUMAN'\$(date +%s%N)'\",\"text\":{\"body\":\"$1\"}}]}}]}]}'; SIG=\$(printf %s \"\$BODY\" | openssl dgst -sha256 -hmac \"\$SECRET\" | sed 's/^.* //'); curl -s -o /dev/null -w '%{http_code}\n' -X POST https://n8n.golden-market.co/webhook/whatsapp -H 'Content-Type: application/json' -H \"X-Hub-Signature-256: sha256=\$SIG\" -d \"\$BODY\""
EOF
chmod +x client.sh
state() { ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -At -c "SELECT status, owner_alerted_at IS NOT NULL FROM conversations WHERE phone_number='"'"'22600000099'"'"';" -c "SELECT role, left(content,80) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.phone_number='"'"'22600000099'"'"' ORDER BY seq;"'; }
```
Scénarios (attendre ~40 s après chaque message client) :
1. `./client.sh "Bonjour"` → `state` : `active`, messages `user` + `assistant` (comportement IA inchangé).
2. `./act.sh '{"action":"take_over","phone_number":"22600000099"}'` puis `./client.sh "Vous êtes là ?"` → `state` : `escalated|t`, dernier message `user|Vous êtes là ?` **sans** `assistant` après ; **une** alerte reçue sur le WhatsApp du propriétaire avec le lien.
3. `./client.sh "Allô ?"` → dernier message `user|Allô ?`, pas d'`assistant`, **pas de seconde alerte** (moins de 30 min).
4. Filet de 2 h : antidater puis écrire :
   ```bash
   ssh admin@144.91.110.105 'C=golden_market_postgres; U=$(docker exec $C printenv POSTGRES_USER); docker exec $C psql -U $U -d golden_market -c "UPDATE conversations SET human_last_action_at = now() - interval '"'"'3 hours'"'"' WHERE phone_number='"'"'22600000099'"'"';"'
   ./client.sh "Toujours personne ?"
   ```
   → `state` : `active`, un `assistant` répond ; lire sa réponse : elle reprend la conversation sans mentionner la « note interne ».
5. Historique humain vu par l'IA : `./act.sh '{"action":"send_text","phone_number":"22600000099","text":"Je vous fais 10% de remise sur le ventilateur."}'`, `./act.sh '{"action":"hand_back","phone_number":"22600000099"}'`, `./client.sh "Ok, c'est combien du coup avec la remise ?"` → la réponse `assistant` tient compte de la remise annoncée par l'équipe.
6. Escalade par l'IA : `./client.sh "Je veux parler à un humain tout de suite"` → `state` : `escalated` (posé par `escalate_to_human`), alerte d'escalade reçue ; puis `./client.sh "Merci"` → pas de réponse `assistant`.

- [ ] **Step 5: Nettoyer la conversation de test**

Même commande que la Task 7 Step 5.

- [ ] **Step 6: Pas de commit** (workflows non versionnés ; la documentation est mise à jour en Task 10). Conserver `backup-*.json` dans le scratchpad jusqu'à la fin du chantier (retour arrière : réimporter le backup + `publish:workflow` + `docker restart`).

---

### Task 9: Déploiement Medusa et vérification de bout en bout

**Files:**
- Modify (VPS) : `/opt/golden-market/production/apps/backend/.env`

- [ ] **Step 1: Renseigner les variables de production (sans afficher le secret)**

```bash
ssh admin@144.91.110.105 'S=$(docker exec golden_market_n8n printenv N8N_ADMIN_ACTIONS_WEBHOOK_SECRET); F=/opt/golden-market/production/apps/backend/.env; grep -q "^N8N_ADMIN_ACTIONS_WEBHOOK_URL=" $F || printf "N8N_ADMIN_ACTIONS_WEBHOOK_URL=https://n8n.golden-market.co/webhook/admin-conversation-action\nN8N_ADMIN_ACTIONS_WEBHOOK_SECRET=%s\n" "$S" >> $F; grep -c "^N8N_ADMIN_ACTIONS_WEBHOOK" $F'
```
Expected : `2`.

- [ ] **Step 2: Suite complète puis déploiement**

```bash
cd apps/backend && npm run test:unit 2>&1 | grep -E "^Tests:|✕"
cd ../.. && git push origin staging && git push origin staging:main
```
Expected : tous les tests passent. Attendre que le conteneur `production-golden-market-backend` soit recréé (le nouveau `.env` n'est lu qu'à la recréation) :
```bash
ssh admin@144.91.110.105 'docker exec production-golden-market-backend sh -c "test -n \"\$N8N_ADMIN_ACTIONS_WEBHOOK_URL\" && ls /app/src/api/admin/whatsapp-conversations/*/take-over/route.js"'
```
Expected : le chemin du fichier (sinon attendre le déploiement / relancer la commande).

- [ ] **Step 3: Vérifier dans le navigateur (admin de production, ordinateur puis largeur mobile)**

Recréer la conversation de test (Task 7 Step 4, premier bloc SQL, avec `created_at = now()`), puis ouvrir `https://golden-market.co/app/whatsapp-conversations?phone=22600000099` (Chrome, session admin du propriétaire) et vérifier :
1. La conversation s'ouvre directement ; en-tête « L'IA répond automatiquement · encore 23 h … pour répondre librement ».
2. « Prendre la main » → libellé « Vous avez la main — l'IA ne répond pas » ; badge « Vous avez la main » dans la liste.
3. Taper un texte, attendre 15 s (au moins un rafraîchissement) : **le texte tapé est toujours là** (Review Focus 2). Envoyer : bulle « Vous » bleue ; le bouton est désactivé pendant l'envoi (Review Focus 4).
4. Antidater le message client de 25 h (SQL Task 7 Step 4) ; au rafraîchissement suivant, la zone de saisie est remplacée par le bouton de relance.
5. « Rendre la main à l'IA » → libellé revenu à « L'IA répond automatiquement ».
6. `?phone=22600000000` → « Conversation introuvable. » (Review Focus 3).
7. Fenêtre réduite à 390 px de large : liste seule ; clic → conversation seule avec « ← Retour » ; retour → liste.

- [ ] **Step 4: Nettoyer** (Task 7 Step 5).

---

### Task 10: Documentation

**Files:**
- Modify: `/home/abdazz/CODE/perso/golden_market_projects/n8n_automation/guide-golden-market-agent.md` (§ État actuel, § 2 schéma, nouvelle § 2.9 « Reprise manuelle », § 3 Historique, Anomalies)
- Modify: `/home/abdazz/CODE/perso/golden_market_projects/n8n_automation/AGENTS.md` (statuts `conversations`, rôle `human`, nouveau workflow, variable)
- Modify: `AGENTS.md` (dépôt Medusa : variables `N8N_ADMIN_ACTIONS_WEBHOOK_*`, visualiseur désormais en écriture via n8n)
- Modify: `HANDOFF.md` (entrée datée en tête de « Dernière mise à jour »)

- [ ] **Step 1: Guide n8n** — ajouter une section « 2.9 Reprise manuelle depuis l'admin Medusa » décrivant : sémantique de `escalated` (humain a la main), colonnes `human_last_action_at`/`owner_alerted_at`, rôle `human`, chaîne `SQL_query_1 → Decide Handler → Route By Handler (ai | resume | human)`, alerte plafonnée, filet de 2 h, workflow `Admin - actions conversation` (id `AdmConvAction7Qx`, actions, codes de réponse, secret), template `reprise_conversation` (id et catégorie notés en Task 1), et le fait qu'`escalate_to_human` pose désormais le statut. Mettre à jour le schéma ASCII du § 2 et ajouter l'entrée `2026-09-27` à l'historique.
- [ ] **Step 2: `AGENTS.md` n8n et Medusa** — une puce chacun pointant vers la spec.
- [ ] **Step 3: `HANDOFF.md`** — entrée `2026-09-27` : ce qui a été livré, vérifications faites (Tasks 7-9), catégorie Meta du template, limites acceptées (médias client non affichés, double envoi théorique hors bouton).
- [ ] **Step 4: Commits**

```bash
cd /home/abdazz/CODE/perso/golden_market_projects/n8n_automation && git add guide-golden-market-agent.md AGENTS.md && git commit -m "docs(agent): reprise manuelle des conversations depuis l'admin Medusa" && git push
cd /home/abdazz/CODE/perso/golden_market_projects/medusa-golden-market && git add AGENTS.md HANDOFF.md && git commit -m "docs(handoff): reprise manuelle des conversations WhatsApp" && git push origin staging && git push origin staging:main
```
