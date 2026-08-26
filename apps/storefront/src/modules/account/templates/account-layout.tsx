import React from "react"

import { clx } from "@modules/common/components/ui"
import UnderlineLink from "@modules/common/components/interactive-link"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({ customer, children }) => {
  return (
    <div className="flex-1 py-8 small:py-12" data-testid="account-page">
      <div className="content-container max-w-5xl mx-auto flex flex-col gap-y-8">
        <div
          className={clx("grid gap-8 items-start", {
            "grid-cols-1 small:grid-cols-[240px_1fr]": customer,
            "grid-cols-1": !customer,
          })}
        >
          <div>{customer && <AccountNav customer={customer} />}</div>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
        <div className="rounded-2xl border border-gm-border bg-white p-6 flex flex-col small:flex-row items-start small:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-gm-ink mb-1">
              Des questions ?
            </h3>
            <span className="text-sm text-gm-ink-muted">
              Retrouvez les réponses aux questions fréquentes sur notre page service client.
            </span>
          </div>
          <UnderlineLink href="/customer-service">Service client</UnderlineLink>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
