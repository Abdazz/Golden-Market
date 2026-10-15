---
name: copie-memoire-dans-depot
description: Le dossier mémoire de ce projet est un lien symbolique vers docs/claude-memory/ du dépôt (synchro par git entre ordinateurs) ; commiter les mémoires à chaque lot (2026-10-15)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 198bc8b4-8df6-456a-b773-e669c505e901
  modified: 2026-10-15T17:39:04.860Z
---

Le propriétaire travaille sur deux ordinateurs et veut que la mémoire suive par git (2026-10-15). Depuis ce jour, `~/.claude/projects/<dossier du projet>/memory` est un **lien symbolique** vers `docs/claude-memory/` du dépôt (ancien dossier gardé en `memory.bak-20261015`). Toute mémoire écrite atterrit donc directement dans le dépôt. Uniquement ce projet : les autres projets gardent leur mémoire normale.

**Why:** une simple copie divergeait entre les deux ordinateurs ; `HANDOFF.md` et `docs/HANDOFF-PROMPT.md` étaient aussi restés au 2026-10-10.

**How to apply:** commiter `docs/claude-memory/` avec chaque lot (et pousser, voir [[deploiement-prod-apres-staging]]) ; `git pull` en début de session pour récupérer les mémoires de l'autre ordinateur ; à la fin de chaque lot, mettre à jour « Dernière mise à jour » de `HANDOFF.md` et l'état de `docs/HANDOFF-PROMPT.md`. Jamais de secret dans une mémoire : le dépôt est public. Installation sur un autre ordinateur : `docs/claude-memory/README.md`.
