---
name: meta-catalog-sync-status
description: "Synchro catalogue Medusa -> Meta : fonctionnelle ; Pixel associé 2026-09-17 ; AddToCart : quick-add corrigé 2026-09-22 puis stub fbq qui ne déléguait pas à callMethod corrigé 2026-09-23"
metadata:
  node_type: memory
  type: project
  originSessionId: 4982eaa2-7c6b-4af9-a650-ec679f30cb7c
  modified: 2026-09-22T13:02:16.315Z
---

**Statut au 2026-09-15, confirmé par le propriétaire et par `HANDOFF.md` : la synchro
catalogue Medusa -> Meta Commerce Manager est entièrement fonctionnelle en production,
rien en attente.** Cette mémoire corrige une entrée précédente qui décrivait un blocage
404 sur `/meta-catalog-feed` — ce blocage a été trouvé et corrigé le 2026-09-13, ne pas le
reproposer comme action à faire. Voir [[medusa-golden-market-overview]] pour le contexte
général du dépôt.

**Ce qui est en place et vérifié (détail dans `HANDOFF.md`, entrées du 2026-09-05 au
2026-09-14)** :
- Route `/meta-catalog-feed` (flux CSV complet, tous champs y compris images) accessible
  publiquement, `ProxyPass` Apache correct sur les 4 vhosts (prod + staging).
- Commerce Catalog Meta créé (`Catalogue_Produits_Golden_Market`, `catalog_id` =
  `1389887146453163`), flux planifié quotidien enregistré, premier import réel réussi
  (39 articles, 0 échec).
- Catalogue lié au bon compte WhatsApp Business Cloud API (`+226 61 85 37 37`) — pas
  celui de l'app mobile WhatsApp Business classique (piège rencontré : "un seul catalogue
  par compte WhatsApp").
- `META_CATALOG_ID`/`META_CATALOG_ACCESS_TOKEN` renseignés **en production uniquement**
  (décision actée : catalogue Meta unique, staging aurait pollué avec des IDs de variantes
  différents).
- Push temps réel prix/stock vérifié bout en bout avec une vraie mutation (2000 -> 3000
  XOF sur une variante réelle, cohérence confirmée côté Meta).
- Pixel Meta + Conversions API (événement Purchase) déployés par-dessus cette synchro
  (2026-09-14/15), pour les pubs dynamiques Facebook/Instagram.

**Gap `referral` corrigé le 2026-09-15** : le webhook WhatsApp du chatbot (workflow n8n
`i6KGA9BvK9unjxxj`, node `Edit Fields`) préfixe maintenant `message_text` avec le contexte
publicitaire (`headline`, `body`, `source_url`) quand `messages[0].referral` est présent
(client arrivé via une pub Click-to-WhatsApp ou un article du catalogue). Vérifié en
conditions réelles (webhook signé) : le contexte apparaît bien en base et l'IA l'exploite
spontanément. Voir [[golden-market-whatsapp-agent-audit]] pour le détail complet de cette
session d'audit (recherche sémantique, garde-fou d'escalade, vision, template
`escalation_alert` manquant).

**How to apply** : ne plus proposer les étapes de configuration Meta (créer le catalogue,
lier le compte WhatsApp, générer le jeton) comme travail restant — c'est fait. Ne plus
proposer non plus l'extraction du `referral` comme travail restant — c'est fait aussi.
Cette synchro catalogue est maintenant un sujet entièrement clos.

