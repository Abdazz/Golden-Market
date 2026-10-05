# Entretien des médias WhatsApp (fichiers orphelins, purge nocturne)

Date : 2026-10-06. Points d'entretien relevés après la spec `2026-09-28-whatsapp-chat-medias-design.md`.
Décisions prises en autonomie (propriétaire absent, carte blanche) : à valider par lui a posteriori.

## 1. Fichier `wa-media` orphelin après un envoi refusé

Constat : un média joint depuis l'admin est d'abord téléversé (`POST .../media`, fichier
`<horodatage>-wa-media-<aléatoire>.<ext>` dans le stockage Medusa), puis envoyé
(`POST .../media-messages` -> n8n `send_media`). Si l'envoi échoue, le message n'est pas enregistré
(vérifié dans le workflow n8n `AdmConvAction7Qx` : `Check Send Result` -> `Format WhatsApp Error`
sans `Save Human Message`) ; « Réessayer » téléverse de nouveau le fichier. Le premier fichier
n'est référencé par aucun message : la purge à 90 jours, qui part des messages, ne le supprime
jamais.

Décision : la route `media-messages` supprime le fichier quand l'échec est **certain** :
`invalid_request`, `not_found`, `window_expired`, `whatsapp_error` (n8n a répondu, rien n'est
enregistré). En cas d'échec **incertain** (`unavailable` : n8n injoignable ou délai dépassé, le
message a peut-être été envoyé et enregistré), le fichier est conservé (risque de casser
l'historique). Suppression par le module fichier de Medusa (`Modules.FILE`, `deleteFiles`), jamais
bloquante (échec journalisé, la réponse d'erreur à l'admin est inchangée).

Garde-fou : seule une URL de notre stockage dont le dernier segment respecte exactement
`^\d+-wa-media-[0-9a-f]{20}\.[a-z0-9]+$` est supprimée (jamais un fichier produit ni une photo de
client). Règle pure `orphanMediaFileKey(url)` dans `src/lib/whatsapp-media-types.ts` ou un nouveau
`src/lib/whatsapp-media-cleanup.ts`, testée.

## 2. Purge nocturne : ne plus rescanner les mêmes messages

Constat : `Find Expired Photos` sélectionne les messages de plus de 90 jours ayant au moins une
pièce jointe avec une URL, mais `Prepare Deletions` ne traite que nos fichiers (`client-photo-`,
`client-media-`, `wa-media-`). Un message dont aucune URL ne correspond (URL externe, ancien
format) n'est jamais marqué expiré : il est relu chaque nuit, et au-delà de 500 messages bloqués
(`LIMIT 500`, tri par date) la purge n'avancerait plus.

Décision : la requête ne sélectionne que les messages ayant au moins une URL correspondant à nos
préfixes (`a->>'url' ~ '(client-photo-|client-media-|wa-media-)'`), de façon cohérente avec
`Prepare Deletions`. Changement dans n8n (workflow `PurgeClientPhot1`), fait par le contrôleur ;
`../n8n_automation/guide-golden-market-agent.md` mis à jour.

## 3. Points non traités (décision)

- Coches « remis / lu » dans le chat : refusées par le propriétaire, non reproposées.
- Micro du chat sur téléphone : non testable sans appareil réel ; reste à vérifier par le
  propriétaire (rappel dans la passation).

## Tests

Unitaires : `orphanMediaFileKey` (URL valide -> clé ; fichier produit, `client-photo-`, segment
modifié, URL vide -> `null`) ; route `media-messages` (échec certain -> `deleteFiles` appelé avec la
clé ; `unavailable` ou succès -> pas de suppression ; échec de suppression -> réponse d'erreur
inchangée). n8n : exécution manuelle de la purge sur staging/production après modification
(nombre de messages sélectionnés avant / après, aucune suppression inattendue : la purge ne touche
que des fichiers de plus de 90 jours, or le chat existe depuis le 2026-09-27, donc 0 aujourd'hui).
