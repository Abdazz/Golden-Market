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
