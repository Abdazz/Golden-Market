---
name: agent-livreurs-reconnus
description: "Agent WhatsApp : livreurs reconnus par leur numéro Medusa (2026-10-10), tool report_courier_receipt, bouton Copier le message livreur, variante dans la confirmation client ; pièges de test n8n (helpers.httpRequest dans un nœud Code, média simulé)"
metadata:
  node_type: memory
  type: project
  originSessionId: 64e2dfeb-ba6b-496b-aee4-3dcdff6d3a54
  modified: 2026-10-10T13:11:10.825Z
---

Lot du 2026-10-10 (trois demandes du propriétaire dans la même session, livré en production le jour même) :
l'agent n8n lit `GET /admin/couriers` à chaque message (nœud Code `Identify Courier`, `this.helpers.httpRequest`
fonctionne dans un nœud Code n8n 2.33 avec task runners, 8 derniers chiffres, livreurs actifs seulement, erreur =
client). Livreur -> note interne à l'IA, section « Livreurs » du prompt (jamais de vente ni `mark_payment_reported`,
jamais de vérification des montants), vision « Reçu d'expédition : … », tool `report_courier_receipt`
(`CourierReceipt7Qx`, alerte `escalation_alert` au propriétaire + courriel Resend de secours, statut inchangé).
Décision prise seul : « Déposée à la gare » reste manuel (pas d'écriture Medusa depuis une lecture IA d'un reçu).
Medusa : badge « Livreur · Nom » dans le chat, bouton « Copier le message livreur » (corps exacts des modèles Meta
dans `lib/courier-message-text.ts`, importé par l'admin Vite : premier import de `src/lib` depuis l'admin, le build
l'accepte), variante « - Avec seau » dans la confirmation client (`lib/order-item-label.ts`).

**Why:** les livreurs envoient souvent les reçus d'expédition à l'agent, qui les prenait pour des paiements client
et contestait les montants ; le propriétaire veut aussi pouvoir renvoyer le message livreur à la main.

**How to apply:** pour tester l'agent côté livreur, créer/réactiver un livreur de test dans Medusa production
(« Test Claude », `+22600000099`, désactivé après les tests ; conversation de test visible dans l'admin) puis
webhook signé ; un média réel se simule en téléversant via `POST /{phone_id}/media` depuis le conteneur n8n (node
`fetch` + `FormData`, pas de curl dans l'image) puis en référençant l'id dans le webhook signé. Les corps exacts des
modèles Meta se lisent par `GET /{template_id}?fields=components` avec le jeton WhatsApp. Voir
[[golden-market-whatsapp-agent-audit]] et [[mini-saas-gestion-livreurs]].
