---
name: golden-market-whatsapp-agent-audit
description: "Audit complet de l'agent WhatsApp (2026-09-15) : correctifs déployés (recherche sémantique, garde-fou d'escalade, vision, referral) + deux pièges n8n/Meta non-évidents à connaître avant de retoucher les tools"
metadata: 
  node_type: memory
  type: project
  originSessionId: 716fa0fd-944a-43c0-82f4-6811ae652c1e
  modified: 2026-09-18T17:07:45.310Z
---

Session d'audit déclenchée par le propriétaire après une conversation client perdue (agent
incapable de comprendre un lien produit + recherche "quittes pour nettoyer les oreilles" sans
résultat). Diagnostic fait sur le vrai workflow n8n de prod (export direct, pas le guide qui
était périmé), correctifs implémentés, déployés et vérifiés en conditions réelles la même
session. Détail complet dans `n8n_automation/guide-golden-market-agent.md` (réécrit) et
`medusa-golden-market/HANDOFF.md` (entrée du 2026-09-15) — cette mémoire retient seulement ce
qui n'est pas évident à retrouver en relisant le code.

**Corrections livrées cette session** : extraction du `referral` Meta (voir
[[meta-catalog-sync-status]]), tool `browse_catalog` (recherche sémantique de repli, pas
d'embeddings — le modèle IA parcourt lui-même les produits disponibles, ~10-40 selon le
stock réel, quand la recherche floue échoue deux fois ; filtré aux produits en stock
uniquement, ajouté après coup sur une remarque du propriétaire), garde-fou d'escalade
déterministe (`conversations.consecutive_search_misses`, seuil 4, déclenché par le workflow
lui-même sans dépendre du jugement du LLM), **compréhension multimodale complète** : photo
(OpenAI `gpt-4o-mini`), message vocal transcrit (OpenAI Whisper), vidéo décrite image+son
(Google Gemini `gemini-3.6-flash` — traite la vidéo entière nativement, pas d'extraction
frame/audio nécessaire) — toutes via des credentials déjà existantes dans ce n8n, aucune
nouvelle à créer. **Validation finale** : la requête exacte qui avait motivé l'audit ("Les
quittes pour nettoyer les oreilles") retestée en conditions réelles trouve maintenant les
bons produits (cure-oreilles) et va jusqu'à la finalisation de commande.

**Piège n8n non-évident, coûte cher si oublié** : `onError: "continueErrorOutput"` doit être
au **niveau racine du node** (sœur de `id`/`name`/`type`), jamais dans `parameters` — mal
placé, n8n l'ignore silencieusement sans erreur de validation à l'import. Pour un tool appelé
par le node AI Agent (sous-workflow), l'erreur est en général absorbée par le wrapper
d'exécution de tool de n8n (juste un message d'erreur renvoyé au modèle) — mais un node du
**workflow principal lui-même** qui lève une exception non interceptée fait planter tout le
node AI Agent, et **le client ne reçoit alors aucune réponse**. Confirmé dans les deux sens en
conditions réelles.

**Découverte majeure, potentiellement présente depuis le lancement du projet** : le template
WhatsApp `escalation_alert` n'existait pas du tout sur le compte Meta, malgré tout ce que
disait la documentation. Conséquence réelle : `escalate_to_human` et `mark_payment_reported`
n'avaient aucune gestion d'erreur, donc chaque fois qu'un client demandait un humain ou
signalait un paiement, l'appel Meta échouait et **le client ne recevait aucune réponse** — au
moment précis où il en avait le plus besoin. Recréé via l'API Meta et approuvé (**vérifié en
conditions réelles le 2026-09-15 : notification reçue avec un vrai `wamid.` de Meta**), les
deux tools rendus défensifs par la même occasion.

**Piège Meta à connaître si ce template est un jour recréé** : Meta rejette (`error_subcode:
2388299`) tout template dont une variable est en tout début ou toute fin de corps — un simple
point après la dernière variable ne suffit PAS, il faut un texte de clôture substantiel
(quelques mots). Confirmé empiriquement après plusieurs essais.

**Piège Gemini, probablement récurrent (les modèles se déprécient vite)** : `gemini-2.5-flash`
refusait déjà les nouveaux appelants au 2026-09-15 (`404`, message d'erreur recommandant
explicitement `gemini-3.6-flash`). Avant de déboguer une branche Gemini qui échoue, vérifier
en premier si le nom de modèle est toujours valide.

**Modèle IA : Claude Sonnet 5 en principal, Groq (`openai/gpt-oss-120b`) en fallback depuis le
2026-09-23** (demande du propriétaire). Était inversé du 2026-09-15 au 2026-09-23 faute de crédit
Anthropic. Avant le swap, crédit vérifié par un appel réel de 1 token avec la credential n8n
(`export:credentials --decrypted` dans le conteneur, clé jamais affichée) ; après, vérifié par
webhook signé : seul `Anthropic Chat Model` s'exécute. Postgres de n8n = conteneur
`golden_market_postgres` (pas `production-golden-market-postgres`, qui est Medusa).
**How to apply** : si l'agent cesse de répondre ou bascule sur Groq, suspecter d'abord un crédit
Anthropic épuisé.

