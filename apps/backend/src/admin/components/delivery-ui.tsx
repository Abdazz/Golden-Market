import { useCallback, useEffect, useState } from "react"
import { api } from "../lib/deliveries"
import type { Courier } from "../lib/deliveries"

// Styles et petits composants partagés par la page "Livraisons" et ses
// onglets (spec 2026-09-28 livreurs-livraisons, stock-livreurs).

export const inputClass =
  "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
export const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
export const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"
export const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg"

export type Notice = { kind: "error" | "warning" | "success"; text: string } | null

export const NoticeText = ({ notice }: { notice: Notice }) =>
  notice ? (
    <p
      className={`txt-compact-small ${
        notice.kind === "error"
          ? "text-ui-fg-error"
          : notice.kind === "warning"
            ? "text-ui-tag-orange-text"
            : "text-ui-tag-green-text"
      }`}
    >
      {notice.text}
    </p>
  ) : null

export const Badge = ({ className, children }: { className: string; children: string }) => (
  <span className={`txt-compact-xsmall-plus whitespace-nowrap rounded-full px-2 py-0.5 ${className}`}>{children}</span>
)

export const useCouriers = () => {
  const [couriers, setCouriers] = useState<Courier[] | null>(null)
  const reload = useCallback(() => {
    api<{ couriers: Courier[] }>("/admin/couriers")
      .then((r) => setCouriers(r.couriers))
      .catch(() => setCouriers([]))
  }, [])
  useEffect(reload, [reload])
  return { couriers, reload }
}
