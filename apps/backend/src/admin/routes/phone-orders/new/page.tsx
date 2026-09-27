import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

// Formulaire "Nouvelle commande" (commande prise par téléphone) : le client
// est identifié par son numéro WhatsApp, jamais par un e-mail. Route admin
// POST /admin/phone-orders (lib/phone-order.ts). Pas d'entrée dans le menu
// latéral : on y accède par le bouton au-dessus de la liste des commandes.
// Pas de composant @medusajs/ui (conflit de types React 18/19).

type VariantResult = {
  variant_id: string
  product_title: string
  variant_title: string | null
  thumbnail: string | null
  price: number | null
  original_price: number | null
  in_stock: boolean
}

type Line = VariantResult & { quantity: number }

const PAYMENT_METHODS = [
  { value: "cash-on-delivery", label: "Paiement à la réception (cash)" },
  { value: "orange-money", label: "Orange Money" },
  { value: "moov-money", label: "Moov Money" },
]

const formatXof = (amount: number | null) =>
  amount == null ? "—" : `${new Intl.NumberFormat("fr-FR").format(amount)} F`

const inputClass = "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2"
const labelClass = "txt-compact-small-plus text-ui-fg-base"

const NewPhoneOrderPage = () => {
  const navigate = useNavigate()
  const [phone, setPhone] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [city, setCity] = useState("Ouagadougou")
  const [address, setAddress] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [knownCustomer, setKnownCustomer] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<VariantResult[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Client déjà connu pour ce numéro : pré-remplit nom et dernière adresse
  // (sans écraser ce qui a déjà été saisi).
  const lookupCustomer = async () => {
    if (phone.replace(/\D/g, "").length < 8) {
      return
    }
    const res = await fetch(`/admin/phone-orders/lookup?phone=${encodeURIComponent(phone)}`, {
      credentials: "include",
    }).then((r) => r.json()).catch(() => null)
    if (!res?.found) {
      setKnownCustomer(null)
      return
    }
    setKnownCustomer([res.first_name, res.last_name].filter(Boolean).join(" ") || res.phone)
    setFirstName((v) => v || res.first_name)
    setLastName((v) => v || res.last_name)
    setAddress((v) => v || res.address)
    if (res.city) setCity((v) => (v === "Ouagadougou" || !v ? res.city : v))
  }

  useEffect(() => {
    const term = search.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      fetch(`/admin/phone-orders/variants?q=${encodeURIComponent(term)}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setResults(data.variants ?? []))
        .catch(() => setResults([]))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const addLine = (variant: VariantResult) => {
    setLines((current) => {
      const existing = current.find((l) => l.variant_id === variant.variant_id)
      if (existing) {
        return current.map((l) =>
          l.variant_id === variant.variant_id ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l
        )
      }
      return [...current, { ...variant, quantity: 1 }]
    })
  }

  const setQuantity = (variantId: string, quantity: number) =>
    setLines((current) =>
      current
        .map((l) => (l.variant_id === variantId ? { ...l, quantity: Math.min(99, quantity) } : l))
        .filter((l) => l.quantity > 0)
    )

  const total = useMemo(() => lines.reduce((sum, l) => sum + (l.price ?? 0) * l.quantity, 0), [lines])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/admin/phone-orders", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          first_name: firstName,
          last_name: lastName,
          city,
          address,
          payment_method: paymentMethod,
          items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? "La commande n'a pas pu être créée.")
        return
      }
      navigate(`/orders/${data.order_id}`)
    } catch {
      setError("Service injoignable, réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest flex flex-col gap-y-6 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="txt-large-plus text-ui-fg-base">Nouvelle commande</h1>
          <p className="txt-compact-small text-ui-fg-subtle">
            Commande prise par téléphone. Le client reçoit la confirmation sur son WhatsApp.
          </p>
        </div>
        <button type="button" onClick={() => navigate("/orders")} className="txt-compact-small text-ui-fg-interactive">
          ← Retour aux commandes
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-y-1 md:col-span-2">
          <span className={labelClass}>Numéro WhatsApp du client *</span>
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={lookupCustomer}
            placeholder="70 00 00 00"
            inputMode="tel"
          />
          {knownCustomer && (
            <span className="txt-compact-xsmall text-ui-fg-subtle">Client déjà connu : {knownCustomer}</span>
          )}
        </label>
        <label className="flex flex-col gap-y-1">
          <span className={labelClass}>Prénom *</span>
          <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className={labelClass}>Nom</span>
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className={labelClass}>Ville *</span>
          <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className={labelClass}>Quartier / adresse de livraison *</span>
          <input
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Quartier, repère…"
          />
        </label>
      </section>

      <section className="flex flex-col gap-y-3">
        <span className={labelClass}>Articles *</span>
        <input
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit (au moins 2 lettres)"
        />
        {results.length > 0 && (
          <ul className="divide-y divide-ui-border-base rounded-md border border-ui-border-base">
            {results.map((v) => (
              <li key={v.variant_id} className="flex items-center gap-x-3 px-3 py-2">
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="h-10 w-10 rounded bg-ui-bg-subtle" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="txt-compact-small-plus truncate">
                    {v.product_title}
                    {v.variant_title ? ` — ${v.variant_title}` : ""}
                  </span>
                  <span className="txt-compact-xsmall text-ui-fg-subtle">
                    {formatXof(v.price)}
                    {v.original_price && v.price && v.original_price > v.price && (
                      <span className="ml-2 line-through">{formatXof(v.original_price)}</span>
                    )}
                    {" · "}
                    {v.in_stock ? "en stock" : "rupture de stock"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => addLine(v)}
                  disabled={!v.in_stock}
                  className="txt-compact-small-plus rounded-md border border-ui-border-base px-3 py-1.5 disabled:opacity-40"
                >
                  Ajouter
                </button>
              </li>
            ))}
          </ul>
        )}
        {lines.length > 0 && (
          <ul className="flex flex-col gap-y-2">
            {lines.map((l) => (
              <li key={l.variant_id} className="flex items-center gap-x-3 rounded-md bg-ui-bg-subtle px-3 py-2">
                <span className="txt-compact-small flex-1">
                  {l.product_title}
                  {l.variant_title ? ` — ${l.variant_title}` : ""}
                </span>
                <span className="flex items-center gap-x-2">
                  <button type="button" className="rounded border px-2" onClick={() => setQuantity(l.variant_id, l.quantity - 1)}>
                    −
                  </button>
                  <span className="txt-compact-small w-6 text-center">{l.quantity}</span>
                  <button type="button" className="rounded border px-2" onClick={() => setQuantity(l.variant_id, l.quantity + 1)}>
                    +
                  </button>
                </span>
                <span className="txt-compact-small-plus w-24 text-right">{formatXof((l.price ?? 0) * l.quantity)}</span>
              </li>
            ))}
            <li className="txt-compact-small-plus flex justify-end px-3">Total : {formatXof(total)}</li>
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-y-2">
        <span className={labelClass}>Moyen de paiement convenu *</span>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <label
              key={m.value}
              className={`txt-compact-small cursor-pointer rounded-md border px-3 py-2 ${
                paymentMethod === m.value ? "border-ui-border-interactive bg-ui-bg-subtle" : "border-ui-border-base"
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value={m.value}
                checked={paymentMethod === m.value}
                onChange={() => setPaymentMethod(m.value)}
                className="mr-2"
              />
              {m.label}
            </label>
          ))}
        </div>
      </section>

      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || lines.length === 0}
          className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted disabled:opacity-50"
        >
          {submitting ? "Création…" : "Créer la commande"}
        </button>
      </div>
    </div>
  )
}

export default NewPhoneOrderPage