**Non traité, limite durable pas un TODO** : les liens externes organiques (pas une pub)
partagés par un client (ex. un lien Facebook Reel) — Meta bloque le scraping non authentifié
de ses propres contenus, pas de solution générale possible avec l'infra actuelle.

**Deux numéros WhatsApp distincts, ne jamais les confondre** (clarifié le 2026-09-17) :
`+226 61 85 37 37` = WhatsApp Business **Cloud API**, celui utilisé par cet agent (webhook,
`OWNER_WHATSAPP_NUMBER` pour les notifications d'escalade dans `n8n/.env`), **ne jamais le
changer sans casser l'agent**. `+226 64 94 73 73` = app mobile WhatsApp Business classique,
opérée par un humain, utilisée uniquement pour les liens du site web
(`apps/storefront/src/lib/contact.ts`, `CONTACT.whatsapp`) — totalement indépendant. Voir
aussi [[recherche-semantique-produits-pgvector]] pour la suite de cette session (2026-09-17/18,
recherche sémantique produits + correctifs Meta Pixel).

**How to apply** : avant de proposer de retoucher `escalate_to_human`, `mark_payment_reported`,
`find_products`, `browse_catalog` ou la branche vision du workflow principal, relire
`n8n_automation/guide-golden-market-agent.md` § 2.6 ("Piège critique") plutôt que de repartir de
zéro — les deux pièges ci-dessus ont chacun coûté un redéploiement complet la première fois.

**Bug de commande en double corrigé le 2026-09-18** (trouvé en simulant une vraie conversation
complète jusqu'à une commande, sur demande du propriétaire) : `mark_payment_reported` recevait
`order_id` en paramètre `$fromAI`, que le modèle ne pouvait jamais fournir correctement sur un
tour séparé de `place_order` (le client ne voit que le `display_id`, jamais l'`order_id` réel, et
seul le texte visible est sauvegardé dans l'historique) — l'agent relançait tout le flux
`place_order` à chaque paiement signalé au lieu de confirmer la commande existante. Corrigé en
ajoutant `conversations.last_order_id` (écrit par `place_order`, lu par
`get_payment_instructions`/`mark_payment_reported` via `conversation_id`, jamais via le modèle) +
renforcement du prompt système. Détail complet dans le commit `n8n_automation` du même jour et
`medusa-golden-market/HANDOFF.md`. **How to apply** : tout nouveau tool qui a besoin de "se
souvenir" d'un id généré par un tool précédent dans la même conversation doit passer par une
colonne `conversations` indexée par `conversation_id` (valeur fixe), jamais par un paramètre
`$fromAI` que le modèle devrait retenir d'un tour à l'autre — le modèle n'a accès qu'à l'historique
texte visible au client, jamais aux résultats bruts des tools d'un tour précédent.

**Tool `send_product_images` ajouté le 2026-09-24** (sous-workflow `SndPrdImgs7kQ2xa`) : l'agent
envoie jusqu'à 5 photos jpeg/png d'un produit (par `variant_id`) quand le client les demande.
Prérequis fait le même jour : 59 images webp (photos Alibaba) converties en jpeg dans Medusa
(WhatsApp refuse le webp). Vérifié par webhook signé seulement (5 `wamid`), **pas encore sur un
vrai téléphone** - le propriétaire doit écrire lui-même à l'agent (fenêtre 24h, son numéro n'a
jamais écrit au bot). Pièges : pas de `URL` dans les nodes Code n8n (ReferenceError) ; la CLI
`update:workflow` est dépréciée -> `publish:workflow --id=...` ; Claude a écrit son raisonnement
dans la réponse client pendant les tests (règle anti-fuite ajoutée au prompt système).
**How to apply** : si des réponses de l'agent contiennent à nouveau du raisonnement à la 3e
personne, le renforcer dans le prompt ; si une fiche produit modifiée dans l'admin n'apparaît
pas sur le storefront : corrigé le 2026-09-27 (subscriber `catalog-updated-storefront-revalidate.ts` écoute aussi product.*) ; pour tester, passer par l'API Admin, pas `medusa exec` (qui ne déclenche pas les subscribers du serveur).

**Escalade n'arrête pas l'IA (constaté le 2026-09-27)** : le workflow principal ne lit jamais
`conversations.status` avant d'appeler l'AI Agent -> après `escalated`, l'IA continue de répondre.
Le propriétaire n'a aujourd'hui AUCUN moyen de répondre lui-même (numéro Cloud API seul). Options
présentées le 2026-09-27 : (1) réponse manuelle + "prendre la main" dans le visualiseur admin
Medusa (recommandée), (2) Chatwoot, (3) coexistence appli WhatsApp Business, (4) relais -
en attente du choix du propriétaire.

**Correctifs de fiabilité du 2026-09-27 (déployés, testés en réel)** : photos/vidéos client jamais
comprises depuis le début (binaire n8n en mode filesystem -> `$binary.data.data` = "filesystem-v2" ;
et l'IA lisait `$('Edit Fields')` au lieu du texte enrichi) -> nœuds `Binary To Base64` +
`Final Message` ; descriptions produit transmises à l'IA ; note de reprise après 12 h (`gapNote`).
**How to apply** : toute nouvelle lecture du texte client dans le workflow principal doit viser
`$('Final Message')`, jamais `$('Edit Fields')`. Pour simuler un vrai média : téléverser via
`POST /{phone_id}/media` puis référencer l'id dans un webhook signé. Pour exécuter un workflow par
CLI dans le conteneur : `-e N8N_RUNNERS_BROKER_PORT=5690 -e N8N_PORT=5699` (sinon conflit de port).
Le propriétaire autorise les tests sur son numéro perso 22677406101 (il doit d'abord écrire au bot
pour ouvrir la fenêtre 24 h). Pas de boutique physique ; livraison jour même Ouaga, ~24 h ailleurs.

**Reprise manuelle + photos admin livrées le 2026-09-27** (spec/plan dans docs/superpowers,
guide n8n § 2.9/2.10). Pièges : le nœud HTTP n8n renvoie l'erreur Meta sur sa sortie SUCCÈS ->
toujours vérifier le wamid ; `escalation_alert` attend 3 paramètres ; `Buffer` indisponible dans
les expressions n8n (Code seulement) ; trop de connexions SSH rapprochées -> le VPS coupe (attendre
~1 min) ; sessions admin Medusa en mémoire -> chaque redéploiement déconnecte le propriétaire.
9 défauts mineurs de relecture différés (voir HANDOFF 2026-09-27). Template `reprise_conversation`
(id 1757148805539141) PENDING au 2026-09-27.
**How to apply** : avant de retoucher ces workflows, relire le guide § 2.9/2.10 ; pour tester
l'UI admin, le propriétaire doit se connecter lui-même (ne jamais se connecter à sa place).

2026-09-28 : chat complet dans l'admin (médias, emojis, vocaux via ffmpeg) livré en production ; réception vidéo/vocal/document des clients et purge 90 jours étendue dans n8n (guide § 2.9/2.10). Chat multimédia.

2026-09-28 soir : messages refusés par Meta après acceptation (accusé `failed`, ex. 131047 hors fenêtre 24 h) désormais inscrits par n8n (nœuds Failed Statuses / Mark Message Failed, colonnes messages.delivery_status/delivery_error) et affichés « Non envoyé » dans l'admin (libellé choisi par le propriétaire). Piège constaté : les messages entrants simulés par webhook signé faussent la fenêtre de 24 h (comptés comme messages client) — éviter d'en simuler sur le numéro du propriétaire sans prévenir.

2026-10-01 : vidéos client non décrites (Gemini 503 « high demand », un seul essai) -> 3 essais sur Describe Video / Describe Image / Transcribe Audio, secours `gemini-3.5-flash` pour la vidéo (`gemini-2.5-flash` = 404 pour cette clé), puis consigne d'escalade (`escalate_to_human`). Les messages modèles n'apparaissent pas sur WhatsApp Web / appareils liés (seulement sur le téléphone). Reprise : `docs/HANDOFF-PROMPT.md`.

2026-10-04 : vrai client (Kaya, commande 20261003001) a payé 9 595 F + 1 515 F, l'agent a contesté les montants et le propriétaire n'a jamais été alerté. Corrigé et publié : alerte `mark_payment_reported` (131008, paramètre vide ; ce nœud n'avait jamais fonctionné), lecture des reçus par la vision (« Reçu de paiement : … »), consigne (frais de retrait ~1 % normaux, jamais contester un paiement ; expédition balai-éponge 1 500 F), réactions emoji enregistrées sans réponse de l'IA. Guide n8n § « Paiements signalés et reçus » ; sauvegardes `~/n8n-backups/2026-10-04/`.
**Why:** le propriétaire veut que tout emoji client s'affiche correctement dans l'admin. Les frais d'expédition par produit qu'il a demandés le 2026-10-04 sont livrés (voir [[mini-saas-gestion-livreurs]]) ; l'agent lit désormais les frais dans ses outils de recherche (`shipping_fee_xof`) et annonce le total frais compris renvoyé par `place_order`.
**How to apply:** `n8n execute` par CLI ignore pinData : pour tester un sous-workflow, importer une copie temporaire dont le déclencheur est remplacé par un nœud Code du même nom (+ manualTrigger), puis la supprimer de `n8n.workflow_entity`.
