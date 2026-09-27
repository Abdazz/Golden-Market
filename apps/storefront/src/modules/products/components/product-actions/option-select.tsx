import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"
import React from "react"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  // Ordre défini dans l'admin (rang de la valeur), pas l'ordre de création.
  const filteredOptions = [...(option.values ?? [])]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((v) => v.value)

  return (
    <div className="flex flex-col gap-y-2">
      {/* Charte Golden Market : pilules arrondies comme le sélecteur de
          quantité, option choisie en violet (comme les boutons secondaires). */}
      <span className="text-sm text-gm-ink-muted">
        {title}
        {current && (
          <>
            {" : "}
            <span className="font-semibold text-gm-ink">{current}</span>
          </>
        )}
      </span>
      <div className="flex flex-wrap gap-2" data-testid={dataTestId}>
        {filteredOptions.map((v) => {
          const selected = v === current
          return (
            <button
              type="button"
              onClick={() => updateOption(option.id, v)}
              key={v}
              aria-pressed={selected}
              className={clx(
                "min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-150 disabled:opacity-40",
                selected
                  ? "border-gm-violet bg-gm-violet text-gm-on-violet"
                  : "border-gm-border bg-gm-ivoire-2 text-gm-ink hover:border-gm-violet hover:text-gm-violet"
              )}
              disabled={disabled}
              data-testid="option-button"
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect
