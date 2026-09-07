# Visualisation des conversations WhatsApp — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page dans l'admin Medusa qui liste les conversations WhatsApp (base `golden_market`, propriété de `n8n_automation`) et affiche le fil complet de chacune, en lecture seule.

**Architecture:** Un client de lecture (`pg.Pool` injectable) dans `apps/backend/src/lib/`, deux routes admin fines qui l'appellent, une page admin (liste + détail, état local, pas de routing imbriqué). Aucun module Medusa complet : c'est une lecture de reporting sur une base externe, jamais une écriture ni une entité du domaine Medusa.

**Tech Stack:** Medusa v2 (`@medusajs/framework`, `@medusajs/admin-sdk`, `@medusajs/icons`), driver `pg`, Jest (`@swc/jest`), React 18 (contrainte admin, voir Contraintes globales).

**Spec:** `docs/superpowers/specs/2026-09-07-whatsapp-conversations-viewer-design.md`

## Contraintes globales

- Aucun point-virgule, guillemets doubles, indentation 2 espaces (ESLint `@medusajs/eslint-plugin`, voir `AGENTS.md`).
- Commentaires, messages de commit et documentation en français (convention Golden Market).
- Jamais de trailer `Co-Authored-By: Claude` dans les commits.
- **Exception documentée et approuvée à la règle « pas de SQL brut / client DB direct »** (`AGENTS.md`, Erreurs courantes) : `whatsapp-chat-db.ts` interroge une base **externe** à Medusa (`golden_market`, propriété de `n8n_automation`), qui n'a ni module ni entité de domaine côté Medusa — un module Medusa serait une sur-ingénierie pour une lecture de reporting pure. Cette exception ne s'étend à rien d'autre : toute donnée du domaine Medusa lui-même continue de passer par ses modules/workflows.
- **Lecture seule stricte** : aucune requête `INSERT`/`UPDATE`/`DELETE` dans ce plan, sur aucune table. Le rôle Postgres utilisé en production (`medusa_whatsapp_reader`, créé hors de ce dépôt — voir spec) ne peut de toute façon pas écrire.
- `WHATSAPP_CHAT_DATABASE_URL` : jamais commitée avec une vraie valeur, uniquement documentée vide dans `.env.template`.
- Composants admin : ne jamais importer de `@medusajs/ui` (`Container`, `Heading`, `Text`, etc.) — conflit de types React 18/19 déjà rencontré et documenté dans `apps/backend/src/admin/widgets/analytics-summary.tsx`. Utiliser des éléments HTML natifs avec les classes utilitaires Medusa (`txt-*`, `text-ui-fg-*`, `bg-ui-bg-*`, `border-ui-border-base`) pour un rendu visuellement cohérent avec le reste de l'admin.

---

## Task 1 : Dépendances (`pg`, `@types/pg`, `@medusajs/icons`)

**Files:**
- Modify: `apps/backend/package.json`

