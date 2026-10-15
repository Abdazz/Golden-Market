---
name: copie-memoire-dans-depot
description: La mémoire est copiée dans docs/claude-memory/ du dépôt pour reprendre sur un autre ordinateur ; resynchroniser et commiter après chaque modification (2026-10-15)
metadata:
  type: feedback
---

Le propriétaire veut pouvoir reprendre le travail sur un autre ordinateur avec toutes les informations (question du 2026-10-15). La mémoire de Claude Code vit hors du dépôt : une copie est tenue dans `docs/claude-memory/` (installation décrite dans son `README.md`).

**Why:** sans copie commitée, un autre ordinateur n'a ni les mémoires ni leurs consignes ; `HANDOFF.md` et `docs/HANDOFF-PROMPT.md` étaient aussi restés au 2026-10-10.

**How to apply:** après chaque modification de mémoire, recopier (`cp <dossier mémoire>/*.md docs/claude-memory/`) ; à la fin de chaque lot, mettre à jour « Dernière mise à jour » de `HANDOFF.md` et l'état de `docs/HANDOFF-PROMPT.md`, puis commiter et pousser (voir [[deploiement-prod-apres-staging]]). Jamais de secret : le dépôt est public.
