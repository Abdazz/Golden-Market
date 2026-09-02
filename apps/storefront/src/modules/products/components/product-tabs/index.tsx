"use client"

import { useState } from "react"
import { CONTACT } from "@lib/contact"
import Back from "@modules/common/icons/back"
import FastDelivery from "@modules/common/icons/fast-delivery"
import Refresh from "@modules/common/icons/refresh"

import Accordion from "./accordion"
import { HttpTypes } from "@medusajs/types"

// Nombre de caractères affichés avant troncature de la description produit
// (palier 2 du backlog du 2026-09-02 : dépliée par défaut, "Lire plus" au-delà).
const DESCRIPTION_TRUNCATE_LENGTH = 220

type ProductTabsProps = {
  product: HttpTypes.StoreProduct
}

const ProductTabs = ({ product }: ProductTabsProps) => {
  const tabs = [
    {
      label: "Description",
      component: <DescriptionTab product={product} />,
    },
    {
      label: "Livraison et retours",
      component: <ShippingInfoTab />,
    },
    {
      label: "Moyens de paiement",
      component: <PaymentMethodsTab />,
    },
  ]

  return (
    <div className="w-full">
      <Accordion type="multiple" defaultValue={["Description"]}>
        {tabs.map((tab, i) => (
          <Accordion.Item
            key={i}
            title={tab.label}
            headingSize="medium"
            value={tab.label}
          >
            {tab.component}
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  )
}

const DescriptionTab = ({ product }: ProductTabsProps) => {
  const [expanded, setExpanded] = useState(false)
  const description = product.description || "Aucune description fournie pour ce produit."
  const isTruncatable = description.length > DESCRIPTION_TRUNCATE_LENGTH

  const shownText =
    isTruncatable && !expanded
      ? `${description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()}…`
      : description

  return (
    <div className="py-4 text-sm leading-relaxed whitespace-pre-line">
      {shownText}
      {isTruncatable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 font-semibold text-gm-violet hover:underline"
        >
          {expanded ? "Réduire" : "Lire plus…"}
        </button>
      )}
    </div>
  )
}

const ShippingInfoTab = () => {
  return (
    <div className="py-4">
      <div className="grid grid-cols-1 gap-y-6 text-sm">
        <div className="flex items-start gap-x-2">
          <FastDelivery />
          <div>
            <span className="font-semibold">Livraison partout au Burkina Faso</span>
            <p className="max-w-sm">
              Si vous êtes à Ouagadougou, nous vous livrons à domicile
              gratuitement en fonction du produit. Si vous êtes dans une
              autre ville, votre colis est expédié depuis Ouagadougou via la
              compagnie de transport de votre choix.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Refresh />
          <div>
            <span className="font-semibold">Échanges simples</span>
            <p className="max-w-sm">
              Un souci avec votre produit ? Contactez-nous, nous trouverons
              une solution pour l&apos;échanger.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Back />
          <div>
            <span className="font-semibold">Satisfait ou remboursé</span>
            <p className="max-w-sm">
              Retournez-nous simplement votre produit, nous vous remboursons
              intégralement. Contactez-nous sur WhatsApp pour lancer un
              retour, sans question posée.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const PaymentMethodsTab = () => {
  return (
    <div className="py-4 text-sm leading-relaxed flex flex-col gap-2">
      <p>
        Le paiement se fait par transfert Orange Money ou Moov Money, sans
        carte bancaire — à la dernière étape de la commande, vous recevez le
        numéro et le montant exact à envoyer. Si vous êtes à Ouagadougou,
        vous pouvez aussi payer en espèces directement à la réception de
        votre colis.
      </p>
      <p>
        Pour un paiement Mobile Money, votre commande est confirmée dès que
        notre équipe reçoit le transfert. Une question ? Écrivez-nous sur
        WhatsApp au{" "}
        <a
          href={CONTACT.whatsapp.href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-gm-violet hover:underline"
        >
          {CONTACT.whatsapp.display}
        </a>
        .
      </p>
    </div>
  )
}

export default ProductTabs