**Interfaces:**
- Produces: le paquet `pg` (driver Postgres) et ses types, importables dans tout `apps/backend/src/**` ; `@medusajs/icons` déclaré explicitement (déjà résolu de façon transitive via `@medusajs/admin-sdk`, mais jamais importé directement dans ce dépôt jusqu'ici).

- [ ] **Step 1 : Ajouter les dépendances**

Dans `apps/backend/package.json`, section `"dependencies"` (ordre alphabétique existant) :
```json
    "@medusajs/icons": "2.18.0",
```
juste après `"@medusajs/framework": "2.18.0",` et avant `"@medusajs/medusa": "2.18.0",`. Puis, dans la même section, après `"exceljs": "^4.4.0",` :
```json
    "pg": "^8.11.3",
```

Dans `"devDependencies"`, après `"@medusajs/test-utils": "2.18.0",` :
```json
    "@types/pg": "^8.11.0",
```

- [ ] **Step 2 : Installer**

Depuis la racine du dépôt (workspace npm) :
```bash
npm install
```

- [ ] **Step 3 : Vérifier la résolution**

```bash
node -e "console.log(require('pg/package.json').version, require('@medusajs/icons/package.json').version)"
```
Attendu : deux numéros de version affichés sans erreur (ex. `8.11.x 2.18.0`).

- [ ] **Step 4 : Commit**

```bash
git add apps/backend/package.json package-lock.json
git commit -m "deps: ajoute pg et @medusajs/icons pour le visualiseur de conversations WhatsApp"
```

---

## Task 2 : Client de lecture `whatsapp-chat-db.ts`

**Files:**
- Create: `apps/backend/src/lib/whatsapp-chat-db.ts`
- Test: `apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts`

**Interfaces:**
- Consumes: rien (module autonome, dépend seulement de `pg` et de `process.env.WHATSAPP_CHAT_DATABASE_URL`).
- Produces (consommé par Task 3) :
  ```ts
  export type ConversationSummary = {
    phoneNumber: string
    customerName: string | null
    status: string
    lastMessageAt: Date
    lastMessagePreview: string | null
    messageCount: number
  }

  export type ChatMessage = {
    role: "user" | "assistant" | "system"
    content: string
    createdAt: Date
  }

  export type QueryExecutor = {
    query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  }

  export function listConversations(
    search?: string,
    executor?: QueryExecutor | null
  ): Promise<ConversationSummary[] | null>

  export function getConversationMessages(
    phoneNumber: string,
    executor?: QueryExecutor | null
  ): Promise<ChatMessage[] | null>
  ```
  `null` en retour signifie toujours « indisponible » (pas de connexion configurée, ou requête en échec) — jamais d'exception non catchée à charge de l'appelant.

### Step 1 : Écrire les tests (ils doivent échouer)

- [ ] Créer `apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts` :

```ts
import { getConversationMessages, listConversations } from "../whatsapp-chat-db"

describe("listConversations", () => {
  it("returns null when no executor is configured", async () => {
    const result = await listConversations(undefined, null)

    expect(result).toBeNull()
  })

  it("maps rows into conversation summaries, converting the bigint message count", async () => {
    const lastMessageAt = new Date("2026-09-07T10:00:00Z")
    const queryMock = jest.fn().mockResolvedValue({
      rows: [
        {
          phone_number: "+22670000000",
          customer_name: "Awa",
          status: "active",
          last_message_at: lastMessageAt,
          last_message_preview: "Merci, à bientôt !",
          // pg renvoie COUNT(*) en chaîne (bigint) - jamais un number natif
          message_count: "4",
        },
      ],
    })

    const result = await listConversations(undefined, { query: queryMock })

    expect(result).toEqual([
      {
        phoneNumber: "+22670000000",
        customerName: "Awa",
        status: "active",
        lastMessageAt,
        lastMessagePreview: "Merci, à bientôt !",
        messageCount: 4,
      },
    ])
  })

  it("passes null (never undefined) as the search bind parameter when no search is given", async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })

    await listConversations(undefined, { query: queryMock })

    // pg lève une erreur si un paramètre lié vaut `undefined` - null uniquement.
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [null])
  })

  it("passes the search term through as the bind parameter", async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })

    await listConversations("+22670", { query: queryMock })

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["+22670"])
  })

  it("returns null when the query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    const result = await listConversations(undefined, { query: queryMock })

    expect(result).toBeNull()
  })

  it("handles a null last_message_preview and null customer_name", async () => {
    const queryMock = jest.fn().mockResolvedValue({
      rows: [
        {
          phone_number: "+22670000001",
          customer_name: null,
          status: "active",
          last_message_at: new Date("2026-09-07T10:00:00Z"),
          last_message_preview: null,
          message_count: "0",
        },
      ],
    })

    const result = await listConversations(undefined, { query: queryMock })

    expect(result?.[0].customerName).toBeNull()
    expect(result?.[0].lastMessagePreview).toBeNull()
    expect(result?.[0].messageCount).toBe(0)
  })
})

describe("getConversationMessages", () => {
  it("returns null when no executor is configured", async () => {
    const result = await getConversationMessages("+22670000000", null)

    expect(result).toBeNull()
  })

  it("maps rows into chat messages, preserving query order", async () => {
    const queryMock = jest.fn().mockResolvedValue({
      rows: [
        { role: "user", content: "Bonjour", created_at: new Date("2026-09-07T10:00:00Z") },
        {
          role: "assistant",
          content: "Bonjour, comment puis-je vous aider ?",
          created_at: new Date("2026-09-07T10:00:01Z"),
        },
      ],
    })

    const result = await getConversationMessages("+22670000000", { query: queryMock })

    expect(result).toEqual([
      { role: "user", content: "Bonjour", createdAt: new Date("2026-09-07T10:00:00Z") },
      {
        role: "assistant",
        content: "Bonjour, comment puis-je vous aider ?",
        createdAt: new Date("2026-09-07T10:00:01Z"),
      },
    ])
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["+22670000000"])
  })

  it("returns null when the query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    const result = await getConversationMessages("+22670000000", { query: queryMock })

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-chat-db.unit.spec.ts
```
Attendu : ÉCHEC — `Cannot find module '../whatsapp-chat-db'`.

- [ ] **Step 3 : Implémenter**

Créer `apps/backend/src/lib/whatsapp-chat-db.ts` :

```ts
import { Pool } from "pg"

// Client de lecture seule vers la base golden_market (propriété du dépôt
// n8n_automation, jamais écrite ici) - voir docs/superpowers/specs/
// 2026-09-07-whatsapp-conversations-viewer-design.md. N'utilise jamais le
// système de modules Medusa : ce n'est pas une entité du domaine Medusa,
// juste une lecture de reporting sur une base externe.

export type QueryExecutor = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export type ConversationSummary = {
  phoneNumber: string
  customerName: string | null
  status: string
  lastMessageAt: Date
  lastMessagePreview: string | null
  messageCount: number
}

export type ChatMessage = {
  role: "user" | "assistant" | "system"
  content: string
  createdAt: Date
}

let pool: Pool | null | undefined

// Instancié une seule fois, à la première utilisation - jamais en dev/staging,
// où WHATSAPP_CHAT_DATABASE_URL est absente par construction (le chatbot
// WhatsApp n'existe qu'en production, un seul environnement n8n réel).
function getDefaultExecutor(): QueryExecutor | null {
  if (pool === undefined) {
    const databaseUrl = process.env.WHATSAPP_CHAT_DATABASE_URL
    pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
  }

  return pool
}

const LIST_CONVERSATIONS_QUERY = `
  SELECT
    c.phone_number,
    c.customer_name,
    c.status,
    c.last_message_at,
    m.content AS last_message_preview,
    COALESCE(mc.message_count, 0) AS message_count
  FROM conversations c
  LEFT JOIN LATERAL (
    SELECT content FROM messages WHERE conversation_id = c.id ORDER BY seq DESC LIMIT 1
  ) m ON true
  LEFT JOIN (
    SELECT conversation_id, COUNT(*) AS message_count FROM messages GROUP BY conversation_id
  ) mc ON mc.conversation_id = c.id
  WHERE ($1::text IS NULL OR c.phone_number ILIKE '%' || $1 || '%')
  ORDER BY c.last_message_at DESC
`

export async function listConversations(
  search?: string,
  executor: QueryExecutor | null = getDefaultExecutor()
): Promise<ConversationSummary[] | null> {
  if (!executor) {
    return null
  }

  try {
    const result = await executor.query(LIST_CONVERSATIONS_QUERY, [search ?? null])

    return result.rows.map((row) => ({
      phoneNumber: row.phone_number as string,
      customerName: (row.customer_name as string | null) ?? null,
      status: row.status as string,
      lastMessageAt: row.last_message_at as Date,
      lastMessagePreview: (row.last_message_preview as string | null) ?? null,
      // COUNT(*) revient en bigint -> chaîne côté driver pg, jamais un number natif.
      messageCount: Number(row.message_count),
    }))
  } catch {
    return null
  }
}

const GET_CONVERSATION_MESSAGES_QUERY = `
  SELECT m.role, m.content, m.created_at
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.phone_number = $1
  ORDER BY m.seq ASC
`

export async function getConversationMessages(
  phoneNumber: string,
  executor: QueryExecutor | null = getDefaultExecutor()
): Promise<ChatMessage[] | null> {
  if (!executor) {
    return null
  }

  try {
    const result = await executor.query(GET_CONVERSATION_MESSAGES_QUERY, [phoneNumber])

    return result.rows.map((row) => ({
      role: row.role as ChatMessage["role"],
      content: row.content as string,
      createdAt: row.created_at as Date,
    }))
  } catch {
    return null
  }
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-chat-db.unit.spec.ts
```
Attendu : 10/10 tests verts.

- [ ] **Step 5 : Lint**

```bash
cd apps/backend && npm run lint
```
Attendu : aucune nouvelle erreur sur les fichiers créés.

- [ ] **Step 6 : Commit**

```bash
git add apps/backend/src/lib/whatsapp-chat-db.ts apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts
git commit -m "feat(whatsapp-chat): ajoute le client de lecture seule vers golden_market"
```

---

## Task 3 : Routes admin

**Files:**
- Create: `apps/backend/src/api/admin/whatsapp-conversations/route.ts`
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/route.ts`

**Interfaces:**
- Consumes: `listConversations`, `getConversationMessages`, `ConversationSummary`, `ChatMessage` (Task 2).
- Produces (consommé par Task 4) : deux endpoints JSON, protégés automatiquement par l'auth admin Medusa (préfixe `/admin`, aucune configuration supplémentaire requise) :
  - `GET /admin/whatsapp-conversations?q=<recherche optionnelle>` →
    `{ available: false } | { available: true, conversations: ConversationSummary[] }`
  - `GET /admin/whatsapp-conversations/:phone` →
    `{ available: false } | { available: true, messages: ChatMessage[] }`

Pas de test dédié pour ces routes : même précédent que
`apps/backend/src/api/admin/analytics-summary/route.ts`, un wrapper fin
sans logique propre n'a pas de suite Jest dans ce dépôt (la logique
testée vit dans le lib de Task 2).

- [ ] **Step 1 : Route liste**

Créer `apps/backend/src/api/admin/whatsapp-conversations/route.ts` :

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listConversations } from "../../../lib/whatsapp-chat-db"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const search = typeof req.query.q === "string" ? req.query.q : undefined
  const conversations = await listConversations(search)

  if (conversations === null) {
    res.json({ available: false })
    return
  }

  res.json({ available: true, conversations })
}
```

- [ ] **Step 2 : Route détail**

Créer `apps/backend/src/api/admin/whatsapp-conversations/[phone]/route.ts` :

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getConversationMessages } from "../../../../lib/whatsapp-chat-db"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const phoneNumber = req.params.phone
  const messages = await getConversationMessages(phoneNumber)

  if (messages === null) {
    res.json({ available: false })
    return
  }

  res.json({ available: true, messages })
}
```

**Piège déjà rencontré sur ce projet avec un handle contenant des
caractères spéciaux** (accents, ici un `+` de numéro E.164) : le segment
`[phone]` est décodé automatiquement par le routeur Medusa (comportement
de framework standard, comme pour toute route `[param]` de type
Next/Express) — ne jamais ajouter de `decodeURIComponent` manuel ici, ce
serait un double-décodage. C'est côté appelant (Task 4) qu'il faut
`encodeURIComponent` le numéro en construisant l'URL.

- [ ] **Step 3 : Démarrer le backend et vérifier manuellement le contrat JSON**

```bash
cd apps/backend && npm run dev
```
Dans un autre terminal, une fois le serveur prêt et après connexion admin
(cookie de session déjà nécessaire — utiliser un navigateur ou `curl` avec
un jeton admin existant) :
```bash
curl -s http://localhost:9001/admin/whatsapp-conversations \
  -H "Authorization: Bearer <jeton admin de dev>"
