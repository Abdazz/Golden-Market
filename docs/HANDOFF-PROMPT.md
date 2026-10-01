# Prompt de reprise (nouvelle session Claude Code)

Copier le bloc ci-dessous comme premier message d'une nouvelle session ouverte dans
`medusa-golden-market/`. Mis à jour le 2026-10-01.

---

Tu reprends le projet Golden Market (boutique Medusa v2.18 + agent IA WhatsApp sur n8n, Burkina
Faso). Le propriétaire gère seul et remplace ses fichiers Excel par un mini-SaaS de gestion dans
l'admin Medusa. Réponds-lui en français ; code, commentaires, UI et commits en français, sans emoji
dans le code, sans trailer Co-Authored-By.

**À lire d'abord** : `AGENTS.md` (structure, commandes, conventions, pièges), `HANDOFF.md`
(section « Dernière mise à jour »), puis ta mémoire (`MEMORY.md`). Le projet n8n est à côté :
`../n8n_automation/` (`schema.sql`, `guide-golden-market-agent.md`, `AGENTS.md`).

## État (tout est en production)

- Mini-SaaS : Livraisons (livreurs, tournée, versements, **stock confié aux livreurs**), Caisse,
  Approvisionnement et marges, Prospects (relances, attente de stock, « Prévenir » = modèle Meta
  `retour_en_stock`).
- Chat WhatsApp de l'admin : médias, vocaux, reprise manuelle, « Non envoyé » (refus Meta),
  messages automatiques (modèles) dans l'historique, « Suivre comme prospect ».
- Specs et plans : `docs/superpowers/specs/` et `docs/superpowers/plans/` (2026-09-27 et 09-28).

## Prochaines tâches proposées au propriétaire (à lui faire choisir)

1. **Tableau de bord de gestion** : une page « Aujourd'hui / ce mois » (ventes, caisse, marges,
   livraisons faites / à faire, stock chez les livreurs, prospects à relancer). Architectural :
   brainstorming + spec + plan.
2. **Finitions du stock livreurs** (mineurs de la revue finale) : recherche produit par nom dans les
   formulaires ; avertissement visible si le déstockage échoue à « Livrée » (aujourd'hui seulement
   journalisé) ; lignes réinitialisées au changement de livreur en mode Retour ; message d'erreur
   au lieu de « Chargement… » sans fin ; refuser un produit saisi deux fois dans une correction ;
   ignorer les variantes `manage_inventory = false` au déstockage ; verrou entre mouvements
   manuels simultanés.
3. **Suivi Meta des commandes par téléphone** (action_source « phone_call » dans l'API Conversions).
4. **Entretien** : purger le fichier `wa-media` orphelin après un envoi échoué ; la purge nocturne
   rescanne d'anciens messages ; coches « remis / lu » dans le chat (refusé pour l'instant, à
   reproposer seulement si demandé) ; micro du chat non testé sur téléphone.

## À rappeler au propriétaire (actions de son côté)

Valider les hypothèses des specs caisse / approvisionnement / prospects ; saisir le solde initial de
caisse et les coûts de revient du stock existant (onglet Marges) ; ajouter ses autres livreurs puis
le stock qu'il leur confie ; « Rendre la main » sur sa conversation de test (22677406101).

## Méthode de travail attendue

- Skills superpowers : brainstorming (annoncer bounded / architectural, design validé avant tout
  code), writing-plans puis executing-plans en ligne pour l'architectural ; TDD (test qui échoue
  d'abord) ; revue finale par un agent frais quand un plan est exécuté. Skills medusa-dev
  (`building-with-medusa`, `building-admin-dashboard-customizations`) pour tout code Medusa.
- Il a donné carte blanche pour déployer jusqu'en production après tests ; tests autorisés sur son
  numéro +226 77 40 61 01 (prévenir avant tout envoi réel ; ne plus simuler de messages entrants
  sur son numéro sans le dire : ils faussent la fenêtre de 24 h).
- Déploiement : `git push origin staging` (staging), `git push origin staging:main` (production),
  GitHub Actions, ~20 min par build. VPS `ssh admin@144.91.110.105` ; conteneurs
  `production-golden-market-backend`, `staging-golden-market-backend`, `*-postgres`,
  `golden_market_n8n`, `golden_market_postgres` (base chat `golden_market`, n8n dans le schéma
  `n8n`). Tests d'API admin depuis le conteneur n8n avec `MEDUSA_ADMIN_KEY_STAGING` /
  `_PRODUCTION` et `MEDUSA_BACKEND_URL` / `_PRODUCTION` (script copié par `docker cp`, supprimé
  ensuite avec `docker exec -u root ... rm`).
- n8n : export (`n8n export:workflow --id=`) → patch Python → `import:workflow` →
  `publish:workflow --id=` → `docker restart golden_market_n8n` ; garder une sauvegarde de la
  version précédente. Workflows : principal `i6KGA9BvK9unjxxj`, modèles / webhook générique
  `pse4PNU4MF5OMGHB`, actions admin `AdmConvAction7Qx`, purge `PurgeClientPhot1`. Le serveur MCP
  n8n refuse le jeton (401) : passer par la CLI sur le VPS.
- Local : Postgres docker sur 5433 ; lancer `npx medusa develop` directement dans `apps/backend`
  (turbo enlève les variables) avec `WHATSAPP_CHAT_DATABASE_URL` pointant sur la base
  `golden_market_chat_test` ; sessions en mémoire (se reconnecter après chaque redémarrage).
  Créer un admin de test local avec `npx medusa user` et un mot de passe généré, gardé dans le
  scratchpad, jamais affiché. Navigateur : Playwright MCP, fichiers sous `.playwright-mcp/`.
- Ne jamais afficher ni committer de secret (.env) ; ne jamais utiliser son mot de passe réel.

## Pièges connus

- `query.graph` sur `order` : demander `items.*`, `summary.*`, `shipping_methods.*` (sinon total 0
  et quantités vides) ; `payment_status` / `fulfillment_status` n'y sont pas calculés.
- Commandes du site en paiement à la livraison : paiement « autorisé » à capturer
  (`capturePaymentWorkflow`) ; commandes par téléphone : `markPaymentCollectionAsPaid`.
- Modèles Meta : pas de variable en début ni en fin de corps ; `retour_en_stock` est en catégorie
  marketing.
- Toute nouvelle colonne de la base chat lue par Medusa doit exister en production AVANT le
  déploiement du backend (sinon le chat devient « indisponible ») ; l'ajouter aussi à
  `../n8n_automation/schema.sql` et à la base locale de test.
