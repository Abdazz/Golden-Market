import { Metadata } from "next"

import { Heading, Text } from "@modules/common/components/ui"

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Golden Market collecte, utilise et protège vos données personnelles.",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="content-container py-16 max-w-3xl">
      <Heading level="h1" className="mb-8">
        Politique de confidentialité
      </Heading>
      <Text className="text-gm-ink-muted mb-10">
        Dernière mise à jour : 30 août 2026
      </Text>

      <div
        className="flex flex-col gap-y-10 text-gm-ink"
        data-testid="privacy-policy-content"
      >
        <section>
          <Heading level="h2" className="mb-3">
            Données que nous collectons
          </Heading>
          <Text className="mb-2">
            Lorsque vous passez commande sur Golden Market, nous collectons :
          </Text>
          <ul className="list-disc pl-6 flex flex-col gap-y-1">
            <li>Votre nom et prénom</li>
            <li>Votre adresse de livraison</li>
            <li>Votre numéro de téléphone</li>
            <li>Votre adresse email</li>
          </ul>
          <Text className="mt-3">
            Si vous créez un compte, ces informations sont conservées pour
            faciliter vos prochaines commandes. Si vous commandez sans
            compte, elles sont conservées le temps nécessaire au traitement
            et au suivi de votre commande.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Paiement
          </Heading>
          <Text>
            Le paiement se fait par Orange Money, par transfert manuel
            directement entre vous et le marchand : Golden Market ne
            collecte, ne traite ni ne stocke aucune donnée de carte
            bancaire ou d&apos;identifiant de paiement. Seul le numéro de
            téléphone Orange Money utilisé pour le transfert peut être
            communiqué au marchand pour confirmer la réception du paiement.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Utilisation de vos données
          </Heading>
          <Text className="mb-2">Vos données sont utilisées uniquement pour :</Text>
          <ul className="list-disc pl-6 flex flex-col gap-y-1">
            <li>Traiter et livrer votre commande</li>
            <li>Vous envoyer un email de confirmation de commande</li>
            <li>Vous contacter en cas de question sur votre commande</li>
          </ul>
          <Text className="mt-3">
            Nous ne vendons ni ne partageons vos données avec des tiers à
            des fins commerciales ou publicitaires.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Vos droits
          </Heading>
          <Text>
            Vous pouvez à tout moment demander à consulter, corriger ou
            supprimer les données que nous détenons sur vous en nous
            contactant à l&apos;adresse indiquée ci-dessous.
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Responsable du traitement
          </Heading>
          <Text>
            Golden Market — [raison sociale, forme juridique et numéro
            d&apos;enregistrement à compléter par le propriétaire de la
            boutique avant lancement].
          </Text>
        </section>

        <section>
          <Heading level="h2" className="mb-3">
            Nous contacter
          </Heading>
          <Text>
            Pour toute question concernant cette politique de
            confidentialité ou vos données personnelles, contactez-nous à{" "}
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
