---
name: golden-market-category-handle-ampersand-bug
description: "Medusa v2 product-category handle generation keeps a literal & from the name, which 404s on the storefront's [handle] route"
metadata:
  type: project
  originSessionId: 2e980302-0e5c-4421-8c5b-65c81623197c
  modified: 2026-08-27T17:51:24.489Z
---

When creating a `product_category` via `createProductCategoriesWorkflow` with
a name containing `&` (e.g. "Maison & Cuisine"), Medusa v2's auto-generated
handle keeps the `&` literally (`maison-&-cuisine`) instead of stripping or
transliterating it, unlike most slugifiers.

**Why this matters:** the storefront's `/[countryCode]/categories/[...category]`
route 404s on that handle — visiting `/bf/categories/maison-&-cuisine`
directly returns 404, even though the category exists and the store API
returns it correctly with that exact handle string. This isn't the same bug
class as the accented-handle 500 fixed earlier in [[golden-market-local-dev-stack]]
(that one was a decodeURIComponent issue); this is Medusa emitting a handle
that doesn't round-trip through the category route at all.

**How to apply:** never use `&` in a product category (or likely collection)
name in this project. Use "et" instead ("Maison et Cuisine"). Verified fix:
renaming to avoid `&` produces a clean handle (`maison-et-cuisine`) that
resolves correctly. If a category already exists with a bad `&` handle,
there's no rename-in-place path that was tested — delete and recreate it
(`productModuleService.deleteProductCategories([id])`) rather than trying to
patch the handle field directly.
