# Commande directe via WhatsApp — Design

## Contexte et constat

Le workflow n8n `Golden Market Sales Automation Workflow` (`i6KGA9BvK9unjxxj`) fait déjà
parler un agent IA aux prospects sur WhatsApp (accueil, questions produits,
escalade humaine). Mais ses tools `check_stock`, `get_price` et `create_order`
ne touchent jamais le vrai magasin : ils lisent/écrivent dans deux tables
Postgres propres à n8n (`public.products`, `public.orders`, schéma `golden_market`
sur le VPS), complètement déconnectées de Medusa.

Vérifié en base le 2026-09-04 :
- `public.products` ne contient que 2 lignes placeholder (« Exemple Produit 1/2 »)
  jamais reliées au vrai catalogue (40 produits réels côté Medusa).
- `public.orders` ne contient que 3 lignes de test, toutes sur le même numéro
  factice `22670000000` — jamais une vraie commande client.

Conséquence : aujourd'hui, un client qui "commande" via WhatsApp obtient une
réponse de l'agent mais **aucune commande n'existe réellement** — pas de
décrément de stock, rien dans l'admin Medusa, aucun paiement réellement
suivi.

## Objectif

Remplacer ces tools pour qu'une commande passée via WhatsApp devienne une
vraie commande Medusa, suivant le même chemin que le storefront (panier →
adresse → livraison → paiement → complétion), avec les mêmes règles métier
(paiement à la réception réservé à Ouagadougou, téléphone obligatoire, email
jamais requis).

## Décision : Store API, pas de serveur MCP

Pas besoin d'un serveur MCP côté Medusa. n8n peut déjà appeler n'importe quelle
API HTTP via des nodes HTTP Request (c'est exactement ainsi que le tool
d'envoi WhatsApp existant appelle `graph.facebook.com`). Un serveur MCP
ajouterait un service de plus à héberger et maintenir sans bénéfice
fonctionnel, puisque le seul client de ces tools est cet unique agent n8n.

Toutes les opérations de panier/commande utilisent le **Store API** Medusa
(clé publishable, pas de privilège élevé) — la même API que le storefront
utilise déjà. Seule l'action `mark_payment_reported` (enregistrer une
référence de paiement communiquée par le client) nécessite l'**Admin API**
(mise à jour de métadonnées de commande) via une clé secrète Admin.

**Limite réelle à connaître** : Medusa OSS ne propose aucun scoping fin des
clés API Admin (vérifié dans `@medusajs/types` — `ApiKeyDTO` n'a qu'un champ
`type: "secret" | "publishable"`, pas de notion de permission/scope). Une clé
secrète Admin porte donc l'intégralité des droits du compte admin qui l'a
créée. Mitigation réaliste : créer un **compte admin dédié** pour n8n (jamais
réutiliser le compte personnel du propriétaire) afin que la clé soit
individuellement révocable/traçable dans les logs — mais elle reste, de fait,
une clé à privilèges complets. À traiter comme un secret de production
sensible dans `/var/www/n8n/.env`.

## État de conversation : pas de panier persistant nécessaire

Une conversation WhatsApp s'étale sur plusieurs messages (articles, puis
adresse, puis moyen de paiement). Mais le workflow charge déjà tout
l'historique des messages à chaque tour (`SQL_query_2`, table `messages`) et
le repasse à l'agent — l'agent LLM reconstruit donc naturellement ce qu'il
sait du client d'un tour à l'autre sans avoir besoin d'un panier Medusa
persistant en base pendant la conversation.

Décision : `place_order` reste un tool **atomique** — l'agent ne l'appelle
qu'une fois qu'il a déjà rassemblé (en conversation) articles, adresse et
moyen de paiement, et le tool exécute alors toute la séquence panier →
commande en un seul appel. Aucune colonne ni table supplémentaire n'est
nécessaire pour cette itération.

## Correspondance tools actuels → tools réels

