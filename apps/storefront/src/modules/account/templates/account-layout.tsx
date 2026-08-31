import React from "react"

import { clx } from "@modules/common/components/ui"
import Breadcrumb from "@modules/common/components/breadcrumb"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({ customer, children }) => {
  return (
    <div className="flex-1 pb-16" data-testid="account-page">
      <div className="content-container">
        <Breadcrumb
          items={[{ label: "Accueil", href: "/" }, { label: "Mon compte" }]}
        />
        <div
          className={clx("grid gap-8 items-start", {
            "grid-cols-1 small:grid-cols-[220px_1fr]": customer,
            "grid-cols-1": !customer,
          })}
        >
          {customer && (
            <div>
              <AccountNav customer={customer} />
            </div>
          )}
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
