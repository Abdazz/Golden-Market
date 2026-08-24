# Refonte visuelle du storefront Golden Market : Design

Document de conception, issu du process de brainstorming architectural du
2026-08-24. Couvre l'intégralité de `apps/storefront` (actuellement le thème
par défaut, non personnalisé, du starter Medusa/Next.js) : système de design
et six pages clés. Décision actée avec l'utilisateur : un seul document
couvrant tout le storefront plutôt qu'un découpage en sous-projets.

## Contexte

Le storefront tourne encore avec le thème générique du starter DTC Medusa
(gris neutre, `@medusajs/ui-preset` par défaut, hero placeholder "Ecommerce
Starter Template"). Golden Market dispose d'une identité de marque déjà
existante (logo, charte) que le storefront n'utilise nulle part.

Assets de marque fournis par l'utilisateur :
`/media/abdazz/DATA/CODE/perso/golden_market_projects/golden_market_visual_identity/`
(logo couleur, logo blanc, logo noir, icône, fichiers haute résolution, PDF).
Palette et typographie ci-dessous extraites directement de ces fichiers, pas
inventées.

Six maquettes complètes ont été construites (Artifacts HTML) et validées par
l'utilisateur au fil de l'eau, avec deux itérations de correctifs (contraste
du titre du hero, espacement de section, suppression de tous les tirets
cadratins). Ce document formalise ce qui a été validé visuellement ; il ne
réintroduit aucune nouvelle décision de design non montrée à l'utilisateur.

## Décisions actées

1. **Approche technique** : tokens CSS (variables) + petite bibliothèque de
   composants maison, superposés à Tailwind CSS existant, plutôt que des
   retouches page par page ou l'introduction d'une librairie de composants
   avec animations riches (shadcn/ui, Framer Motion). Raison : cohérence
   garantie entre toutes les pages, et poids de bundle minimal, prioritaire
   sur mobile au Burkina Faso.
2. **Mobile-first strict, très léger** : pas d'animation lourde, pas de vidéo
   de fond, pas de parallax. Les seules animations sont des transitions CSS
   courtes (translation/opacité, ~150 à 600ms) qui respectent
   `prefers-reduced-motion`.
3. **Aucun tiret cadratin (—)**, ni dans le code ni dans le contenu affiché,
   sur l'ensemble du storefront. Le tiret simple (-) reste autorisé. Utiliser
   virgule, point, deux-points, ou point médian (·) selon le contexte. Cette
   règle s'applique à tout code touché dans le cadre de cette refonte ; le
   nettoyage du code existant hors périmètre (backend, emails) est différé
   (décision explicite de l'utilisateur, hors scope ici).
4. **Le flux fonctionnel n'est pas modifié.** Checkout en 4 étapes empilées
   (Adresse, Livraison, Paiement, Récapitulatif), paiement Orange Money manuel
   avec instructions affichées, Stripe pour carte bancaire : ce document ne
   touche qu'à l'habillage visuel de ces flux, jamais à leur logique
   (`apps/storefront/src/lib/data/`, workflows backend inchangés).
5. **Dark mode hors scope.** `tailwind.config.js` déclare déjà
   `darkMode: "class"` mais rien dans le code actuel ne bascule ce mode
   (vérifié : aucune occurrence de logique dark mode dans
   `apps/storefront/src`). Les tokens sont définis en variables CSS pour
   rester extensibles, mais seul le thème clair est câblé dans cette refonte.
6. **Photos catalogue hétérogènes** (`apps/backend/static/`) : certaines sont
   des photos studio propres sur fond blanc, d'autres des visuels marketing
   fournisseur avec texte anglais incrusté et fond non uniforme. Traitement
   retenu : conteneur image à ratio fixe (1:1 pour les cartes produit) avec
   `object-fit: cover`, qui recentre systématiquement sur le produit sans
   dépendre de la qualité de la source.

## Système de design

### Palette

| Nom | Hex (clair) | Usage |
|---|---|---|
| Violet Profond | `#332871` | Surfaces de marque : header, hero, footer, bandeaux de compte |
| Améthyste | `#6E5CC4` | Liens, accents secondaires, statut "en cours" |
| Or Vif | `#E7A92E` | Action principale (CTA), accents dorés |
| Or Pâle | `#F6DFA0` | Fonds doux (badge "Nouveau", chips) |
| Terracotta | `#C85A1D` | Réservé aux promotions/bons plans uniquement, jamais pour une action neutre |
| Ivoire | `#FAF6EE` | Fond de page |
| Encre | `#211B3D` | Texte |

Variantes sombres définies (mêmes rôles, valeurs éclaircies pour rester
lisibles sur fond sombre) mais **non câblées** dans l'implémentation initiale
(cf. décision 5). Valeurs exactes dans le fichier de tokens CSS à créer (voir
Composants).

### Typographie

- **Titres** : Baloo 2 (Google Fonts, graisses 500/600/700/800). Reprend le
  style rond et gras du logo.
- **Corps, prix, interface** : Inter (déjà utilisée dans le storefront,
  graisses 400/500/600/700). Conservée pour sa lisibilité en grille dense et
  son bon rendu des chiffres tabulaires (prix en FCFA).
- Deux familles seulement, choix délibéré pour limiter le poids des polices
  chargées sur mobile.

### Composants transverses à créer

Nouveau répertoire de tokens et primitives, superposé à
`@medusajs/ui-preset` sans le remplacer entièrement (les composants Medusa UI
non visuellement critiques, ex. `Toaster`, restent tels quels) :

- `apps/storefront/src/styles/tokens.css` (nouveau) : variables CSS définies
  ci-dessus, chargées globalement.
- `tailwind.config.js` : `theme.extend.colors` et `theme.extend.fontFamily`
  étendus pour exposer les tokens comme classes Tailwind (`bg-violet`,
  `text-gold`, `font-display`, etc.), en plus des couleurs `grey.*`
  existantes qui restent utilisées ailleurs dans l'admin/composants non
  retouchés.
- `apps/storefront/src/modules/common/components/ui/` : composants stylés
  ajoutés ou étendus : `Button` (variantes primary/secondary/outline/ghost,
  formes pilule), `Badge` (promo/nouveau/rupture/livraison), `Chip`
  (catégories, défilement horizontal sans scrollbar visible), `ProductCard`
  (image ratio 1:1, badge overlay, bouton ajouter rond).

## Pages

Chaque page ci-dessous a une maquette Artifact de référence, approuvée par
l'utilisateur le 2026-08-24. Les liens restent valables tant que
l'utilisateur ne les supprime pas depuis son compte ; la description qui
suit reste la source de vérité si un lien devient inaccessible.

### Accueil

Fichiers principaux : `modules/home/components/hero/index.tsx`,
`modules/home/components/featured-products/`, `modules/layout/templates/nav/`,
`modules/layout/templates/footer/`.

- **Header** : bandeau Violet Profond, logo (version blanche), navigation
  desktop (masquée en dessous de 860px), icônes compte/panier avec badge de
  quantité.
- **Hero** : bandeau Violet Profond, anneau décoratif doré en CSS (écho du
  "G" du logo, pas d'image raster), carte produit flottante illustrant une
  promotion réelle, titre en Baloo 2 800 ("Les occasions en `or` à ne pas
  manquer", "or" en doré, reste du texte en blanc cassé sur fond violet),
  deux CTA (plein doré + contour), mini bandeau de confiance (Orange Money,
  livraison nationale).
- **Bandeau de confiance** : 3 items (paiement Orange Money, livraison
  Burkina Faso, contact WhatsApp), fond ivoire légèrement plus soutenu.
- **Catégories** : grille de 6 cartes (icône + libellé), pas de photo par
  catégorie (aucune photographie dédiée disponible).
- **Bons plans** : section teintée terracotta clair (seul usage non-badge de
  cette couleur), grille de produits en promotion avec badge de réduction.
- **Meilleures ventes** : grille produit standard, 4 colonnes en desktop, 2
  en mobile.

Référence : https://claude.ai/code/artifact/f4a7c57d-c941-4050-aa76-096ac933512f

### Catalogue (liste produits)

Fichiers principaux : `modules/store/templates/`,
`modules/store/components/refinement-list/`,
`modules/store/components/pagination/`.

- Fil d'ariane, titre de catégorie, compteur de résultats.
- Barre d'outils : bouton "Filtrer" (mobile uniquement, ouvre un panneau ou
  modal) + tri. Comportement à implémenter : actuellement
  `store/templates/index.tsx` empile `RefinementList` au-dessus de la grille
  en mobile (`flex-col small:flex-row`), sans bouton ni panneau dédié ; ce
  document demande un vrai panneau/modal mobile déclenché par un bouton,
  distinct de l'affichage desktop.
- Filtres desktop en colonne latérale fixe (≥900px) : catégories à cocher
  avec compteur, curseur de prix, disponibilité. Sur mobile, les mêmes
  filtres passent dans le panneau déclenché par le bouton "Filtrer" au lieu
  d'être empilés en pleine page.
- Grille produit (réutilise `ProductCard`).
- **"Charger plus de produits"** plutôt qu'une pagination numérotée
  (`store/components/pagination` existe déjà en pagination numérotée
  classique ; ce document demande de le remplacer par un bouton de
  chargement incrémental, plus adapté au doigt sur mobile). Si un tri
  d'implémentation ultérieur juge la pagination numérotée trop coûteuse à
  remplacer pour la V1, le garder est acceptable à condition de la restyler
  avec les mêmes tokens ; ce n'est pas un point bloquant du design, seule la
  grille et les filtres le sont.

Référence : https://claude.ai/code/artifact/06fbcabb-fe70-43d9-b6b7-cb0516c1b2f5

### Fiche produit

Fichiers principaux : `modules/products/templates/`,
`modules/products/components/image-gallery/`,
`modules/products/components/product-actions/`,
`modules/products/components/product-tabs/`,
`modules/products/components/related-products/`.

- Fil d'ariane.
- Galerie : image principale carrée + bande de vignettes.
- Titre, prix (actuel + barré si promo + montant économisé), points forts
  en liste à puces.
- Sélecteur de variante (couleur en pastilles rondes, ou taille en chips
  selon le produit ; `option-select.tsx` existant fournit déjà la logique,
  seul l'habillage change).
- Sélecteur de quantité + CTA "Ajouter au panier" : **en flux normal sur
  desktop** (≥900px), **barre fixe en bas d'écran sur mobile** pour ne
  jamais perdre le bouton d'achat au scroll (nouveau comportement à
  implémenter dans `product-actions/mobile-actions.tsx`, qui gère déjà un
  cas mobile distinct).
- Bandeau de confiance (Orange Money, livraison, WhatsApp).
- Accordéon description/livraison/paiement (`product-tabs/accordion.tsx`
  existant, à restyler).
- Produits similaires en défilement horizontal (`related-products/`).

Référence : https://claude.ai/code/artifact/e00b18ea-ea99-42af-89b1-68fbcb8311b0

### Panier

Fichiers principaux : `modules/cart/templates/`,
`modules/cart/components/item/`, `modules/cart/components/empty-cart-message/`.

- Fil d'ariane, titre avec compteur d'articles.
- Liste d'articles : vignette, nom, variante, bouton "Retirer", sélecteur de
  quantité, prix ligne.
- Carte récapitulative collante (`position: sticky`) : champ code promo,
  sous-total, note "livraison calculée à l'étape suivante", total, CTA
  "Passer la commande", lien "Continuer mes achats".
- État vide (`empty-cart-message/index.tsx` existant) : à restyler avec les
  mêmes tokens, pas de maquette dédiée demandée par l'utilisateur ; suivre
  le ton du reste (icône simple, CTA vers le catalogue).

Référence : https://claude.ai/code/artifact/5427c142-92a4-4835-b34d-ecc382aef3d9

### Paiement (checkout)

Fichiers principaux : `modules/checkout/templates/checkout-form/`,
`modules/checkout/components/addresses/`,
`modules/checkout/components/shipping/`,
`modules/checkout/components/payment/`,
`modules/checkout/components/review/`,
`modules/checkout/templates/checkout-summary/`.

- 4 cartes empilées correspondant exactement aux 4 composants existants
  (Addresses, Shipping, Payment, Review) : numéro d'étape en pastille
  (violet plein = complétée avec coche, doré = active, gris atténué =
  désactivée), titre, lien "Modifier" sur les étapes complétées, résumé
  d'une ligne pour les étapes complétées.
- Étape Paiement : deux cartes de méthode sélectionnables (Orange Money,
  Carte bancaire) réutilisant la logique déjà présente dans
  `payment/index.tsx` (`isOrangeMoney`, `isStripeLike`), habillage seul à
  changer.
- **Encart d'instructions Orange Money** : fond ivoire soutenu, bordure
  gauche violette (pas doré ni terracotta, registre volontairement calme
  pour une instruction de paiement sensible), numéro à créditer, titulaire,
  montant à envoyer en évidence, note de confirmation. Reprend les données
  déjà exposées par `activeSession.data` dans le composant existant (numéro
  de téléphone, nom de compte, note) ; **ce document ne change aucune
  donnée, seulement la présentation**. Profiter de cette passe pour retirer
  le tiret cadratin actuellement présent dans
  `checkout/components/payment/index.tsx`, entre le numéro de téléphone et
  le nom du titulaire dans la phrase "Envoyez le montant total au numéro".
- Récapitulatif de commande en colonne latérale collante : mini-liste
  d'articles, sous-total, livraison, total.

Référence : https://claude.ai/code/artifact/8c2e9351-4406-4bca-9c91-d924326fe349

### Compte

Fichiers principaux : `modules/account/templates/account-layout.tsx`,
`modules/account/components/account-nav/`,
`modules/account/components/overview/`,
`modules/account/components/order-card/`,
`modules/account/components/login/`, `modules/account/components/register/`.

- Navigation latérale (desktop uniquement) : Vue d'ensemble, Commandes,
  Adresses, Profil, Déconnexion (en terracotta pour le distinguer comme
  action de sortie, seul autre usage de cette couleur hors promotions).
- Carte d'accueil violette avec salutation et lien vers le profil.
- Liste de commandes récentes : vignettes empilées, numéro, date, statut en
  badge coloré sémantique (vert = livrée, doré = en cours, améthyste =
  paiement reçu ; ces couleurs sémantiques sont distinctes de l'accent de
  marque, cf. la couleur "Livrée" qui n'est ni violette ni dorée), total,
  lien vers le détail.
- Teaser adresse par défaut en bas de page.
- Connexion/inscription (`account/components/login/`,
  `account/components/register/`) : pas de maquette dédiée, ce sont des
  formulaires centrés simples ; restyler avec les mêmes tokens (`Button`,
  champs de saisie avec bordure `--border` et focus doré) suffit, sans
  changer la disposition.

Référence : https://claude.ai/code/artifact/e19ba19e-3eda-406e-a072-7e99d85a60d9

## Hors scope

- Bouton "Commander via WhatsApp" et synchronisation catalogue n8n :
  différés post-lancement (`ROADMAP.md`, Phase différée), non traités ici.
- Dark mode (cf. décision 5).
- Toute modification de la logique métier : calcul de prix, gestion des
  stocks, workflows de paiement/commande côté backend.
- Nettoyage des tirets cadratins hors du périmètre touché par cette refonte
  (backend, emails Resend) : décision explicite de l'utilisateur, à traiter
  séparément si demandé plus tard.

## Vérification

Le storefront n'a pas de suite de tests automatisés (`AGENTS.md` :
« Test (backend only; the storefront has no test suite) »). La vérification
sera manuelle, page par page, via `pnpm run storefront:dev` (ou gestionnaire
de paquets détecté), comparée à chacune des six maquettes de référence
ci-dessus, aux largeurs mobile (~375px), tablette (~768px) et desktop
(≥1280px). Vérifier en particulier :

- Contraste du texte sur toutes les surfaces violettes (cf. bug déjà corrigé
  sur le hero pendant le brainstorming).
- Absence de tirets cadratins dans tout texte affiché et tout code touché.
- Barre d'achat sticky mobile sur la fiche produit ne recouvre aucun contenu
  interactif.
- Flux de checkout et paiement Orange Money fonctionnellement inchangés
  (mêmes données affichées, mêmes appels `initiatePaymentSession`).
