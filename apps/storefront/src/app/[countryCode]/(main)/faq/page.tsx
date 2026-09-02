import { Metadata } from "next"

import { CONTACT } from "@lib/contact"
import Breadcrumb from "@modules/common/components/breadcrumb"
import { Heading } from "@modules/common/components/ui"
import Accordion from "@modules/products/components/product-tabs/accordion"

export const metadata: Metadata = {
  title: "Questions fréquentes",
  description:
    "Réponses aux questions les plus fréquentes sur les commandes, le paiement, la livraison et les retours chez Golden Market.",
}

// Contenu statique réel, aligné sur le comportement effectif du site et sur
// conditions-generales/page.tsx - aucune promesse (délai, moyen de paiement)
// qui ne soit pas déjà réellement implémentée.
const FAQ_ITEMS: { question: string; answer: React.ReactNode }[] = [
  {
    question: "Comment passer une commande ?",
    answer:
      "Ajoutez les produits souhaités à votre panier, puis suivez les étapes de paiement : adresse de livraison, mode de livraison, puis paiement. Vous recevez ensuite une page de confirmation avec le numéro de votre commande.",
  },
  {
    question: "Dois-je créer un compte pour commander ?",
    answer:
      "Non, vous pouvez commander sans créer de compte. Créer un compte vous permet simplement de retrouver l'historique de vos commandes et vos adresses plus rapidement la prochaine fois.",
  },
  {
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Le paiement s'effectue par transfert manuel Orange Money ou Moov Money, au numéro indiqué à la dernière étape de la commande, ou en espèces à la réception de votre colis si vous êtes livré à Ouagadougou. Pour un paiement Mobile Money, votre commande est confirmée dès que nous recevons le transfert.",
  },
  {
    question: "Livrez-vous partout au Burkina Faso ?",
    answer:
      "Oui. Si vous êtes à Ouagadougou, la livraison à domicile est gratuite en fonction du produit. Si vous êtes dans une autre ville, votre colis est expédié depuis Ouagadougou via la compagnie de transport de votre choix.",
  },
  {
    question: "Puis-je suivre ma commande ?",
    answer:
      "Oui, depuis votre compte, rubrique \"Commandes\", vous retrouvez le statut de chaque commande passée.",
  },
  {
    question: "Comment retourner un produit ou obtenir un remboursement ?",
    answer: (
      <>
        Contactez-nous directement sur WhatsApp au{" "}
        <a
          href={CONTACT.whatsapp.href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-gm-violet hover:underline"
        >
          {CONTACT.whatsapp.display}
        </a>{" "}
        pour lancer un retour : nous vous remboursons intégralement, sans
        question posée.
      </>
    ),
  },
  {
    question: "Comment vous contacter ?",
    answer: (
      <>
        Par WhatsApp au{" "}
        <a
          href={CONTACT.whatsapp.href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-gm-violet hover:underline"
        >
          {CONTACT.whatsapp.display}
        </a>
        , par téléphone au{" "}
        <a href={CONTACT.phone.href} className="font-semibold text-gm-violet hover:underline">
          {CONTACT.phone.display}
        </a>{" "}
        ou par email à{" "}
        <a
          href={CONTACT.email.href}
          className="font-semibold text-gm-violet hover:underline"
        >
          {CONTACT.email.display}
        </a>
        .
      </>
    ),
  },
]

export default function FaqPage() {
  return (
    <div className="content-container py-10 max-w-3xl">
      <Breadcrumb
        items={[{ label: "Accueil", href: "/" }, { label: "FAQ" }]}
      />
      <Heading level="h1" className="mb-2">
        Questions fréquentes
      </Heading>
      <p className="text-gm-ink-muted mb-8">
        Vous ne trouvez pas votre réponse ? Écrivez-nous sur WhatsApp au{" "}
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

      <Accordion type="multiple" data-testid="faq-accordion">
        {FAQ_ITEMS.map((item) => (
          <Accordion.Item
            key={item.question}
            title={item.question}
            headingSize="medium"
            value={item.question}
          >
            <div className="py-2 text-sm leading-relaxed text-gm-ink-muted">
              {item.answer}
            </div>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  )
}
