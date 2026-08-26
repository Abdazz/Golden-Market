const Radio = ({
  checked,
  "data-testid": dataTestId,
}: {
  checked: boolean
  "data-testid"?: string
}) => {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className="group relative flex h-5 w-5 shrink-0 items-center justify-center outline-none"
      data-testid={dataTestId || "radio-button"}
    >
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-gm-border bg-white transition-colors group-data-[state=checked]:border-gm-violet group-data-[state=checked]:bg-gm-violet">
        {checked && <div className="h-1.5 w-1.5 rounded-full bg-gm-on-violet" />}
      </div>
    </button>
  )
}

export default Radio
