# Commande directe via WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les tools n8n fantômes (`check_stock`, `get_price`, `create_order`, `get_payment_instructions`, `mark_payment_reported`) de l'agent WhatsApp par de vrais appels au Store/Admin API Medusa, pour qu'une commande passée en conversation devienne une vraie commande Golden Market.

**Architecture:** Pas de serveur MCP — les tools n8n appellent directement le Store API (clé publishable, comme le storefront) via des nodes HTTP Request, et l'Admin API (clé secrète, une seule action) pour `mark_payment_reported`. Le tool `place_order` est atomique : l'agent ne l'appelle qu'une fois qu'il a déjà rassemblé articles/adresse/paiement en conversation (l'historique de messages, déjà rechargé à chaque tour, suffit à faire tenir l'état — aucun panier persistant à gérer entre deux tours).

**Tech Stack:** n8n (workflows édités via `mcp__n8n__update_workflow`/`create_workflow_from_code`), Medusa v2 Store/Admin API (HTTP), Medusa.js v2 backend (`apps/backend`, TypeScript, Jest).

**Spec:** `docs/superpowers/specs/2026-09-04-whatsapp-checkout-design.md`

## Global Constraints

- Toute nouvelle commande créée depuis WhatsApp doit suivre exactement les mêmes règles métier que le storefront : téléphone obligatoire, email jamais requis, paiement à la réception uniquement si `city === "Ouagadougou"`.
- Développement et tests contre **staging** Medusa (`https://staging.golden-market.co`, région `reg_01M17QF8ZWE6C7083V2SWEMDXY`) — le basculement vers production (`https://golden-market.co`, région `reg_01M1805Y7M3XEGFF59J7FNWP17`) est un geste explicite, séparé, jamais automatique (Task 9).
- Aucun secret (clé Admin, clé publishable) ne doit apparaître dans un message de conversation ou un fichier commité — uniquement dans `/var/www/n8n/.env` sur le VPS.
- Les workflows n8n n'ont pas de commits git par étape (ils vivent dans l'instance n8n) : chaque tâche n8n se termine par un appel `mcp__n8n__update_workflow`/`create_workflow_from_code` avec un `versionName` explicite, qui joue le rôle du commit.
- Le code backend (`apps/backend`) suit le workflow standard du projet : commit sur `staging`, CI verte, puis `main` en fast-forward, CI verte à nouveau.

---

### Task 1: Suppression du double message de confirmation

**Files:**
- Modify: `apps/backend/src/subscribers/order-placed-customer-whatsapp.ts`
- Test: `apps/backend/src/subscribers/__tests__/order-placed-customer-whatsapp.unit.spec.ts`

**Interfaces:**
- Consumes: `order.metadata` (déjà résolu par `query.graph`, ajouté à la liste `fields` de la requête existante)
- Produces: le subscriber n'appelle plus `fetch(webhookUrl, ...)` quand `order.metadata?.source === "whatsapp"` — Task 4 (`place_order`) doit poser `metadata: { source: "whatsapp" }` sur la commande à la complétion pour que ce guard s'active.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `apps/backend/src/subscribers/__tests__/order-placed-customer-whatsapp.unit.spec.ts`, avant le test `"skips sending when the order has no phone"` :

```typescript
it("skips sending when the order originates from WhatsApp itself (metadata.source)", async () => {
  process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL = "https://n8n.example.com/webhook/order-confirmation"

  graph.mockResolvedValue({
    data: [
      {
        id: "order_123",
        display_id: 42,
        currency_code: "xof",
        total: 8500,
        metadata: { source: "whatsapp" },
        shipping_address: { first_name: "Aminata", phone: "+22670000000" },
        items: [{ product_title: "Produit A" }],
        payment_collections: [{ payments: [{ amount: 8500 }] }],
      },
    ],
  })

  await orderPlacedCustomerWhatsappHandler({
    event: { data: { id: "order_123" } } as any,
    container: container as any,
  })

  expect(fetchMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd apps/backend && npx jest order-placed-customer-whatsapp -t "metadata.source"
```

Expected: FAIL — `fetchMock` est appelé alors que le test attend qu'il ne le soit pas (le guard n'existe pas encore).

- [ ] **Step 3: Ajouter le champ `metadata` à la requête et le guard**

Dans `apps/backend/src/subscribers/order-placed-customer-whatsapp.ts`, modifier le type `OrderConfirmationData` :

```typescript
type OrderConfirmationData = {
  id: string
  display_id: number
  currency_code: string
  total: number
  metadata?: Record<string, unknown> | null
  shipping_address?: { first_name?: string; phone?: string }
  items?: Array<{ product_title?: string }>
  payment_collections?: Array<{
    payments?: Array<{ provider_id?: string; amount?: number }>
  }>
}
```

Ajouter `"metadata"` à la liste `fields` du `query.graph(...)` (juste après `"total"`), puis, juste après la vérification `if (!phone) { ... return }`, ajouter :

```typescript
if (typedOrder.metadata?.source === "whatsapp") {
  logger.info(
    `Commande ${typedOrder.id} placée depuis WhatsApp — confirmation déjà donnée dans la conversation, template ignoré`
  )
  return
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
cd apps/backend && npx jest order-placed-customer-whatsapp
```

