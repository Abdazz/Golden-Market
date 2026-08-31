"use client"

import { CONTACT } from "@lib/contact"
import Back from "@modules/common/icons/back"
import FastDelivery from "@modules/common/icons/fast-delivery"
import Refresh from "@modules/common/icons/refresh"

import Accordion from "./accordion"
import { HttpTypes } from "@medusajs/types"

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
      label: "Paiement Orange Money",
      component: <OrangeMoneyTab />,
    },
  ]

  return (
    <div className="w-full">
      <Accordion type="multiple">
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
  return (
    <div className="py-4 text-sm leading-relaxed whitespace-pre-line">
      {product.description || "Aucune description fournie pour ce produit."}
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
            <span className="font-semibold">Livraison au Burkina Faso</span>
            <p className="max-w-sm">
              Votre colis est expédié depuis Ouagadougou jusqu&apos;à votre
              adresse ou votre point de retrait.
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
            <span className="font-semibold">Retours faciles</span>
            <p className="max-w-sm">
              Retournez-nous simplement votre produit, nous vous remboursons.
              Aucune question posée, on fait le maximum pour que ce soit sans
              tracas.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const OrangeMoneyTab = () => {
  return (
    <div className="py-4 text-sm leading-relaxed flex flex-col gap-2">
      <p>
        Le paiement se fait par transfert Orange Money, sans carte bancaire.
        À la dernière étape de la commande, vous recevez le numéro et le
        montant exact à envoyer.
      </p>
      <p>
        Une fois le transfert effectué, votre commande est confirmée dès que
        notre équipe reçoit le paiement. Une question ? Écrivez-nous sur
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
