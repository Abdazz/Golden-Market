import { Metadata } from "next"

import { Heading, Text } from "@modules/common/components/ui"

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Les conditions générales de vente et d'utilisation de Golden Market.",
}

export default function TermsOfServicePage() {
  return (
    <div className="content-container py-16 max-w-3xl">
      <Heading level="h1" className="mb-8">
        Conditions générales de vente
      </Heading>
      <Text className="text-gm-ink-muted mb-10">
        Dernière mise à jour : 30 août 2026
      </Text>

      <div
        className="flex flex-col gap-y-10 text-gm-ink"
        data-testid="terms-of-service-content"
      >
        <section>
          <Heading level="h2" className="mb-3">
            Objet
          </Heading>
          <Text>
            Les présentes conditions générales de vente régissent les
            achats effectués sur le site Golden Market par les clients
            résidant au Burkina Faso.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Commande
          </Heading>
          <Text>
            Toute commande passée sur le site vaut acceptation des présentes
            conditions générales. Une fois votre commande confirmée, vous
            recevez un email récapitulatif ainsi qu&apos;une page de
            confirmation indiquant le numéro de votre commande.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Paiement
          </Heading>
          <Text>
            Le paiement s&apos;effectue exclusivement par Orange Money, par
            transfert manuel au numéro indiqué lors du paiement. Votre
            commande est traitée après confirmation de la réception du
            paiement par le marchand.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Livraison
          </Heading>
          <Text>
            Les commandes sont expédiées depuis Ouagadougou. Le montant et
            le délai de livraison sont convenus directement avec le
            marchand après la commande, en fonction de votre localisation.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Échanges et retours
          </Heading>
          <Text>
            En cas de problème avec un produit reçu, contactez-nous : nous
            trouverons ensemble une solution d&apos;échange ou de
            remboursement.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Nous contacter
          </Heading>
          <Text>
            Pour toute question relative à ces conditions générales,
            contactez-nous à{" "}
            <a
              href="mailto:commandes@golden-market.co"
              className="text-gm-violet underline"
            >
              commandes@golden-market.co
            </a>
            .
          </Text>
        </section>
      </div>
    </div>
  )
}
