# Golden Market — Handoff / suivi d'avancement

Document de suivi entre sessions Claude Code. Chaque session doit :

1. Lire ce document en premier pour savoir où en est le projet.
2. Cocher/mettre à jour le statut d'une tâche **dès qu'elle est terminée** (pas en fin
   de session — au fil de l'eau).
3. Ajouter une entrée dans le journal en bas si une décision ou un blocage mérite d'être
   tracé pour la session suivante.

Le détail des tâches vit dans `ROADMAP.md` (phases 0 à 5 + phase différée) ainsi que
dans les décisions actées de `ARCHITECTURE.md`. Ce document-ci ne répète pas le contenu
des tâches, seulement leur **statut**.

Statuts possibles : `à faire` · `en cours` · `bloqué` · `fait`.

## Dernière mise à jour

2026-08-16 — Session de planification initiale (analyse du projet + `ROADMAP.md` créé
et validé). Aucun code modifié dans cette session.

## Statut par phase

### Phase 0 — Débloquer le paiement manuel Orange Money
Statut global : **en cours** (travail entamé hors session Claude, non commité)

- [ ] Corriger le double `export default` dans `orange-money-manual.ts` — à faire
- [ ] Instructions Orange Money sur la page de confirmation de commande — à faire
- [ ] Subscriber `order-placed` → webhook n8n (notification WhatsApp marchand) — à faire
- [ ] Provider email Medusa (Resend/SMTP) dans `medusa-config.ts` — à faire
- [ ] Vérification bout en bout du flux de paiement — à faire

### Phase 1 — Catalogue & région Burkina Faso
Statut global : **à faire** (périmètre révisé le 2026-08-16, voir `ROADMAP.md`)

- [ ] Région BF (XOF) créée/seedée — à faire
- [ ] `NEXT_PUBLIC_DEFAULT_REGION=bf` dans le storefront — à faire
- [ ] Clé publishable liée au bon sales channel — à faire
- [ ] Import du catalogue réel via script (plus de saisie manuelle — décision révisée,
      voir journal) — à faire, plan dédié pas encore écrit

### Phase 2 — Durcissement sécurité
Statut global : **à faire**

### Phase 3 — Déploiement VPS + Docker
Statut global : **à faire**

### Phase 4 — Tests & CI minimale
Statut global : **à faire**

### Phase 5 — Vérification pré-lancement
Statut global : **à faire**

### Phase différée (post-lancement)
Non commencée, hors périmètre du lancement (sync n8n, bouton WhatsApp, import
catalogue automatisé, nettoyage TODOs template).

## Journal

- **2026-08-16** — Analyse approfondie du dépôt effectuée. Constat clé : un seul
  commit d'initialisation (scaffold quasi intact) + travail non commité sur le
  provider `orange-money-manual` (bug bloquant : deux `export default` dans le même
  fichier). Décisions de périmètre prises avec l'utilisateur : MVP resserré (pas de
  sync n8n ni bouton WhatsApp au lancement), hébergement VPS + Docker, pas de date
  fixe, notification marchand via webhook n8n → WhatsApp, notification client via
  provider email Medusa. `ROADMAP.md` créé et validé. `HANDOFF.md` créé (ce fichier).
  Prochaine étape : plan d'implémentation détaillé de la Phase 0 via le skill
  `writing-plans`.
- **2026-08-16 (suite)** — Plan d'implémentation Phase 0 écrit
  (`docs/superpowers/plans/2026-08-16-phase-0-paiement-notifications.md`, 10 tâches)
  et exécuté via `subagent-driven-development`, directement sur `main` (décision
  utilisateur). Tasks 1 à 8 terminées et validées en review (voir le ledger
  `.superpowers/sdd/2026-08-16-phase-0-paiement-notifications/progress.md` pour le
  détail des rulings). En cours : Tasks 9-10. Pendant l'exécution, l'utilisateur a
  fourni le catalogue produits réel (`Golden Market - Catalogue des produits.xlsx`,
  racine du dépôt, non versionné) : ~29 produits sur 2 feuilles (vente express / vente
  sur commande), 29 images intégrées. Décision : import automatisé (pas de saisie
  manuelle) via 2 collections Medusa + price list grossistes pour le prix de gros —
  détail dans `ROADMAP.md` Phase 1. Ce travail sera traité comme un plan séparé après
  la clôture de la Phase 0.