Expected: PASS, tous les tests du fichier (y compris les existants).

- [ ] **Step 5: Lancer la suite complète + lint + typecheck**

```bash
cd apps/backend && npx tsc --noEmit && npx eslint src/subscribers/order-placed-customer-whatsapp.ts && npx jest --silent
```

Expected: 0 erreur TypeScript, 0 nouvelle erreur lint (le warning `MedusaError` préexistant reste), tous les tests passent.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/subscribers/order-placed-customer-whatsapp.ts apps/backend/src/subscribers/__tests__/order-placed-customer-whatsapp.unit.spec.ts
git commit -m "Ignore la confirmation WhatsApp template pour les commandes déjà passées via WhatsApp"
```

Ne pas pousser sans confirmation.

---

### Task 2: Variables d'environnement Medusa côté n8n (staging)

**Files:**
- Modify: `/home/yulcom/web/perso/n8n-ai-automation/docker-compose.yml` (clone local canonique, repo `Abdazz/n8n-ai-automation` — c'est ici que toute modification de ce repo doit se faire, jamais directement sur le VPS)
- Modify: `/var/www/n8n/.env` (VPS uniquement, non versionné — contient déjà `WHATSAPP_*`, `ORANGE_MONEY_*`, etc., c'est le seul fichier de cette tâche qui s'édite sur le VPS)

**Interfaces:**
- Produces: `$env.MEDUSA_BACKEND_URL`, `$env.MEDUSA_PUBLISHABLE_KEY`, `$env.MEDUSA_BF_REGION_ID` — consommés par les nodes HTTP Request des Tasks 3, 4, 5, 7.

- [ ] **Step 1: Ajouter le passthrough dans le clone local**

Dans `/home/yulcom/web/perso/n8n-ai-automation/docker-compose.yml`, bloc `environment:` du service `n8n`, juste après la ligne `N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET: ${N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET}` (ajoutée le 2026-09-04), ajouter :

```yaml
      # --- Medusa Store API (commande directe via WhatsApp) ---
      MEDUSA_BACKEND_URL: ${MEDUSA_BACKEND_URL}
      MEDUSA_PUBLISHABLE_KEY: ${MEDUSA_PUBLISHABLE_KEY}
      MEDUSA_BF_REGION_ID: ${MEDUSA_BF_REGION_ID}
```

- [ ] **Step 2: Commit et push depuis le clone local**

```bash
cd /home/yulcom/web/perso/n8n-ai-automation
git add docker-compose.yml
git commit -m "Ajoute les variables Medusa Store API pour la commande directe via WhatsApp"
git push origin main
```

Ne pas pousser sans confirmation explicite de l'utilisateur (même règle que partout ailleurs dans ce projet).

- [ ] **Step 3: Déployer sur le VPS — `git pull`, jamais d'édition directe**

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 "cd /var/www/n8n && git pull origin main"
```

- [ ] **Step 4: Ajouter les valeurs staging à `.env` sur le VPS** (ce fichier n'est pas versionné, il n'existe que sur le VPS)

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 "
if ! grep -q 'MEDUSA_BACKEND_URL' /var/www/n8n/.env; then
  cat >> /var/www/n8n/.env <<'EOF'

# --- Medusa Store API (commande directe via WhatsApp, 2026-09-04) ---
# Valeurs STAGING pendant le développement/test (Task 9 bascule vers prod)
MEDUSA_BACKEND_URL=https://staging.golden-market.co
MEDUSA_PUBLISHABLE_KEY=pk_e68aa03ce4f0060631238eedc137d6f12be40d95cc40e5e0bd8464daf3ffb8a2
MEDUSA_BF_REGION_ID=reg_01M17QF8ZWE6C7083V2SWEMDXY
EOF
  echo inserted
else
  echo 'already present, skipped'
fi
"
```

- [ ] **Step 5: Recréer le conteneur pour charger les nouvelles variables**

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 "cd /var/www/n8n && docker compose up -d n8n"
```

- [ ] **Step 6: Vérifier**

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 \
  "docker exec golden_market_n8n printenv MEDUSA_BACKEND_URL MEDUSA_PUBLISHABLE_KEY MEDUSA_BF_REGION_ID"
```

Expected: les trois valeurs staging s'affichent.

---

### Task 3: Tool `find_products` (remplace `check_stock` + `get_price`)

**Files (n8n):** nouveau workflow, créé via `mcp__n8n__create_workflow_from_code`, nom `Tool - find_products`

**Interfaces:**
- Consumes: `$env.MEDUSA_BACKEND_URL`, `$env.MEDUSA_PUBLISHABLE_KEY`, `$env.MEDUSA_BF_REGION_ID` (Task 2)
- Produces: sortie `{ result: string }` — un résumé textuel produit(s)/prix/disponibilité, dans le même format que l'actuel `check_stock`/`get_price` (`"<nom> : <prix> FCFA, <N> en stock"` ou `"rupture de stock"`), pour que le prompt système de l'AI Agent (Task 7) n'ait pas besoin de changer sa façon de lire la réponse.

- [ ] **Step 1: Lire la référence SDK n8n**

```
mcp__n8n__get_sdk_reference
```

- [ ] **Step 2: Récupérer les définitions de nodes nécessaires**

```
mcp__n8n__get_node_types({
  nodeIds: [
    { nodeId: "n8n-nodes-base.executeWorkflowTrigger" },
    { nodeId: "n8n-nodes-base.httpRequest" },
    { nodeId: "n8n-nodes-base.code" }
  ]
})
```

- [ ] **Step 3: Écrire et valider le code du workflow**

```typescript
import { workflow, trigger, node, expr } from '@n8n/workflow-sdk';

const inputTrigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: {
    name: 'When Executed by Another Workflow',
    parameters: { workflowInputs: { values: [{ name: 'product_name' }] } }
  }
});

const searchProducts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Search Medusa Products',
    parameters: {
      method: 'GET',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/products'),
      authentication: 'none',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'q', value: expr('{{ $json.product_name }}') },
          { name: 'region_id', value: expr('{{ $env.MEDUSA_BF_REGION_ID }}') },
          { name: 'fields', value: 'title,handle,*variants.calculated_price,*variants.inventory_quantity,*variants.id' },
          { name: 'limit', value: '5' }
        ]
      },
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }
        ]
      },
      options: {}
    }
  }
});

const formatResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Format Result',
    parameters: {
      jsCode: `
const products = $input.first().json.products || [];

if (products.length === 0) {
  return { json: { result: "Aucun produit trouvé avec ce nom." } };
}

const summary = products.map(p => {
  const variant = p.variants?.[0];
  const price = variant?.calculated_price?.calculated_amount;
  const qty = variant?.inventory_quantity;
  const priceText = price != null ? \`\${price} FCFA\` : 'prix indisponible';
  const stockText = qty > 0 ? \`\${qty} en stock\` : 'rupture de stock';
  return \`\${p.title} (id produit: \${p.handle}, id variante: \${variant?.id}) : \${priceText}, \${stockText}\`;
}).join('\\n');

return { json: { result: summary } };
`.trim()
    }
  }
});

export default workflow('find-products', 'Tool - find_products')
  .add(inputTrigger)
  .to(searchProducts)
  .to(formatResult);
```

Valider :

```
mcp__n8n__validate_workflow({ code: "<le code ci-dessus>" })
```

Expected: `{"valid": true, ...}`. Corriger et revalider si besoin avant de continuer.

- [ ] **Step 4: Créer le workflow**

```
mcp__n8n__create_workflow_from_code({
  code: "<le code validé>",
  name: "Tool - find_products",
  description: "Recherche des produits réels Golden Market (prix, stock) via le Store API Medusa.",
  versionName: "Version initiale"
})
```

Noter le `workflowId` retourné pour la Task 7.

- [ ] **Step 5: Tester en conditions réelles**

```
mcp__n8n__execute_workflow({
  workflowId: "<id du Step 4>",
  executionMode: "manual",
  inputs: { type: "webhook", webhookData: { method: "POST", body: { product_name: "serpillière" } } }
})
```

Puis `mcp__n8n__get_execution` (`includeData: true`) sur le nœud `Format Result`.

Expected: `result` contient `"Serpillière auto-essorante à éponge (id produit: serpillière-auto-essorante-à-éponge, id variante: variant_01M1HTDXZCEH7QNRGNBKH2R0F4) : 8500 FCFA, 92 en stock"` (ou une quantité en stock à jour au moment du test — la donnée vient du vrai Store API staging, pas figée).

---

### Task 4: Tool `place_order` (remplace `create_order`)

**Files (n8n):** nouveau workflow, créé via `mcp__n8n__create_workflow_from_code`, nom `Tool - place_order`

**Interfaces:**
- Consumes: `$env.MEDUSA_BACKEND_URL`, `$env.MEDUSA_PUBLISHABLE_KEY`, `$env.MEDUSA_BF_REGION_ID` (Task 2) ; `id produit`/`id variante` retournés par `find_products` (Task 3)
- Produces: `{ result: string, order_id: string, display_id: number, total: number }` — `order_id` est consommé par Task 5 (`get_payment_instructions`) et Task 6 (`mark_payment_reported`) ; écrit `metadata: { source: "whatsapp" }` sur la commande, condition du guard de la Task 1.
- Paramètres d'entrée : `items` (JSON stringifié, `[{variant_id, quantity}]`), `phone_number`, `first_name`, `address_1`, `city`, `provider_id` (`pp_cash-on-delivery_cash-on-delivery` | `pp_orange-money-manual_orange-money-manual` | `pp_moov-money-manual_moov-money-manual`).

- [ ] **Step 1: Récupérer les définitions de nodes nécessaires**

```
mcp__n8n__get_node_types({
  nodeIds: [
    { nodeId: "n8n-nodes-base.httpRequest" },
    { nodeId: "n8n-nodes-base.code" },
    { nodeId: "n8n-nodes-base.if" }
  ]
})
```

- [ ] **Step 2: Écrire et valider le code du workflow**

```typescript
import { workflow, trigger, node, ifElse, expr } from '@n8n/workflow-sdk';

const inputTrigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: {
    name: 'When Executed by Another Workflow',
    parameters: {
      workflowInputs: {
        values: [
          { name: 'items' },
          { name: 'phone_number' },
          { name: 'first_name' },
          { name: 'address_1' },
          { name: 'city' },
          { name: 'provider_id' }
        ]
      }
    }
  }
});

