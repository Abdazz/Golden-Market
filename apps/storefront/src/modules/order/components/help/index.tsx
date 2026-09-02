import { CONTACT } from "@lib/contact"
import { Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import React from "react"

// Liens réels vers les vrais canaux de contact de la marque (voir lib/contact.ts)
// - pas de page /contact générique inexistante sur ce storefront.
const Help = () => {
  return (
    <div className="mt-6">
      <Heading className="text-base-semi">Besoin d&apos;aide ?</Heading>
      <div className="text-base-regular my-2">
        <ul className="gap-y-2 flex flex-col">
          <li>
            <a href={CONTACT.whatsapp.href} target="_blank" rel="noreferrer">
              Nous écrire sur WhatsApp
            </a>
          </li>
          <li>
            <LocalizedClientLink href="/conditions-generales">
              Retours et échanges
            </LocalizedClientLink>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Help
