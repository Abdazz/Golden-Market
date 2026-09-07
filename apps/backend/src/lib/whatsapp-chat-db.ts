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