```
Attendu, sans `WHATSAPP_CHAT_DATABASE_URL` positionnée en local :
`{"available":false}`. C'est le comportement voulu (spec : indisponible
en dev/staging par construction).

- [ ] **Step 4 : Commit**

```bash
git add apps/backend/src/api/admin/whatsapp-conversations
git commit -m "feat(whatsapp-chat): ajoute les routes admin liste/détail des conversations"
```

---

## Task 4 : Page admin (liste + détail)

**Files:**
- Create: `apps/backend/src/admin/routes/whatsapp-conversations/page.tsx`

**Interfaces:**
- Consumes (via `fetch`, pas d'import direct) : les deux routes de Task 3, avec les mêmes formes JSON.
- Produces : un nouvel item de navigation « Conversations WhatsApp » dans le menu latéral de l'admin Medusa.

- [ ] **Step 1 : Créer la page**

Créer `apps/backend/src/admin/routes/whatsapp-conversations/page.tsx` :

```tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { useEffect, useState } from "react"

// Page admin de visualisation en lecture seule des conversations WhatsApp
// (base golden_market, propriété de n8n_automation) - voir
// docs/superpowers/specs/2026-09-07-whatsapp-conversations-viewer-design.md.
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
}

type ChatMessage = {
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
}

type ListResponse = { available: false } | { available: true; conversations: ConversationSummary[] }
type DetailResponse = { available: false } | { available: true; messages: ChatMessage[] }

