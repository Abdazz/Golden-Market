---
name: storefront-build-broken-verify-phone
description: Build storefront cassé du 2026-09-17 au 2026-09-22 (composant client VerifyPhone important cookies.ts server-only) - corrigé et déployé le 2026-09-22
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-22T13:02:32.934Z
  originSessionId: ca824cb0-33c5-4f0e-97b4-7b02efcc038f
---

**Bug trouvé le 2026-09-22, sans rapport avec la tâche en cours (fix AddToCart, voir
[[meta-catalog-sync-status]])** : en poussant staging et production, les deux
déploiements ont échoué à l'étape "Déployer sur le VPS" (`deploy-staging.yml` /
`deploy-production.yml`), build Docker du storefront en échec avec `Failed to compile` :

```
./src/lib/data/cookies.ts
Error: You're importing a component that needs "server-only". That only works in a
Server Component which is not supported in the pages/ directory.
Import trace: cookies.ts -> verify-phone/index.tsx -> login-template.tsx
```

**Root cause** : `VerifyPhone` (`apps/storefront/src/modules/account/components/verify-phone/index.tsx`,
`"use client"`) importait et appelait directement `getPendingCustomer()` depuis
`@lib/data/cookies` (module marqué `import "server-only"` + `next/headers`, jamais
appelable depuis un composant client) pour lire le téléphone en attente dans
`handleResend`, au lieu de passer par une server action de `@lib/data/customer.ts`
(`"use server"`) comme le reste du flux (`confirmPhoneVerification` par ex.).

**Découvert en vérifiant les runs GitHub Actions dans le navigateur** (aucun accès
token/`gh` CLI dans l'environnement - la page "Sign in to view logs" affichée au premier
chargement était juste un rendu pas encore hydraté, un refresh de l'onglet a suffi à
montrer la session déjà connectée).

**Antériorité confirmée** : le déploiement production du commit précédent (`52e7ec9`,
un des commits de la série d'auth `868ec33`..`52e7ec9`) avait déjà échoué à la même
étape, avant même la session qui a trouvé ce bug - donc le build était cassé en
production depuis au moins ce commit-là, pas introduit par le fix AddToCart. Le
déploiement staging de `52e7ec9`, lui, avait réussi (état divergent staging/prod avant
correctif).

**Corrigé** (`apps/storefront/src/lib/data/customer.ts` +
`apps/storefront/src/modules/account/components/verify-phone/index.tsx`) :
`resendPhoneVerification()` ne prend plus `phone` en paramètre - elle lisait déjà
`getPendingCustomer()` en interne (server-side) pour le mot de passe, elle lit
maintenant aussi le téléphone depuis ce même appel. `VerifyPhone` n'importe plus
`@lib/data/cookies` du tout. Vérifié par `next build` local complet (pas seulement
`tsc --noEmit`, qui ne détecte pas ce genre d'erreur de frontière client/serveur webpack) :
`Compiled successfully` obtenu après le correctif. Déployé en staging et production le
2026-09-22 (commit `075584a`), les deux déploiements ont réussi après coup.

**How to apply** : si un futur échec de déploiement storefront montre "Failed to
compile" avec une erreur `server-only`/`next/headers` "not supported in the pages/
directory" (le storefront n'a pas de vrai répertoire `pages/`, ce message générique de
Next.js signale en fait un import server-only atteint depuis le bundle client), chercher
en premier un composant `"use client"` qui importe directement une fonction de
`@lib/data/cookies.ts` au lieu de passer par une server action de `@lib/data/customer.ts`
(ou équivalent) qui l'appelle en interne. Toujours vérifier un fix de ce type avec un
`next build` complet, pas seulement `tsc --noEmit` - ce dernier ne voit pas les
frontières client/serveur du bundler.
