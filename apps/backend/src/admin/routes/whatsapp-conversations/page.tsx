import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { useEffect, useState } from "react"

// Page admin de visualisation en lecture seule des conversations WhatsApp
// (base golden_market, propriété de n8n_automation) - voir
// docs/superpowers/specs/2026-09-07-whatsapp-conversations-viewer-design.md.
//
// Mise en page à deux panneaux (liste à gauche, fil façon WhatsApp à
// droite) toujours visibles ensemble - pas de bascule liste/détail plein
// écran comme dans la première version.
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

const initials = (conversation: ConversationSummary) => {
  const source = conversation.customerName ?? conversation.phoneNumber
  return source.slice(0, 1).toUpperCase()
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR")

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
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ui-tag-neutral-bg text-ui-fg-base txt-compact-small-plus">
      {initials(conversation)}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
      <span className="flex items-center justify-between gap-x-2">
        <span className="truncate text-ui-fg-base txt-compact-small-plus">
          {conversation.customerName ?? conversation.phoneNumber}
        </span>
        <span className="shrink-0 text-ui-fg-subtle txt-compact-xsmall">
          {formatTime(conversation.lastMessageAt)}
        </span>
      </span>
      <span className="truncate text-ui-fg-subtle txt-compact-small">
        {conversation.lastMessagePreview ?? "—"}
      </span>
      <span className="text-ui-fg-muted txt-compact-xsmall">
        {conversation.messageCount} message{conversation.messageCount > 1 ? "s" : ""} · {conversation.status}
      </span>
    </span>
  </button>
)

const ConversationListPanel = ({
  selectedPhone,
  onSelect,
}: {
  selectedPhone: string | null
  onSelect: (phoneNumber: string) => void
}) => {
  const [search, setSearch] = useState("")
  const [list, setList] = useState<ListResponse | null>(null)

  useEffect(() => {
    const query = search ? `?q=${encodeURIComponent(search)}` : ""
    fetch(`/admin/whatsapp-conversations${query}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then(setList)
      .catch(() => setList({ available: false }))
  }, [search])

  // Sélectionne automatiquement la conversation la plus récente (première
  // de la liste, déjà triée par last_message_at DESC côté backend) dès
  // qu'elle est connue et qu'aucune sélection n'existe encore.
  useEffect(() => {
    if (selectedPhone !== null) {
      return
    }
    if (list?.available && list.conversations.length > 0) {
      onSelect(list.conversations[0].phoneNumber)
    }
  }, [list, selectedPhone, onSelect])

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r border-ui-border-base">
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
  const fromClient = message.role === "user"
  const isSystem = message.role === "system"

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-ui-fg-muted txt-compact-xsmall bg-ui-bg-subtle rounded-full px-3 py-1">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex ${fromClient ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 ${
          fromClient ? "bg-ui-bg-component text-ui-fg-base" : "bg-ui-tag-green-bg text-ui-tag-green-text"
        }`}
      >
        <p className="txt-compact-small whitespace-pre-wrap">{message.content}</p>
        <p
          className={`txt-compact-xsmall mt-1 text-right ${
            fromClient ? "text-ui-fg-muted" : "text-ui-tag-green-icon"
          }`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
}

const ConversationThreadPanel = ({ phoneNumber }: { phoneNumber: string | null }) => {
  const [detail, setDetail] = useState<DetailResponse | null>(null)

  useEffect(() => {
    if (!phoneNumber) {
      return
    }
    setDetail(null)
    fetch(`/admin/whatsapp-conversations/${encodeURIComponent(phoneNumber)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then(setDetail)
      .catch(() => setDetail({ available: false }))
  }, [phoneNumber])

  if (!phoneNumber) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-ui-fg-subtle">Sélectionnez une conversation à gauche.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-ui-border-base px-6 py-4">
        <h2 className="text-ui-fg-base txt-large-plus">{phoneNumber}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
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
              <MessageBubble key={index} message={message} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const WhatsappConversationsPage = () => {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex h-[calc(100vh-120px)] overflow-hidden rounded-lg">
      <ConversationListPanel selectedPhone={selectedPhone} onSelect={setSelectedPhone} />
      <ConversationThreadPanel phoneNumber={selectedPhone} />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Conversations WhatsApp",
  icon: ChatBubbleLeftRight,
})

export default WhatsappConversationsPage
