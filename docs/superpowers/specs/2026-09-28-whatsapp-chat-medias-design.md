# Chat WhatsApp complet dans l'admin (médias, emojis, vocaux) — design

## Contexte

Depuis la reprise manuelle (spec `2026-09-27-whatsapp-reprise-manuelle-design.md`),
le propriétaire répond aux clients depuis la page `/app/whatsapp-conversations`
de l'admin Medusa, mais **uniquement en texte**. Côté réception, seules les
**photos** du client sont affichées (§ 2.10 du guide n8n) ; ses vidéos, notes
vocales et documents n'apparaissent pas dans l'admin.

Le propriétaire veut l'expérience d'un vrai chat WhatsApp (décision du
2026-09-28) :

- **Envoyer** : photos, vidéos, documents, notes vocales enregistrées depuis le
  navigateur, emojis ; légende sous le média ; plusieurs fichiers d'un coup ;
  coller une image (Ctrl+V) ; glisser-déposer.
- **Voir** : vidéos, notes vocales et documents envoyés par le client (en plus
  des photos déjà affichées).
- **Conservation** : 90 jours pour tous les médias (client et propriétaire),
  comme les photos client aujourd'hui.

Aucun dysfonctionnement signalé : il s'agit de fonctions manquantes.

## Principes conservés

- **n8n reste le seul écrivain** de la base `golden_market` (tables
  `conversations`, `messages`) et le **seul détenteur du jeton WhatsApp**.
  Medusa lit la base (rôle lecture seule) et déclenche les actions par le
  webhook `Admin - actions conversation` (`N8N_ADMIN_ACTIONS_WEBHOOK_URL` +
  secret).
- Les médias sont stockés dans le **stockage de fichiers Medusa** sous un **nom
  aléatoire** (comme les photos client), servis par une URL publique non
  devinable, et **purgés après 90 jours**.
- **Fenêtre de 24 h** : hors fenêtre, aucun message libre (texte ou média) ;
  seule la relance par modèle reste possible (inchangé).

## Approche retenue (A) : Medusa stocke, n8n envoie par lien

1. L'admin téléverse le fichier vers une **nouvelle route Medusa** qui le
   valide, le convertit si besoin, le stocke et renvoie son URL.
2. L'admin demande l'envoi au webhook n8n (action `send_media`) avec l'URL,
   le type et la légende.
3. n8n envoie le média à WhatsApp **par lien** (`link`), puis l'enregistre dans
   l'historique avec sa pièce jointe.

Rejetées : B (Medusa appelle WhatsApp directement : jeton hors de n8n,
historique incohérent) ; C (fichier transitant par le webhook n8n : fragile
pour les vidéos de 16 Mo, plus complexe pour le même résultat).

## 1. Envoi depuis l'admin

### Zone de message

- **Trombone** : sélection de photos, vidéos, documents (sélection multiple ;
  sur téléphone, galerie ou appareil photo).
- **Glisser-déposer** d'un ou plusieurs fichiers sur la conversation.
- **Coller une image** (Ctrl+V) : jointe comme photo.
- **Aperçu avant envoi** : vignette par fichier (nom + taille pour un document),
  croix pour retirer. Le texte tapé sert de **légende** ; avec plusieurs
  fichiers, la légende accompagne le **premier** (comportement WhatsApp).
- **Bouton 😊** : petit sélecteur d'emojis (liste intégrée, sans dépendance
  lourde), insertion au curseur.
- **Bouton micro** : appui pour enregistrer (durée affichée), puis Envoyer ou
  Annuler.
- **Limites** (celles de WhatsApp), vérifiées avant l'envoi et côté serveur :

| Type | Formats acceptés | Taille max | Conversion |
|---|---|---|---|
| Photo | JPEG, PNG ; WebP/HEIC/GIF convertis | 5 Mo | → JPEG si besoin (sharp, déjà utilisé) |
| Vidéo | MP4 (H.264/AAC), 3GP | 16 Mo | aucune (MP4 exigé) |
| Document | PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP | 100 Mo | aucune |
| Vocal | enregistrement du navigateur (WebM/Opus, MP4/AAC) | 16 Mo | → OGG/Opus (ffmpeg) pour s'afficher comme vocal |

### Route Medusa `POST /admin/whatsapp-conversations/:phone/media`

