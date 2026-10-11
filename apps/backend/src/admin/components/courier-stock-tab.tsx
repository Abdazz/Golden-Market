import { useCallback, useEffect, useId, useState } from "react"
import { parseFormLines, readableError } from "../lib/courier-stock-form"
import type { FormLine } from "../lib/courier-stock-form"
import { matchesSearch } from "../lib/product-search"
import { api, MOVEMENT_LABELS } from "../lib/deliveries"
import type { CourierStockMovement, CourierStockOverview } from "../lib/deliveries"
import { card, inputClass, NoticeText, primaryButton, secondaryButton } from "./delivery-ui"
import type { Notice } from "./delivery-ui"

// Onglet "Stock livreurs" (spec 2026-09-28 stock-livreurs) : une carte par
// livreur (réorganisé le 2026-10-11 à la demande du propriétaire) avec les
// produits qu'il a en main et leurs quantités, ses remises / retours /
// corrections et son historique. Stock au dépôt replié en bas. Cartes
// empilées, utilisable sur téléphone.

type Mode = "handover" | "return" | "adjustment"
const MODE_LABELS: Record<Mode, string> = { handover: "Remettre", return: "Retour", adjustment: "Corriger" }
const DONE_LABELS: Record<Mode, string> = { handover: "Remise enregistrée", return: "Retour enregistré", adjustment: "Correction enregistrée" }
type Line = FormLine
const EMPTY_LINE: Line = { inventory_item_id: "", quantity: "", search: "" }
const MAX_MATCHES = 30

const ProductPicker = ({
  choices,
  value,
  hint,
  onChange,
  onSearch,
}: {
  choices: { id: string; label: string }[]
  value: string
  hint: (id: string) => string
  onChange: (id: string) => void
  // Texte tapé : le formulaire refuse une ligne tapée mais sans produit choisi.
  onSearch: (text: string) => void
}) => {
  const selected = choices.find((c) => c.id === value)
  const [text, setText] = useState(selected?.label ?? "")
  const [open, setOpen] = useState(false)
  const listId = useId()
  useEffect(() => {
    if (selected) setText(selected.label)
  }, [selected?.label])
  const allMatches = choices.filter((c) => matchesSearch(c.label, text))
  const matches = allMatches.slice(0, MAX_MATCHES)
  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={`${inputClass} w-full`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Rechercher un produit…"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value)
          onSearch(e.target.value)
          setOpen(true)
          if (value) onChange("")
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout">
          {matches.length ? (
            <>
              {matches.map((c) => (
                <li key={c.id} role="option" aria-selected={c.id === value}>
                  <button
                    type="button"
                    className="txt-compact-small flex w-full flex-col items-start px-3 py-2 text-left hover:bg-ui-bg-base-hover"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(c.id)
                      setText(c.label)
                      onSearch(c.label)
                      setOpen(false)
                    }}
                  >
                    <span className="text-ui-fg-base">{c.label}</span>
                    <span className="text-ui-fg-subtle">{hint(c.id)}</span>
                  </button>
                </li>
              ))}
              {allMatches.length > MAX_MATCHES && <li role="presentation" className="txt-compact-small px-3 py-2 text-ui-fg-muted">Affinez la recherche…</li>}
            </>
          ) : (
            <li role="presentation" className="txt-compact-small px-3 py-2 text-ui-fg-subtle">Aucun produit</li>
          )}
        </ul>
      )}
    </div>
  )
}

