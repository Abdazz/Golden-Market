import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

// Libellés français des statuts bruts Medusa (fulfillment_status /
// payment_status). Valeur inconnue -> repli sur le texte brut plutôt que de
// planter (nouvelle valeur ajoutée côté Medusa sans mise à jour ici).
const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  not_fulfilled: "Non préparée",
  partially_fulfilled: "Partiellement préparée",
  fulfilled: "Préparée",
  partially_shipped: "Partiellement expédiée",
  shipped: "Expédiée",
  partially_delivered: "Partiellement livrée",
  delivered: "Livrée",
  canceled: "Annulée",
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_paid: "Non payée",
  awaiting: "En attente de paiement",
  captured: "Paiement reçu",
  partially_captured: "Paiement partiellement reçu",
  partially_refunded: "Partiellement remboursée",
  refunded: "Remboursée",
  canceled: "Annulée",
  requires_action: "Action requise",
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const formatStatus = (str: string, labels: Record<string, string>) =>
    labels[str] ?? str

  return (
    <div>
      {order.email && (
        <Text>
          Nous avons envoyé les détails de confirmation de commande à{" "}
          <span
            className="text-ui-fg-medium-plus font-semibold"
            data-testid="order-email"
          >
            {order.email}
          </span>
          .
        </Text>
      )}
      <Text className="mt-2">
        Date de la commande :{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        Numéro de commande :{" "}
        <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              Statut de la commande :{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {formatStatus(order.fulfillment_status, FULFILLMENT_STATUS_LABELS)}
              </span>
            </Text>
            <Text>
              Statut du paiement :{" "}
              <span
                className="text-ui-fg-subtle "
                data-testid="order-payment-status"
              >
                {formatStatus(order.payment_status, PAYMENT_STATUS_LABELS)}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetails
