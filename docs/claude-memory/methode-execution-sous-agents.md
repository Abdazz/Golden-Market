---
name: methode-execution-sous-agents
description: "Le propriétaire veut que les plans d'implémentation soient exécutés avec des sous-agents (subagent-driven-development), pas en ligne"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 81b0ad81-4304-4021-8801-c7b46cdddc72
  modified: 2026-10-05T22:50:22.517Z
---

Pour exécuter un plan (après brainstorming, spec et plan validés), utiliser superpowers:subagent-driven-development : un sous-agent par tâche, une revue par tâche, une revue finale sur le modèle le plus capable. Il l'a demandé deux fois de suite (2026-10-04, frais d'expédition, en corrigeant mon choix « en ligne » ; 2026-10-05, tableau de bord).

**Why:** les revues par tâche et la revue finale ont trouvé de vrais défauts avant la production (script de bascule qui choisissait la zone au hasard, « - » au lieu de 0 F au checkout, compteur « en retard » toujours à 0).

**How to apply:** proposer directement l'exécution avec des sous-agents à la remise du plan. Garder pour le contrôleur ce qui touche la production (déploiement, SSH VPS, n8n, clés) ; recouper les chiffres réels après déploiement. Voir [[mini-saas-gestion-livreurs]].
