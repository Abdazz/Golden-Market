# Prompt de reprise (nouvelle session Claude Code)

Copier le bloc ci-dessous comme premier message d'une nouvelle session ouverte dans
`medusa-golden-market/`. Mis à jour le 2026-10-05.

---

Tu reprends le projet Golden Market (boutique Medusa v2.18 + agent IA WhatsApp sur n8n, Burkina
Faso). Le propriétaire gère seul et remplace ses fichiers Excel par un mini-SaaS de gestion dans
l'admin Medusa. Réponds-lui en français ; code, commentaires, UI et commits en français, sans emoji
dans le code, sans trailer Co-Authored-By.

**À lire d'abord** : `AGENTS.md` (structure, commandes, conventions, pièges), `HANDOFF.md`
(section « Dernière mise à jour »), puis ta mémoire (`MEMORY.md`). Le projet n8n est à côté :
`../n8n_automation/` (`schema.sql`, `guide-golden-market-agent.md`, `AGENTS.md`).

## État (tout est en production)

- Mini-SaaS : Tableau de bord (`/app/dashboard` : « À faire aujourd'hui » puis chiffres du jour et
  du mois), Livraisons (livreurs, tournée, versements, stock confié aux livreurs), Caisse,
  Approvisionnement et marges, Prospects (relances, attente de stock, « Prévenir » = modèle Meta
  `retour_en_stock`).
- Frais d'expédition par produit : option de livraison « Livraison » à prix calculé (fournisseur
  `golden-market-shipping`) : gratuite à Ouagadougou, ailleurs les frais les plus élevés du panier ;
  saisis dans l'encadré « Frais d'expédition » de la fiche produit (`metadata.frais_expedition_xof`,
  1 500 F si vide). Saisis le 2026-10-05 : balai-éponge 1 500 F, les 38 autres produits 1 000 F.
  Le site, l'agent WhatsApp (`place_order`) et les commandes par téléphone ajoutent ces frais au
  total ; l'agent les lit dans ses outils de recherche (`shipping_fee_xof`).
- Chat WhatsApp de l'admin : médias, vocaux, reprise manuelle, « Non envoyé » (refus Meta),
  messages automatiques (modèles) dans l'historique, « Suivre comme prospect », réactions emoji
  affichées (« Réaction : 👍🏾 »).
- Agent WhatsApp : paiements (alerte « Paiement signalé » au propriétaire réparée le 2026-10-04,
  reçus Orange / Moov Money lus par la vision, frais de retrait ~1 % et transferts multiples
  acceptés, ne conteste jamais un paiement) ; médias client (vidéo par Gemini `gemini-3.6-flash`
  puis secours `gemini-3.5-flash`, photo par OpenAI, vocal par Whisper, escalade si tout échoue).
