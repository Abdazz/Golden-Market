"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Fields = {
  amount_collected: boolean
  transport_fee: boolean
  courier_fee: true
}
type Line = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  place: string
  type: "express" | "expedition"
  items: { title: string; quantity: number }[]
  amount_to_collect: number | null
  fields: Fields
  state: "todo" | "submitted" | "returned" | "validated" | "failed" | "canceled"
  failure_reason: string | null
  report: {
    delivered: boolean
    failure_reason: string | null
    amount_collected: number | null
    courier_fee: number | null
    transport_fee: number | null
    return_reason: string | null
  } | null
}

const xof = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} F`

// Champs : 16 px minimum (évite le zoom automatique d'iOS), 48 px de haut.
const field =
  "w-full min-h-[48px] rounded-xl border border-gm-border bg-white px-4 py-3 text-base text-gm-ink outline-none placeholder:text-gm-ink-muted/60 focus-visible:border-gm-amethyst focus-visible:ring-2 focus-visible:ring-gm-amethyst/40"
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gm-amethyst"
const primary = `inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-gm-violet px-4 py-3 text-base font-semibold text-gm-on-violet transition-colors hover:bg-gm-violet-hover active:bg-gm-violet-hover disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`
const secondary = `inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-gm-border bg-white px-4 py-3 text-base font-semibold text-gm-ink transition-colors active:bg-gm-ivoire-2 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`
const label = "flex flex-col gap-1.5 text-sm font-semibold"
const alertBox = "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"

const STATE: Record<Line["state"], { label: string; tone: string }> = {
  todo: { label: "À renseigner", tone: "bg-gm-gold-soft text-gm-ink" },
  submitted: {
    label: "Envoyé, en attente de validation",
    tone: "bg-gm-ivoire-2 text-gm-ink-muted",
  },
  returned: { label: "À corriger", tone: "bg-gm-terracotta text-white" },
  validated: { label: "Validé", tone: "bg-green-100 text-green-800" },
  failed: { label: "Non livrée", tone: "bg-gm-ivoire-2 text-gm-ink-muted" },
  canceled: { label: "Annulée", tone: "bg-gm-ivoire-2 text-gm-ink-muted" },
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/livreur/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(json.message ?? "Une erreur est survenue."), {
      status: res.status,
    })
  }
  return json as T
}

const digits = (v: string) => v.replace(/\D/g, "")

const Brand = () => (
  <div className="flex items-center gap-x-2">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/logo/logo-mark-color.png" alt="" width={40} height={40} className="h-10 w-10" />
    <p className="font-display text-sm font-semibold uppercase tracking-wider text-gm-gold-strong">
      Golden Market
    </p>
  </div>
)

const Login = ({ onLogged }: { onLogged: () => void }) => {
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await call("login", { phone, pin })
      onLogged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <div>
        <Brand />
        <h1 className="mt-1 font-display text-3xl font-bold text-gm-violet">
          Espace livreur
        </h1>
        <p className="mt-2 text-base text-gm-ink-muted">
          Connectez-vous pour voir vos livraisons du jour.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className={label}>
          Votre téléphone
          <input
            className={field}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="70 00 00 00"
          />
        </label>
        <label className={label}>
          Code PIN
          <input
            className={field}
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            placeholder="4 chiffres"
          />
        </label>
        <div aria-live="polite">
          {error && (
            <p role="alert" className={alertBox}>
              {error}
            </p>
          )}
        </div>
        <button
          className={primary}
          disabled={busy || !phone.trim() || pin.length !== 4}
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  )
}

const numStr = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(n)

const ReportSheet = ({
  line,
  onClose,
  onSent,
  onExpired,
}: {
  line: Line
  onClose: () => void
  onSent: () => void
  onExpired: () => void
}) => {
  const prev = line.report
  const [delivered, setDelivered] = useState<boolean | null>(null)
  const [reason, setReason] = useState(prev?.failure_reason ?? "")
  const [amount, setAmount] = useState(numStr(prev?.amount_collected))
  const [courierFee, setCourierFee] = useState(numStr(prev?.courier_fee))
  const [transportFee, setTransportFee] = useState(numStr(prev?.transport_fee))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus dans la fenêtre à l'ouverture, retour au bouton d'origine à la
  // fermeture, Échap ferme, Tab reste dans la fenêtre.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose()
      if (e.key !== "Tab" || !dialogRef.current) return
      const items = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input, textarea, [href]"
        )
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
      opener?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await call(`deliveries/${line.id}/report`, {
        delivered,
        failure_reason: reason,
        amount_collected: amount,
        courier_fee: courierFee,
        transport_fee: transportFee,
      })
      onSent()
    } catch (err) {
      if ((err as { status?: number }).status === 401) return onExpired()
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-black/50"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-gm-ivoire px-5 pb-8 pt-5 outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-gm-ink-muted">
              Commande {line.order_number}
            </p>
            <h2
              id="report-title"
              className="font-display text-xl font-bold text-gm-violet"
            >
              {line.customer_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`-mr-2 -mt-2 flex h-12 w-12 items-center justify-center rounded-full text-3xl leading-none ${focusRing}`}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {line.state === "returned" && prev?.return_reason && (
          <p className="mb-4 rounded-xl bg-gm-terracotta px-4 py-3 text-base font-semibold text-white">
            À corriger : {prev.return_reason}
          </p>
        )}

        <fieldset className="mb-5">
          <legend className="mb-2 text-base font-semibold">
            La commande a-t-elle été livrée ?
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={delivered === true}
              onClick={() => setDelivered(true)}
              className={delivered === true ? primary : secondary}
            >
              Oui
            </button>
            <button
              type="button"
              aria-pressed={delivered === false}
              onClick={() => setDelivered(false)}
              className={delivered === false ? primary : secondary}
            >
              Non
            </button>
          </div>
        </fieldset>

        {delivered === false && (
          <label className={`${label} mb-5`}>
            Pourquoi n&apos;a-t-elle pas été livrée ?
            <textarea
              className={field}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Client absent, injoignable, refus…"
            />
          </label>
        )}
        {delivered === true && (
          <div className="mb-5 flex flex-col gap-4">
            {line.fields.amount_collected && (
              <label className={label}>
                Montant encaissé (F CFA)
                <input
                  className={field}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(digits(e.target.value))}
                />
              </label>
            )}
            <label className={label}>
              Course du livreur (F CFA)
              <input
                className={field}
                inputMode="numeric"
                value={courierFee}
                onChange={(e) => setCourierFee(digits(e.target.value))}
              />
            </label>
            {line.fields.transport_fee && (
              <label className={label}>
                Frais Expédition (F CFA)
                <input
                  className={field}
                  inputMode="numeric"
                  value={transportFee}
                  onChange={(e) => setTransportFee(digits(e.target.value))}
                />
              </label>
            )}
          </div>
        )}

        <div aria-live="polite">
          {error && (
            <p role="alert" className={`${alertBox} mb-4`}>
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          className={primary}
          disabled={busy || delivered === null}
          onClick={send}
        >
          {busy ? "Envoi…" : "Envoyer le rapport"}
        </button>
      </div>
    </div>
  )
}

const editable = (l: Line) =>
  l.state === "todo" || l.state === "returned" || l.state === "submitted"

const actionLabel = (l: Line) =>
  l.state === "todo"
    ? "Renseigner"
    : l.state === "returned"
    ? "Corriger"
    : "Modifier"

export const LivreurApp = () => {
  const [state, setState] = useState<"loading" | "login" | "ready">("loading")
  const [courier, setCourier] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const [open, setOpen] = useState<Line | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Jour affiché : vide = aujourd'hui (le serveur donne la date du jour).
  const [day, setDay] = useState("")
  const [today, setToday] = useState("")

  const load = useCallback(async () => {
    try {
      const r = await call<{ courier: { name: string }; date: string; deliveries: Line[] }>(
        day ? `deliveries?date=${day}` : "deliveries"
      )
      setCourier(r.courier.name)
      setLines(r.deliveries)
      setToday((t) => t || r.date)
      setState("ready")
      setError(null)
    } catch (err) {
      if ((err as { status?: number }).status === 401) setState("login")
      else {
        setError((err as Error).message)
        setState("ready")
      }
    }
  }, [day])

  useEffect(() => {
    load()
  }, [load])

  if (state === "loading") {
    return (
      <p role="status" className="p-6 text-gm-ink-muted">
        Chargement…
      </p>
    )
  }
  if (state === "login") return <Login onLogged={load} />

  const logout = async () => {
    await call("logout", {}).catch(() => undefined)
    setLines([])
    setState("login")
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Brand />
          <h1 className="truncate font-display text-2xl font-bold text-gm-violet">
            Bonjour {courier}
          </h1>
        </div>
        <button
          type="button"
          onClick={logout}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-semibold text-gm-amethyst ${focusRing}`}
        >
          Quitter
        </button>
      </header>

      <div aria-live="polite">
        {error && (
          <p role="alert" className={`${alertBox} mb-4`}>
            {error}
          </p>
        )}
      </div>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="jour" className="text-sm font-semibold">
          Jour
        </label>
        <input
          id="jour"
          type="date"
          value={day || today}
          max={today}
          onChange={(e) => setDay(e.target.value === today ? "" : e.target.value)}
          className={`min-h-[44px] flex-1 rounded-xl border border-gm-border bg-white px-3 ${focusRing}`}
        />
        {day && (
          <button
            type="button"
            onClick={() => setDay("")}
            className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold text-gm-amethyst ${focusRing}`}
          >
            Aujourd&apos;hui
          </button>
        )}
      </div>
      {!lines.length && !error && (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-gm-ink-muted">
          {day ? "Aucune commande ce jour-là." : "Aucune commande aujourd'hui."}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {lines.map((l) => (
          <li
            key={l.id}
            className="rounded-2xl border border-gm-border bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-base font-bold">{l.customer_name}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-right text-xs font-semibold ${
                  STATE[l.state].tone
                }`}
              >
                {STATE[l.state].label}
              </span>
            </div>
            <p className="mt-1 text-sm text-gm-ink-muted">
              {l.type === "express" ? "Livraison Ouaga" : "Expédition"} ·
              Commande {l.order_number}
            </p>
            {l.place && <p className="mt-1 text-sm">{l.place}</p>}
            <p className="mt-1 text-sm">
              {l.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")}
            </p>
            {l.amount_to_collect !== null && l.amount_to_collect > 0 && (
              <p className="mt-2 text-base font-bold text-gm-violet">
                À encaisser : {xof(l.amount_to_collect)}
              </p>
            )}
            {l.state === "returned" && l.report?.return_reason && (
              <p className="mt-2 rounded-lg bg-gm-terracotta/10 px-3 py-2 text-sm font-semibold text-gm-terracotta">
                À corriger : {l.report.return_reason}
              </p>
            )}
            {l.state === "failed" && l.failure_reason && (
              <p className="mt-2 text-sm text-gm-ink-muted">
                Motif : {l.failure_reason}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <a
                href={`tel:${l.customer_phone}`}
                className={`${secondary} text-gm-amethyst`}
              >
                Appeler
              </a>
              {editable(l) ? (
                <button
                  type="button"
                  onClick={() => setOpen(l)}
                  className={primary}
                >
                  {actionLabel(l)}
                </button>
              ) : (
                <span />
              )}
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <ReportSheet
          line={open}
          onClose={() => setOpen(null)}
          onExpired={() => {
            setOpen(null)
            setState("login")
          }}
          onSent={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </div>
  )
}
