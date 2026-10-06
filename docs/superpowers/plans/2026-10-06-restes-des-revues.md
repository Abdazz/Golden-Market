# Restes des revues du 2026-10-06 - plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** solder les points mineurs relevés par les revues des lots du 2026-10-06 (stock livreurs, widgets produit, médias WhatsApp, Meta).

**Architecture:** retouches locales dans le code existant, sans changement d'interface publique ni migration.

**Tech Stack:** Medusa v2.18 (workflows, core-flows locking), React 18 (extensions admin), Jest.

**Spec:** pas de spec dédiée (petites corrections) : les constats viennent des revues consignées dans `HANDOFF.md` (entrée du 2026-10-06) et des specs `2026-10-06-finitions-stock-livreurs-design.md`, `2026-10-06-entretien-medias-whatsapp-design.md`, `2026-10-06-meta-evenements-achat-design.md`.

## Global Constraints

- Français, pas d'emoji, pas de trailer `Co-Authored-By` ; pas de point-virgule, guillemets doubles, 2 espaces ; pas de `@medusajs/ui` dans l'admin.
- Ne pas toucher à la production, au VPS, à n8n ni aux `.env`.
- Décision : pas de test d'intégration du verrou (il demanderait une base et un serveur Medusa complets pour un risque jugé faible par la revue finale).

## Review Focus

- Verrou : un propriétaire par exécution ; une libération ne doit jamais libérer le verrou d'une autre exécution.
- Recherche : « cœur » trouvé en tapant « coeur » et inversement ; lettres accentuées et chiffres conservés.
- Suppression d'un `wa-media` : refusée si l'URL ne vient pas de notre stockage (hôte différent de `MEDUSA_BACKEND_PUBLIC_URL`).

---

### Task 1: Backend (verrou, hôte des médias, tests Meta)

**Files:**
- Modify: `apps/backend/src/workflows/courier-stock.ts`
- Modify: `apps/backend/src/lib/whatsapp-media-cleanup.ts` (+ test)
- Modify: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/media-messages/route.ts` (+ test)
- Test: `apps/backend/src/lib/__tests__/meta-conversions-mapping.unit.spec.ts`

- [ ] **Step 1: Verrou avec propriétaire** : dans `recordCourierStockWorkflow` et `takeDeliveryStockWorkflow`, générer un identifiant d'exécution avec `transform` (par ex. `transform({}, () => ({ ownerId: \`courier-stock-${Date.now()}-${Math.random().toString(36).slice(2)}\` }))` — vérifier dans `node_modules/@medusajs/core-flows/dist/locking/steps/acquire-lock.js` que `ownerId` est bien transmis au fournisseur et utilisé à la libération) et le passer à `acquireLockStep({ key, timeout: 10, ttl: 30, ownerId })` et `releaseLockStep({ key, ownerId })`. Commentaire : une exécution qui dépasse le ttl ne peut plus libérer le verrou d'une autre.

- [ ] **Step 2: Hôte des médias (test d'abord)** : `orphanMediaFileKey(url, allowedOrigin?)` refuse une URL dont l'origine diffère de `allowedOrigin` quand il est fourni. Tests : origine identique -> clé ; autre hôte -> `null` ; `allowedOrigin` absent -> comportement actuel. La route passe `new URL(process.env.MEDUSA_BACKEND_PUBLIC_URL).origin` quand la variable existe (try/catch si elle est mal formée -> pas de suppression). Test de route : URL d'un autre hôte -> aucune suppression.

- [ ] **Step 3: Tests Meta manquants** : `meta_browser` non objet (`"texte"`, `null`) -> aucun champ navigateur, pas d'exception ; `storefrontUrl` avec `/` final ET `country_code: "BF"` -> `https://golden-market.co/bf/order/order_1/confirmed`.

- [ ] **Step 4: Vérifier** : suite unitaire complète, tsc filtré, eslint des fichiers ; commit `fix: verrou du stock livreur par exécution, hôte vérifié avant suppression d'un média, tests Meta`.

---

### Task 2: Admin (sélecteur, recherche, widget vidéo, historique)

**Files:**
- Modify: `apps/backend/src/admin/lib/product-search.ts` (+ test)
- Modify: `apps/backend/src/admin/components/courier-stock-tab.tsx`
- Modify: `apps/backend/src/admin/widgets/product-video.tsx`

- [ ] **Step 1: Recherche (test d'abord)** : `normalizeSearch` remplace `œ`/`Œ` par `oe` et `æ`/`Æ` par `ae` avant la suppression des accents, et garde toute lettre ou chiffre Unicode (`/[^\p{L}\p{N}]+/gu` au lieu de `[^a-z0-9]`). Tests : `matchesSearch("Cœur de palmier", "coeur")` vrai ; `normalizeSearch("Ætna 2")` = `"aetna 2"` ; les tests existants passent toujours.

- [ ] **Step 2: Sélecteur accessible** : `ProductPicker` : `role="combobox"`, `aria-expanded`, `aria-controls` (identifiant via `useId`), `aria-autocomplete="list"` sur le champ ; `role="listbox"` sur la liste, `role="option"` sur chaque proposition (le bouton peut rester un `<button>` dans un `<li role="option">` ou porter le rôle lui-même).

- [ ] **Step 3: Historique** : au changement de livreur dans `History`, vider la liste affichée (état « Chargement… ») avant la nouvelle requête, pour ne jamais montrer les mouvements du livreur précédent.

- [ ] **Step 4: Widget vidéo** : entourer `await uploadRes.json()` d'un `try/catch` -> `setStatus("error")` et `setErrorMessage("Réponse inattendue du serveur, réessayez.")`.

- [ ] **Step 5: Vérifier** : tests `src/admin/lib/__tests__`, tsc filtré, eslint ; commit `fix(admin): recherche avec ligatures, sélecteur accessible, historique et téléversement vidéo plus sûrs`.
