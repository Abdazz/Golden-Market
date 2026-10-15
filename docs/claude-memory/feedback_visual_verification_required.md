---
name: feedback-visual-verification-required
description: Code-level checks (tsc/build/eslint/grep) are not sufficient to call a visual redesign done — always run a real browser pass against a live backend before declaring it complete
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2e980302-0e5c-4421-8c5b-65c81623197c
  modified: 2026-08-27T00:52:40.105Z
---

For the storefront-redesign 4-plan sequence (Fondation, Accueil/Catalogue/Produit,
Panier/Paiement, Compte), every task and every final review relied on
`tsc --noEmit`, `npm run build` reaching "Compiled successfully", scoped
`eslint`, and em-dash greps — because no Medusa backend was reachable in the
dev sandbox, so `npm run build` always failed later at "Collecting page
data" and real visual QA was deferred to the human partner in every single
plan's ledger.

When a real backend was finally stood up (Postgres+Redis via docker-compose,
Medusa backend, real Golden Market catalog import) and the storefront was
driven with Playwright + real screenshots, code-level checks had missed:
- A CSS `@import` ordering bug (`tokens.css` after the `tailwindcss/*`
  imports) that Turbopack's dev-mode CSS parser rejects outright (500 on
  every page) but the production webpack build silently tolerates — so
  `next build`'s "Compiled successfully" gave false confidence.
- A Next.js dynamic-route-param bug: `params.handle` for `/products/[handle]`
  arrives already percent-encoded rather than decoded, so any product
  handle with non-ASCII characters (accented French names — the majority of
  Golden Market's real catalog) crashed the product detail page with a 500.
  No amount of `tsc`/`eslint`/em-dash-grep on the redesign's own component
  files could ever have surfaced this — it lived in routing code no plan
  touched.
- A footer flex layout (`justify-between`, no `flex-wrap`) that overlaps
  text at mobile width — invisible to any non-visual check.

**Why:** all three were structurally invisible to the verification method
used throughout the 4-plan sequence, no matter how rigorously it was
applied. They only surfaced once real pages were rendered in a real
browser against real data.

**How to apply:** for this project (and likely any frontend redesign work
where a live backend isn't normally available in-session), treat
"tsc/build/lint clean" as necessary but explicitly *not sufficient* to
claim visual work is done. When the user asks to move forward with visual
verification (or when finishing a UI-heavy branch), proactively stand up
the real stack (see [[project-golden-market-local-dev-stack]]) and drive it
with a screenshot-capable tool rather than deferring "visual QA" indefinitely
as a footnote. Cross-cutting bugs (CSS import order, routing/param decoding,
responsive flex overlap) hide specifically in the gap between "code
compiles" and "renders correctly in a browser."
