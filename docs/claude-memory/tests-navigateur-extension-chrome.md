---
name: tests-navigateur-extension-chrome
description: "Le propriétaire veut que j'utilise l'extension Claude in Chrome (son navigateur, ses sessions) pour les tests navigateur plutôt que Playwright avec sessions fabriquées"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 082cf4b2-1ad1-427a-b086-ab2d09fee80a
  modified: 2026-10-07T16:40:04.911Z
---

Le 2026-10-07, le propriétaire m'a signalé l'extension Chrome (« Claude in Chrome ») pour mes tests dans le navigateur, alors que j'utilisais Playwright avec un administrateur local et des cookies posés à la main.

**Why:** son Chrome a déjà ses sessions ouvertes (admin de production notamment) : vérifications plus directes, sans compte de test ni manipulation de cookies.

**How to apply:** pour les vérifications visuelles (admin staging/production, site), utiliser les outils mcp__claude-in-chrome__* (charger le skill claude-in-chrome d'abord, nouvel onglet, pas de réutilisation d'onglets existants sans demande). Le 2026-10-07 il a confirmé : « aucun problème que tu utilises mon compte » — je peux agir avec son compte, y compris pour des tests en production. Garder la prudence seulement pour ce qui touche de vrais clients (messages WhatsApp, commandes réelles modifiées) : utiliser des données de test (numéro fictif, commande de test) et nettoyer ensuite. Playwright reste possible pour les tests locaux. Voir [[autonomie-totale-proprietaire]].