const MovementForm = ({
  mode,
  data,
  initialCourierId,
  onDone,
  onCancel,
}: {
  mode: Mode
  data: CourierStockOverview
  initialCourierId: string
  onDone: (notice: Notice) => void
  onCancel: () => void
}) => {
  const courierId = initialCourierId
  const [lines, setLines] = useState<Line[]>([EMPTY_LINE])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Produits proposés : au dépôt pour une remise, chez le livreur pour un retour, tous pour une correction.
  const choices = data.items.filter((i) =>
    mode === "handover" ? i.warehouse > 0 : mode === "return" ? (i.by_courier[courierId] ?? 0) > 0 : true
  )
  const hint = (id: string) => {
    const item = data.items.find((i) => i.id === id)
    if (!item) return ""
    return mode === "handover" ? `${item.warehouse} au dépôt` : `${item.by_courier[courierId] ?? 0} chez le livreur`
  }
  const setLine = (index: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const submit = async () => {
    if (!courierId) return setError("Choisissez un livreur.")
    const form = parseFormLines(mode, lines)
    if ("error" in form) return setError(form.error)
    const parsed = form.lines
    if (mode === "adjustment" && !note.trim()) return setError("Indiquez la raison de la correction.")
    setBusy(true)
    setError(null)
    try {
      await api("/admin/courier-stock/movements", { method: "POST", body: { courier_id: courierId, type: mode, lines: parsed, note: note || null } })
      const name = data.couriers.find((c) => c.id === courierId)?.name ?? ""
      onDone({ kind: "success", text: `${DONE_LABELS[mode]} pour ${name}.` })
    } catch (e) {
      setError(readableError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
      <span className="txt-compact-small-plus text-ui-fg-base">
        {mode === "handover" ? "Remettre des produits au livreur" : mode === "return" ? "Le livreur rend des produits" : "Corriger après comptage (quantités réellement chez le livreur)"}
      </span>
      {lines.map((line, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <ProductPicker
            choices={choices}
            value={line.inventory_item_id}
            hint={hint}
            onChange={(id) => setLine(index, { inventory_item_id: id })}
            onSearch={(text) => setLine(index, { search: text })}
          />
          <input
            className={`${inputClass} max-w-[90px]`}
            inputMode="numeric"
            placeholder={mode === "adjustment" ? "Compté" : "Qté"}
            value={line.quantity}
            onChange={(e) => setLine(index, { quantity: e.target.value })}
          />
          <span className="txt-compact-small text-ui-fg-subtle">{hint(line.inventory_item_id)}</span>
        </div>
      ))}
      <button type="button" className={`${secondaryButton} self-start`} onClick={() => setLines((ls) => [...ls, EMPTY_LINE])}>
        + Produit
      </button>
      <input className={inputClass} placeholder={mode === "adjustment" ? "Raison (obligatoire)" : "Note (facultatif)"} value={note} onChange={(e) => setNote(e.target.value)} />
      <NoticeText notice={error ? { kind: "error", text: error } : null} />
      <div className="flex gap-x-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={submit}>
          {MODE_LABELS[mode]}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}

const History = ({ courierId, version }: { courierId: string; version: number }) => {
  const [movements, setMovements] = useState<CourierStockMovement[] | null>(null)
  const [failed, setFailed] = useState(false)
  // Changement de livreur : on vide la liste avant la requête, jamais les mouvements du précédent.
  useEffect(() => {
    setMovements(null)
  }, [courierId])
  useEffect(() => {
    let cancelled = false
    setFailed(false)
    api<{ movements: CourierStockMovement[] }>(`/admin/courier-stock/movements?courier_id=${encodeURIComponent(courierId)}`)
      .then((r) => {
        if (!cancelled) setMovements(r.movements)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [courierId, version])
  if (failed) return <p className="txt-compact-small text-ui-fg-error">Historique indisponible.</p>
  if (movements === null) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
  if (!movements.length) return <p className="txt-compact-small text-ui-fg-subtle">Aucun mouvement.</p>
  return (
    <ul className="flex flex-col divide-y divide-ui-border-base">
      {movements.map((m) => (
        <li key={m.id} className="txt-compact-small flex flex-wrap justify-between gap-x-3 py-1.5">
          <span className="text-ui-fg-subtle">
            {new Date(m.created_at).toLocaleDateString("fr-FR")} · {MOVEMENT_LABELS[m.type]}
            {m.order_number ? ` · commande ${m.order_number}` : ""}
            {m.note ? ` · ${m.note}` : ""}
          </span>
          <span className="text-ui-fg-base">
            {m.label} <strong>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</strong>
          </span>
        </li>
      ))}
    </ul>
  )
}

type OpenForm = { courierId: string; mode: Mode }

const CourierCard = ({
  courier,
  data,
  form,
  historyOpen,
  version,
  onOpenForm,
  onToggleHistory,
  onDone,
}: {
  courier: { id: string; name: string }
  data: CourierStockOverview
  form: Mode | null
  historyOpen: boolean
  version: number
  onOpenForm: (mode: Mode | null) => void
  onToggleHistory: () => void
  onDone: (notice: Notice) => void
}) => {
  const products = data.items
    .filter((item) => (item.by_courier[courier.id] ?? 0) !== 0)
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
  const total = products.reduce((sum, item) => sum + (item.by_courier[courier.id] ?? 0), 0)
  return (
    <div className={`${card} flex flex-col gap-y-3 px-4 py-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="txt-compact-medium-plus text-ui-fg-base">{courier.name}</span>
        <span className="txt-compact-small text-ui-fg-subtle">
          {products.length ? `${total} article(s) · ${products.length} produit(s)` : "Aucun produit en main"}
        </span>
      </div>
      {products.length > 0 && (
        <ul className="flex flex-col divide-y divide-ui-border-base">
          {products.map((item) => (
            <li key={item.id} className="txt-compact-small flex items-center justify-between gap-x-3 py-1.5">
              <span className="text-ui-fg-base">{item.label}</span>
              <strong className="text-ui-fg-base">{item.by_courier[courier.id]}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button key={m} type="button" className={form === m ? primaryButton : secondaryButton} onClick={() => onOpenForm(form === m ? null : m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
        <button type="button" className={historyOpen ? primaryButton : secondaryButton} onClick={onToggleHistory}>
          Historique
        </button>
      </div>
      {form && (
        <MovementForm
          key={form}
          mode={form}
          data={data}
          initialCourierId={courier.id}
          onCancel={() => onOpenForm(null)}
          onDone={onDone}
        />
      )}
      {historyOpen && <History courierId={courier.id} version={version} />}
    </div>
  )
}

export const CourierStockTab = () => {
  const [data, setData] = useState<CourierStockOverview | null>(null)
  const [openForm, setOpenForm] = useState<OpenForm | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [historyOf, setHistoryOf] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const reload = useCallback(() => {
    setLoadError(null)
    api<CourierStockOverview>("/admin/courier-stock")
      .then((r) => {
        setData(r)
        setVersion((v) => v + 1)
      })
      .catch((e) => setLoadError(readableError(e)))
  }, [])
  useEffect(reload, [reload])

  if (!data && loadError)
    return (
      <div className="flex flex-col items-start gap-y-2">
        <NoticeText notice={{ kind: "error", text: loadError }} />
        <button type="button" className={secondaryButton} onClick={reload}>
          Réessayer
        </button>
      </div>
    )
  if (!data) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
  if (!data.couriers.length) return <p className="txt-compact-small text-ui-fg-subtle">Ajoutez d'abord un livreur (onglet Livreurs).</p>

  const inWarehouse = data.items.filter((item) => item.warehouse > 0).sort((a, b) => a.label.localeCompare(b.label, "fr"))

  return (
    <div className="flex flex-col gap-y-3">
      <NoticeText notice={notice} />
      {loadError && (
        <div className="flex flex-wrap items-center gap-2">
          <NoticeText notice={{ kind: "error", text: `Mise à jour de l'affichage impossible : ${loadError}` }} />
          <button type="button" className={secondaryButton} onClick={reload}>
            Réessayer
          </button>
        </div>
      )}
      {data.couriers.map((courier) => (
        <CourierCard
          key={courier.id}
          courier={courier}
          data={data}
          form={openForm?.courierId === courier.id ? openForm.mode : null}
          historyOpen={historyOf === courier.id}
          version={version}
          onOpenForm={(mode) => {
            setNotice(null)
            setOpenForm(mode ? { courierId: courier.id, mode } : null)
          }}
          onToggleHistory={() => setHistoryOf(historyOf === courier.id ? null : courier.id)}
          onDone={(n) => {
            setNotice(n)
            setOpenForm(null)
            reload()
          }}
        />
      ))}
      <details className={`${card} px-4 py-3`}>
        <summary className="txt-compact-small-plus cursor-pointer text-ui-fg-base">
          Stock au dépôt ({inWarehouse.length} produit(s))
        </summary>
        {inWarehouse.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-ui-border-base">
            {inWarehouse.map((item) => (
              <li key={item.id} className="txt-compact-small flex items-center justify-between gap-x-3 py-1.5">
                <span className="text-ui-fg-base">{item.label}</span>
                <strong className="text-ui-fg-base">{item.warehouse}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="txt-compact-small mt-2 text-ui-fg-subtle">Rien au dépôt.</p>
        )}
      </details>
    </div>
  )
}
