---
name: deploiement-prod-apres-staging
description: "Après chaque push sur staging, lancer aussi le déploiement production sans demander (consigne du 2026-10-12)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 198bc8b4-8df6-456a-b773-e669c505e901
  modified: 2026-10-12T15:47:10.741Z
---

À chaque push sur `staging`, enchaîner directement le déploiement production : `git fetch -q origin && git push origin origin/staging:main`, puis suivre le run GitHub Actions (API, attente ~15 min en tâche de fond, peu d'appels : limite 60/h).

**Why:** le propriétaire l'a demandé explicitement le 2026-10-12 (« à chaque fois que tu déploie sur staging, il faut également lancé le déploiement de la production ») ; il validait déjà chaque déploiement, la question était superflue.

**How to apply:** ne plus demander « je déploie en production ? » ; tester d'abord (tests unitaires + navigateur local), pousser staging puis main, et annoncer le déploiement lancé. Voir [[autonomie-totale-proprietaire]].