const checkCodAllowed = ifElse({
  version: 2.3,
  config: {
    name: 'Check COD Allowed',
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { id: 'is-cod', leftValue: expr('{{ $json.provider_id }}'), rightValue: 'pp_cash-on-delivery_cash-on-delivery', operator: { type: 'string', operation: 'equals' } },
          { id: 'not-ouaga', leftValue: expr('{{ $json.city }}'), rightValue: 'Ouagadougou', operator: { type: 'string', operation: 'notEquals' } }
        ],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const rejectCod = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Reject COD Outside Ouagadougou',
    parameters: {
      jsCode: `return { json: { result: "Le paiement à la réception n'est disponible que pour Ouagadougou. Propose Orange Money ou Moov Money au client." } };`
    }
  }
});

const createCart = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Create Cart',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/carts'),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ region_id: $env.MEDUSA_BF_REGION_ID }) }}'),
      options: {}
    }
  }
});

const addLineItems = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Add Line Items',
    executeOnce: true,
    parameters: {
      jsCode: `
const cartId = $('Create Cart').first().json.cart.id;
const items = typeof $('When Executed by Another Workflow').first().json.items === 'string'
  ? JSON.parse($('When Executed by Another Workflow').first().json.items)
  : $('When Executed by Another Workflow').first().json.items;

const baseUrl = $env.MEDUSA_BACKEND_URL;
const key = $env.MEDUSA_PUBLISHABLE_KEY;

let lastCart = null;
for (const item of items) {
  const res = await this.helpers.httpRequest({
    method: 'POST',
    url: \`\${baseUrl}/store/carts/\${cartId}/line-items\`,
    headers: { 'x-publishable-api-key': key, 'Content-Type': 'application/json' },
    body: { variant_id: item.variant_id, quantity: item.quantity },
    json: true
  });
  lastCart = res.cart;
}

return { json: { cart_id: cartId, cart: lastCart } };
`.trim()
    }
  }
});

const setAddress = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Set Address',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/carts/{{ $json.cart_id }}'),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(`{{ JSON.stringify({
        shipping_address: {
          first_name: $('When Executed by Another Workflow').first().json.first_name,
          last_name: $('When Executed by Another Workflow').first().json.first_name,
          address_1: $('When Executed by Another Workflow').first().json.address_1,
          city: $('When Executed by Another Workflow').first().json.city,
          country_code: 'bf',
          phone: $('When Executed by Another Workflow').first().json.phone_number
        }
      }) }}`),
      options: {}
    }
  }
});

const getShippingOptions = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Get Shipping Options',
    parameters: {
      method: 'GET',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/shipping-options'),
      authentication: 'none',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'cart_id', value: expr('{{ $(\'Add Line Items\').first().json.cart_id }}') }] },
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      options: {}
    }
  }
});

const setShippingMethod = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Set Shipping Method',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/carts/{{ $(\'Add Line Items\').first().json.cart_id }}/shipping-methods'),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ option_id: $json.shipping_options[0].id }) }}'),
      options: {}
    }
  }
});

const createPaymentCollection = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Create Payment Collection',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/payment-collections'),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ cart_id: $(\'Add Line Items\').first().json.cart_id }) }}'),
      options: {}
    }
  }
});

const createPaymentSession = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Create Payment Session',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/payment-collections/{{ $json.payment_collection.id }}/payment-sessions'),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ provider_id: $(\'When Executed by Another Workflow\').first().json.provider_id }) }}'),
      options: {}
    }
  }
});

const completeCart = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Complete Cart',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/store/carts/{{ $(\'Add Line Items\').first().json.cart_id }}/complete'),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-publishable-api-key', value: expr('{{ $env.MEDUSA_PUBLISHABLE_KEY }}') }] },
      options: {}
    }
  }
});

const markMetadata = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Mark Order Source',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.MEDUSA_BACKEND_URL }}/admin/orders/{{ $json.order.id }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ metadata: { source: "whatsapp" } }) }}'),
      options: {}
    },
    credentials: { httpBearerAuth: { name: 'Medusa Admin API' } }
  }
});

const formatResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Format Result',
    parameters: {
      jsCode: `
const order = $('Complete Cart').first().json.order;
return {
  json: {
    result: \`Commande confirmée ! Numéro de commande : #\${order.display_id}. Montant total : \${order.total} \${order.currency_code.toUpperCase()}. Utilise get_payment_instructions pour indiquer au client comment payer.\`,
    order_id: order.id,
    display_id: order.display_id,
    total: order.total
  }
};
`.trim()
    }
  }
});

export default workflow('place-order', 'Tool - place_order')
  .add(inputTrigger)
  .to(checkCodAllowed
    .onTrue(rejectCod)
    .onFalse(createCart
      .to(addLineItems)
      .to(setAddress)
      .to(getShippingOptions)
      .to(setShippingMethod)
      .to(createPaymentCollection)
      .to(createPaymentSession)
      .to(completeCart)
      .to(markMetadata)
      .to(formatResult)));
