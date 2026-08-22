import http from "http"
import type { AddressInfo } from "net"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import seedRegionBf from "../../src/scripts/seed-region-bf"

// Démarrage de l'app Medusa (migrations + chargement des modules) plus lent
// que le hook timeout Jest par défaut (5s).
jest.setTimeout(60000)

// Même provider_id que celui utilisé par seed-region-bf.ts pour lier Orange
// Money à la région Burkina Faso (rules: { "customer.groups.id": ... } côté
// variant n'entre pas en jeu ici, seul le prix détail est testé).
const ORANGE_MONEY_PROVIDER_ID = "pp_orange-money-manual_orange-money-manual"

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Parcours critique : panier -> checkout -> paiement Orange Money -> commande", () => {
      let regionId: string
      let salesChannelId: string
      let variantId: string
      let publishableKey: string

      beforeAll(async () => {
        const container = getContainer()

        // Sur une vraie base (dev/prod), un profil de livraison par défaut existe déjà
        // (créé par le seed initial du scaffold, migration-scripts/initial-data-seed.ts)
        // — seed-region-bf.ts s'appuie dessus sans le créer lui-même. La base de test
        // éphémère créée par medusaIntegrationTestRunner n'exécute que les migrations,
        // pas ce seed : il faut donc le créer explicitement ici pour reproduire l'état
        // réel dont seed-region-bf.ts dépend.
        const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
        const existingProfiles = await fulfillmentModuleService.listShippingProfiles()
        if (existingProfiles.length === 0) {
          await fulfillmentModuleService.createShippingProfiles({
            name: "Default Shipping Profile",
            type: "default",
          })
        }

        // Réutilise le script de seed réel (Phase 1) plutôt que de dupliquer sa
        // logique : région XOF, Orange Money comme seul payment provider,
        // fulfillment set + option de livraison pour le Burkina Faso.
        await seedRegionBf({ container })

        const regionModuleService = container.resolve(Modules.REGION)
        const [region] = await regionModuleService.listRegions({
          name: "Burkina Faso",
        })
        regionId = region.id

        const storeModuleService = container.resolve(Modules.STORE)
        const [store] = await storeModuleService.listStores()
        salesChannelId = store.default_sales_channel_id!

        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: shippingProfiles } = await query.graph({
          entity: "shipping_profile",
          fields: ["id"],
        })

        // Produit minimal, sur le même modèle que import-catalog.ts :
        // shipping_profile_id obligatoire (sinon requires_shipping silencieusement
        // false, bug réel découvert et corrigé en Phase 1) et manage_inventory:false
        // (Golden Market ne suit pas l'inventaire au niveau variant).
        const { result: products } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Produit de test — parcours Orange Money",
                status: ProductStatus.PUBLISHED,
                shipping_profile_id: shippingProfiles[0].id,
                sales_channels: [{ id: salesChannelId }],
                options: [{ title: "Title", values: ["Default Title"] }],
                variants: [
                  {
                    title: "Default Title",
                    options: { Title: "Default Title" },
                    manage_inventory: false,
                    prices: [{ amount: 5000, currency_code: "xof" }],
                  },
                ],
              },
            ],
          },
        })
        variantId = products[0].variants![0].id

        // Toute route /store/* exige une clé publishable liée au sales channel
        // (piège documenté dans ARCHITECTURE.md) — aucune n'existe par défaut sur
        // une base de test fraîche, il faut la créer explicitement.
        const { result: apiKeys } = await createApiKeysWorkflow(container).run({
          input: {
            api_keys: [
              {
                type: "publishable",
                title: "Clé de test",
                created_by: "integration-test",
              },
            ],
          },
        })
        publishableKey = apiKeys[0].token

        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: { id: apiKeys[0].id, add: [salesChannelId] },
        })
      })

      // Rejoue tout le parcours (panier -> ... -> complete) et renvoie la commande créée.
      // Partagé par les deux tests ci-dessous : le premier vérifie le statut de paiement,
      // le second le contrat du webhook n8n envoyé sur order.placed — chacun a besoin de
      // sa propre commande (un panier ne se complète qu'une fois).
      async function placeOrder(email: string) {
        const headers = { "x-publishable-api-key": publishableKey }

        const { data: cartData } = await api.post(
          "/store/carts",
          {
            region_id: regionId,
            sales_channel_id: salesChannelId,
            email,
            items: [{ variant_id: variantId, quantity: 1 }],
            shipping_address: {
              country_code: "bf",
              city: "Ouagadougou",
              address_1: "Test",
            },
          },
          { headers }
        )
        const cartId = cartData.cart.id
        expect(cartData.cart.items).toHaveLength(1)

        const { data: shippingOptionsData } = await api.get(
          `/store/shipping-options?cart_id=${cartId}`,
          { headers }
        )
        expect(shippingOptionsData.shipping_options.length).toBeGreaterThan(0)
        const shippingOptionId = shippingOptionsData.shipping_options[0].id

        await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: shippingOptionId },
          { headers }
        )

        const { data: paymentCollectionData } = await api.post(
          "/store/payment-collections",
          { cart_id: cartId },
          { headers }
        )
        const paymentCollectionId = paymentCollectionData.payment_collection.id

        await api.post(
          `/store/payment-collections/${paymentCollectionId}/payment-sessions`,
          { provider_id: ORANGE_MONEY_PROVIDER_ID },
          { headers }
        )

        const { data: completeData } = await api.post(
          `/store/carts/${cartId}/complete`,
          {},
          { headers }
        )
        expect(completeData.type).toBe("order")
        return completeData.order as { id: string; email: string }
      }

      it("crée une commande avec le paiement autorisé via Orange Money", async () => {
        const order = await placeOrder("client-test@golden-market.co")
        expect(order.email).toBe("client-test@golden-market.co")

        const headers = { "x-publishable-api-key": publishableKey }
        // payment_status n'est pas un champ persisté sur order (donc absent de la
        // réponse de /complete, qui fait un query.graph brut) : c'est une valeur
        // calculée par getOrderDetailWorkflow à partir des payment_collections,
        // exposée via GET /store/orders/:id — exactement l'appel que fait la page
        // de confirmation du storefront (voir order/components/payment-details).
        const { data: orderData } = await api.get(
          `/store/orders/${order.id}?fields=%2Bpayment_status`,
          { headers }
        )
        // orange-money-manual autorise immédiatement (voir
        // src/modules/orange-money-manual.ts) : la confirmation humaine du
        // paiement réel se fait ensuite manuellement dans l'admin (capture).
        expect(orderData.order.payment_status).toBe("authorized")
      })

      it("notifie le webhook n8n avec le détail de la commande (order.placed)", async () => {
        // Pas de vrai n8n disponible (voir HANDOFF.md/ROADMAP.md — aucun workflow
        // récepteur n'existe encore côté n8n_automation) : un petit serveur HTTP local
        // tient lieu de récepteur pour valider le contrat réellement envoyé par le
        // subscriber order-placed.ts contre une vraie commande.
        let received: any = null
        const server = http.createServer((req, res) => {
          const chunks: Buffer[] = []
          req.on("data", (chunk) => chunks.push(chunk))
          req.on("end", () => {
            received = JSON.parse(Buffer.concat(chunks).toString("utf-8"))
            res.writeHead(200)
            res.end()
          })
        })
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
        const port = (server.address() as AddressInfo).port
        const previousWebhookUrl = process.env.N8N_ORDER_WEBHOOK_URL
        process.env.N8N_ORDER_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook`

        try {
          const order = await placeOrder("webhook-test@golden-market.co")

          // order.placed est traité par le subscriber avant que la réponse HTTP de
          // /complete ne revienne (event bus local synchrone), mais on tolère un court
          // délai pour éviter toute fragilité si ça changeait.
          for (let i = 0; i < 20 && received === null; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }

          expect(received).toMatchObject({
            order_id: order.id,
            provider: "orange-money-manual",
            email: "webhook-test@golden-market.co",
            currency_code: "xof",
            items: [{ title: "Produit de test — parcours Orange Money", quantity: 1 }],
          })
          expect(typeof received.display_id).toBe("number")
          expect(typeof received.total).toBe("number")
        } finally {
          process.env.N8N_ORDER_WEBHOOK_URL = previousWebhookUrl
          await new Promise<void>((resolve) => server.close(() => resolve()))
        }
      })
    })
  },
})
