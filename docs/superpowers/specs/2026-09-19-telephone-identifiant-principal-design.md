# Téléphone comme identifiant principal du compte client

## Contexte

Aujourd'hui, le formulaire d'inscription du storefront exige un email et
laisse le téléphone facultatif — inversé par rapport à l'usage réel des
clients Golden Market (WhatsApp/téléphone est le canal de contact universel
au Burkina Faso ; l'email est secondaire, souvent absent). Le compte client
utilise le provider Medusa `emailpass` avec l'email comme identifiant.

Un flux de vérification par email existe déjà côté storefront
(`verification_required`, lien envoyé après inscription), mais en
recherchant le subscriber censé l'envoyer, aucun n'existe dans ce projet :
Medusa émet bien l'événement interne `auth.verification_requested`, mais
rien ne l'écoute. **Ce flux n'envoie donc rien aujourd'hui** — l'inscription
par email fonctionne en pratique sans jamais bloquer sur une vérification
réelle. Ce constat est repris plus bas car il justifie de construire un tout
nouveau système de vérification (WhatsApp) plutôt que de réutiliser un
mécanisme email supposé déjà fonctionnel.

## Objectif

- Le téléphone devient **obligatoire** à l'inscription et sert
  d'**identifiant principal** du compte.
- L'email devient **facultatif**.
- Un client qui renseigne les deux doit pouvoir se connecter avec l'un OU
  l'autre (même mot de passe).
- Le compte téléphone est vérifié par un **code à 6 chiffres envoyé par
  WhatsApp** avant de pouvoir être utilisé.

## Non-objectifs (hors scope de cette itération)

- **Réinitialisation de mot de passe pour un compte sans email.** Le
  subscriber existant (`auth-password-reset.ts`) traite l'`entity_id` de la
  demande comme une adresse email et l'envoie via Resend — sans email
  valide, cet envoi échoue silencieusement (le subscriber ne relance jamais
  d'exception). Un client inscrit uniquement par téléphone qui oublie son
  mot de passe n'a donc **aucun moyen de le réinitialiser** à l'issue de
  cette itération. C'est un vrai manque, traité comme un suivi séparé
  (probablement : même schéma que la vérification, code WhatsApp pour
  réinitialiser), pas comme un oubli.
- Vérifier l'email quand il est fourni en plus du téléphone — il hérite de
  la confiance du téléphone déjà vérifié, pas de vérification séparée.
- Migrer les comptes existants : un seul compte `has_account=true` existe en
  production aujourd'hui (email, pas de téléphone) ; il continue de
  fonctionner sans changement, aucune migration nécessaire.
- Écrire un provider d'authentification dédié au téléphone (« phonepass ») —
  voir décision ci-dessous.
- Toucher au flux de création de client invité (commandes passées sans
  compte, WhatsApp ou storefront) — hors champ, ce flux ne passe pas par
  l'auth module.

## Décision : réutiliser `emailpass` pour le téléphone, sous un second `id`

Vérifié dans le code source (`@medusajs/auth-emailpass`) : le provider ne
valide jamais le format de son paramètre `email` — il l'utilise tel quel
comme `entity_id` pour le hash du mot de passe et la recherche
d'identité. Rien ne l'empêche donc de recevoir un numéro de téléphone à la
place d'un email. Écrire un second provider dédié au téléphone dupliquerait
~180 lignes de hashing scrypt pour zéro bénéfice fonctionnel.

**Mais** un second enregistrement du même package sous un `id` différent
est nécessaire, pas juste une réutilisation du même `id` "emailpass" — voir
la décision suivante sur `authVerificationsPerActor`, qui ne peut cibler
que par nom de provider, pas par `entity_type`. Deux entrées dans
`modules.auth.options.providers`, toutes deux résolues vers
`@medusajs/medusa/auth-emailpass` :
- `{ resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" }` (déjà
  existant, pour l'email).
- `{ resolve: "@medusajs/medusa/auth-emailpass", id: "phone-pass" }`
  (nouveau, même code, seul l'`id` de routage change — la route HTTP
  devient `/auth/customer/phone-pass` au lieu de `/auth/customer/emailpass`).

Conséquence : le champ « email » envoyé à `sdk.auth.register`/`sdk.auth.login`
côté téléphone est en réalité le numéro de téléphone normalisé (voir
normalisation ci-dessous), et le provider passé est `"phone-pass"` plutôt
que `"emailpass"` — un détail d'implémentation invisible depuis le
storefront et l'admin (le vrai champ `customer.phone` reste correct et
distinct).

## Décision : `authVerificationsPerActor` ne peut cibler que par provider

Vérifié dans le code source (`@medusajs/medusa/dist/api/auth/utils/validate-verification.js`) :
la vérification n'est déclenchée par Medusa au login que si
`projectConfig.http.authVerificationsPerActor.customer` contient une entrée
dont `auth_provider` correspond au provider utilisé — la recherche se fait
**uniquement par nom de provider**, jamais par `entity_type`. Si téléphone
et email partageaient le même `id` de provider ("emailpass"), il serait
impossible d'exiger la vérification pour le téléphone sans l'exiger aussi
pour l'email (et donc casser la connexion du seul compte existant en
production, qui n'a pas d'entrée `auth_verification` du tout).

C'est la vraie raison du second `id` de provider ci-dessus : avec
`auth_provider: "phone-pass"` distinct d'`"emailpass"`, la configuration

```ts
projectConfig: {
  http: {
    authVerificationsPerActor: {
      customer: [{ entity_type: "phone", auth_provider: "phone-pass" }],
    },
  },
},
```

n'affecte que les identités enregistrées via `phone-pass` — l'email garde
son comportement actuel (jamais bloqué, cohérent avec le constat que la
vérification email n'a de toute façon jamais été appliquée). **Sans cette
configuration, le provider de vérification whatsapp-otp serait développé
mais jamais réellement invoqué par Medusa** - un compte téléphone serait
créé immédiatement sans jamais passer par la case code WhatsApp, exactement
comme le flux email mort aujourd'hui. Découvert en lisant le code source
pendant l'écriture du plan d'implémentation, après l'approbation de cette
spec — corrigé ici plutôt que silencieusement dans le seul plan, pour que
les deux documents restent cohérents.

## Décision : deux identités liées au même client

Quand téléphone ET email sont fournis, on enregistre **deux
`auth_identity`** distinctes — une via `phone-pass` (`entity_id` = numéro
normalisé) et une via `emailpass` (`entity_id` = email) — toutes deux liées
au **même** `customer.id` via `setAuthAppMetadataWorkflow` (déjà exporté
par `@medusajs/core-flows`, utilisé nativement par
`createCustomerAccountWorkflow`). Le client ne voit qu'un seul champ de
connexion : c'est le **storefront** qui détermine quel provider appeler
(`phone-pass` ou `emailpass`) selon que la saisie ressemble à un téléphone
ou à un email, avant d'appeler `sdk.auth.login` — `authenticate()` lui-même
reste une simple recherche par `entity_id`, peu importe le provider.

## Décision : normalisation du numéro de téléphone

Le téléphone sert désormais d'identifiant d'authentification (contrairement
au téléphone de l'adresse de livraison, simple texte libre) : deux saisies
différentes du même numéro réel (`70 00 00 00`, `+22670000000`,
`226-70-00-00-00`) ne doivent jamais créer deux comptes ni bloquer une
connexion légitime.

Règle : avant tout usage comme `entity_id` (inscription, connexion,
vérification), normaliser en ne gardant que les chiffres puis en préfixant
`+226` si absent — mêmes règles qu'un numéro burkinabè déjà utilisé partout
ailleurs dans ce projet (WhatsApp). Fonction pure, testée isolément
(`normalize-phone.ts` ou ajout à un util existant).

## Architecture

### Inscription (`apps/storefront/src/lib/data/customer.ts`)

`signup()` change de forme :
1. Normalise le téléphone (obligatoire — le formulaire ne soumet plus sans).
2. `sdk.auth.register("customer", "emailpass", { email: phoneNormalisé, password })`.
3. Login immédiat (`sdk.auth.login`) avec le téléphone — la réponse indique
   `verification_required` (voir ci-dessous), jamais un customer créé
   directement.
4. Les données d'inscription (prénom, nom, téléphone, email éventuel) restent
   en attente (`setPendingCustomer`, mécanisme déjà existant) jusqu'à
   vérification réussie.

`completeLogin()` (déjà générique côté token) : au moment de créer le
customer (`sdk.store.customer.create`), si `pending.email` est renseigné,
enchaîne un second `sdk.auth.register("customer","emailpass",{email,password})`
puis lie cette identité au même `customer.id`. Cette liaison n'existe pas
côté SDK storefront (accès direct à `setAuthAppMetadataStep` needed) : elle
passe par une **nouvelle route API backend** dédiée plutôt que par le SDK
d'auth générique.

### Nouvelle route backend : lier une identité email secondaire

`POST /store/customers/me/link-email-identity` (authentifiée par le token
de la session téléphone déjà active) :
1. Valide `{ email, password }` (email au format valide, password requis).
2. Vérifie qu'aucune identité `emailpass` n'existe déjà pour cet email
   appartenant à un **autre** client (message d'erreur explicite sinon).
3. `authModuleService.register("emailpass", { body: { email, password } })`
   (résolution directe du module Auth, même appel que fait l'endpoint HTTP
   `/auth/customer/emailpass/register`) pour créer l'identité email.
4. `setAuthAppMetadataWorkflow(container).run({ input: { authIdentityId,
   actorType: "customer", value: customer.id } })` — workflow déjà exporté
   par `@medusajs/core-flows`, utilisé tel quel (pas de step isolé à
   réinvoquer manuellement).
5. Met à jour `customer.email` (déjà exposé par `StoreUpdateCustomer`).

Testée en isolant la logique de liaison dans un fichier `lib/` pur
(entrées : IDs/chaînes ; sorties : succès/erreur), à l'image de
`storefront-revalidate-client.ts`.

### Vérification WhatsApp (nouveau)

**Provider de vérification** `apps/backend/src/modules/whatsapp-otp-verification/`
(enregistré dans `medusa-config.ts` sous
`modules.auth.options.verification.providers`, à côté des providers de
paiement custom déjà présents) :
- Miroir du provider `token` natif (`@medusajs/auth/providers/verification/token.js`) :
  même stockage (`authVerificationService`), même logique d'expiration et de
  statut « déjà vérifié », mais génère un **code à 6 chiffres** (`crypto.randomInt`)
  au lieu d'un jeton opaque long. Expiration : 10 minutes (constante dédiée,
  plus courte que les 15 minutes du provider `token` — un code à 6 chiffres
  est plus sensible au brute-force qu'un jeton long, la fenêtre doit rester
  courte).
- Le code est haché avant stockage (même fonction `hashVerificationToken`
  réutilisée — un hash reste un hash, peu importe la longueur de l'entrée).

**Déclenchement** : `signup()` appelle
`sdk.auth.verification.request({ entity_id: phoneNormalisé, entity_type: "phone", code_provider: "whatsapp-otp" }, { authorization: Bearer <token non vérifié> })`.

**Subscriber** `apps/backend/src/subscribers/auth-verification-requested-whatsapp.ts` :
- Écoute `AuthWorkflowEvents.VERIFICATION_REQUESTED`.
- Ignore tout événement dont `code_provider !== "whatsapp-otp"` (laisse le
  chemin email/token, actuellement mort, complètement inchangé — pas dans le
  scope de cette itération de le réparer).
- Envoie le code via le webhook n8n **déjà existant et déjà générique**
  (`N8N_ORDER_CONFIRMATION_WEBHOOK_URL`/`_SECRET`, voir
  `order-placed-customer-whatsapp.ts` — accepte `{phone, template_name,
  params}` sans être spécifique aux commandes malgré son nom). Nouveau
  `template_name` : `account_verification_code`, `params: [code]`.
- Même pattern défensif que les autres subscribers (try/catch, jamais de
  throw, log).

**Nouveau template Meta requis** : `account_verification_code`, corps type
« Votre code de vérification Golden Market est {{1}}. Il expire dans 10
minutes. » — à soumettre et faire approuver par Meta avant que ce flux ne
puisse fonctionner en conditions réelles (délai externe, même processus que
`escalation_alert`). **Ce délai bloque la vérification en conditions
réelles, pas le développement/déploiement du code** — tout le reste peut
être développé, testé (mocké) et déployé pendant l'attente d'approbation.

**Rate limiting** : nouveau middleware sur `/auth/verification/request`
(uniquement quand `code_provider=whatsapp-otp` — ne pas toucher au comportement
du provider `token` par défaut), même pattern IP-keyed que
`resetPasswordRateLimitMiddleware`/`semanticSearchRateLimitMiddleware`.

### Confirmation du code (storefront)

Nouvel écran (mêmes conventions que `verify-account` existant, mais saisie
de 6 chiffres au lieu d'un clic de lien) :
- `confirmPhoneVerification(code: string)` dans `customer.ts` :
  `sdk.auth.verification.confirm({ code, code_provider: "whatsapp-otp" })`
  (pas d'authentification requise, comme le flux email).
- En cas de succès : relance `login()` avec le téléphone (le flux existant
  crée alors le customer à partir des données en attente, lie l'email si
  fourni — voir ci-dessus).
- Bouton « Renvoyer le code » : relance `sdk.auth.verification.request(...)`
  avec le même `entity_id`/`code_provider` (le provider gère déjà la
  ré-émission d'un code sur une vérification non confirmée, comme le
  provider `token`).

### Formulaires (storefront)

- `register/index.tsx` : `phone` devient `required`, libellé « Téléphone
  (WhatsApp) » ; `email` perd `required`, reste `type="email"` (validé
  seulement s'il est rempli — comportement natif HTML5 sur un champ non
  requis).
- `login/index.tsx` : le champ email devient un champ texte unique libellé
  « Téléphone (WhatsApp) ou email », `type="text"` (retire la validation
  HTML5 de format email, incompatible avec un numéro de téléphone),
  `name` renommé `identifier` (répercuté dans `login()` côté `customer.ts`).
  Normalise l'entrée avant l'appel si elle ressemble à un numéro de
  téléphone (mêmes règles que l'inscription) ; laisse tel quel sinon
  (email).
- `requestPasswordReset` : label mis à jour en cohérence (« Téléphone
  (WhatsApp) ou email ») pour ne pas induire en erreur — même si l'envoi
  réel ne fonctionnera que pour un identifiant email tant que le suivi
  « non-objectif » ci-dessus n'est pas traité. Documenté clairement dans le
  code (commentaire) pour ne pas surprendre un futur lecteur.

## Erreurs et cas limites

- **Ré-inscription avec un téléphone non vérifié** : déjà géré par
  `emailpass.register()` (une identité sans `app_metadata` est « réclamable »,
  le mot de passe est simplement mis à jour) — aucun changement nécessaire,
  le client peut recommencer l'inscription sans blocage.
- **Email déjà utilisé par un autre compte** lors de la liaison
  post-vérification : la nouvelle route retourne une erreur explicite (« cet
  email est déjà associé à un autre compte ») plutôt que d'écraser
  silencieusement ou de planter — le client garde son compte téléphone (déjà
  créé et vérifié), seule la liaison de l'email échoue.
- **Code expiré ou invalide** : message explicite + bouton « Renvoyer le
  code » (le provider distingue déjà les deux cas côté erreur Medusa
  standard : `NOT_ALLOWED` avec message différent).
- **`WHATSAPP` non configuré / webhook n8n down** : le subscriber logue et
  n'interrompt jamais la requête HTTP du client (même pattern que les autres
  subscribers) — le code existe et est valide côté backend même si sa
  livraison échoue ; un « Renvoyer le code » réessaie l'envoi.

## Tests

TDD complet côté backend, mêmes conventions que les modules récents
(`meta-conversions-*`, `storefront-revalidate-client`) :
- `normalize-phone.ts` : cas limites (espaces, tirets, préfixe déjà présent,
  préfixe `00226`, numéro déjà en E.164).
- Provider `whatsapp-otp-verification` : génération/hash/expiration/code
  déjà vérifié — tests unitaires directs sur la classe (pas besoin de
  mocker tout le module Auth, `authVerificationService` est injectable).
- Subscriber `auth-verification-requested-whatsapp.ts` : filtre sur
  `code_provider`, appel webhook mocké, jamais de throw.
- Route `link-email-identity` : email déjà pris, succès, validations.
- Storefront : `signup`/`login`/`confirmPhoneVerification` — tests existants
  (s'il y en a) mis à jour, sinon nouveaux tests ciblés sur la logique pure
  de normalisation/branchement.

Vérification finale en conditions réelles :
- Sur staging, avec le template Meta approuvé : inscription téléphone
  seul → réception du code WhatsApp → confirmation → connexion.
- Inscription téléphone + email → connexion successivement avec les deux
  identifiants.
- Renvoi de code après expiration simulée (TTL réduit en test).

## Rollout

1. Backend : normalisation téléphone, provider de vérification, subscriber,
   route de liaison d'email, rate limiting — TDD, déployé sur staging puis
   production (circuit habituel).
2. Storefront : formulaires, écran de code, `customer.ts` — même circuit.
3. Soumission du template Meta `account_verification_code` dès que possible
   (en parallèle du développement, pas après) — c'est le chemin critique
   externe de ce projet.
4. Vérification en conditions réelles sur staging une fois le template
   approuvé, avant bascule production.
5. Documentation : `HANDOFF.md` (entrée de session) + mémoire projet sur le
   non-objectif « reset de mot de passe téléphone-only » pour ne pas le
   perdre de vue.
