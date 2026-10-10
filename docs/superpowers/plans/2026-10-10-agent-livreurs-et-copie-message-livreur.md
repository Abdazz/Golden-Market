# Plan - Livreurs reconnus par l'agent et copie du message livreur

Spec : `docs/superpowers/specs/2026-10-10-agent-livreurs-et-copie-message-livreur-design.md`.
Dépôt Medusa : npm, backend `apps/backend` (tests `npm run test:unit -- <chemin>`). Code, commentaires
et commits en français, sans emoji dans le code, sans trailer Co-Authored-By. TDD : test qui échoue
d'abord. Les tâches 1 à 4 sont exécutées par des sous-agents (revue par tâche), les tâches 5 à 7 par
le contrôleur (production, VPS, n8n).

## Task 1 - Module pur `courier-message-text.ts` (Medusa)

Fichiers : `apps/backend/src/lib/courier-message-text.ts` (nouveau),
`apps/backend/src/lib/delivery-message.ts` (déplacer `buildCourierMessage`, le réexporter),
`apps/backend/src/lib/__tests__/courier-message-text.unit.spec.ts` (nouveau).

1. Test d'abord : `renderCourierMessage({ template_name: "livraison_livreur_ouaga", params: [
   "Marina", "22670305367", "Tampouy, vers la station SOGELB", "Balai éponge avec seau", "1",
   "9 500" ] })` renvoie exactement le corps Meta rempli (voir spec, `\n` conservés) ; idem pour
   `livraison_livreur_expedition` (se termine par `\n\nMerci 🙏`) ; paramètre manquant → chaîne
   vide ; modèle inconnu → `params.join("\n")` (jamais d'exception) ; `courierMessageText(input)`
   = rendu de `buildCourierMessage(input)`.
2. Implémenter : `COURIER_TEMPLATE_BODIES` (corps exacts de la spec), `renderCourierMessage`,
   `courierMessageText`. Aucune dépendance (pas de `process`, pas d'import Node) : le fichier est
   importé par l'admin (Vite).
3. `delivery-message.ts` importe et réexporte `buildCourierMessage` depuis le nouveau module ; les
   tests existants `delivery-message.unit.spec.ts` passent sans modification.

## Task 2 - Route `by-order` enrichie (Medusa)

Fichiers : `apps/backend/src/lib/delivery-service-helpers.ts` (`toTourLine`),
`apps/backend/src/api/admin/deliveries/by-order/[order_id]/route.ts`,
`apps/backend/src/admin/lib/deliveries.ts` (type `TourLine`, nouveau type de réponse `ByOrder`
si utile), test `apps/backend/src/lib/__tests__/delivery-order-sync.unit.spec.ts` ou nouveau
test unitaire de `toTourLine` si la fonction n'est pas encore couverte.

1. `toTourLine` ajoute `address`, `transport_company`, `destination_city` (valeurs brutes de la
   livraison, `null` si absentes). Test.
2. La réponse `order` de la route gagne `customer_name` (`customerName(order)`), `customer_phone`
   (`order.shipping_address?.phone ?? ""`) et `items` (`itemsOf(order)`).
3. Type `TourLine` de l'admin mis à jour ; `npm run build` de l'admin (ou au moins `tsc`) passe.

## Task 3 - Bouton « Copier le message livreur » (admin Medusa)

Fichiers : `apps/backend/src/admin/widgets/order-delivery.tsx`,
`apps/backend/src/admin/components/copy-courier-message.tsx` (nouveau, composant réutilisable :
`text`, bouton, état « Message copié », repli zone sélectionnable, lien « Voir le message » avec
aperçu `<pre className="whitespace-pre-wrap">`). Import du module pur par
`../../lib/courier-message-text`.

1. Avant attribution (formulaire) : texte = `courierMessageText({ customerName: order.customer_name,
   customerPhone: order.customer_phone, type, address (express) ou null, transportCompany /
   destinationCity (expédition) ou null, items: order.items, amountToCollect: parseAmountInput(
   amountText) ?? proposedAmount })`. Bouton sous « Confier au livreur ».
2. Livraison en cours : texte à partir de `current` (`customer_name`, `customer_phone`, `type`,
   `address`, `transport_company`, `destination_city`, `items`, `amount_to_collect`). Bouton dans
   l'encadré de la livraison en cours, après la ligne du statut WhatsApp.
3. Pas de composant `@medusajs/ui` (conflit React 18/19 documenté). Classes utilitaires comme le
   reste du widget. Aucun composant dans l'historique.

## Task 4 - Badge « Livreur » dans les conversations WhatsApp (admin Medusa)

Fichiers : `apps/backend/src/admin/lib/courier-match.ts` (nouveau) + test
`apps/backend/src/admin/lib/__tests__/courier-match.unit.spec.ts`,
`apps/backend/src/admin/components/whatsapp-courier.tsx` (nouveau),
`apps/backend/src/admin/routes/whatsapp-conversations/page.tsx`.

1. Test d'abord : `courierFor(couriers, "22670000000")` trouve `{ phone: "+226 70 00 00 00",
   active: true }`, ignore un livreur inactif, renvoie `null` sinon ; `courierBadge` = « Livreur ·
   NOM ».
2. Composant : charge `GET /admin/couriers` une fois (`api` de `lib/deliveries`), affiche le badge
   (lien `/app/deliveries?tab=couriers`, classes de tag comme `WhatsappProspect` mais couleur
   verte `bg-ui-tag-green-bg text-ui-tag-green-text`) dans l'en-tête à côté de
   `WhatsappProspect`. Dans la liste, la ligne d'une conversation sans nom client affiche le nom
   du livreur suivi de « · Livreur » à la place du numéro (la liste reçoit la liste des livreurs
   en prop ou via un hook partagé, une seule requête par page).
3. Échec de chargement des livreurs : aucun badge, aucun message d'erreur.

## Task 5 - Workflow n8n (contrôleur, VPS)

1. Sauvegarde : export du workflow principal et de `escalate_to_human` dans
   `~/n8n-backups/2026-10-10/` sur le VPS.
2. Nouveau sous-workflow `Tool - report_courier_receipt` (id `CourierReceipt7Qx`) : trigger
   (`summary`, `conversation_id`, `courier_name`) → `Get Conversation Phone` (Postgres,
   credential `6KTv30JcX465t9lg`, `continueErrorOutput` → `Format Alert`) → `Format Alert` (Code :
   paramètres nettoyés, jamais vides) → `Alert Owner` (HTTP, `escalation_alert`,
   `continueRegularOutput`) → `Return Result` (Code : journalise l'échec, renvoie « Transmis à
   l'équipe. »).
3. Workflow principal : nœud `Identify Courier` (Code) entre `Edit Fields` et `Is Image Message` ;
   `Final Message` + `courier_name` ; `Describe Image (Vision)` consigne conditionnelle ; `AI Agent`
   note interne + section Livreurs du prompt système ; nouveau nœud tool `report_courier_receipt`
   (toolWorkflow 2.2) connecté en `ai_tool`.
4. Import (`n8n import:workflow`), `publish:workflow --id=…` pour les deux, `docker restart
   golden_market_n8n`.
5. Tests : livreur de test `Test Claude` (`22600000099`) créé via l'API admin de production
   (désactivé à la fin) ; webhook signé texte puis image de reçu fictive ; numéro inconnu → flux
   inchangé. Vérifier dans `n8n.execution_entity` / l'UI : `courier` renseigné, tool appelé, wamid
   de l'alerte. Prévenir le propriétaire que l'alerte de test lui arrive.

## Task 6 - Documentation

`n8n_automation/guide-golden-market-agent.md` (§ 2.12, liste des tools, schéma § 2),
`n8n_automation/AGENTS.md` (9 tools), `medusa-golden-market/AGENTS.md` (encadré Livraison : bouton
copier ; conversations : badge livreur), `HANDOFF.md`, `docs/HANDOFF-PROMPT.md`.

## Task 7 - Déploiement Medusa

Commit sur `staging`, `git push origin staging`, vérification du build, puis `git push origin
staging:main`. Vérifier en production : bouton « Copier le message livreur » visible sur une fiche
commande, badge livreur sur une conversation de livreur.

## Task 8 - Variante du produit dans la confirmation de commande au client (Medusa)

Demande du propriétaire (2026-10-10, troisième message) : la confirmation WhatsApp envoyée au client
affiche « Balai-éponge à essorage automatique » sans la variante (« Avec seau » / « Sans seau »).

Fichiers : `apps/backend/src/lib/order-item-label.ts` (nouveau, pur) + test
`apps/backend/src/lib/__tests__/order-item-label.unit.spec.ts`,
`apps/backend/src/lib/delivery-service-helpers.ts` (`itemsOf` utilise le nouveau helper),
`apps/backend/src/subscribers/order-placed-customer-whatsapp.ts` (`productSummary`),
`apps/backend/src/subscribers/__tests__/order-placed-customer-whatsapp.unit.spec.ts`.

1. Test d'abord : `orderItemLabel({ product_title: "Balai-éponge à essorage automatique",
   variant_title: "Avec seau" })` = « Balai-éponge à essorage automatique - Avec seau » ;
   `variant_title` absent, `"Default Title"`, `"Default variant"` ou égal au titre du produit →
   titre du produit seul (règle déjà appliquée par `itemsOf`, à déplacer sans changer son résultat).
2. `itemsOf` appelle `orderItemLabel` (ses tests existants, s'il y en a, restent verts).
3. Subscriber : `productSummary` pour un seul article = `orderItemLabel(item)` ; plusieurs articles
   inchangé (« N articles »). Le type `OrderConfirmationData.items` gagne `variant_title?: string |
   null`. Test : un article avec variante « Avec seau » → premier paramètre produit « Balai-éponge à
   essorage automatique - Avec seau » ; un article « Default Title » → titre seul.