```

Valider avec `mcp__n8n__validate_workflow`. **Ne pas créer le node `Mark Order Source` avec un credential inventé** — Task 6 crée le credential Admin réel (`Medusa Admin API`, type `httpBearerAuth`) avant que ce node puisse fonctionner ; en attendant, `onError: 'continueRegularOutput'` évite que l'absence de credential casse toute la création de commande (le tag `metadata.source` est une amélioration, pas une condition bloquante pour la vente).

- [ ] **Step 3: Créer le workflow**

```
mcp__n8n__create_workflow_from_code({
  code: "<le code validé>",
  name: "Tool - place_order",
  description: "Crée une vraie commande Medusa (panier → adresse → livraison → paiement → complétion) à partir des articles, coordonnées et moyen de paiement confirmés par le client.",
  versionName: "Version initiale"
})
```

- [ ] **Step 4: Tester en conditions réelles contre staging**

Utiliser le `variant_id` obtenu au Test de la Task 3.

```
mcp__n8n__execute_workflow({
  workflowId: "<id du Step 3>",
  executionMode: "manual",
  inputs: {
    type: "webhook",
    webhookData: {
      method: "POST",
      body: {
        items: JSON.stringify([{ variant_id: "variant_01M1HTDXZCEH7QNRGNBKH2R0F4", quantity: 1 }]),
        phone_number: "+22677406101",
        first_name: "Test WhatsApp",
        address_1: "Secteur 15",
        city: "Ouagadougou",
        provider_id: "pp_cash-on-delivery_cash-on-delivery"
      }
    }
  }
})
```

Puis `mcp__n8n__get_execution` (`includeData: true`) sur `Format Result` et `Complete Cart`.

Expected: `Format Result.result` contient un vrai numéro de commande. Vérifier ensuite côté base staging :

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 \
  "docker exec staging-golden-market-postgres psql -U medusa -d golden_market_staging -c \"SELECT display_id, metadata FROM \\\"order\\\" ORDER BY created_at DESC LIMIT 1;\""
```

Expected: une vraie ligne dans la table `order` de Medusa (pas dans la table `orders` fantôme de n8n).

- [ ] **Step 5: Tester le refus COD hors Ouagadougou**

Même appel avec `city: "Bobo-Dioulasso"`, `provider_id: "pp_cash-on-delivery_cash-on-delivery"`.

Expected : `Format Result` n'est pas atteint, `Reject COD Outside Ouagadougou.result` contient le message de refus, aucune commande créée.

---

### Task 5: Tool `get_payment_instructions` (réel)

**Files (n8n):** modifie le workflow existant `DKlNw9FbVGWdhToy` (`Tool - get_payment_instructions`)

**Interfaces:**
- Consumes: `order_id` (produit par Task 4)
- Produces: `{ result: string }` inchangé dans sa forme (texte prêt à envoyer au client), mais désormais basé sur les vraies infos de paiement de la commande.

- [ ] **Step 1: Remplacer la requête SQL par un appel Store API réel**

```
mcp__n8n__update_workflow({
  workflowId: "DKlNw9FbVGWdhToy",
  versionName: "Lit la vraie commande Medusa au lieu de la table fantôme",
  operations: [
    {
      type: "removeNode",
      nodeName: "Execute a SQL query"
    },
    {
      type: "addNode",
      node: {
        name: "Fetch Real Order",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.5,
        position: [496, 352],
        parameters: {
          method: "GET",
          url: "={{ $env.MEDUSA_BACKEND_URL }}/store/orders/{{ $json.order_id }}",
          authentication: "none",
          sendQuery: true,
          queryParameters: { parameters: [{ name: "fields", value: "display_id,total,currency_code,*payment_collections.payments" }] },
          sendHeaders: true,
          headerParameters: { parameters: [{ name: "x-publishable-api-key", value: "={{ $env.MEDUSA_PUBLISHABLE_KEY }}" }] },
          options: {}
        }
      }
    },
    { "type": "addConnection", "source": "When Executed by Another Workflow", "target": "Fetch Real Order", "sourceIndex": 0, "targetIndex": 0 },
    { "type": "addConnection", "source": "Fetch Real Order", "target": "Code in JavaScript", "sourceIndex": 0, "targetIndex": 0 }
  ]
})
```

- [ ] **Step 2: Réécrire le node `Code in JavaScript`**

