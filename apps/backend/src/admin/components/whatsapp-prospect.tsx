import { useCallback, useEffect, useState } from "react"
import { api } from "../lib/deliveries"
import { activeProspectFor, prospectBadge } from "../lib/prospect-match"
import { emptyForm, ProspectForm } from "./prospect-form"

// « Suivre comme prospect » depuis une conversation WhatsApp : badge si le
// numéro est déjà suivi (lien vers la page Prospects), sinon bouton qui
// ouvre le formulaire prérempli (numéro, nom du client).

type ProspectRow = { id: string; phone: string; status: string; follow_up_on: string | null; product: string | null }

export const WhatsappProspect = ({ phoneNumber, customerName }: { phoneNumber: string; customerName: string | null }) => {
  const [active, setActive] = useState<ProspectRow | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    const digits = phoneNumber.replace(/\D/g, "").slice(-8)
    api<{ all: ProspectRow[] }>(`/admin/prospects?q=${digits}`)
      .then((r) => setActive(activeProspectFor(r.all, phoneNumber)))
      .catch(() => setActive(null))
  }, [phoneNumber])
  useEffect(() => {
    setOpen(false)
    load()
  }, [load])

  if (active === undefined) return null
  if (active) {
    return (
      <a
        href="/app/prospects"
        className="txt-compact-xsmall-plus rounded-full bg-ui-tag-blue-bg px-2 py-1 text-ui-tag-blue-text"
      >
        {prospectBadge(active)}
      </a>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="txt-compact-small-plus rounded-md border border-ui-border-base px-3 py-1.5"
      >
        Suivre comme prospect
      </button>
      {open && (
        <div className="w-full">
          <ProspectForm
            initial={{ ...emptyForm(), phone: `+${phoneNumber.replace(/\D/g, "")}`, name: customerName ?? "" }}
            onSaved={() => {
              setOpen(false)
              load()
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </>
  )
}
