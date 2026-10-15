# Espace livreur (2026-10-15)

Demande du propriétaire : le livreur se connecte, voit ses commandes, renseigne un rapport par
livraison ou expédition ; l'équipe reçoit les rapports par livreur et les valide commande par
commande. Première version : une seule page web ; une application livreur viendra plus tard.

## Ce qui est décidé (propriétaire)

- Connexion par **téléphone + code PIN** (créé par l'équipe pour chaque livreur).
- Le livreur voit ses commandes ; un clic ouvre un formulaire du même type que « Marquer comme payée ».
- Champs du formulaire : **Montant encaissé**, **Course du livreur**, **Frais Expédition** (nouveau nom de
  « Frais compagnie de transport », y compris dans l'admin), case **Livrée ?** toujours **cochée par défaut**.
- **Livraison à Ouagadougou** : le client paie à la réception, c'est le livreur qui encaisse. Il voit et
  renseigne « Montant encaissé » (pas « Frais Expédition »).
- **Expédition (hors Ouagadougou)** : le client paie par Mobile Money à l'entreprise. Le livreur **ne voit
  pas** « Montant encaissé » (il ne le connaît pas) ; il renseigne « Course du livreur » et « Frais
  Expédition ».
- Le rapport n'écrit rien dans la caisse ni dans la commande : l'équipe le valide ensuite, commande par
  commande. À la validation, tout est figé sauf « Montant encaissé » d'une expédition, saisi par l'équipe.

## Hypothèses à valider (prises par défaut)

1. Page servie par le backend (`/livreur`, HTML + JavaScript simple), sans passer par le site client ni par
   l'admin Medusa : un livreur n'a jamais accès à l'admin.
2. PIN à 4 chiffres, stocké haché ; 5 essais ratés par téléphone -> blocage 15 minutes (même limiteur que
   les routes de vérification existantes). L'équipe peut le réinitialiser depuis la fiche du livreur.
3. Un rapport par livraison ; le livreur peut le modifier tant qu'il n'est pas validé.
4. Le livreur ne voit que ses livraisons en cours et ses rapports non validés (pas le téléphone ni
   l'adresse d'autres livreurs, pas de montants de caisse).

## Architecture

- **Modèle** : table `delivery_report` dans le module `delivery` (livraison unique, livreur, `status`
  `submitted` / `validated`, `delivered`, `amount_collected` nullable, `courier_fee`, `transport_fee`,
  `submitted_at`, `validated_at`). Colonne `pin_hash` ajoutée à `courier`.
- **Authentification livreur** : routes `/courier/login` (téléphone + PIN) et `/courier/logout` ; jeton
  signé (HMAC, `COOKIE_SECRET`), cookie `httpOnly`, 12 h. Middleware dédié sur `/courier/*` : une session
  livreur ne donne accès à rien d'autre. Écritures par workflows, règles pures testées
  (`src/lib/courier-report-rules.ts` : champs visibles et obligatoires selon le type).
- **Routes livreur** : `GET /courier/deliveries` (ses livraisons en cours), `POST /courier/deliveries/:id/report`.
- **Routes admin** : `GET /admin/courier-reports` (rapports à valider, groupés par livreur),
  `POST /admin/courier-reports/:id/validate` (montant encaissé seulement pour une expédition),
  `POST /admin/couriers/:id/pin`.
- **Validation** : réutilise le code existant de fin de livraison et de paiement
  (`finishDelivery`, `markOrderDelivered`, mark-paid) avec les valeurs du rapport ; stock livreur, caisse
  (frais) et commande se mettent à jour comme aujourd'hui. Un rapport validé ne peut plus changer.
- **Écran admin** : onglet « Rapports livreurs » dans `/app/deliveries` (par livreur, un rapport par
  ligne, bouton « Valider », compteur dans l'onglet), champ PIN dans la fiche livreur.

## Hors périmètre

Application mobile, géolocalisation, notifications push, preuve de livraison par photo, rapport groupé
« fin de journée » en un seul envoi (le livreur envoie un rapport par commande).

## Tests

Règles pures (champs selon Ouaga / expédition, « Livrée » cochée par défaut, montant jamais accepté du
livreur pour une expédition) ; PIN (haché, limiteur, mauvais PIN) ; un livreur ne lit ni ne modifie la
livraison d'un autre ; validation = mêmes écritures qu'une fin de livraison manuelle ; contrôle visuel
de la page livreur sur téléphone (largeur 390 px) et de l'onglet admin dans Chrome.
