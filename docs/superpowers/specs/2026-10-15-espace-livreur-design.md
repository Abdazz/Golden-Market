# Espace livreur (2026-10-15)

Demande du propriétaire : le livreur se connecte, voit ses commandes, renseigne un rapport par
livraison ou expédition ; l'équipe reçoit les rapports par livreur et les valide commande par
commande. Première version : une seule page web ; une application livreur viendra plus tard.

## Ce qui est décidé (propriétaire)

- Connexion par **téléphone + code PIN** (créé par l'équipe pour chaque livreur).
- Le livreur voit ses commandes ; un clic ouvre un formulaire du même type que « Marquer comme payée ».
- Le formulaire pose d'abord la question **« La commande a-t-elle été livrée ? » (Oui / Non)**, sans
  réponse présélectionnée (une commande confiée peut ne pas avoir été livrée).
  - **Non** : une zone de saisie « Pourquoi n'a-t-elle pas été livrée ? » (obligatoire) remplace le reste.
  - **Oui** : les champs suivants s'affichent : **Montant encaissé**, **Course du livreur**,
    **Frais Expédition** (nouveau nom de « Frais compagnie de transport », y compris dans l'admin).
- **Livraison à Ouagadougou** : le client paie à la réception, c'est le livreur qui encaisse. Après « Oui », il voit et
  renseigne « Montant encaissé » et « Course du livreur » (pas « Frais Expédition »).
- **Expédition (hors Ouagadougou)** : le client paie par Mobile Money à l'entreprise. Le livreur **ne voit
  pas** « Montant encaissé » (il ne le connaît pas) ; il renseigne « Course du livreur » et « Frais
  Expédition ».
- **Rapport « Oui » (livrée)** : n'écrit rien dans la caisse ni dans la commande ; l'équipe le valide
  ensuite, commande par commande. À la validation, tout est figé sauf « Montant encaissé » d'une
  expédition, saisi par l'équipe. Elle peut aussi **renvoyer le rapport au livreur pour correction avec un
  motif** : le livreur voit le motif, corrige et renvoie.
- **Rapport « Non » (non livrée)** : **aucune validation**. Dès l'envoi, l'échec est enregistré avec le
  motif du livreur. La validation ne porte que sur les livraisons réussies.

## Hypothèses à valider (prises par défaut)

1. Page servie par le **storefront** (Next.js, route `/livreur`), conçue **mobile-first** avec la charte
   graphique Golden Market (tous les livreurs utilisent un téléphone ; contrôle à 360 et 390 px d'abord).
   Le navigateur ne parle qu'au storefront : ses route handlers `/api/livreur/*` relaient vers les routes
   backend `/courier/*` et gardent le jeton dans un cookie `httpOnly` du site. Un livreur n'a jamais
   accès à l'admin Medusa.
2. PIN à 4 chiffres, stocké haché ; 5 essais ratés par téléphone -> blocage 15 minutes (même limiteur que
   les routes de vérification existantes). L'équipe peut le réinitialiser depuis la fiche du livreur.
3. Un rapport par livraison ; le livreur peut modifier un rapport « Oui » tant qu'il n'est pas validé, et
   corriger un rapport renvoyé. Un rapport « Non » est définitif (la commande revient à confier).
4. Le livreur ne voit que ses livraisons en cours et ses rapports non validés (pas le téléphone ni
   l'adresse d'autres livreurs, pas de montants de caisse).

## Architecture

- **Modèle** : table `delivery_report` dans le module `delivery` (livraison unique, livreur, `status`
  `submitted` / `returned` (renvoyé pour correction, avec `return_reason`) / `validated` / `applied`
  (rapport « Non », appliqué sans validation), `delivered` (oui / non), `failure_reason` (si non), `amount_collected` nullable, `courier_fee`, `transport_fee`,
  `submitted_at`, `validated_at`). Colonne `pin_hash` ajoutée à `courier`.
- **Authentification livreur** : routes `/courier/login` (téléphone + PIN) et `/courier/logout` ; jeton
  signé (HMAC, `COOKIE_SECRET`), cookie `httpOnly`, 12 h. Middleware dédié sur `/courier/*` : une session
  livreur ne donne accès à rien d'autre. Écritures par workflows, règles pures testées
  (`src/lib/courier-report-rules.ts` : champs visibles et obligatoires selon le type).
- **Routes livreur** (jeton livreur, appelées par le storefront) : `GET /courier/deliveries` (ses livraisons en cours), `POST /courier/deliveries/:id/report`.
- **Routes admin** : `GET /admin/courier-reports` (rapports à valider, groupés par livreur),
  `POST /admin/courier-reports/:id/validate` (montant encaissé seulement pour une expédition),
  `POST /admin/courier-reports/:id/return` (motif obligatoire),
  `POST /admin/couriers/:id/pin`.
- **Rapport « Non »** : à l'envoi, même écriture que le bouton « Échec » existant (la commande redevient à
  confier, aucune écriture de caisse), statut `applied`.
- **Validation d'un rapport « Oui »** : réutilise le code existant de fin de livraison et de paiement
  (`finishDelivery`, `markOrderDelivered`, mark-paid) avec les valeurs du rapport ; stock livreur, caisse
  (frais) et commande se mettent à jour comme aujourd'hui. Un rapport validé ne peut plus changer.
- **Écran admin** : onglet « Rapports livreurs » dans `/app/deliveries`, en deux niveaux.
  1. **Liste des livreurs à qui des commandes ont été confiées aujourd'hui** (tournée du jour), avec pour
     chacun : nombre de commandes, rapports reçus, rapports à valider, renvoyés, échecs. Compteur global
     des rapports à valider dans l'onglet.
  2. **Clic sur un livreur** : tableau de ses commandes du jour, avec toutes les informations utiles :
     numéro de commande, client et téléphone, type (livraison Ouaga / expédition), ville ou adresse,
     compagnie, produits, montant à encaisser, état du rapport (pas encore de rapport / à valider /
     renvoyé / validé / non livrée), et pour un rapport : livrée oui ou non, motif, montant encaissé,
     course, Frais Expédition, heure d'envoi. Sur chaque ligne « à valider » : boutons **Valider** et
     **Renvoyer pour correction** (motif obligatoire) ; le Montant encaissé d'une expédition se saisit
     dans la ligne à la validation. Les autres champs sont en lecture seule.
  Champ PIN dans la fiche livreur (création / réinitialisation).

## Hors périmètre

Application mobile native, géolocalisation, notifications push, preuve de livraison par photo, rapport groupé
« fin de journée » en un seul envoi (le livreur envoie un rapport par commande).

## Tests

Règles pures (champs selon Ouaga / expédition, question Oui / Non d'abord, motif obligatoire si Non, montant jamais accepté du
livreur pour une expédition) ; PIN (haché, limiteur, mauvais PIN) ; un livreur ne lit ni ne modifie la
livraison d'un autre ; validation = mêmes écritures qu'une fin de livraison manuelle ; contrôle visuel
de la page livreur sur téléphone (largeur 390 px) et de l'onglet admin dans Chrome.
