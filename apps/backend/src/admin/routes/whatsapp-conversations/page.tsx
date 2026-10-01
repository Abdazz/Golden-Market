import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { useCallback, useEffect, useRef, useState } from "react"
import { WhatsappAttachment } from "../../components/whatsapp-attachment"
import type { ChatAttachment } from "../../components/whatsapp-attachment"
import { WhatsappComposer } from "../../components/whatsapp-composer"
import { WhatsappProspect } from "../../components/whatsapp-prospect"

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
  // Photos, vidéos, vocaux, documents envoyés par l'agent, le client ou
  // depuis l'admin (absent sur les messages antérieurs au 2026-09-27).
  // url null : média supprimé après 90 jours ou copie en échec.
  attachments?: ChatAttachment[]
  // Message refusé par WhatsApp après l'envoi, libellé prêt à afficher.
  deliveryFailure?: string | null
  // Message automatique (modèle Meta) : libellé à la place de « IA ».
  automaticLabel?: string | null
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

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

// Utilisé uniquement dans la liste des conversations (pas dans le fil de
// messages) : contrairement à un fil unique où toutes les bulles sont du
// même jour ou proches, la liste mélange des conversations vieilles de
// plusieurs jours - n'afficher que l'heure y est ambigu ("13:47" d'hier ou
// d'aujourd'hui ?). Signalé par le propriétaire. Même convention que
// WhatsApp : heure seule si aujourd'hui, date sinon.
const formatListTimestamp = (iso: string) => {
  const date = new Date(iso)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  return isToday
    ? formatTime(iso)
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
}

// Icône générique (pas de nom client enregistré) - SVG inline plutôt que
// @medusajs/icons : même conflit de types React 18/19 que @medusajs/ui
// (documenté ci-dessus) dès qu'une icône est rendue directement en JSX,
// contrairement à ChatBubbleLeftRight ci-dessus qui n'est jamais rendue
// mais seulement passée en référence à defineRouteConfig.
const GenericAvatarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

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
          <p className="txt-compact-xsmall-plus mb-0.5 opacity-70">{fromHuman ? "Vous" : (message.automaticLabel ?? "IA")}</p>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-1 flex flex-col gap-1">
            {/* Photos en grille (l'agent en envoie souvent plusieurs d'un
                coup), les autres médias dessous. Clé indexée : un même
                fichier peut apparaître deux fois dans un message. */}
            {message.attachments.some((a) => a.type === "image") && (
              <div className="flex flex-wrap gap-1">
                {message.attachments
                  .filter((a) => a.type === "image")
                  .map((attachment, index) => (
                    <WhatsappAttachment
                      key={`image-${index}`}
                      attachment={attachment}
                      compact={message.attachments!.filter((a) => a.type === "image").length > 1}
                    />
                  ))}
              </div>
            )}
            {message.attachments
              .filter((a) => a.type !== "image")
              .map((attachment, index) => (
                <WhatsappAttachment key={`${attachment.type}-${index}`} attachment={attachment} />
              ))}
          </div>
        )}
        {message.content && <p className="txt-compact-small whitespace-pre-wrap break-words">{message.content}</p>}
        <p className="txt-compact-xsmall mt-1 text-right opacity-70">{formatTime(message.createdAt)}</p>
        {message.deliveryFailure && (
          <p className="txt-compact-xsmall-plus mt-1 text-right text-ui-fg-error">{message.deliveryFailure}</p>
        )}
      </div>
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
  const [refreshFailed, setRefreshFailed] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  // Numéro actuellement affiché : une réponse arrivée après un changement de
  // conversation (rafraîchissement lent de A pendant qu'on ouvre B) doit être
  // ignorée, sinon le fil de A s'afficherait alors que l'envoi part vers B.
  const currentPhone = useRef(phoneNumber)
  currentPhone.current = phoneNumber

  const load = useCallback(() => {
    if (!phoneNumber) {
      return
    }
    const requested = phoneNumber
    // Un échec de rafraîchissement (réseau, redéploiement, session expirée)
    // ne remplace jamais une conversation déjà affichée : la zone de saisie
    // (brouillon en cours, erreur) resterait sinon démontée puis vidée.
    const keepOrFail = (prev: DetailResponse | null): DetailResponse =>
      prev && "conversation" in prev ? prev : { available: false }
    fetch(`/admin/whatsapp-conversations/${encodeURIComponent(requested)}`, { credentials: "include" })
      .then((res) => res.json() as Promise<DetailResponse>)
      .then((data) => {
        if (currentPhone.current !== requested) {
          return
        }
        setRefreshFailed(!data.available)
        setDetail((prev) => (data.available ? data : keepOrFail(prev)))
      })
      .catch(() => {
        if (currentPhone.current !== requested) {
          return
        }
        setRefreshFailed(true)
        setDetail(keepOrFail)
      })
  }, [phoneNumber])

  useEffect(() => {
    setDetail(null)
    setNotice(null)
    setRefreshFailed(false)
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

  const lastMessage = conversation?.messages[conversation.messages.length - 1]

  const toggleHand = async () => {
    // L'IA ne répond qu'au prochain message entrant : rendre la main alors que
    // le client attend une réponse laisserait sa dernière question sans suite.
    if (
      humanHasHand &&
      lastMessage?.role === "user" &&
      !window.confirm(
        "Le dernier message du client restera sans réponse : l'IA ne répondra qu'à son prochain message. Rendre quand même la main à l'IA ?"
      )
    ) {
      return
    }
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
        {conversation && <WhatsappProspect phoneNumber={conversation.phoneNumber} customerName={conversation.customerName} />}
      </div>

      {notice && <p className="txt-compact-small border-b border-ui-border-base px-4 py-2 text-ui-fg-error">{notice}</p>}
      {refreshFailed && conversation && (
        <p className="txt-compact-small border-b border-ui-border-base px-4 py-2 text-ui-fg-subtle">
          Rafraîchissement impossible pour le moment : la conversation affichée peut ne pas être à jour.
        </p>
      )}

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
        <WhatsappComposer phoneNumber={phoneNumber} replyWindow={conversation.replyWindow} onSent={afterSend} />
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