- Protégée (admin connecté), fichier en `multipart/form-data`.
- **Type détecté sur le contenu** (signature du fichier), pas sur le nom.
- Conversion : image → JPEG (sharp) ; vocal → OGG/Opus mono (ffmpeg, binaire
  embarqué dans l'image backend). Échec de conversion du vocal : le fichier est
  gardé tel quel et envoyé comme **audio simple** (avertissement renvoyé).
- Stockage via le module fichier Medusa sous `wa-media-<aléatoire>.<ext>` ;
  réponse : `{ url, kind: "image"|"video"|"document"|"audio", mime_type,
  filename, size, voice: boolean, warning }`.
- Erreurs : type non accepté ou taille dépassée → 400 avec message en français.

### Action n8n `send_media`

- Webhook existant `Admin - actions conversation`, nouvelle action
  `send_media` : `{ action, phone_number, kind, url, caption?, filename?, voice? }`.
- Même contrôle que `send_text` : refus `window_expired` si le dernier message
  client date de plus de 24 h.
- Envoi Graph API `messages` : `type: image|video|document|audio`,
  `{ link: url, caption }` (`filename` pour un document). WhatsApp n'accepte pas
  de légende sur un audio : si du texte accompagne un vocal seul, l'admin
  l'envoie juste après en message texte (`send_text`).
- **Succès seulement** (présence d'un `wamid`, cf. piège « HTTP node renvoie
  les erreurs sur la sortie succès ») : enregistrement dans `messages` avec
  `role = 'human'`, `content` = légende (ou vide), `attachments =
  [{ type, url, mime_type, filename?, voice? }]`, et mise à jour de
  `human_last_action_at` comme pour `send_text`.
- Échec : réponse `{ ok: false, error_code, message }` ; rien n'est enregistré.

### Envoi de plusieurs fichiers

Envois **séquentiels**, dans l'ordre (téléversement puis `send_media`, fichier
par fichier). Un échec n'annule pas les fichiers déjà partis : le fichier en
échec reste dans l'aperçu avec son erreur et **Réessayer**. Le texte seul (sans
fichier) continue d'utiliser `send_text`.

## 2. Réception et affichage

### n8n (workflow principal)

- Messages client de type `video`, `audio` (dont notes vocales `voice`),
  `document` : téléchargement du média WhatsApp puis copie dans le stockage
  Medusa (`POST /admin/uploads`, nom `client-media-<aléatoire>.<ext>`), comme
  les photos (`Upload Client Photo`, § 2.10). En-tête d'authentification
  calculé dans un nœud Code (pas de `Buffer` dans les expressions).
- Enregistrement : `attachments = [{ type: "video"|"audio"|"document", url,
  mime_type, filename?, voice? }]`, légende éventuelle dans `content`.
- Téléchargement ou copie en échec : `attachments = [{ type, url: null,
  unavailable: true }]` ; l'agent répond normalement.
- **Comportement de l'agent IA inchangé** (photos et vidéos analysées comme
  aujourd'hui).

### Admin

Pour les médias du client (gauche) comme pour ceux du propriétaire (droite) :

- Photo : vignette, agrandissement plein écran au clic.
- Vidéo : lecteur intégré (`<video controls>`).
- Vocal / audio : lecteur audio (`<audio controls>`) avec durée.
- Document : carte avec icône du format, nom, taille, bouton **Télécharger**.
- Légende sous le média.
- `url: null` : « Média expiré (conservé 90 jours) » ou « Média indisponible »
  (`unavailable`).

Type `ChatAttachment` étendu (lecture) : `{ type: "image"|"video"|"audio"|
"document"; url: string | null; mime_type?; filename?; voice?; expired?;
unavailable? }` ; les anciennes pièces jointes `{ type: "image", url }` restent
valides.

### Conservation (90 jours)

Le workflow de purge `PurgeClientPhot1` est étendu : tout fichier
`client-photo-*`, `client-media-*` et `wa-media-*` de plus de 90 jours est
supprimé du stockage et sa pièce jointe passe à `url: null, expired: true`.

## 3. Erreurs et sécurité

- Fichier refusé (type, taille) : message clair **avant** envoi, ex.
  « Vidéo trop lourde : 16 Mo maximum pour WhatsApp ».
- Refus WhatsApp (fenêtre fermée, format) : fichier conservé dans l'aperçu avec
  l'erreur et **Réessayer**, rien dans l'historique.
- Micro refusé par le navigateur : « Autorisez le micro pour enregistrer un
  vocal ».
- Conversion du vocal impossible : envoi en audio simple + avertissement.
- Sécurité : route réservée à l'admin connecté ; type vérifié sur le contenu ;
  noms aléatoires ; jeton WhatsApp uniquement dans n8n ; secret du webhook
  inchangé.
- Téléphone : tout fonctionne sur mobile (galerie/appareil photo, micro,
  aperçus adaptés).

## 4. Tests

- **Unitaires (TDD)** : validation des fichiers (type réel, taille par type),
  choix du type WhatsApp, nom aléatoire, conversion image/vocal (ffmpeg
  réel sur un court échantillon), construction de l'action `send_media`,
  normalisation des pièces jointes lues (anciennes et nouvelles).
- **Local** : envoi (sans webhook : erreur attendue) et affichage des types de
  pièces jointes dans l'admin de test.
- **Réel** (numéro du propriétaire +226 77 40 61 01, fenêtre de 24 h ouverte) :
  depuis Medusa, photo + légende, vidéo, PDF, vocal, emojis ; depuis le
  téléphone du propriétaire, vidéo, vocal, PDF → affichés dans l'admin.

## Déploiement

1. Backend (route, conversion, ffmpeg dans l'image) : local → staging →
   production.
2. n8n : action `send_media`, réception vidéo/audio/document, purge étendue
   (export/import CLI + publication, comme les évolutions précédentes).
3. Documentation : `AGENTS.md`, `HANDOFF.md`, guide n8n (§ 2.9, § 2.10).

## Hors périmètre

- Transcription des notes vocales du client par l'agent IA.
- Réactions, réponses citées (« répondre à ce message »), suppression de
  message.
- Envoi de médias hors fenêtre de 24 h (interdit par WhatsApp).