- Specs et plans : `docs/superpowers/specs/` et `docs/superpowers/plans/` (dernier lot :
  2026-10-04, frais d'expédition et tableau de bord).

## À vérifier en début de session

- Premières commandes hors Ouagadougou depuis le 2026-10-04 : total frais compris (site, WhatsApp,
  téléphone) et message de l'agent annonçant ce total. La commande par téléphone et `place_order`
  n'ont pas été testés en réel (calcul partagé vérifié par paniers API non validés).
- Premier reçu de paiement d'un client : alerte « Paiement signalé » reçue par le propriétaire,
  référence inscrite sur la commande (`metadata.whatsapp_payment_reference`).
- Vidéo de test que le propriétaire devait envoyer (toujours rien au 2026-10-05) : vérifier dans
  n8n (workflow `i6KGA9BvK9unjxxj`, nœuds `Describe Video (Vision)` / `(Vision, secours)`).
- Le client 22664947373 (vidéos du 2026-09-29, balai-éponge à tête interchangeable) : piste de
  relance à rappeler au propriétaire (c'est aussi son numéro Orange Money / de test, à confirmer).
- Messages modèles : remis au téléphone mais pas affichés sur WhatsApp Web ni les appareils liés
  (comportement de WhatsApp) ; un message « delivered » sans « Non envoyé » est bien arrivé.

## Prochaines tâches proposées au propriétaire (à lui faire choisir)

1. **Finitions du stock livreurs** (mineurs de la revue finale) : recherche produit par nom dans les
   formulaires ; avertissement visible si le déstockage échoue à « Livrée » (aujourd'hui seulement
   journalisé) ; lignes réinitialisées au changement de livreur en mode Retour ; message d'erreur
   au lieu de « Chargement… » sans fin ; refuser un produit saisi deux fois dans une correction ;
   ignorer les variantes `manage_inventory = false` au déstockage ; verrou entre mouvements
   manuels simultanés.
2. **Finitions tableau de bord et frais d'expédition** (mineurs des revues du 2026-10-04/05) :
   chiffres « Commandé » / « Encaissé » indisponibles sans libellé ; cartes à 3 montants serrées
   sur téléphone ; livraisons de commandes annulées comptées « en cours » tant que la tournée n'est
   pas ouverte ; encadré « Frais d'expédition » sans gestion d'échec réseau ; « Retirer » du widget
   vidéo produit ne supprime pas `video_url` (fusion des métadonnées Medusa) ; route des commandes
   par téléphone sans test unitaire ; défaut de 1 500 F à passer à 1 000 F si le propriétaire le
   souhaite (constante `DEFAULT_SHIPPING_FEE_XOF`).
3. **Suivi Meta des commandes par téléphone** (action_source « phone_call » dans l'API Conversions).
4. **Entretien** : purger le fichier `wa-media` orphelin après un envoi échoué ; la purge nocturne
   rescanne d'anciens messages ; coches « remis / lu » dans le chat (refusé pour l'instant, à
   reproposer seulement si demandé) ; micro du chat non testé sur téléphone.

## À rappeler au propriétaire (actions de son côté)

- Saisir le solde initial de caisse (la caisse affiche 0 F en production) et les coûts de revient
  du stock existant (onglet Marges, sinon la marge du mois reste incomplète).
- Saisir les frais d'expédition de chaque nouveau produit à sa création (sinon 1 500 F) ; vérifier
  ceux des produits volumineux (congélateur, vitrine, machines), réglés à 1 000 F comme les autres.
- Valider les hypothèses des specs caisse / approvisionnement / prospects ; ajouter ses autres
  livreurs puis le stock qu'il leur confie ; « Rendre la main » sur sa conversation de test
  (22677406101).

## Méthode de travail attendue

- Skills superpowers : brainstorming (annoncer bounded / architectural, design validé avant tout
  code), writing-plans, puis exécution du plan **avec des sous-agents**
  (subagent-driven-development : choix du propriétaire les 2026-10-04 et 05) ; déploiement, SSH et
  n8n en production faits par le contrôleur, pas par les sous-agents ; TDD (test qui échoue
  d'abord) ; revue finale par un agent frais sur le modèle le plus capable. Skills medusa-dev
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
- Clés d'API des identifiants n8n (ex. Gemini `googlePalmApi`) : `n8n export:credentials --all
  --decrypted --output=/tmp/c.json` dans le conteneur, lire la clé dans un script Node exécuté dans
  le conteneur, supprimer le fichier aussitôt ; ne jamais afficher la clé.
- Déploiements : pousser staging et main en même temps a déjà fait échouer la production au tout
  début (« Déployer sur le VPS ») sans rien casser ; vérifier l'état avec
  `curl https://api.github.com/repos/Abdazz/Golden-Market/actions/runs?per_page=3` (dépôt public
  en lecture) et demander au propriétaire de cliquer « Re-run » si besoin (pas de `gh` ici).
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
- Modèles Gemini : vérifier qu'un modèle existe encore pour la clé avant de l'utiliser
  (`gemini-2.5-flash` renvoie 404 « no longer available to new users »).
- Medusa fusionne `metadata` à l'enregistrement d'un produit : pour retirer une clé, envoyer `""`
  (l'omettre la laisse en place).
- Le job nocturne `postpone-deliveries` ramène chaque nuit le `tour_date` des livraisons en cours à
  aujourd'hui : « en retard » = `first_tour_date` < aujourd'hui.
- n8n : un nœud HTTP qui échoue renvoie l'erreur Meta sur sa sortie succès ou erreur selon
  `onError` ; un sous-workflow appelé par l'agent renvoie la sortie de son DERNIER nœud (terminer
  par un nœud Code qui renvoie le résultat voulu). `n8n execute` par CLI ignore `pinData` : tester
  un sous-workflow avec une copie temporaire dont le déclencheur est remplacé par un nœud Code du
  même nom (+ `manualTrigger`), avec `-e N8N_RUNNERS_BROKER_PORT=5698`, puis la supprimer de
  `n8n.workflow_entity`.
- Un commit qui ne touche que la documentation ne déclenche pas de build GitHub Actions.
- Le scratchpad de session est vidé entre les sessions : recréer l'admin de test local et
  ré-exporter les workflows n8n au besoin.

