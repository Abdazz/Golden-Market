import React, { useMemo, useRef, useState } from "react"

type CityAutocompleteProps = {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  suggestions: readonly string[]
  required?: boolean
  autoComplete?: string
  "data-testid"?: string
}

// Remplace le <input list="..."> + <datalist> natif (rendu incohérent selon
// le navigateur - liste parfois décalée sur le côté, pas de vrai filtrage à
// la frappe) par un menu déroulant maison, tout en gardant le champ en
// texte libre (aucune ville hors liste n'est bloquée - le Burkina Faso a
// bien plus de localités que les 45 chefs-lieux suggérés ici). Signalé par
// le propriétaire le 2026-09-04.
// Retire les diacritiques (accents) après décomposition NFD, sans écrire de
// plage unicode littérale dans le code source (fragile à l'encodage) :
// construite via les points de code (U+0300 à U+036F, marques
// diacritiques combinantes).
const COMBINING_DIACRITICS_START = 0x0300
const COMBINING_DIACRITICS_END = 0x036f
const stripDiacritics = (s: string) =>
  Array.from(s)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < COMBINING_DIACRITICS_START || code > COMBINING_DIACRITICS_END
    })
    .join("")
const normalize = (s: string) => stripDiacritics(s.normalize("NFD")).toLowerCase()

const CityAutocomplete = ({
  label,
  name,
  value,
  onChange,
  suggestions,
  required,
  autoComplete,
  ...props
}: CityAutocompleteProps) => {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    if (!value) {
      return suggestions
    }
    const needle = normalize(value)
    return suggestions.filter((city) => normalize(city).includes(needle))
  }, [value, suggestions])

  const selectCity = (city: string) => {
    onChange({
      target: { name, value: city },
    } as React.ChangeEvent<HTMLInputElement>)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) {
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % matches.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((i) => (i - 1 + matches.length) % matches.length)
    } else if (e.key === "Enter" && matches[highlighted]) {
      e.preventDefault()
      selectCity(matches[highlighted])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="flex flex-col w-full relative">
      <div className="flex relative z-0 w-full txt-compact-medium">
        <input
          ref={inputRef}
          type="text"
          name={name}
          autoComplete={autoComplete}
          placeholder=" "
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e)
            setHighlighted(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          className="pt-4 pb-1 block w-full h-11 px-4 mt-0 bg-white border border-gm-border rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-gm-gold/40 focus:border-gm-gold hover:border-gm-ink-muted transition-colors"
          {...props}
        />
        <label
          htmlFor={name}
          onClick={() => inputRef.current?.focus()}
          className="flex items-center justify-center mx-3 px-1 transition-all absolute duration-300 top-3 -z-1 origin-0 text-gm-ink-muted"
        >
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
      </div>
      {open && matches.length > 0 && (
        <ul className="absolute top-full mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gm-border bg-white shadow-lg z-20 py-1">
          {matches.map((city, i) => (
            <li key={city}>
              <button
                type="button"
                // onMouseDown (pas onClick) : se déclenche avant le blur de
                // l'input, sinon la liste se referme avant que le clic soit
                // pris en compte.
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectCity(city)
                }}
                className={`block w-full px-4 py-2 text-left text-sm ${
                  i === highlighted
                    ? "bg-gm-gold/10 text-gm-ink"
                    : "text-gm-ink-muted hover:bg-gm-gold/5"
                }`}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default CityAutocomplete
