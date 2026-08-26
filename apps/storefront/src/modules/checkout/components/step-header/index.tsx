import { clx, Heading } from "@modules/common/components/ui"

type StepStatus = "completed" | "active" | "disabled"

type StepHeaderProps = {
  step: number
  title: string
  status: StepStatus
  summary?: string
  onEdit?: () => void
  editTestId?: string
  summaryTestId?: string
}

const StepHeader = ({
  step,
  title,
  status,
  summary,
  onEdit,
  editTestId,
  summaryTestId,
}: StepHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={clx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold font-display",
            status === "completed" && "bg-gm-violet text-gm-on-violet",
            status === "active" && "bg-gm-gold text-gm-ink",
            status === "disabled" && "bg-gm-ivoire-2 text-gm-ink-muted"
          )}
        >
          {status === "completed" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M13.5 4.5L6.5 11.5L3 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            step
          )}
        </span>
        <div className="min-w-0">
          <Heading
            level="h2"
            className={clx("text-lg", status === "disabled" && "text-gm-ink-muted")}
          >
            {title}
          </Heading>
          {summary && (
            <p className="text-sm text-gm-ink-muted truncate" data-testid={summaryTestId}>
              {summary}
            </p>
          )}
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-sm font-semibold text-gm-amethyst hover:underline"
          data-testid={editTestId}
        >
          Modifier
        </button>
      )}
    </div>
  )
}

export default StepHeader
