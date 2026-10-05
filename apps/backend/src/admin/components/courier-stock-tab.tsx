import { useCallback, useEffect, useState } from "react"
import { parseFormLines, readableError } from "../lib/courier-stock-form"
import type { FormLine } from "../lib/courier-stock-form"
import { matchesSearch } from "../lib/product-search"
import { api, MOVEMENT_LABELS } from "../lib/deliveries"
import type { CourierStockMovement, CourierStockOverview } from "../lib/deliveries"
import { card, inputClass, NoticeText, primaryButton, secondaryButton } from "./delivery-ui"
import type { Notice } from "./delivery-ui"

// Onglet "Stock livreurs" (spec 2026-09-28 stock-livreurs) : combien il reste
// de chaque produit chez chaque livreur, remises / retours / corrections et
// historique. Cartes empilées, utilisable sur téléphone.

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
  useEffect(() => {
    if (selected) setText(selected.label)
  }, [selected?.label])
  const allMatches = choices.filter((c) => matchesSearch(c.label, text))
  const matches = allMatches.slice(0, MAX_MATCHES)
  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={`${inputClass} w-full`}
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
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout">
          {matches.length ? (
            <>
              {matches.map((c) => (
                <li key={c.id}>
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
              {allMatches.length > MAX_MATCHES && <li className="txt-compact-small px-3 py-2 text-ui-fg-muted">Affinez la recherche…</li>}
            </>
          ) : (
            <li className="txt-compact-small px-3 py-2 text-ui-fg-subtle">Aucun produit</li>
          )}
        </ul>
      )}
    </div>
  )
}

const MovementForm = ({
  mode,
  data,
  onDone,
  onCancel,
}: {
  mode: Mode
  data: CourierStockOverview
  onDone: (notice: Notice) => void
  onCancel: () => void
}) => {
  const [courierId, setCourierId] = useState(data.couriers[0]?.id ?? "")
  const [lines, setLines] = useState<Line[]>([EMPTY_LINE])
  const [note, setNote] = useState("")
  const [resetKey, setResetKey] = useState(0)
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
      <select
        className={inputClass}
        value={courierId}
        onChange={(e) => {
          setCourierId(e.target.value)
          if (mode === "return") {
            setLines([EMPTY_LINE])
            setResetKey((k) => k + 1)
          }
        }}
      >
        {data.couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {lines.map((line, index) => (
        <div key={`${resetKey}-${index}`} className="flex flex-wrap items-center gap-2">
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
  useEffect(() => {
    setFailed(false)
    api<{ movements: CourierStockMovement[] }>(`/admin/courier-stock/movements?courier_id=${encodeURIComponent(courierId)}`)
      .then((r) => setMovements(r.movements))
      .catch(() => setFailed(true))
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

export const CourierStockTab = () => {
  const [data, setData] = useState<CourierStockOverview | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
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

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button key={m} type="button" className={mode === m ? primaryButton : secondaryButton} onClick={() => setMode(mode === m ? null : m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <NoticeText notice={notice} />
      {loadError && (
        <div className="flex flex-wrap items-center gap-2">
          <NoticeText notice={{ kind: "error", text: `Mise à jour de l'affichage impossible : ${loadError}` }} />
          <button type="button" className={secondaryButton} onClick={reload}>
            Réessayer
          </button>
        </div>
      )}
      {mode && (
        <MovementForm
          key={mode}
          mode={mode}
          data={data}
          onCancel={() => setMode(null)}
          onDone={(n) => {
            setNotice(n)
            setMode(null)
            reload()
          }}
        />
      )}
      {data.items.map((item) => (
        <div key={item.id} className={`${card} flex flex-col gap-y-1 px-4 py-3`}>
          <span className="txt-compact-small-plus text-ui-fg-base">{item.label}</span>
          <div className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1 text-ui-fg-subtle">
            <span>
              Au dépôt : <strong className="text-ui-fg-base">{item.warehouse}</strong>
            </span>
            {data.couriers.map((c) => (
              <span key={c.id}>
                {c.name} : <strong className={item.by_courier[c.id] ? "text-ui-fg-base" : ""}>{item.by_courier[c.id] ?? 0}</strong>
              </span>
            ))}
            <span>Total : {item.stocked}</span>
          </div>
        </div>
      ))}
      <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
        <span className="txt-compact-small-plus text-ui-fg-base">Historique</span>
        <div className="flex flex-wrap gap-2">
          {data.couriers.map((c) => (
            <button key={c.id} type="button" className={historyOf === c.id ? primaryButton : secondaryButton} onClick={() => setHistoryOf(historyOf === c.id ? null : c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        {historyOf && <History courierId={historyOf} version={version} />}
      </div>
    </div>
  )
}