```
mcp__n8n__update_workflow({
  workflowId: "DKlNw9FbVGWdhToy",
  versionName: "Formate les instructions à partir du vrai provider_id",
  operations: [{
    type: "updateNodeParameters",
    nodeName: "Code in JavaScript",
    parameters: {
      jsCode: "const order = $json.order;\n\nif (!order) {\n  return { json: { result: \"Commande introuvable. Vérifie l'ID de commande.\" } };\n}\n\nconst payment = order.payment_collections?.[0]?.payments?.[0];\nconst providerId = payment?.provider_id || '';\nconst total = order.total;\nconst currency = order.currency_code.toUpperCase();\n\nlet message;\nif (providerId.startsWith('pp_cash-on-delivery')) {\n  message = `Ta commande #${order.display_id} sera livrée à Ouagadougou. Tu paieras ${total} ${currency} en espèces à la réception.`;\n} else if (providerId.startsWith('pp_orange-money-manual')) {\n  message = `Pour finaliser ta commande #${order.display_id}, envoie ${total} ${currency} au numéro Orange Money ${$env.ORANGE_MONEY_NUMBER} (${$env.ORANGE_MONEY_NAME || 'Golden Market'}), puis donne-moi la référence de la transaction.`;\n} else if (providerId.startsWith('pp_moov-money-manual')) {\n  message = `Pour finaliser ta commande #${order.display_id}, envoie ${total} ${currency} au numéro Moov Money ${$env.MOOV_MONEY_NUMBER} (${$env.MOOV_MONEY_NAME || 'Golden Market'}), puis donne-moi la référence de la transaction.`;\n} else {\n  message = `Ta commande #${order.display_id} d'un montant de ${total} ${currency} a bien été enregistrée.`;\n}\n\nreturn { json: { result: message } };"
    },
    replace: true
  }]
})
```

- [ ] **Step 3: Vérifier le câblage**

```
mcp__n8n__get_workflow_details({ workflowId: "DKlNw9FbVGWdhToy" })
```

Expected: `connections` montre `When Executed by Another Workflow → Fetch Real Order → Code in JavaScript`, plus de référence à `Execute a SQL query`.

- [ ] **Step 4: Tester en conditions réelles**

```
mcp__n8n__execute_workflow({
  workflowId: "DKlNw9FbVGWdhToy",
  executionMode: "manual",
  inputs: { type: "webhook", webhookData: { method: "POST", body: { order_id: "<order_id obtenu au Test de la Task 4>" } } }
})
```

Expected: `result` contient le bon montant, la bonne devise, et le bon message selon le moyen de paiement utilisé au Test de la Task 4 (Cash on Delivery → message espèces à la réception).

---

### Task 6: Tool `mark_payment_reported` (réel) — nécessite une clé Admin

**Prérequis humain (avant ce Task) :** créer un compte admin Medusa **dédié à n8n** (jamais le compte personnel du propriétaire) dans l'admin Medusa (`https://staging.golden-market.co/app`, puis `https://golden-market.co/app` pour la Task 9), puis générer une clé API secrète pour ce compte (Réglages → Développeur → Gestion des clés API → Créer une clé secrète). Voir la mise en garde sur l'absence de scoping fin dans `docs/superpowers/specs/2026-09-04-whatsapp-checkout-design.md`.

**Files (n8n):** modifie le workflow existant `kBEyWGZdSLcI9EOI` (`Tool - mark_payment_reported`) ; crée un credential n8n `httpBearerAuth` nommé `Medusa Admin API` (utilisé aussi par Task 4, node `Mark Order Source`)

**Interfaces:**
- Consumes: `order_id`, `payment_reference` (déjà les paramètres actuels du tool)
- Produces: `{ result: string }` inchangé dans sa forme ; écrit `order.metadata.whatsapp_payment_reference` sur la vraie commande.

- [ ] **Step 1: Créer le credential n8n avec la clé Admin réelle**

Dans l'éditeur n8n (pas via MCP — la création de credentials contenant un secret ne se fait pas via un outil automatisé) : Credentials → New → "Bearer Auth" → nom `Medusa Admin API` → coller la clé secrète créée au prérequis.

- [ ] **Step 2: Remplacer la requête SQL par une mise à jour Admin API réelle**

```
mcp__n8n__update_workflow({
  workflowId: "kBEyWGZdSLcI9EOI",
  versionName: "Écrit la référence de paiement sur la vraie commande Medusa",
  operations: [
    { type: "removeNode", nodeName: "Execute a SQL query" },
    {
      type: "addNode",
      node: {
        name: "Update Order Metadata",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.5,
        position: [496, 352],
        parameters: {
          method: "POST",
          url: "={{ $env.MEDUSA_BACKEND_URL }}/admin/orders/{{ $json.order_id }}",
          authentication: "genericCredentialType",
          genericAuthType: "httpBearerAuth",
          sendBody: true,
          contentType: "json",
          specifyBody: "json",
          jsonBody: "={{ JSON.stringify({ metadata: { whatsapp_payment_reference: $json.payment_reference || null } }) }}",
          options: {}
        },
        credentials: { httpBearerAuth: { name: "Medusa Admin API" } }
      }
    },
    { "type": "addConnection", "source": "When Executed by Another Workflow", "target": "Update Order Metadata", "sourceIndex": 0, "targetIndex": 0 },
    { "type": "addConnection", "source": "Update Order Metadata", "target": "Format Result", "sourceIndex": 0, "targetIndex": 0 }
  ]
})
```

- [ ] **Step 3: Réécrire `Format Result`**

