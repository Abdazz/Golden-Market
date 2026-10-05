# Finitions du stock confié aux livreurs

Date : 2026-10-06. Suite de `2026-09-28-stock-livreurs-design.md` : défauts mineurs relevés par la
revue finale du 2026-09-28. Conception validée par le propriétaire le 2026-10-06.

## Objectif

Rendre l'onglet « Stock livreurs » plus sûr et plus pratique au quotidien, sans nouvelle table ni
migration : retrouver un produit en tapant son nom, ne jamais rester sur un écran bloqué, ne
jamais perdre silencieusement un mouvement ou un déstockage.

## Changements

### 1. Recherche d'un produit par nom (Remettre / Retour / Corriger)

- La liste déroulante « Produit… » de chaque ligne devient un champ de recherche : la saisie
  filtre les produits proposés (mêmes produits qu'aujourd'hui selon le mode : au dépôt pour une
  remise, chez le livreur pour un retour, tous pour une correction).
- Recherche insensible aux accents, aux majuscules et à l'ordre des mots (« eponge balai » trouve
  « Balai-éponge ») ; tous les mots saisis doivent apparaître dans le libellé.
- Chaque proposition affiche la quantité utile (au dépôt / chez le livreur). Un clic choisit le
  produit ; le champ affiche alors son libellé, et le modifier annule le choix.
- Champ vide ou sans résultat : « Aucun produit » ; utilisable au doigt sur téléphone.
- Au plus 30 propositions ; au-delà, une dernière ligne grise « Affinez la recherche… ».
- Une ligne avec une quantité ou un texte de recherche mais sans produit choisi dans la liste est
  refusée : « Choisissez le produit dans la liste. » (une ligne entièrement vide reste ignorée).
- Règle de filtrage pure : `admin/lib/product-search.ts` (`matchesSearch(label, query)`), testée.

### 2. Déstockage échoué à « Livrée » / « Déposée à la gare »

- Aujourd'hui l'échec de `takeDeliveryStockWorkflow` est seulement journalisé. Désormais la route
  `POST /admin/deliveries/:id/complete` renvoie aussi `stock_warning` (texte : « Stock du livreur
  non mis à jour : enregistrez un Retour des articles livrés dans l'onglet Stock livreurs. » ; un
  Retour corrige le solde du livreur sans toucher Medusa, alors qu'une correction retirerait une
  seconde fois le stock Medusa déjà baissé par la livraison) et l'inscrit dans le
  champ existant `delivery.sync_warning` (concaténé à l'éventuel avertissement de paiement, séparés
  par un espace), affiché dans la tournée et l'encadré « Livraison » de la fiche commande.
- La page Livraisons affiche l'avis en orange (`warning`) dès qu'un des deux avertissements existe.
- La livraison reste terminée (jamais bloquant, comme aujourd'hui).
- L'avertissement n'est posé que si le workflow de déstockage lui-même échoue : un échec de la
  lecture des libellés des articles déstockés donne le libellé « Article » (journalisé, sans
  avertissement). Un échec de l'inscription de l'avertissement dans la livraison est journalisé
  sans renvoyer d'erreur ni sauter le journal de caisse.

### 3. Retour : changement de livreur

En mode Retour, changer de livreur vide les lignes saisies (les produits proposés dépendent du
livreur). Remise et correction : inchangé.

### 4. Chargement en échec

- Onglet : si `GET /admin/courier-stock` échoue, afficher le message d'erreur et un bouton
  « Réessayer » au lieu de « Chargement… » sans fin.
- Rechargement en échec après un mouvement réussi : l'avis de succès reste affiché et, sur une
  ligne séparée, « Mise à jour de l'affichage impossible : <message> » avec « Réessayer ».
- Erreur réseau (fetch impossible) : « Service injoignable, réessayez. » au lieu du message brut
  du navigateur (`readableError`, `admin/lib/courier-stock-form.ts`).
- Historique d'un livreur : en échec, « Historique indisponible. » au lieu de « Aucun mouvement. ».

### 5. Produit saisi deux fois dans une correction

Refusé avec « Ce produit est saisi deux fois : gardez une seule ligne. », côté formulaire
(`parseFormLines`) et côté serveur (`parseMovementLines`). Aujourd'hui la dernière quantité écrase
la précédente sans avertissement. Remise et retour : les lignes en double continuent de
s'additionner.

### 6. Variantes sans suivi de stock

Au déstockage d'une livraison, les variantes `manage_inventory = false` sont ignorées (aucun
mouvement), comme Medusa ne suit pas leur stock. La table variante -> articles physiques passée à
`orderItemNeeds` est construite par une nouvelle règle pure `inventoryByManagedVariant(variants)`
(dans `lib/courier-stock-rules.ts`) qui exclut ces variantes, testée.

### 7. Verrou des mouvements de stock

`recordCourierStockWorkflow` et `takeDeliveryStockWorkflow` prennent le même verrou
(`acquireLockStep` / `releaseLockStep`, clé `courier-stock`, timeout 10 s, ttl 30 s, comme
`completeDeliveryWorkflow`) : deux mouvements simultanés ne peuvent plus dépasser le stock du dépôt
ou du livreur, chacun voyant le solde laissé par l'autre. Verrou global (le dépôt est commun à tous
les livreurs) : volume faible, attente négligeable.

## Hors périmètre

Pas de nouvelle colonne (l'avertissement réutilise `sync_warning`), pas de changement du calcul des
soldes, pas de refonte de l'onglet.

## Tests

- Unitaires (TDD, test qui échoue d'abord) : `matchesSearch` ; doublon refusé en correction
  (`parseFormLines`, `parseMovementLines`) et toujours additionné en remise / retour ;
  `inventoryByManagedVariant` exclut les variantes sans suivi ; texte combiné des avertissements.
- Local (Playwright, bureau et téléphone) : recherche, retour avec changement de livreur, erreur
  de chargement simulée, doublon refusé, livraison avec déstockage.
- Staging puis production : onglet chargé, une remise et un retour de test annulés par le mouvement
  inverse (sur le livreur de test en staging uniquement).