| Tool actuel (table fantôme) | Remplacement (Store/Admin API réel) |
|---|---|
| `check_stock` + `get_price` (deux appels quasi identiques) | Un seul tool `find_products` — `GET /store/products?q=<name>&region_id=<bf>&fields=title,handle,*variants.calculated_price,*variants.inventory_quantity` |
| `create_order` (INSERT dans `orders`) | `place_order` — séquence réelle Store API (détaillée plus bas) |
| `get_payment_instructions` | Lit la vraie commande via `GET /store/orders/:id?fields=*payment_collections.payments,display_id,total,currency_code` (endpoint non authentifié, déjà utilisé par la page de confirmation du storefront) et formate selon le `provider_id` réel |
| `mark_payment_reported` | Met à jour `order.metadata.whatsapp_payment_reference` via Admin API (`POST /admin/orders/:id`), puis notifie le marchand (HTTP Request WhatsApp déjà en place, inchangé) — la capture du paiement reste manuelle via l'admin Medusa, jamais automatique sur simple déclaration client |
| `escalate_to_human` | Inchangé, ne touche pas la boutique |

## Séquence `place_order` (remplace `create_order`)

Reproduit exactement le flux du storefront (`apps/storefront/src/lib/data/cart.ts`),
piloté par les paramètres que l'agent a déjà collectés en conversation :

1. `POST /store/carts` — `{ region_id, country_code: "bf" }` (ou réutilise
   `conversations.cart_id` si déjà présent)
2. `POST /store/carts/:id/line-items` — un appel par article `{ variant_id, quantity }`
3. `POST /store/carts/:id` — adresse de livraison `{ shipping_address: { first_name, address_1, city, phone }, email: null }`
   (email jamais requis, comme le storefront depuis 2026-09-04)
4. `POST /store/carts/:id/shipping-methods` — option unique BF (id à résoudre via `GET /store/shipping-options?cart_id=`)
5. `POST /store/payment-collections` puis `POST /store/payment-collections/:id/payment-sessions` — `provider_id` choisi par le client (Orange/Moov/COD)
6. **Règle métier à répliquer** : si `provider_id` = paiement à la réception et `city` ≠ "Ouagadougou" → refuser et redemander un autre moyen de paiement (le storefront filtre déjà cette option par ville, voir `apps/storefront/src/modules/checkout/components/payment/index.tsx`)
7. `POST /store/carts/:id/complete` — retourne la commande réelle (`order.id`, `display_id`, `total`)

## Éviter le double message de confirmation

Une commande créée via WhatsApp déclenche quand même l'événement `order.placed`
Medusa, qui fait déjà partir le message-template de confirmation WhatsApp
construit le 2026-09-04 (`order-placed-customer-whatsapp.ts`). Un client en
pleine conversation avec l'agent recevrait alors un message-template
supplémentaire d'un même numéro, redondant avec la confirmation que l'agent
vient de donner en langage naturel.

Fix : `place_order` marque `metadata: { source: "whatsapp" }` sur la commande
à l'étape 7. Le subscriber `order-placed-customer-whatsapp.ts` ignore l'envoi
si `order.metadata?.source === "whatsapp"`.

## Variables d'environnement n8n à ajouter

Aucune n'existe actuellement (vérifié dans `/var/www/n8n/.env`) :

- `MEDUSA_BACKEND_URL` — `https://api.golden-market.co` (ou équivalent réel)
- `MEDUSA_PUBLISHABLE_KEY` — même valeur que `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` du storefront
- `MEDUSA_BF_REGION_ID` — ID de la région Burkina Faso (à récupérer via `GET /store/regions`)
- `MEDUSA_ADMIN_API_KEY` — nouvelle clé Admin, scopée à la lecture/écriture de commandes uniquement, utilisée exclusivement par `mark_payment_reported`

## Hors périmètre de cette itération

- Pas de refonte du bouton "Commander via WhatsApp" côté storefront (mentionné dans un spec antérieur, différé).
- Pas de synchronisation catalogue n8n ↔ Medusa : `find_products` interroge Medusa en direct à chaque appel, pas de cache/table miroir à maintenir.
- La capture réelle du paiement manuel reste un geste humain dans l'admin Medusa, comme aujourd'hui pour les commandes web.