```
mcp__n8n__update_workflow({
  workflowId: "kBEyWGZdSLcI9EOI",
  versionName: "Lit le résultat de la vraie commande",
  operations: [{
    type: "updateNodeParameters",
    nodeName: "Format Result",
    parameters: {
      jsCode: "const order = $json.order;\n\nif (!order) {\n  return { json: { result: \"Commande introuvable — impossible de marquer le paiement.\" } };\n}\n\nreturn {\n  json: {\n    result: `C'est noté, merci ! Ta commande (#${order.display_id}) est marquée comme en attente de vérification. Un membre de notre équipe va confirmer la réception du paiement sous peu.`,\n    order_id: order.id,\n    display_id: order.display_id,\n    total: order.total\n  }\n};"
    },
    replace: true
  }]
})
```

Le node `HTTP Request` existant (alerte WhatsApp au marchand) reste inchangé — mettre à jour ses références `{{ $('Format Result').first().json.order_id }}` etc. si les noms de champs ont changé (ils sont conservés à l'identique ici, aucun changement nécessaire).

- [ ] **Step 4: Vérifier le câblage**

```
mcp__n8n__get_workflow_details({ workflowId: "kBEyWGZdSLcI9EOI" })
```

Expected: `connections` montre `When Executed by Another Workflow → Update Order Metadata → Format Result → HTTP Request`.

- [ ] **Step 5: Tester en conditions réelles**

```
mcp__n8n__execute_workflow({
  workflowId: "kBEyWGZdSLcI9EOI",
  executionMode: "manual",
  inputs: { type: "webhook", webhookData: { method: "POST", body: { order_id: "<order_id de la Task 4>", payment_reference: "TX-TEST-123" } } }
})
```

Expected: `Format Result.result` contient le bon numéro de commande. Vérifier en base staging que `metadata` contient `whatsapp_payment_reference: "TX-TEST-123"` :

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 \
  "docker exec staging-golden-market-postgres psql -U medusa -d golden_market_staging -c \"SELECT metadata FROM \\\"order\\\" WHERE id = '<order_id>';\""
```

---

### Task 7: Câblage de l'AI Agent (workflow principal)

**Files (n8n):** modifie `i6KGA9BvK9unjxxj` (`Golden Market Sales Automation Workflow`)

**Interfaces:**
- Consumes: `workflowId` des Tasks 3 et 4 (`find_products`, `place_order`)
- Produces: le prompt système référence désormais les vrais noms de tools et les vraies règles métier (COD réservé à Ouagadougou, téléphone obligatoire, email jamais requis).

- [ ] **Step 1: Retirer les tools `check_stock`, `get_price`, `create_order` de l'agent**

```
mcp__n8n__update_workflow({
  workflowId: "i6KGA9BvK9unjxxj",
  versionName: "Retire les tools fantômes check_stock/get_price/create_order",
  operations: [
    { type: "removeNode", nodeName: "Call 'Tool - check_stock'" },
    { type: "removeNode", nodeName: "Call 'Tool - get_price'" },
    { type: "removeNode", nodeName: "Call 'Tool - create_order'" }
  ]
})
```

- [ ] **Step 2: Ajouter les tools `find_products` et `place_order`**

```
mcp__n8n__update_workflow({
  workflowId: "i6KGA9BvK9unjxxj",
  versionName: "Branche les tools réels find_products et place_order",
  operations: [
    {
      type: "addNode",
      node: {
        name: "Call 'Tool - find_products'",
        type: "@n8n/n8n-nodes-langchain.toolWorkflow",
        typeVersion: 2.2,
        position: [1728, 448],
        parameters: {
          description: "Recherche un ou plusieurs produits réels par nom (prix, stock réel). Utilise ce tool avant d'annoncer un prix ou une disponibilité.",
          workflowId: { __rl: true, value: "<id Task 3>", mode: "list" },
          workflowInputs: {
            mappingMode: "defineBelow",
            value: { product_name: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('product_name', ``, 'string') }}" }
          }
        }
      }
    },
    {
      type: "addNode",
      node: {
        name: "Call 'Tool - place_order'",
        type: "@n8n/n8n-nodes-langchain.toolWorkflow",
        typeVersion: 2.2,
        position: [1920, 640],
        parameters: {
          description: "Crée une vraie commande une fois que le client a confirmé les articles (avec leur id variante donné par find_products), son nom, son adresse, sa ville et son moyen de paiement. Le paiement à la réception n'est proposé que pour Ouagadougou.",
          workflowId: { __rl: true, value: "<id Task 4>", mode: "list" },
          workflowInputs: {
            mappingMode: "defineBelow",
            value: {
              items: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('items', `tableau JSON [{variant_id, quantity}]`, 'string') }}",
              first_name: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('first_name', ``, 'string') }}",
              address_1: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('address_1', ``, 'string') }}",
              city: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('city', ``, 'string') }}",
              provider_id: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('provider_id', `pp_cash-on-delivery_cash-on-delivery, pp_orange-money-manual_orange-money-manual ou pp_moov-money-manual_moov-money-manual`, 'string') }}",
              phone_number: "={{ $('Edit Fields').item.json.from }}"
            }
          }
        }
      }
    },
    { "type": "addConnection", "source": "Call 'Tool - find_products'", "target": "AI Agent", "connectionType": "ai_tool", "sourceIndex": 0, "targetIndex": 0 },
    { "type": "addConnection", "source": "Call 'Tool - place_order'", "target": "AI Agent", "connectionType": "ai_tool", "sourceIndex": 0, "targetIndex": 0 }
  ]
})
```

- [ ] **Step 3: Mettre à jour le prompt système de l'AI Agent**