const roleLabel = (role: ChatMessage["role"]) =>
  role === "user" ? "Client" : role === "assistant" ? "IA" : "Système"

const ConversationDetail = ({ phoneNumber, onBack }: { phoneNumber: string; onBack: () => void }) => {
  const [detail, setDetail] = useState<DetailResponse | null>(null)

  useEffect(() => {
    setDetail(null)
    fetch(`/admin/whatsapp-conversations/${encodeURIComponent(phoneNumber)}`, { credentials: "include" })
      .then((res) => res.json())
      .then(setDetail)
      .catch(() => setDetail({ available: false }))
  }, [phoneNumber])

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <button
        type="button"
        onClick={onBack}
        className="txt-compact-small text-ui-fg-interactive mb-4"
      >
        ← Retour à la liste
      </button>

      <h1 className="text-ui-fg-base txt-large-plus mb-4">{phoneNumber}</h1>

      {detail === null && <p className="text-ui-fg-subtle">Chargement…</p>}
      {detail && !detail.available && (
        <p className="text-ui-fg-subtle">Conversation indisponible pour le moment.</p>
      )}
      {detail?.available && detail.messages.length === 0 && (
        <p className="text-ui-fg-subtle">Aucun message dans cette conversation.</p>
      )}
      {detail?.available && detail.messages.length > 0 && (
        <div className="flex flex-col gap-y-3">
          {detail.messages.map((message, index) => (
            <div key={index} className="flex flex-col gap-y-1 border-b border-ui-border-base pb-2">
              <span className="txt-compact-small text-ui-fg-subtle">
                {roleLabel(message.role)} · {new Date(message.createdAt).toLocaleString("fr-FR")}
              </span>
              <p className="text-ui-fg-base txt-compact-small whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ConversationList = ({ onSelect }: { onSelect: (phoneNumber: string) => void }) => {
  const [search, setSearch] = useState("")
  const [list, setList] = useState<ListResponse | null>(null)

  useEffect(() => {
    const query = search ? `?q=${encodeURIComponent(search)}` : ""
    fetch(`/admin/whatsapp-conversations${query}`, { credentials: "include" })
      .then((res) => res.json())
      .then(setList)
      .catch(() => setList({ available: false }))
  }, [search])

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <h1 className="text-ui-fg-base txt-large-plus mb-4">Conversations WhatsApp</h1>

      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Rechercher par numéro de téléphone"
        className="txt-compact-small border border-ui-border-base rounded-md px-3 py-2 mb-4 w-full max-w-sm"
      />

      {list === null && <p className="text-ui-fg-subtle">Chargement…</p>}
      {list && !list.available && (
        <p className="text-ui-fg-subtle">Conversations indisponibles pour le moment.</p>
      )}
      {list?.available && list.conversations.length === 0 && (
        <p className="text-ui-fg-subtle">Aucune conversation trouvée.</p>
      )}
      {list?.available && list.conversations.length > 0 && (
        <table className="w-full txt-compact-small">
          <thead>
            <tr className="text-left text-ui-fg-subtle">
              <th className="pb-2 pr-4">Numéro</th>
              <th className="pb-2 pr-4">Dernier message</th>
              <th className="pb-2 pr-4">Messages</th>
              <th className="pb-2">Dernière activité</th>
            </tr>
          </thead>
          <tbody>
            {list.conversations.map((conversation) => (
              <tr
                key={conversation.phoneNumber}
                onClick={() => onSelect(conversation.phoneNumber)}
                className="cursor-pointer border-t border-ui-border-base hover:bg-ui-bg-subtle"
              >
                <td className="py-2 pr-4 text-ui-fg-base">{conversation.phoneNumber}</td>
                <td className="py-2 pr-4 text-ui-fg-subtle">{conversation.lastMessagePreview ?? "—"}</td>
                <td className="py-2 pr-4 text-ui-fg-subtle">{conversation.messageCount}</td>
                <td className="py-2 text-ui-fg-subtle">
                  {new Date(conversation.lastMessageAt).toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const WhatsappConversationsPage = () => {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

  return selectedPhone ? (
    <ConversationDetail phoneNumber={selectedPhone} onBack={() => setSelectedPhone(null)} />
  ) : (
    <ConversationList onSelect={setSelectedPhone} />
  )
}

export const config = defineRouteConfig({
  label: "Conversations WhatsApp",
  icon: ChatBubbleLeftRight,
})

export default WhatsappConversationsPage
```

- [ ] **Step 2 : Vérification visuelle locale (base golden_market factice)**

Pas de suite automatisée pour les pages admin dans ce dépôt (même
précédent que `widgets/analytics-summary.tsx`, jamais testé
automatiquement) — vérification manuelle obligatoire, avec de vraies
données passant par le vrai chemin HTTP (pas une lecture de code).

Sur la stack de dev déjà démarrée (`docker compose up -d` à la racine,
backend `npm run dev` depuis `apps/backend`) :

```bash
# Conteneur Postgres jetable, isolé du Postgres Medusa, juste pour ce test
docker run -d --name whatsapp_chat_test_db \
  -e POSTGRES_DB=golden_market -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -p 127.0.0.1:5555:5432 postgres:16-alpine

sleep 3

docker exec -i whatsapp_chat_test_db psql -U test -d golden_market <<'EOF'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number    TEXT NOT NULL UNIQUE,
    customer_name   TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT NOT NULL,
    content          TEXT NOT NULL,
    whatsapp_msg_id  TEXT,
    seq              BIGSERIAL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO conversations (phone_number, customer_name, status)
VALUES ('+22670000000', 'Awa Traoré', 'active');

INSERT INTO messages (conversation_id, role, content)
SELECT id, 'user', 'Bonjour, avez-vous le diffuseur en stock ?' FROM conversations;
INSERT INTO messages (conversation_id, role, content)
SELECT id, 'assistant', 'Oui, il est disponible à 3 000 FCFA.' FROM conversations;
EOF
```

Puis, dans `apps/backend/.env` (fichier de dev local, jamais commité) :
```
WHATSAPP_CHAT_DATABASE_URL=postgres://test:test@localhost:5555/golden_market
```
Redémarrer `npm run dev`, ouvrir `http://localhost:9001/app/whatsapp-conversations`
dans un navigateur connecté à l'admin. Vérifier :
1. L'item « Conversations WhatsApp » apparaît dans le menu latéral.
2. La ligne `+22670000000` s'affiche avec l'aperçu du dernier message
   (« Oui, il est disponible à 3 000 FCFA. ») et `messageCount: 2`.
3. Cliquer sur la ligne affiche les deux messages dans le bon ordre
   (client puis IA), avec les bons libellés de rôle.
4. Retirer `WHATSAPP_CHAT_DATABASE_URL` du `.env`, redémarrer : la page
   affiche « Conversations indisponibles pour le moment. » (pas d'écran
   blanc, pas d'erreur console).

Nettoyer ensuite :
```bash
docker stop whatsapp_chat_test_db && docker rm whatsapp_chat_test_db
```
et retirer la ligne `WHATSAPP_CHAT_DATABASE_URL` ajoutée au `.env` local.

- [ ] **Step 3 : Lint**

```bash
cd apps/backend && npm run lint
```

- [ ] **Step 4 : Commit**

```bash
git add apps/backend/src/admin/routes/whatsapp-conversations
git commit -m "feat(whatsapp-chat): ajoute la page admin de visualisation des conversations"
```

---

## Task 5 : Documentation `.env.template`

**Files:**
- Modify: `apps/backend/.env.template`

- [ ] **Step 1 : Ajouter la section**

Ajouter à la fin de `apps/backend/.env.template` :

```
# --- Visualisation des conversations WhatsApp (admin Medusa) ---
# Connexion LECTURE SEULE vers la base golden_market (propriété du dépôt
# n8n_automation, hébergée par son propre conteneur Postgres). Vide en
# dev/staging par construction (le chatbot WhatsApp n'existe qu'en
# production) - la page admin affiche alors "indisponible" au lieu de
# planter. Voir docs/superpowers/specs/
# 2026-09-07-whatsapp-conversations-viewer-design.md pour la création du
# rôle Postgres dédié (medusa_whatsapp_reader, SELECT uniquement sur
# public.conversations/public.messages) et du réseau Docker partagé
# nécessaire pour l'atteindre.
WHATSAPP_CHAT_DATABASE_URL=
```

- [ ] **Step 2 : Commit**

```bash
git add apps/backend/.env.template
git commit -m "docs: documente WHATSAPP_CHAT_DATABASE_URL dans .env.template"
```

---

## Task 6 : Vérification finale et suite complète

- [ ] **Step 1 : Suite unitaire complète**

```bash
cd apps/backend && npm run test:unit
```
Attendu : tous les tests verts, y compris ceux de Task 2.

- [ ] **Step 2 : Build**

```bash
cd apps/backend && npm run build
```
Attendu : build sans erreur (confirme que la page admin et les routes
compilent bien via `medusa build`, pas seulement en dev).

- [ ] **Step 3 : Rappel des étapes hors code restantes**

Ce plan ne couvre que ce dépôt. Avant que `WHATSAPP_CHAT_DATABASE_URL`
puisse être renseignée en production, il reste (voir spec, section
« Étapes manuelles hors code ») :
1. Créer le réseau Docker externe `golden_market_shared_net` sur le VPS.
2. Y joindre le service `postgres` de `docker-compose.yml` dans le dépôt
   `n8n_automation` (hors de ce dépôt).
3. Créer le rôle `medusa_whatsapp_reader` (SQL fourni dans la spec) sur
   `golden_market_postgres`.
4. Joindre le service `backend` de production au même réseau externe
   dans `docker-compose.prod.yml` de ce dépôt, et redéployer.
5. Renseigner `WHATSAPP_CHAT_DATABASE_URL` dans le `.env` backend de
   production sur le VPS.

Ces étapes ne font pas partie de ce plan (aucun code de ce dépôt ne peut
les exécuter) — à traiter séparément, potentiellement dans une session
dédiée au dépôt `n8n_automation` pour les points 2 et 3.

---

## Auto-révision effectuée

- **Couverture de la spec** : client de lecture (Task 2), routes admin
  (Task 3), page admin liste+détail (Task 4), configuration (Task 5),
  gestion des erreurs « indisponible » (Task 2 + 4), sécurité/rôle
  dédié et réseau Docker (rappelés en Task 6, hors code de ce dépôt par
  construction). Tests (Task 2, suivant le seul précédent existant du
  projet pour ce genre de lib). Rien de la spec n'est sans tâche
  correspondante.
- **Placeholders** : aucun "TBD"/"TODO" ; chaque étape de code contient
  le code réel, pas une description.
- **Cohérence des types** : `ConversationSummary`/`ChatMessage` et les
  noms de fonctions (`listConversations`, `getConversationMessages`)
  sont identiques entre Task 2 (définition), Task 3 (routes) et Task 4
  (page, types dupliqués côté client car la page ne peut pas importer
  du code serveur - seuls les noms de champs JSON doivent rester
  synchronisés, ce qui est le cas).