**Correctif du 2026-09-17 : Pixel associé au catalogue pour le taux de correspondance.**
Le catalogue affichait un bandeau "Paramètres - Attention requise" dans Meta Business
Manager (Catalogue > Évènements) : taux de correspondance à 0%, 3 problèmes critiques
("aucun évènement ViewContent/AddToCart/Purchase reçu"). Cause : la seule source
d'évènements liée au catalogue était l'app "Golden Market Bot" (WhatsApp), pas le vrai
Pixel du site (`Golden_Market_Pixel`, `1835275317320182`, déployé le 2026-09-14/15 -
voir [[golden-market-whatsapp-agent-audit]] pour le contexte). Le Pixel n'avait jamais
été associé au catalogue comme source d'évènements (étape oubliée après le déploiement
du code Pixel/Conversions API). Corrigé via Gestionnaire d'évènements > (sélectionner
`Golden_Market_Pixel`) > Aperçu > "Catalogue associé" > Gérer le statut > activer
l'interrupteur pour `Catalogue_Produits_Golden_Market` uniquement (ID `1389887146453163`).
**Piège rencontré** : le chemin evident "Sources de données du catalogue > Ajouter >
Pixel" ne fait PAS ça - il configure le Pixel comme source de *produits* (crawling du
site pour ajouter/modifier/supprimer des articles du catalogue automatiquement) et exige
d'ajouter le domaine comme "site de confiance", ce qui aurait donné à Facebook un droit
d'édition automatique du catalogue en conflit avec la règle "Medusa = source de vérité"
([[medusa-golden-market-overview]]). Le bon chemin (association pure pour l'attribution
publicitaire, sans droit d'édition) passe par la page du Pixel lui-même dans le
Gestionnaire d'évènements, pas par les Sources de données du catalogue. Après le
correctif : les 3 problèmes critiques ont disparu immédiatement pour `Golden_Market_Pixel`
(confirmation que le Pixel envoie bien ses évènements). Le taux de correspondance
restait à 0% juste après le changement - normal, Meta recalcule sur une fenêtre glissante
de 28 jours et a besoin de nouvelles interactions matchées après l'association ; peut
prendre jusqu'à 24-48h avec du trafic réel avant de dépasser le seuil recommandé de 90%.

**How to apply** : si le bandeau "Paramètres - Attention requise" ou un taux de
correspondance catalogue bas reressort dans une session future peu après le 2026-09-17,
vérifier d'abord si le délai de recalcul (24-48h) suffit avant de rouvrir une
investigation. Ne jamais proposer de cocher "Pixel" dans Sources de données du catalogue
pour ce genre de problème - toujours passer par la page du Pixel dans le Gestionnaire
d'évènements ("Catalogue associé").

**Bug de code trouvé et corrigé le 2026-09-17 (même session) : mauvais content_ids
envoyés à Meta.** En vérifiant tout de suite (plutôt que d'attendre le délai de 24-48h
ci-dessus) la cohérence entre les `content_ids` envoyés par le Pixel/Conversions API et
le `retailer_id` (`id`) publié par `/meta-catalog-feed`, deux vrais bugs sont apparus
(le flux catalogue publie une ligne par **variante** avec `id = variant.id` et
`item_group_id = product.id`, voir `meta-catalog-mapping.ts:84-85`) :
- **ViewContent** (`trackProductView`, `meta-pixel.ts`) envoyait `content_ids:
  [product.id]` (l'id **produit**) au lieu des ids de variante -> ne pouvait
  structurellement jamais matcher. Corrigé : le composant `ProductViewTracker` calcule
  maintenant `variantIds: product.variants.map(v => v.id)` et le Pixel envoie
  `content_ids: product.variantIds`.
- **Purchase côté serveur** (Conversions API, `meta-conversions-mapping.ts` +
  `order-placed-meta-conversions-api.ts`) envoyait `contents: [{id: item.product_id}]`
  au lieu de `item.variant_id`, alors que le Purchase côté client (`order-tracker`)
  utilisait déjà correctement `variant_id` - incohérence entre les deux événements
  dédupliqués par le même `event_id`. Corrigé (requête `items.variant_id` au lieu de
  `items.product_id`, mapping mis à jour, tests unitaires alignés - 17 tests passent).
- AddToCart et InitiateCheckout étaient déjà corrects côté **contenu** (utilisaient
  `variant_id`) - mais voir le bug distinct trouvé le 2026-09-22 ci-dessous : le contenu
  était correct, l'événement n'était simplement jamais émis depuis le chemin réel utilisé.

Correctifs faits en TDD côté backend (tests modifiés d'abord, RED vérifié, puis code) ;
côté storefront pas de suite de tests unitaires (confirmé par `AGENTS.md`), vérifié par
lint + `tsc --noEmit` uniquement.

**Bug supplémentaire trouvé et corrigé le 2026-09-17 (même session), déployé en
prod/staging** : `ViewContent` n'était jamais envoyé sur un accès **direct** à une fiche
produit (le cas d'un clic depuis une pub Facebook/Instagram - exactement le scénario visé
par cette intégration). Cause : `MatomoTracker` (qui initialise le Pixel) est monté après
`{children}` dans `layout.tsx`, donc après tout composant de page sur un premier
chargement direct - le wrapper `fbq()` voyait `window.fbq` encore absent et abandonnait
l'appel au lieu de le mettre en file d'attente. Corrigé dans
`apps/storefront/src/lib/analytics/meta-pixel.ts` : `fbq()` crée désormais son propre
stub de file d'attente au premier appel (`ensureFbqStub`), qu'importe quel composant
appelle en premier - plus besoin de gagner la course avec `initMetaPixelTracker`.
**How to apply** : si un futur bug de tracking Meta ressemble à "l'évènement ne part que
parfois, selon le chemin de navigation", suspecter en premier ce genre de course entre
composants montés dans `layout.tsx` (le meta-pixel/matomo tracker vs les trackers de
page), pas le contenu de l'évènement lui-même.

**Bug trouvé et corrigé le 2026-09-22 : AddToCart jamais émis en pratique (0 évènement
reçu par Meta sur 7 jours, taux de correspondance catalogue bloqué à 66.7% car "Ajouts de
produits au panier" restait "Manquant").** Root cause différente du bug content_ids du
2026-09-17 : le code de tracking AddToCart (`meta-pixel.ts` + appel dans
`product-actions/index.tsx`, la fiche produit) était correct, mais ce chemin n'est quasi
jamais emprunté en production. Le vrai chemin d'ajout au panier pour la quasi-totalité du
trafic est le bouton "ajout rapide" de la grille produits
(`product-preview/quick-add-button.tsx`), utilisable pour tout le catalogue réel car
celui-ci est entièrement mono-variante (voir commentaire dans `product-preview/index.tsx`)
- et ce composant appelait `addToCart` directement sans jamais appeler
`trackAddToCart` (ni Matomo ni Meta). Corrigé : `QuickAddButton` reçoit maintenant
`name`/`category`/`price` en props (passés depuis `product-preview/index.tsx`, données déjà
chargées) et appelle `trackMatomoAddToCart`/`trackMetaAddToCart` après un ajout réussi,
même schéma que `product-actions/index.tsx`. Vérifié par `tsc --noEmit` et lint ciblé
(propres sur les deux fichiers touchés). **Déployé en staging et production le
2026-09-22** (commit `79cb41a`, fast-forward staging -> main). Voir
[[storefront-build-broken-verify-phone]] pour un bug de build sans rapport découvert et
corrigé pendant ce même déploiement (bloquait déjà le déploiement production précédent).

**How to apply** : pour tout futur "évènement X jamais reçu par Meta/Matomo malgré un
code de tracking qui semble correct", toujours vérifier que le composant qui déclenche
l'action réelle la plus utilisée par les visiteurs (pas seulement le chemin "complet"
via la fiche produit) appelle bien le tracker - un composant "raccourci"/"ajout rapide"
ajouté après coup peut dupliquer la logique métier (ici `addToCart`) sans dupliquer le
tracking associé. Chercher tous les appelants de la fonction métier (`addToCart`, etc.),
pas seulement le tracker lui-même.

**2e cause trouvée le 2026-09-23 : le correctif du 2026-09-22 ne suffisait pas.** Le
lendemain du déploiement, Meta affichait toujours "Aucun évènement AjoutAuPanier reçu".
Vérifié en prod (Chrome) : le clic sur `quick-add-button` appelait bien
`fbq("track","AddToCart",...)`, mais l'évènement restait coincé dans `window.fbq.queue`
sans aucune requête vers `facebook.com/tr`. Cause : le stub maison `ensureFbqStub`
(`meta-pixel.ts`) poussait **toujours** dans `queue` sans jamais déléguer à
`fbq.callMethod` (contrairement au snippet officiel Meta) ; fbevents.js ne vide la file
qu'une fois, à son chargement -> tout évènement émis après chargement (AddToCart au
clic, InitiateCheckout...) était perdu. ViewContent/PageView passaient car émis avant le
chargement du script. Preuve : rejouer l'évènement via `fbq.callMethod.apply(fbq, args)`
-> requête `ev=AddToCart` HTTP 200. Corrigé : le stub délègue à `callMethod` s'il existe.
**How to apply** : pour un évènement Pixel "jamais reçu", inspecter `window.fbq.queue`
après l'action en prod : s'il y est encore, le problème est le stub, pas l'appelant.
**Déployé staging + prod le 2026-09-23 (commit `eec4eeb`) et vérifié en prod : vrai clic quick-add -> requête `ev=AddToCart` HTTP 200, file vide.** Reste à voir Meta passer "Ajouts au panier" de "Manquant" à OK (diagnostics mis à jour avec ~24h de retard).

**2026-10-16 : photos, vidéos et ruptures dans le catalogue Meta.**
- Champs de l'API `items_batch` (v20.0) : `additional_image_link` (tableau) et `video` (`[{url}]`). Les noms `additional_image_urls` et `videos` sont refusés comme « champ non reconnu » (visible dans `validation_status` de la réponse, pas dans le statut HTTP). Le flux CSV a les colonnes `video[0].url` et `additional_image_link`. Un produit modifié dans l'admin est renvoyé aux deux catalogues par `subscribers/product-updated-meta-catalog.ts`.
- Le flux planifié (« Remplacé tous les jours », 23h Ouagadougou) prend la priorité sur l'API pour certains attributs : après un changement de format du flux, lancer une importation manuelle dans Meta (Sources de données).
- 29 variantes sur 40 sont « en rupture de stock » dans Meta parce que leur stock Medusa est à 0 (gestion de stock active). Décision du propriétaire le 2026-10-16 : les laisser en rupture (hors publicités dynamiques), ne pas activer la commande sans stock.
- Taux de correspondance pixel/catalogue 89,9 % : dû aux événements d'avant les corrections du 22-23/09 ; à revérifier après le 21/10. Les deux catalogues (principal et app mobile) sont associés au pixel, sans effet sur la synchro.