```
mcp__n8n__update_workflow({
  workflowId: "i6KGA9BvK9unjxxj",
  versionName: "Met à jour les règles métier du prompt système (paiement à la réception, email)",
  operations: [{
    type: "setNodeParameter",
    nodeName: "AI Agent",
    path: "/options/systemMessage",
    value: "Tu es l'assistant commercial de Golden Market, une boutique en ligne au Burkina Faso.\nTon rôle : accueillir les prospects sur WhatsApp, répondre à leurs questions produits,\net les accompagner jusqu'à la commande.\n\nRègles strictes :\n- N'invente JAMAIS un prix, un stock, ou une promesse de livraison — utilise toujours find_products, qui interroge le vrai catalogue.\n- N'accorde jamais de remise non prévue.\n- Le paiement à la réception (cash) n'est proposé QUE si le client livre à Ouagadougou. Pour toute autre ville, propose uniquement Orange Money ou Moov Money.\n- Le téléphone du client (déjà connu, c'est son numéro WhatsApp) est l'identifiant réel de la commande — ne redemande jamais d'email, ce n'est jamais nécessaire.\n- Avant d'appeler place_order, confirme explicitement avec le client : les articles, le prix total, l'adresse de livraison complète, et le moyen de paiement choisi.\n- Si le client est mécontent, confus après 2 tentatives, ou demande explicitement un humain → utilise escalate_to_human.\n- Pour finaliser une commande : utilise place_order, puis get_payment_instructions.\n- Si le client signale avoir payé (référence de transaction ou capture d'écran), utilise mark_payment_reported.\n- Ton : chaleureux, professionnel, réponses courtes adaptées à WhatsApp (pas de pavés).\n- Langue : français, sauf si le client écrit dans une autre langue."
  }]
})
```

- [ ] **Step 4: Vérifier le câblage complet**

```
mcp__n8n__get_workflow_details({ workflowId: "i6KGA9BvK9unjxxj" })
```

Expected: `connections["Call 'Tool - find_products'"].ai_tool` et `connections["Call 'Tool - place_order'"].ai_tool` pointent vers `AI Agent` ; plus aucune référence à `check_stock`, `get_price`, `create_order`.

---

### Task 8: Vérification bout-en-bout réelle (staging)

**Files:** aucun — vérification manuelle via l'exécution du workflow principal

- [ ] **Step 1: Simuler un message client entrant réaliste**

```
mcp__n8n__execute_workflow({
  workflowId: "i6KGA9BvK9unjxxj",
  executionMode: "manual",
  triggerNodeName: "Webhook1",
  inputs: {
    type: "webhook",
    webhookData: {
      method: "POST",
      body: {
        entry: [{ changes: [{ value: { messages: [{
          from: "22677406101",
          id: "wamid.test-e2e-001",
          text: { body: "Bonjour, je veux commander une serpillière auto-essorante, je suis à Ouagadougou, secteur 15, je paie à la livraison" }
        }] } }] }]
      }
    }
  }
})
```

- [ ] **Step 2: Inspecter l'exécution**

```
mcp__n8n__get_execution({ workflowId: "i6KGA9BvK9unjxxj", executionId: "<id>", includeData: true })
```

Expected: l'AI Agent appelle `find_products` puis, selon la conversation, `place_order` — vérifier qu'une vraie commande apparaît en base staging (même requête SQL que Task 4 Step 4) et que le message final envoyé au client (node `HTTP Request` principal) confirme le numéro de commande réel.

- [ ] **Step 3: Confirmer avec le propriétaire**

Demander confirmation que le comportement conversationnel reste naturel (pas de jargon technique dans les réponses du bot) avant de passer à la Task 9.

---

### Task 9: Bascule vers production — geste explicite, non automatique

**Ne pas exécuter cette tâche sans confirmation explicite de l'utilisateur.**

**Files:** `/var/www/n8n/.env` (VPS)

- [ ] **Step 1: Demander confirmation explicite**

Reformuler clairement ce que la bascule implique (les commandes WhatsApp deviendront de vraies commandes en production, décrémenteront le vrai stock) et attendre un "oui" explicite avant de continuer.

- [ ] **Step 2: Remplacer les trois valeurs staging par les valeurs production**

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 "
sed -i \
  -e 's#MEDUSA_BACKEND_URL=https://staging.golden-market.co#MEDUSA_BACKEND_URL=https://golden-market.co#' \
  -e 's#MEDUSA_PUBLISHABLE_KEY=pk_e68aa03ce4f0060631238eedc137d6f12be40d95cc40e5e0bd8464daf3ffb8a2#MEDUSA_PUBLISHABLE_KEY=pk_1be385320711b101e576a72f4c9e582c28ee97cae97804d99ad08ac61368396e#' \
  -e 's#MEDUSA_BF_REGION_ID=reg_01M17QF8ZWE6C7083V2SWEMDXY#MEDUSA_BF_REGION_ID=reg_01M1805Y7M3XEGFF59J7FNWP17#' \
  /var/www/n8n/.env
"
```

- [ ] **Step 3: Créer/associer le compte admin + clé Admin de production** (répéter le prérequis de la Task 6 sur `https://golden-market.co/app`, mettre à jour le credential `Medusa Admin API` dans n8n avec la nouvelle clé)

- [ ] **Step 4: Recréer le conteneur**

```bash
ssh -i ~/.ssh/golden_market_deploy admin@144.91.110.105 "cd /var/www/n8n && docker compose up -d n8n"
```

- [ ] **Step 5: Un test réel unique, surveillé, avec un vrai petit montant ou un produit test**, avant d'annoncer la fonctionnalité disponible aux vrais clients.
