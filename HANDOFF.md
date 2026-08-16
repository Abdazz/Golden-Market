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

2026-08-16 — Phase 0 clôturée : vérification bout en bout du paiement Orange Money
effectuée (Task 10), `HANDOFF.md` mis à jour. Voir journal ci-dessous pour le détail,
notamment un bug non planifié découvert dans le storefront (bouton « Place order »
non fonctionnel pour Orange Money) et son contournement.

## Statut par phase

### Phase 0 — Débloquer le paiement manuel Orange Money
Statut global : **fait**

- [x] Corriger le double `export default` dans `orange-money-manual.ts` — fait (Task 1)
- [x] Instructions Orange Money sur la page de confirmation de commande — fait (Task 3)
- [x] Subscriber `order-placed` → webhook n8n (notification WhatsApp marchand) — fait (Task 2)
- [x] Provider email Medusa (Resend/SMTP) dans `medusa-config.ts` — fait (Task 4)
- [x] Vérification bout en bout du flux de paiement — fait (Task 10)

### Phase 1 — Catalogue & région Burkina Faso
Statut global : **fait**

- [x] Région BF (XOF) créée/seedée — fait (Task 3)
- [x] `NEXT_PUBLIC_DEFAULT_REGION=bf` dans le storefront — fait (Task 3)
- [x] Clé publishable liée au bon sales channel — fait (Task 3)
- [x] Import du catalogue réel via script (plus de saisie manuelle — décision révisée,
      voir journal) — fait (Task 4)

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
- **2026-08-16 (suite)** — Plan d'implémentation Phase 0 écrit (le plan détaillé de
  cette phase, écrit pendant la session — fichier de travail non commité :
  `docs/` n'est pas suivi par git, `.superpowers/` est dans `.gitignore`), 11 tâches
  (dont une ajoutée après coup) et exécuté via `subagent-driven-development`,
  directement sur `main`
  (décision utilisateur). Tasks 1 à 8 terminées et validées en review (détail des
  rulings conservé dans le ledger de session, lui aussi non commité). En cours :
  Tasks 9-10. Pendant l'exécution, l'utilisateur a
  fourni le catalogue produits réel (`Golden Market - Catalogue des produits.xlsx`,
  racine du dépôt, non versionné) : ~29 produits sur 2 feuilles (vente express / vente
  sur commande), 29 images intégrées. Décision : import automatisé (pas de saisie
  manuelle) via 2 collections Medusa + price list grossistes pour le prix de gros —
  détail dans `ROADMAP.md` Phase 1. Ce travail sera traité comme un plan séparé après
  la clôture de la Phase 0.
- **2026-08-16 (clôture Phase 0)** — Task 9 (page de réinitialisation de mot de passe)
  et Task 10 (vérification E2E) terminées. Parcours complet rejoué en direct (backend
  `:9001` + storefront `:8001`, Postgres/Redis Docker) : panier → checkout → sélection
  Orange Money → instructions affichées au checkout (numéro, montant, texte FR) →
  commande passée → page de confirmation affichant les mêmes instructions Orange Money
  (Task 3 confirmé) → log backend `Commande ... placée — N8N_ORDER_WEBHOOK_URL non
  configuré, notification marchand ignorée` (fallback Task 2 propre, sans erreur) →
  admin Medusa : commande retrouvée, paiement `pending`, capture manuelle effectuée,
  passage à `Captured` / `paid` confirmé (`POST /admin/payments/.../capture` → 200).
  Suite de tests unitaires : 5 suites / 10 tests, tous verts (Tasks 1, 2, 4, 5, 6).
  Email de confirmation client (Task 5) : tentative bien déclenchée mais échoue
  proprement (log d'erreur explicite, capturé par le try/catch, ne bloque pas la
  commande) faute de `RESEND_API_KEY` réelle dans ce sandbox — vérification live de
  la réception email **différée à la Phase 5** (déjà signalé comme lacune connue
  depuis la review de la Task 9, pas une régression).
  **Bug non planifié découvert pendant la vérification** : le bouton « Place order »
  du storefront (`apps/storefront/src/modules/checkout/components/payment-button/index.tsx`,
  code du scaffold initial, jamais touché par aucune tâche de ce plan) ne gère pas le
  provider Orange Money dans son `switch` — seuls `isStripeLike` et `isManual` sont
  couverts, donc le bouton reste bloqué sur « Select a payment method » (disabled) dès
  qu'Orange Money est sélectionné, empêchant tout client réel de finaliser sa commande
  par ce moyen de paiement. Contourné temporairement (patch local non commité, retiré
  après usage) le temps de vérifier le reste du parcours ; **ce n'est pas un artefact
  Playwright/DOM** (le bouton est un vrai `<button disabled>` React, confirmé par
  lecture du code et par le comportement live) — c'est un vrai défaut applicatif, à
  corriger avant tout lancement réel. Recommandation : créer une tâche dédiée (ajouter
  un `case isOrangeMoney(...)` réutilisant `ManualTestPaymentButton`, les instructions
  de paiement Orange Money n'exigeant pas de saisie carte côté client) et l'inscrire
  dans `ROADMAP.md`. Par contraste, le flux de capture admin (dialogue de confirmation
  Radix) a fonctionné sans aucune friction d'automatisation ; le seul bruit console
  observé était un warning `validateDOMNesting` préexistant dans le composant
  `CostBreakdown` de l'admin Medusa lui-même, sans rapport avec ce plan.
  **Reste ouvert côté n8n** : le contrat exact du payload webhook (URL, méthode,
  structure JSON envoyée à `N8N_ORDER_WEBHOOK_URL`) n'a jamais été validé contre le
  dépôt `n8n_automation` — signalé depuis la Task 2, toujours non résolu. À faire avant
  de configurer une vraie URL n8n en production.
  Phase 0 marquée **fait** : les 5 points du `ROADMAP.md` sont couverts et vérifiés de
  bout en bout ; le bug du bouton « Place order » ci-dessus a été traité en Task 11
  (ajoutée après coup au plan, qui en compte donc 11 au lieu de 10).
- **2026-08-16 (Task 11)** — Correction du bug « Place order » décrit ci-dessus : ajout
  d'un `case isOrangeMoney(...)` réutilisant `ManualTestPaymentButton` dans
  `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`
  (commit `76f4973`, « Corrige le bouton "Place order" resté désactivé pour Orange
  Money »). Le bug ne reste donc plus un blocage réel — le paragraphe ci-dessus
  documente son historique (découverte, cause, contournement temporaire) mais est
  résolu depuis ce commit.
- **2026-08-16 (Phase 1)** — Phase 1 clôturée : catalogue et région Burkina Faso
  complètement implémentés via deux scripts idempotents (`seed-region-bf.ts`,
  `import-catalog.ts`). Livrables : région Burkina Faso (devise XOF, seul Orange Money
  comme payment provider, lieu de stock et fulfillment point, tax region), 29 produits
  réels importés depuis le fichier Excel « Golden Market - Catalogue des produits.xlsx »
  avec images intégrées (22 « Vente express » + 7 « Vente sur commande »), deux collections
  Medusa correspondantes, et customer group « Grossistes » pour le tarif de gros via
  price list. **Point ouvert intentionnel : la livraison est tarifiée à 0 XOF** (placeholder
  volontaire — le merchant négocie le coût réel de livraison après la commande via
  WhatsApp). Ce n'est pas un bug ; si une session future cherche à « fixer » ce prix,
  consulter d'abord l'utilisateur. Scripts ré-exécutables sans risque de doublon
  (vérification par nom/titre avant création).
