---
name: whatsapp-app-mobile-catalog
description: "Catalogue Meta dédié à l'app mobile WhatsApp Business (+226 64 94 73 73) créé, connecté et vérifié en conditions réelles le 2026-09-22 - sujet clos"
metadata:
  node_type: memory
  type: project
  originSessionId: 40a9ca8b-501f-4bc4-8eaf-957cbbced087
  modified: 2026-09-22T23:10:56.673Z
---

**Statut au 2026-09-22 : résolu et vérifié en conditions réelles (le propriétaire confirme
que les produits s'affichent dans le catalogue de l'app mobile).** Sujet distinct de la
synchro catalogue de production - voir [[meta-catalog-sync-status]] pour le catalogue lié
au compte Cloud API, et [[golden-market-whatsapp-agent-audit]] pour le piège "deux numéros
WhatsApp distincts" déjà repéré le 2026-09-18.

**Root cause confirmée** (règle officielle Meta, vérifiée à la fois par recherche web et par
une vraie erreur API) : **un catalogue Meta ne peut être connecté qu'à un seul compte
WhatsApp Business (WABA) à la fois** ; un catalogue peut être partagé entre plusieurs
*numéros de téléphone* mais seulement s'ils appartiennent au même WABA. Or `+226 64 94 73 73`
(app mobile, canal humain - réceptionne les leads publicitaires Facebook Click-to-WhatsApp,
utilisé pour l'envoi manuel) et `+226 61 85 37 37` (Cloud API, piloté par l'agent IA) sont
**deux WABA distincts** sous le même Business Manager Golden Market (IDs `1355974616188559`
et `1559398689065795`), pas deux numéros d'un même WABA. Le catalogue de production
(`Catalogue_Produits_Golden_Market`, `1389887146453163`) déjà lié au WABA de `61 85 37 37`
ne pouvait donc structurellement pas être aussi lié à celui de `64 94 73 73` - confirmé par
l'erreur API réelle `"WhatsApp Business Account should have maximum one product catalog"` en
tentant l'association.

**Piège rencontré en testant l'association via le Gestionnaire WhatsApp desktop** : le
catalogue `Golden Market` (`1021997438964307`, vide) a d'abord échoué avec cette même erreur
alors qu'aucun catalogue n'était visiblement associé à `64 94 73 73`. Cause probable (non
confirmée à 100%) : ce catalogue avait déjà été associé puis dissocié manuellement par le
propriétaire depuis l'app mobile avant cette session - un état résiduel côté Meta a
probablement bloqué la ré-association via l'outil desktop. Un catalogue **tout neuf, jamais
utilisé nulle part**, s'est associé sans problème dès le premier essai. **How to apply** : si
une future association de catalogue WhatsApp échoue avec cette erreur sur un compte qui
semble pourtant vide, soupçonner un résidu d'un essai précédent plutôt qu'un blocage
définitif - créer un catalogue frais pour vérifier avant d'investiguer plus loin.

**Option rejetée : fusionner les deux numéros sous un seul WABA.** Aurait résolu le problème
de partage de catalogue, mais `64 94 73 73` est le seul canal d'envoi manuel de Golden Market
(pas d'autre moyen d'écrire manuellement à un client) - fusionner l'aurait fait passer sous
gestion Cloud API, ce qui coupe l'usage de l'app mobile classique sauf activation de la
fonctionnalité Meta "Coexistence" (app + API en parallèle), non mise en place. Rejeté comme
trop risqué pour ce gain.

**Solution retenue et déployée : second catalogue Meta, alimenté par le même flux Medusa.**
Cohérent avec la règle "Medusa = source de vérité unique" ([[medusa-golden-market-overview]]).
- Catalogue créé dans Commerce Manager : `Catalogue_Produits_Golden_Market_App_TEST` (nom
  jamais renommé faute d'avoir trouvé l'option de rename dans l'UI - cosmétique seulement,
  à corriger si l'occasion se présente), `catalog_id` = `1018445977919742`.
- Source de données : flux planifié horaire sur `https://golden-market.co/meta-catalog-feed`
  (même route publique que le catalogue de production, aucune modification de code
  nécessaire pour le flux lui-même), devise XOF. Premier import : 39 produits, 0 échec.
- Associé à `64 94 73 73` via Gestionnaire WhatsApp, icône catalogue + bouton "Ajouter au
  panier" activés.
- Permissions : le system user `goldenmarketbot` (déjà utilisé pour `META_CATALOG_ACCESS_TOKEN`,
  scope `catalog_management`) a reçu un accès "Contrôle total" sur ce nouveau catalogue via
  Business Settings > Catalogues > Affecter des personnes - **le jeton existant est réutilisé
  tel quel**, pas de nouveau jeton généré.

**Code déployé (commit `f25fdd6`, staging puis fast-forward main, les deux déploiements
GitHub Actions ont réussi)** : `syncVariantToMetaCatalog` (`meta-catalog-sync.ts`) accepte
désormais un tableau de `MetaCatalogConfig` au lieu d'un seul, et pousse en parallèle
(`Promise.allSettled`) vers chacun - un échec sur un catalogue n'empêche pas la tentative sur
les autres, les échecs sont agrégés dans une seule erreur remontée à l'appelant. Nouvelle
fonction `getConfiguredMetaCatalogConfigs()` lit deux paires de variables d'environnement
indépendantes : `META_CATALOG_ID`/`META_CATALOG_ACCESS_TOKEN` (production, existant) et
`META_CATALOG_APP_ID`/`META_CATALOG_APP_ACCESS_TOKEN` (nouveau, catalogue app). Chaque paire
est optionnelle indépendamment - absence de l'une n'empêche pas l'autre. Les deux subscribers
(`product-variant-price-updated-meta-catalog.ts`,
`product-variant-stock-updated-meta-catalog.ts`) utilisent cette fonction. Fait en TDD
(tests modifiés d'abord, RED vérifié, puis code, 48/48 tests verts, `tsc --noEmit` propre).
Variables `META_CATALOG_APP_ID=1018445977919742` et `META_CATALOG_APP_ACCESS_TOKEN=<même
valeur que META_CATALOG_ACCESS_TOKEN>` ajoutées dans `apps/backend/.env` en production
uniquement (même décision que pour le catalogue de production - pas sur staging).

**How to apply** : ne plus proposer la connexion du catalogue à l'app mobile comme travail
restant - c'est fait et vérifié (produits visibles dans l'app). Si un jour un besoin de
rafraîchissement plus rapide que l'heure se présente sur ce catalogue, le flux planifié
peut être resserré depuis Commerce Manager > Sources de données - le push temps réel
prix/stock, lui, est déjà actif dès que les deux variables d'env sont configurées.
