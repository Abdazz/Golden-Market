import { useState } from "react"
import { api } from "../lib/deliveries"
import { primaryButton, secondaryButton } from "./delivery-ui"

// Boutons « Marquer non payée » / « Marquer non livrée » (2026-10-16) de la
// fiche commande : confirmation sur place avec ce qui sera défait, puis
// rechargement de la fiche. Affichés seulement dans la fenêtre de 24 h
// (undo.*.available renvoyé par GET /admin/order-payments/:id).
export type UndoWindow = { available: boolean; until: string | null }
export type UndoInfo = { paid: UndoWindow; delivered: UndoWindow }

const TEXT = {
  paid: {
    label: "Marquer non payée",
    path: "undo-paid",
    reminder:
      "La commande redeviendra non payée (montant dû, ou paiement à la livraison « Autorisé ») : paiement retiré de la commande, vente et frais retirés de la caisse.",
  },
  delivered: {
    label: "Marquer non livrée",
    path: "undo-delivered",
    reminder:
      "La livraison sera défaite : expédition supprimée, stock remis (dépôt et livreur), frais de la livraison retirés de la caisse ; la livraison revient « Confiée » dans la tournée du jour.",
  },
}

// Ouagadougou = UTC : "2026-10-16T08:05:00.000Z" -> "16/10 à 08:05".
const untilText = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} à ${iso.slice(11, 16)}`

export const UndoAction = ({ orderId, kind, window: w }: { orderId: string; kind: "paid" | "delivered"; window?: UndoWindow }) => {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!w?.available || !w.until) return null
  const t = TEXT[kind]

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/order-payments/${orderId}/${t.path}`, { method: "POST" })
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      {confirm ? (
        <div className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
          <span className="txt-compact-small text-ui-fg-base">{t.reminder}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} disabled={busy} onClick={run}>
              {busy ? "Annulation…" : "Oui, annuler"}
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setConfirm(false)}>
              Non
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="txt-compact-small text-ui-fg-subtle">Annulation possible jusqu'au {untilText(w.until)}</span>
          <button type="button" className={secondaryButton} onClick={() => setConfirm(true)}>
            {t.label}
          </button>
        </div>
      )}
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
    </div>
  )
}
