# Golden Market — Handoff / suivi d'avancement

Document de suivi entre sessions Claude Code. Chaque session doit :

1. Lire ce document en premier pour savoir où en est le projet.
2. Cocher/mettre à jour le statut d'une tâche **dès qu'elle est terminée** (pas en fin
   de session — au fil de l'eau).
3. Ajouter une entrée dans le journal en bas si une décision ou un blocage mérite d'être
   tracé pour la session suivante.

Le détail des tâches vit dans `ROADMAP.md` (phases 0 à 5 + phase différée) ainsi que
dans les décisions actées de `ARCHITECTURE.md`. Ce document-ci ne répète pas le contenu
des tâches, seulement leur **statut**.

Statuts possibles : `à faire` · `en cours` · `bloqué` · `fait`.

## Dernière mise à jour

2026-08-31 (après-midi) - **Conformité aux 6 maquettes claude.ai : les 6 pages
implémentées et vérifiées en local, en cours de déploiement.** Le propriétaire a
signalé qu'Accueil et Catalogue n'étaient en fait pas conformes non plus (contrairement
au prompt de reprise) - toutes les pages ont donc été (re)traitées. Cadence choisie par
le propriétaire : tout enchaîner sur `staging` (chaque page vérifiée en local + build
prod + 10/10 Playwright), puis **une seule** promotion `staging` -> `main` à la fin
(les déploiements VPS prennent 40-60 min pièce en ce moment). Le lien de la maquette
Paiement n'était pas mort : `Artifact action:"read"` fonctionne (intermittences de
l'outil, pas du serveur).

Commits sur `staging` (pas encore sur `main`) :
- `bf3c78f` Correctifs transverses : format prix "15 000 FCFA" (`money.ts` en fr-FR +
  branche XOF), footer refait selon maquette (Boutique/Aide/Contact + vrais numéros,
  `lib/contact.ts`), logo recadré sur la pastille (`logo-mark-*.png`), icônes de rayon
  SVG, badge "Nouveau" retiré (catalogue importé le même jour -> apparaissait partout).
  **Déjà mergé sur `main` et déployé en prod (vérifié).**
- `207ca84` Accueil : hero 2 colonnes + visuel décoratif (vrai produit, jamais de
  fausse remise), bandeau de confiance avec icônes, sur-titre "Rayons", suppression du
  faux traitement "promo" terracotta sur la 1re collection.
- `6fe6372` Catalogue + pages catégorie/collection : composant `Breadcrumb` partagé,
  barre d'outils (nombre de résultats + menu de tri déroulant), tri sorti de la barre
  latérale, pages catégorie/collection repassées en gm-*. Pagination numérique
  conservée (écart assumé vs "Charger plus").
- `7a98394` Fiche produit : vraie mise en page 2 colonnes, fil d'Ariane catégorie,
  prix Baloo + "Économisez X" (si vraie promo), sélecteur de quantité + bouton
  "Ajouter au panier · <prix>", bandeau de réassurance, accordéon Description /
  Livraison / **Paiement Orange Money**. **Non construits** (à signaler / décider) :
  puces marketing "Suivi du sommeil..." (aucune source de données) et pastilles de
  couleur (produits mono-variante).
- `d371783` Mon compte : fil d'Ariane, icônes sur la nav latérale, "Membre depuis
  <mois année>" (neutre, pas "Cliente"), bouton "Modifier mon profil", carte adresse
  par défaut en pointillés, statut "En livraison" ajouté à OrderCard, correction de 2
  liens morts du formulaire d'inscription, retrait de la carte "/customer-service".
- `883c271` Paiement : le gabarit `(checkout)/layout` affiche l'en-tête violet complet
  + footer du site (comme la maquette), fil d'Ariane "Accueil / Panier / Paiement" +
  titre "Finaliser ma commande", carte renommée "Votre commande", correction du bug
  "null null" de l'étape adresse (panier avec `shipping_address` vide), traduction des
  libellés de formulaire restés en anglais. Sélecteur E2E du moyen de paiement rendu
  précis (le footer contient aussi "Paiement Orange Money").
- `3261730` Panier : fil d'Ariane, titre "Mon panier (N articles)", sélecteur de
  quantité (- n +), champ code promo affiché d'emblée, traduction du texte anglais
  résiduel du CartDropdown, masquage de la variante "Default Title".

**État au 2026-08-31 ~17h05 GMT :**
1. ✅ Déploiement `staging` réussi (42 min). Les 5 pages front vérifiées à l'écran sur
   `https://staging.golden-market.co` (Accueil, Catalogue, Fiche produit, Panier,
   Paiement) : conformes. `/account` non vérifiable en ligne (voir bug ci-dessous), mais
   code vérifié en dev local.
2. ✅ `staging` mergé dans `main` (fast-forward, 7 commits `bf3c78f..658780d`) et poussé.
   **Déploiement production en cours** (poussé ~17h05 GMT). À re-vérifier sur
   `https://golden-market.co` quand il est terminé.
3. À signaler au propriétaire — écarts assumés : puces marketing + pastilles couleur de
   la fiche produit (pas de données réelles), "Charger plus" remplacé par pagination
   numérique, liens footer "Aide" (Paiement OM / Livraison) pointant vers les CGV faute
   de pages dédiées.

### ✅ RÉSOLU 2026-08-31 17h26 GMT — /account cassé en prod ET staging (pré-existant)

**Corrigé** : option `nocanon` ajoutée à `ProxyPass /` dans
`/etc/apache2/sites-available/golden-market.co-le-ssl.conf` (prod, cert lineage
`golden-market.co-0001`) et `staging.golden-market.co-le-ssl.conf` (staging), puis
`sudo apache2ctl configtest && sudo apache2ctl graceful` (+ `service apache2 restart`).
Après coup, les chunks `account/%40dashboard/page-*.js` et `%40login/page-*.js`
renvoient **200** sur prod ET staging, et `/bf/account` affiche le formulaire de
connexion (0 erreur console). Fait par le propriétaire en SSH pendant la session.
Le correctif Apache est indépendant du déploiement storefront : il a résolu prod
immédiatement, avant même que le déploiement de conformité n'y soit arrivé.

Historique / diagnostic ci-dessous pour mémoire.

Toutes les pages `/{cc}/account*` affichaient « Application error: a client-side exception
has occurred » (écran blanc). Cause : `ChunkLoadError` sur les chunks des slots de
routes parallèles Next `account/@dashboard/page-*.js` et `account/@login/page-*.js`.

**Diagnostic (fait cette session) :**
- Le navigateur demande `.../_next/static/chunks/app/%5BcountryCode%5D/(main)/account/%40dashboard/page-<hash>.js`
  (le `@` du dossier de slot encodé en `%40`). Apache renvoie **404**.
- Le même chemin (`%5BcountryCode%5D`, `(main)`) **sans** `%40` — ex. `.../store/page-<hash>.js`
  — renvoie **200**. Donc c'est bien le `%40` (`@`) qui pose problème.
- `next start` lancé **en local** sur le build de prod sert le chemin encodé `%40` avec
  **200** (le `@` littéral, lui, renvoie 404). Donc `next start` est correct.
- Conclusion : le reverse-proxy **Apache** devant le conteneur dé-canonicalise / décode
  le `%40` avant de proxyfier, `next start` reçoit un `@` littéral et renvoie 404.

**Correctif probable (à appliquer sur le VPS, accès SSH `admin@144.91.110.105`) :**
ajouter l'option `nocanon` à la directive `ProxyPass` des vhosts staging **et** prod du
storefront (transmet le chemin brut non décodé au backend) :
```
ProxyPass        / http://127.0.0.1:<port-storefront>/ nocanon
ProxyPassReverse / http://127.0.0.1:<port-storefront>/
```
puis `sudo apache2ctl configtest && sudo apache2ctl graceful`. Vérifier ensuite
`curl -s -o /dev/null -w '%{http_code}' 'https://.../\_next/static/chunks/app/%5BcountryCode%5D/(main)/account/%40dashboard/page-<hash>.js'` -> doit passer à 200, et
`/bf/account` doit afficher le formulaire de connexion sans écran blanc.
Ce bug **n'est pas** causé par les commits de conformité (prod le présentait déjà avec
`bf3c78f` seul) et la promotion prod ne l'aggrave pas.

### Notes techniques de session (dev local)
- Ports de dev réels : backend **9002**, storefront **8002** (pas 9001/8001 - ceux-là
  et 9000/8000 sont pris par d'autres conteneurs). `apps/backend/.env` : `PORT=9002`,
  `DATABASE_URL` sur `localhost:5440` (Postgres remappé via
  `docker-compose.override.yml`). `apps/storefront/.env.local` cible 9002/8002.
- Le script `storefront:dev` force `-p 8000` (occupé) : lancer
  `npx next dev --turbopack -p 8002` directement depuis `apps/storefront`.
- **Ne jamais lancer `npm run build` pendant qu'un `next dev` tourne** : ils partagent
  `.next/`, le build écrase les manifestes du serveur de dev -> 500 ENOENT
  `_buildManifest.js.tmp` sur toutes les pages. Arrêter le dev, `rm -rf .next`, build,
  puis relancer le dev.
- Échecs Playwright intermittents "Rupture de stock" / "2 add-product-button" après une
  rafale d'éditions : c'est du bruit HMR (l'état `inStock` du client passe faux avant
  résolution de la variante), **pas** une régression. Redémarrer le dev proprement
  (`rm -rf .next`), le préchauffer (curl des routes clés), puis relancer -> 10/10.
- La variante réelle des produits est "Default Title" (`manage_inventory: false` -> jamais
  en rupture). Le "Rupture de stock" observé était toujours un artefact d'hydratation.

2026-08-30 (midi) - Conformité maquette "Golden Market · Catalogue" (page `/store` "Tous les
produits") : le filtre de la barre latérale ("Filtrer par Size/Color") a été remplacé par un
vrai filtre par catégorie (les 6 vraies catégories, compteurs réels, multi-sélection) - l'ancien
filtre n'avait plus aucun rapport avec le catalogue réel (options S/M/L/XL et Black/White
orphelines en base, résidu d'un ancien seed de démo jamais nettoyé côté données - signalé, pas
corrigé, hors périmètre de ce correctif front). Composant `OptionsPicker` devenu mort, supprimé.
Ajout d'un bouton d'ajout rapide au panier sur chaque carte produit (variante unique uniquement,
le cas de tout le catalogue réel), d'un badge "Nouveau" réel (basé sur `created_at`), et du vrai
pourcentage de réduction sur le badge promo existant (mécanisme Medusa natif via price list de
type "sale", déjà branché correctement - juste jamais affiché avec le vrai %). 10/10 tests
Playwright stables, build de production vérifié. Accès aux artifacts claude.ai rétabli en
session (compte Chrome reconnecté) mais lecture/scroll bloqués par le sandboxing cross-origin de
l'iframe de rendu des maquettes - contourné par capture d'écran manuelle. **Reste à auditer** :
Panier, Fiche produit, Mon compte, Paiement (mockups non encore comparés au code).

2026-08-30 (fin de matinée) - Correctif header + conformité maquettes initiales (artifacts
claude.ai) : bug réel signalé par le propriétaire (logo centré sur desktop comme sur mobile,
bouton "Menu" identique aux deux formats, aucune icône). Header refondu selon la maquette
"Golden Market · Accueil" : logo à gauche sur tous les formats, navigation desktop générique
(Accueil/Catégories/Promotions/Suivre ma commande - `/store` pour les deux premiers, faute de
page dédiée ; `/account/orders` pour le suivi de commande), bouton "Menu" + icône hamburger
réservé au mobile (masqué à partir de `small`), boutons Compte/Panier en icônes circulaires
(plus de texte "Mon compte"/"Cart (n)"), badge de quantité sur le panier. Favicon généré à
partir du mark du logo (recadré, remplaçait le triangle par défaut Next.js/Vercel jamais changé).
2 tests Playwright ajoutés (conformité header desktop/mobile), 8/8 stable. **Accès aux artifacts
claude.ai coupé en session** (après un `/login` ayant déconnecté le Remote Control) avant d'avoir
pu auditer les 5 autres maquettes (Catalogue/Panier/Fiche produit/Mon compte/Paiement) - reste à
faire dans une prochaine session, avec l'accord du propriétaire de continuer sur la seule
maquette accessible entre-temps.

2026-08-30 (matin, suite) - Pages publiques "Politique de confidentialité" et "Conditions
générales de vente" ajoutées (`/politique-de-confidentialite`, `/conditions-generales`),
liées depuis une nouvelle colonne "Légal" du footer. Contenu rédigé à partir du comportement
réel du code (données collectées au checkout, paiement Orange Money manuel sans données de
carte, emails Resend) - pas de texte juridique générique copié d'un modèle. Un placeholder
explicite `[à compléter]` marque la raison sociale/numéro d'enregistrement, absents du dépôt
- **à faire par le propriétaire avant tout lancement réel**, même limite que celle déjà
documentée pour l'onglet "Livraison et retours" des fiches produit. Suite Playwright
étendue (2 tests de plus, liens footer → contenu de page), 6/6 stable en local.

2026-08-30 (matin) - Suite de tests E2E Playwright ajoutée (`apps/storefront/e2e/`,
`playwright.config.ts`) : parcours d'achat complet vérifié en conditions réelles de navigateur
(région → produit → panier → adresse → livraison → Orange Money → commande confirmée), 4/4 tests
stables sur deux exécutions locales consécutives contre le vrai backend/DB de dev seedés. Poussé
sur `staging` puis `main`, a déclenché un redéploiement automatique des deux environnements : le
déploiement staging a dépassé le timeout SSH de 40 min (image storefront déjà construite avec
succès, seul le `docker compose up -d` final n'a pas eu le temps de s'exécuter) - corrigé en
démarrant manuellement le conteneur puis en portant `command_timeout` à 60 min dans les deux
workflows pour absorber une marge de charge VPS. Production a réussi du premier coup. Voir le
journal ci-dessous pour le détail.

2026-08-30 - **Production entièrement déployée et vérifiée sur le VPS réel**
(`https://golden-market.co`) : `staging` mergée dans `main` et poussée (décision explicite du
propriétaire de passer en production après validation du staging), VPS provisionné selon la même
procédure que staging (répertoire, secrets réels, vhost Apache + certbot, admin, catalogue),
pipeline CI/CD automatisé vérifié de bout en bout. **Phase 3 marquée fait** - voir journal
ci-dessous pour le détail (dont un incident TLS certbot en cours de route, résolu). Aucune commande
de test placée en production (contrairement au test API fait sur staging) pour ne pas polluer les
données réelles du marchand.

2026-08-29 (soir) - **Staging entièrement déployé et validé sur le VPS réel**
(`https://staging.golden-market.co`) : pipeline CI/CD entièrement automatisé (build → migrate →
seed → démarrage, sans aucune étape manuelle par déploiement), parcours d'achat complet vérifié
via l'API (panier → livraison → Orange Money → commande, `display_id 1`), cron de sauvegarde
Postgres installé et testé (dump réel confirmé, rétention 7 jours). Phase 3 reste **en cours**
uniquement parce que la production n'est pas encore déployée (décision explicite du propriétaire :
staging d'abord, validation avant toute promotion vers `main`/production). Voir le journal
ci-dessous pour le détail complet (4 bugs réels trouvés et corrigés pendant ce premier
déploiement).

2026-08-29 - Correctif de persistance des images produit (Phase 3) : le module `file`
(file-local, jamais configuré explicitement) construisait ses URLs sur
`http://localhost:9000/static` en dur et rien ne servait ce chemin nulle part (ni Medusa,
ni Apache) - les images étaient donc cassées indépendamment de tout redéploiement. Corrigé
via `MEDUSA_BACKEND_PUBLIC_URL`, un bind mount Docker persistant et une route Apache dédiée.
Politique de branche confirmée : tout passe par `staging` (poussée sur `origin`) avant `main`.
Décision explicite du propriétaire : déploiement staging seul pour le moment, production
seulement après validation. Accès SSH VPS fourni (`admin@144.91.110.105`). Voir le journal
ci-dessous pour le détail technique.

2026-08-28 - Phase 3 (déploiement VPS + Docker) : artefacts de code livrés et mergés sur `main`
(Dockerfiles backend/storefront, `docker-compose.prod.yml` paramétré par `.env.deploy`, script de
sauvegarde Postgres avec rétention, templates de vhost Apache staging/production, workflows
GitHub Actions de déploiement automatique). Statut global passé à **en cours** : reste le Runbook
manuel VPS (accès réel, secrets, premier déploiement staging puis validation explicite avant
production), volontairement non automatisé. Voir `ROADMAP.md` Phase 3 et le journal ci-dessous.

2026-08-27 - Phase 2 (durcissement sécurité) clôturée : garde-fou de démarrage
`assertProductionConfig` (secrets forts, CORS sans `localhost`, no-op hors production) et
rate limiting Redis sur `POST /auth/customer/emailpass/reset-password` (5 req / 15 min par
IP, best-effort) implémentés ; compte admin dédié en prod et hygiène `.env` déjà satisfaits
sans code. Voir `ROADMAP.md` Phase 2 et le journal ci-dessous pour le détail.

2026-08-27 — Phase 1.5 (refonte visuelle du storefront) clôturée : spec de design validée,
4 plans exécutés (Fondation, Accueil/Catalogue/Fiche produit, Panier/Paiement, Compte),
branding Medusa retiré, storefront traduit en français, vraie taxonomie de catégories créée,
3 bugs réels corrigés via vérification visuelle sur backend réel. Voir `ROADMAP.md` Phase 1.5
et le journal ci-dessous pour le détail.

2026-08-16 — Phase 1 clôturée : vérification bout en bout du storefront sur la région
Burkina Faso effectuée (Task 6 du plan « catalogue-region-bf »), commande réelle passée
avec succès en XOF (panier → checkout → livraison 0 FCFA → Orange Money → confirmation).
Voir journal ci-dessous pour le détail, notamment une pollution de données découverte et
corrigée (un `geo_zone` « bf » orphelin sur le fulfillment set européen, résidu de la
Phase 0, faussait les options de livraison proposées pour la région BF).

## Prompt de reprise — conformité aux maquettes (2026-08-31)

Copier-coller le bloc ci-dessous en premier message d'une nouvelle session Claude Code
pour reprendre exactement où l'audit s'est arrêté.

> Continue l'audit de conformité du storefront Golden Market aux 6 maquettes publiées
> comme artifacts claude.ai. Lis d'abord `HANDOFF.md` en entier (section « Prompt de
> reprise » et journal du 2026-08-30/31), `AGENTS.md`, puis reprends le travail décrit
> ci-dessous. Ne recommence pas l'audit d'Accueil/Catalogue (déjà faits et vérifiés) ;
> continue sur Panier, Fiche produit, Mon compte (déjà comparés au code, à implémenter),
> et Paiement (maquette pas encore vue, lien mort à ce jour — vérifier avant de
> continuer, voir plus bas).
>
> Règles déjà établies dans ce projet à respecter sans redemander :
> - Ne jamais fabriquer de fausses données pour coller à une maquette (couleurs de
>   variante inexistantes, pourcentages de remise sans vraie promo, texte marketing
>   sans source réelle). Construire le vrai mécanisme sous-jacent quand il existe côté
>   Medusa, sinon signaler l'écart à l'utilisateur au lieu d'inventer.
> - Toujours committer sur `staging` d'abord, jamais directement sur `main`
>   (`git checkout staging` → commit → `git checkout main` → `git merge staging
>   --ff-only` → `git push origin main`).
> - Jamais de trailer `Co-Authored-By: Claude` dans les commits.
> - Vérification visuelle obligatoire (Playwright + captures d'écran réelles), pas
>   seulement une relecture de code — des bugs réels ont déjà été manqués sans ce
>   passage.
> - Pour chaque page corrigée : vérifier en local (dev server + suite Playwright
>   `apps/storefront/e2e/`), vérifier le build de production, committer, merger/pousser
>   sur `main`, puis rejouer les tests contre staging et production réels (exclure tout
>   test qui mute une vraie commande/panier des runs de production).

### Les 6 maquettes (artifacts claude.ai)

| Page | URL | Statut |
|---|---|---|
| Accueil | https://claude.ai/code/artifact/f4a7c57d-c941-4050-aa76-096ac933512f | ✅ implémenté sur `staging` (commit `207ca84`), en attente de promotion prod |
| Catalogue | https://claude.ai/code/artifact/06fbcabb-fe70-43d9-b6b7-cb0516c1b2f5 | ✅ implémenté sur `staging` (`6fe6372`), en attente prod |
| Panier | https://claude.ai/code/artifact/5427c142-92a4-4835-b34d-ecc382aef3d9 | ✅ implémenté sur `staging` (`3261730`), en attente prod |
| Fiche produit | https://claude.ai/code/artifact/e00b18ea-ea99-42af-89b1-68fbcb8311b0 | ✅ implémenté sur `staging` (`7a98394`), en attente prod — 2 écarts assumés signalés |
| Mon compte | https://claude.ai/code/artifact/e19ba19e-3eda-406e-a072-7e99d85a60d9 | ✅ implémenté sur `staging` (`d371783`), en attente prod |
| Paiement | https://claude.ai/code/artifact/8c2e9351-4406-4bca-9c91-d924326fe349 | ✅ implémenté sur `staging` (`883c271`), en attente prod — lien PAS mort (lisible via `Artifact`) |

Le 7e artifact `2fdb5ee1-d8ed-4b9e-aaa9-7fc4e3e9285b` (« Golden Market ») est le **design
system** : palette (Violet `#332871`, Améthyste `#6E5CC4`, Or `#E7A92E`, Terracotta
`#C85A1D`, Ivoire `#FAF6EE`, Encre `#211B3D`), typo Baloo 2 (titres) + Inter (texte),
composants boutons/badges/cartes. Déjà reflété dans `tokens.css` / `tailwind.config.js`.

**Note sur l'outil `Artifact`** : `action: "read"` et `action: "list"` sur ce compte ont
été intermittents toute la session (parfois « No published artifacts yet. », parfois une
vraie erreur d'accès « public reader »), sans lien avec un vrai changement côté serveur -
pas la peine de perdre du temps à retenter plus de 2-3 fois. Le contournement fiable est
la capture d'écran via le navigateur Chrome (`mcp__claude-in-chrome__*`, déjà connecté à
la bonne session claude.ai) : `navigate` vers l'URL de l'artifact puis
`computer` (screenshot). Limite connue : l'iframe de rendu de la maquette bloque tout
scroll/clic/JS synthétique (sandboxing cross-origin volontaire) - un seul viewport est
donc capturable par capture, pas la page complète ; zoomer/dézoomer le navigateur avant
la capture peut aider à voir plus de contenu d'un coup si besoin.

### Écarts déjà identifiés (Panier, Fiche produit, Mon compte) — à implémenter

**Panier** (`apps/storefront/src/modules/cart/...`) :
- Fil d'Ariane (breadcrumb) manquant.
- Titre H1 doit inclure le compte réel d'articles, ex. « Panier (3 articles) ».
- Steppers de quantité (boutons −/+) à vérifier/construire (existant à confirmer avant
  de recoder).
- Bouton de suppression avec icône poubelle + libellé « Retirer » (style à aligner sur
  la maquette).
- Champ code promo affiché directement sur la page panier (actuellement seulement au
  checkout, si présent du tout - à vérifier s'il existe un vrai mécanisme de code promo
  côté Medusa avant de construire un champ qui ne ferait rien de réel).
- Carte récapitulatif : titre « Récapitulatif », détail Sous-total/Livraison/Total, CTA
  « Passer la commande », lien « Continuer mes achats ».
- Le panneau `CartDropdown` (`apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`)
  contient encore du texte anglais résiduel du scaffold (Cart / Subtotal (excl. taxes) /
  Go to cart / Quantity: / Remove / Your shopping bag is empty.) — jamais corrigé, à
  traiter en même temps que la page Panier puisque le contenu de la maquette diffère.

**Fiche produit** (`apps/storefront/src/modules/products/...`) :
- Fil d'Ariane manquant.
- Texte « Économisez X FCFA » : réel et calculable à partir de
  `calculated_price.original_amount` vs `calculated_amount` (même mécanisme que le badge
  de remise du Catalogue, déjà branché dans `get-product-price.ts`) — à construire, pas
  fabriqué.
- Rangée de badges de confiance (Orange Money / Livraison Burkina Faso / Assistance
  WhatsApp) : contenu statique légitime (infos réelles déjà utilisées ailleurs dans le
  code, ex. `ORANGE_MONEY_NUMBER`/`ORANGE_MONEY_NAME`), à construire.
- Nouvelle section accordéon « Paiement Orange Money » : contenu réel/statique, à
  construire.
- Bouton d'ajout au panier combiné avec le prix, ex. « Ajouter au panier · 12 000 FCFA ».
- **Ne pas construire** : les swatches de couleur (le produit réel n'a qu'une seule
  variante, pas d'option couleur) ni les 3 puces marketing (« ✓ Suivi du sommeil... »,
  aucune source de données réelle) — signaler ces deux écarts à l'utilisateur plutôt que
  d'inventer du contenu.

**Mon compte** (`apps/storefront/src/modules/account/...`, `/account/*`) :
- Fil d'Ariane manquant.
- Icônes sur la nav latérale du compte, à ajouter.
- Bannière de bienvenue avec « Cliente depuis [mois année] » — calculable depuis
  `customer.created_at`, à construire.
- Bouton « Modifier mon profil ».
- Section « COMMANDES RÉCENTES » avec cartes de commande. **Attention** : les badges de
  statut de la maquette (« Livrée » / « En livraison » / « Paiement reçu ») doivent être
  mappés depuis les vrais champs Medusa (`fulfillment_status`, `payment_status`) —
  vérifier la correspondance réelle des valeurs avant de coder le mapping, ne pas
  inventer de statuts qui n'existent pas côté Medusa.
- Carte résumé de l'adresse de livraison par défaut.
- Les pages `/account/*` actuelles sont encore globalement le scaffold non stylé — c'est
  une vraie refonte de page complète, pas un correctif ponctuel.

**Footer (transversal, toutes les pages)** : le footer actuellement en place
(`apps/storefront/src/modules/layout/templates/footer/index.tsx`, colonnes
Catégories/Collections/Légal, ajoutées en session du 2026-08-30) ne correspond pas à la
structure vue sur les maquettes Panier et Mon compte : celles-ci montrent un footer avec
tagline + 3 colonnes Boutique/Aide/Contact, et de vrais numéros de contact (WhatsApp
« +226 61 85 37 37 », téléphone « +226 64 94 73 73 », email `commandes@golden-market.co`
déjà utilisé sur les pages Confidentialité/CGV). À reconstruire pour matcher la maquette
tout en gardant les liens légaux déjà ajoutés (Politique de confidentialité / CGV) quelque
part dans la nouvelle structure — ne pas les perdre au passage.

### Ordre de travail suggéré

1. Confirmer/récupérer l'URL de la maquette Paiement auprès du propriétaire (lien mort).
2. Reconstruire le footer commun (impacte toutes les pages, autant le faire une fois).
3. Panier, puis Fiche produit, puis Mon compte, puis Paiement — un commit par page,
   vérifié comme décrit dans les règles ci-dessus avant de passer à la suivante.

## Statut par phase

### Phase 0 — Débloquer le paiement manuel Orange Money
Statut global : **fait**

- [x] Corriger le double `export default` dans `orange-money-manual.ts` — fait (Task 1)
- [x] Instructions Orange Money sur la page de confirmation de commande — fait (Task 3)
- [x] Subscriber `order-placed` → webhook n8n (notification WhatsApp marchand) — fait (Task 2)
- [x] Provider email Medusa (Resend/SMTP) dans `medusa-config.ts` — fait (Task 4)
- [x] Vérification bout en bout du flux de paiement — fait (Task 10)

### Phase 1 — Catalogue & région Burkina Faso
Statut global : **fait**

- [x] Région BF (XOF) créée/seedée — fait (Task 3)
- [x] `NEXT_PUBLIC_DEFAULT_REGION=bf` dans le storefront — fait (Task 3)
- [x] Clé publishable liée au bon sales channel — fait (Task 3)
- [x] Import du catalogue réel via script (plus de saisie manuelle — décision révisée,
      voir journal) — fait (Task 4)

**Ne jamais éditer le prix d'un produit importé depuis l'admin Medusa** : le prix de
gros est une règle de prix sur le variant (`rules: { "customer.groups.id": ... }`),
pas une price list, invisible dans l'admin (aucune UI Medusa pour les règles de prix
au niveau variant), et silencieusement supprimé par toute modification de prix faite
depuis le formulaire produit de l'admin — le module de pricing traite le tableau de
prix reçu comme faisant autorité et supprime tout prix absent de ce tableau. Pas de
solution automatique de restauration : il faudrait supprimer le produit et réimporter
la ligne concernée (l'idempotence par titre du script d'import ne le restaurera pas
tant que le produit existe toujours).

### Phase 1.5 — Refonte visuelle du storefront
Statut global : **fait**

- [x] Spec de design validée, 4 plans exécutés et mergés — fait, voir `ROADMAP.md` Phase 1.5
- [x] Branding Medusa retiré, traduction française du storefront — fait
- [x] Accessibilité clavier du `Chip`, 3 bugs réels corrigés en vérification visuelle — fait
- [x] Vraie taxonomie de catégories (`seed:categories-bf`) — fait

**Point ouvert** : le contenu de l'onglet « Livraison et retours » de la fiche produit reste
une traduction du texte de démo Medusa, pas une politique vérifiée — à relire avant lancement.
Codé en dur côté storefront, non éditable depuis l'admin (comme tout le texte de marque/UI du
site — seules les données produit/catalogue le sont).

### Phase 2 — Durcissement sécurité
Statut global : **fait**

- [x] Secrets de production distincts des valeurs de `.env.template` - désormais imposé au
      démarrage par le garde-fou de code `assertProductionConfig`, pas seulement documenté
      (voir journal ci-dessous)
- [x] `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` restreints en production - désormais imposé
      par le même garde-fou de démarrage, pas seulement documenté
- [x] Compte admin dédié en prod - déjà satisfait sans action de code, documenté dans
      `ARCHITECTURE.md` ligne 64
- [x] Hygiène `.env` / `.env.local` de production - déjà satisfait sans action de code,
      revérifié pendant ce plan
- [x] Rate limiting de `POST /auth/customer/emailpass/reset-password` - implémenté, voir
      le journal ci-dessous pour le détail

### Phase 3 — Déploiement VPS + Docker
Statut global : **fait**

- [x] Dockerfiles production backend/storefront, `docker-compose.prod.yml`, script de
      sauvegarde Postgres, templates Apache, workflows GitHub Actions - livrés et mergés sur
      `main`. Voir `ROADMAP.md` Phase 3 pour le détail et le journal ci-dessous.
- [x] Persistance des images produit entre redéploiements (module `file` configuré,
      volume bind mount + route Apache dédiée) - voir journal ci-dessous.
- [x] Runbook manuel VPS exécuté pour staging ET production : répertoires
      `/opt/golden-market/{staging,production}`, secrets réels, comptes admin, vhosts Apache +
      certbot sur les deux domaines, catalogue importé, cron de sauvegarde installé et testé sur
      les deux environnements (rétention 7 jours staging / 30 jours production). Détail complet
      dans `docs/superpowers/plans/2026-08-27-phase3-deploiement-staging-production.md` et le
      journal ci-dessous.
- [x] Staging entièrement provisionné, déployé et vérifié (checkout complet testé via l'API).
- [x] Production entièrement provisionnée, déployée et vérifiée (2026-08-30) après validation du
      staging par le propriétaire - `https://golden-market.co` en ligne, 4 conteneurs stables,
      pipeline CI/CD automatisé confirmé fonctionnel de bout en bout.

### Phase 4 — Tests & CI minimale
Statut global : **à faire**

### Phase 5 — Vérification pré-lancement
Statut global : **à faire**

### Phase différée (post-lancement)
Non commencée, hors périmètre du lancement (sync n8n, bouton WhatsApp, import
catalogue automatisé, nettoyage TODOs template).

## Journal

- **2026-08-30 (midi, conformité maquette Catalogue)** - Accès aux artifacts claude.ai rétabli
  après reconnexion du compte Chrome (le blocage précédent était lié à un changement de compte
  côté propriétaire, pas un bug de l'outil). Capture de la maquette "Golden Market · Catalogue"
  via l'extension Chrome - lecture directe via l'outil Artifact toujours indisponible
  ("public non-member reader"), et le scroll/clic dans l'iframe de rendu des maquettes ne
  répond à aucune interaction synthétique (souris, clavier, JS) même dans un onglet neuf -
  sandboxing cross-origin, confirmé en testant plusieurs approches (scroll à différentes
  positions, clic sur un menu déroulant réel de la maquette, redimensionnement de fenêtre,
  raccourcis de zoom navigateur - tous bloqués). Capture d'écran manuelle du premier écran
  suffisante pour comparer la page `/store`.
  - **Écart réel identifié et corrigé** : le filtre de la barre latérale du catalogue affichait
    "Size" (S/M/L/XL) et "Color" (Black/White) - des valeurs réelles en base
    (`/store/product-options` les renvoie sans filtrer par produit encore existant), mais
    **orphelines** : aucun produit réel ne les référence (confirmé par requête SQL directe,
    `product_option`/`product_option_value`) - résidu d'un ancien seed de démo dont les produits
    ont été supprimés sans jamais nettoyer les options associées. Signalé comme bug de données à
    traiter séparément (pas corrigé ici, portée front uniquement).
  - **Corrigé** : nouveau composant `CategoryFilter` (`apps/storefront/src/modules/store/
    components/refinement-list/category-filter.tsx`) - les 6 vraies catégories avec compteurs
    réels (`category.products.length`), multi-sélection via un nouveau paramètre d'URL
    `categoryIds` (`apps/storefront/src/lib/util/category-filters.ts`, même pattern que
    `product-option-filters.ts` existant), remplace `OptionsPicker` dans `RefinementList`.
    Filtrage branché de bout en bout : `store/page.tsx` → `StoreTemplate` →
    `PaginatedProducts` (paramètre `categoryIds`, distinct du `categoryId` singulier déjà
    utilisé par les pages de catégorie individuelles) → requête Medusa réelle. `OptionsPicker`
    devenu totalement mort (plus aucun import) - supprimé plutôt que laissé en l'état. La
    plomberie de filtrage par option de variante (`product-option-filters.ts`,
    `optionValueIds` dans `listProductsWithSort`) reste en place : capacité toujours valide,
    seule l'UI qui l'exposait a été retirée.
  - **Bouton d'ajout rapide** (`quick-add-button.tsx`, nouveau) sur chaque carte produit de la
    grille - variante unique uniquement (`product.variants.length === 1`), le cas de tout le
    catalogue réel importé ; réutilise le même `addToCart` server action que la fiche produit.
  - **Badges réels, pas inventés** (décision explicite du propriétaire : "vrai % configurable",
    pas de fausses promos) : le badge "Promo" affichait un texte générique alors que le
    mécanisme de réduction réel existait déjà et fonctionnait correctement (`price_type ===
    "sale"` via une vraie price list Medusa, `percentage_diff` déjà calculé dans
    `get-product-price.ts`) - simplement jamais affiché avec le vrai pourcentage. Corrigé pour
    afficher `-{percentage_diff}%` réel. Badge "Nouveau" ajouté séparément, basé sur
    `created_at` (fenêtre de 14 jours) - signal réel, aucune donnée éditoriale inventée.
  - **Vérifié** : 10/10 tests Playwright stables sur deux exécutions consécutives (2 nouveaux
    tests : filtre catégorie fonctionnel, ajout rapide fonctionnel avec vérification du badge de
    panier), build de production storefront sans erreur.
  - **Reste à faire** : auditer les 4 autres maquettes non encore comparées au code (Panier,
    Fiche produit, Mon compte, Paiement) - probablement d'autres écarts du même type. Corriger
    le bug de données des options orphelines (`Size`/`Color`) si un nettoyage de base est
    souhaité avant lancement réel.

- **2026-08-30 (fin de matinée, header + conformité maquettes)** - Signalement direct du
  propriétaire avec capture d'écran : "Pourquoi le logo est centré au milieu sur desktop ? [...]
  Et si on est sur mobile il faudrait ajouter l'icone de menu juste à côté du texte 'Menu' à
  gauche." Investigation : `Nav` (`apps/storefront/src/modules/layout/templates/nav/index.tsx`)
  plaçait le logo dans une colonne `flex-1` centrale entre deux zones `flex-1` symétriques
  (identique sur tous les formats), et `SideMenu` (bouton "Menu") n'avait aucune icône ni aucune
  règle responsive - un pattern mobile affiché tel quel sur desktop, jamais corrigé depuis le
  scaffold Medusa d'origine.
  - **Première itération** (avant relecture des maquettes) : logo déplacé à gauche, icône
    hamburger ajoutée à "Menu" (masqué à partir de `small` via une nouvelle classe sur
    `SideMenu`), navigation desktop ajoutée avec liens directs vers les 6 vraies catégories.
  - **Demande explicite du propriétaire de se conformer aux maquettes initiales** (artifacts
    claude.ai, 6 pages : Accueil, Catalogue, Panier, Fiche produit, Mon compte, Paiement) - lecture
    de la maquette "Golden Market · Accueil" a révélé un vrai désaccord avec la première itération :
    la maquette prévoit une navigation desktop **générique** (Accueil / Catégories / Promotions /
    Suivre ma commande), pas des liens de catégorie, et des **boutons icône circulaires** pour
    Compte/Panier (avec badge de quantité sur le panier) plutôt que du texte ("Mon compte",
    "Cart (n)"). Corrigé en conséquence :
    - `Catégories` et `Promotions` pointent vers `/store` (aucune page dédiée n'existe pour l'un ou
      l'autre concept dans ce catalogue - `/store` porte déjà le filtre par catégorie et c'est déjà
      la cible de "Voir les promotions" ailleurs sur le site) ; `Suivre ma commande` pointe vers
      `/account/orders` (fonctionnalité réelle la plus proche, pas de suivi de commande invité par
      numéro).
    - Nouvelles icônes `account.tsx`/`shopping-bag.tsx` (`apps/storefront/src/modules/common/
      icons/`) répliquant exactement les tracés SVG de la maquette, boutons icône stylés avec les
      tokens de couleur déjà en place (`gm-on-violet`, `gm-terracotta`) plutôt que des couleurs
      codées en dur.
    - **Découverte au passage (hors périmètre, non corrigée)** : `CartDropdown`
      (`apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`) contient encore du
      texte anglais scaffold non traduit ("Cart", "Subtotal (excl. taxes)", "Go to cart",
      "Quantity:", "Remove", "Your shopping bag is empty.") - jamais couvert par la traduction
      complète de la Phase 1.5. Signalé au propriétaire, pas corrigé (hors du périmètre de ce
      correctif de header).
  - **Favicon** : toujours le triangle par défaut du scaffold Next.js/Vercel, jamais remplacé.
    Généré à partir du mark du logo (`public/logo/logo-white.png`, recadré par détection de la
    bande de lignes vides séparant l'icône du texte "Golden Market" en dessous - `PIL.Image.
    getbbox()` seul aurait inclus le texte). `public/favicon.ico` (16/32/48px, fallback legacy) et
    `src/app/icon.png` (512px, convention App Router Next.js, auto-détecté sans changement de
    code) tous deux régénérés depuis ce mark recadré.
  - **Accès aux artifacts claude.ai coupé en session** juste après un `/login` du propriétaire
    (a déconnecté le Remote Control) - plus aucun artifact accessible, y compris celui déjà lu
    quelques échanges plus tôt. Confirmé que ce n'est pas un problème de retry (`list` renvoie
    "aucun artifact publié" pour tous les scopes). Décision du propriétaire : continuer avec la
    seule maquette déjà lue (Accueil) plutôt qu'attendre le rétablissement de l'accès. **Reste à
    faire** : auditer les 5 autres maquettes (Catalogue, Panier, Fiche produit, Mon compte,
    Paiement) une fois l'accès aux artifacts rétabli - probablement d'autres écarts du même type
    (texte générique vs contenu réel, icônes vs texte) sur ces pages, non vérifiés à ce jour.
  - **Vérifié** : 8/8 tests Playwright stables (2 nouveaux, conformité header desktop/mobile),
    build de production storefront sans erreur (`/icon.png` bien détecté comme route statique).

- **2026-08-30 (matin, tests E2E Playwright + timeout CI/CD)** - Question directe du propriétaire
  ("Can you write full browser tests using playwright?"), première fois qu'un test navigateur réel
  existe pour ce projet (Phase 4/5 encore vides jusque-là). Stack de dev locale relancée (Postgres/
  Redis Docker déjà présents, backend/storefront redémarrés manuellement), `@playwright/test`
  installé comme devDependency du storefront (pas un script jetable). `apps/storefront/e2e/
  storefront.spec.ts` (3 tests : redirection région, contenu réel, prix XOF) et `checkout.spec.ts`
  (parcours d'achat complet, s'appuyant sur les `data-testid` déjà présents dans le scaffold).
  - **Bugs de test corrigés en écrivant la suite** (pas des bugs applicatifs) : le code postal était
    un champ requis jamais rempli, bloquant silencieusement la soumission du formulaire d'adresse
    (Medusa ne montre pas d'erreur explicite pour un champ HTML natif invalide) ; l'assertion sur le
    prix (`/F ?CFA/`) échouait à cause des espaces insécables Unicode (U+202F) qu'`Intl.
    NumberFormat` insère et qu'un `\s` littéral ne capture pas - corrigé en utilisant le
    `data-testid="product-price"` dédié plutôt qu'un texte libre, qui échouait aussi en mode
    "tous les tests ensemble" à cause d'un conflit de sélecteur strict avec les prix des produits
    similaires affichés sur la même page.
  - **Vérifié réellement, pas seulement écrit** : 4/4 tests passent, exécuté deux fois de suite
    pour écarter un succès isolé, une vraie commande confirmée en base à chaque passage
    (`display_id` incrémenté, vérifié via `psql`).
  - **Incident système rencontré et diagnostiqué en cours de route** : le backend de dev local a
    été tué par OOM (poste de développement partagé avec de nombreux autres projets/conteneurs
    tournant en simultané, sans rapport avec ce dépôt) pendant que la suite tournait - diagnostiqué
    via `free -h` et l'exit code 137 dans les logs, corrigé en redémarrant le backend, pas un défaut
    des tests eux-mêmes.
  - **Incident CI/CD découvert en poussant la suite** : le push sur `staging` puis `main`
    (nécessaire, `@playwright/test` est une dépendance réelle du storefront) a déclenché les deux
    déploiements automatiques. Le déploiement **staging** a échoué après 40 minutes (limite
    `command_timeout` du workflow) - diagnostic : l'image `staging-golden-market-storefront` avait
    fini de se construire avec succès (confirmée présente via `docker images` sur le VPS), seule
    l'étape finale `docker compose up -d` n'a pas eu le temps de s'exécuter avant la coupure SSH.
    Corrigé en deux temps : démarrage manuel du conteneur storefront déjà construit (`docker compose
    up -d`, aucune perte de travail), puis `command_timeout` porté de 40 à 60 minutes dans les deux
    workflows pour absorber une marge de charge VPS future. Le déploiement **production** de la même
    session a réussi du premier coup (VPS moins chargé au moment de son exécution, en parallèle de
    staging).
  - **Reste ouvert** : la suite Playwright ne tourne pas encore en CI (nécessiterait un `webServer`
    Playwright ou un environnement de test dédié avec backend/DB - hors périmètre de cette session,
    conçue pour tourner en local pour l'instant, voir Phase 4).

- **2026-08-30 (déploiement production, clôture Phase 3)** - Après validation du staging par le
  propriétaire ("Yes. Go ahead" à la question explicite sur le test de checkout, puis "Go head with
  the production deployment"), `staging` mergée dans `main` (fast-forward, 8 commits) et poussée.
  VPS provisionné pour `/opt/golden-market/production` en suivant exactement la même procédure que
  staging (répertoire créé par le propriétaire via `sudo`, clonage de `main`, secrets réels générés
  - JWT/cookie/Postgres distincts de staging, `RESEND_API_KEY` et `ORANGE_MONEY_NUMBER` réutilisés
  tels quels par décision explicite du propriétaire, admin `abdoulazizzorom@gmail.com` avec le même
  mot de passe qu'en staging par décision explicite du propriétaire malgré la recommandation
  contraire).
  - **Incident TLS certbot (résolu)** : la première tentative (`certbot --apache -d golden-market.co
    -d www.golden-market.co`) a échoué sur un conflit de vhost lors de la tentative d'installation
    sur `www.golden-market.co` (aucun vhost existant pour ce nom) - or certbot fait un rollback
    transactionnel de **toute** sa session en cas d'échec, y compris le certificat déjà déployé
    avec succès sur `golden-market.co` juste avant. Résultat temporaire : Apache servait le
    certificat par défaut d'un autre site du VPS partagé (`biblio.golden-technologies.com`) pour
    toute requête HTTPS sur `golden-market.co`. Diagnostiqué via `apache2ctl -S` (absence du vhost
    dans la liste `*:443`) et confirmation que le fichier `golden-market.co-le-ssl.conf` avait
    disparu de `sites-available`. Corrigé en relançant `certbot --apache -d golden-market.co` seul
    (sans `www`, qui n'était pas un prérequis) - a créé un second lignage de certificat
    (`golden-market.co-0001`, cohabite sans problème avec l'éventuel premier). Vérifié après coup :
    `curl -v` confirme le bon certificat servi, `apache2ctl -S` liste bien `golden-market.co` sous
    `*:443`.
  - **Cron de sauvegarde production** : même contournement que pour staging (`/opt/backups`
    appartient à `root`, propriétaire injoignable pour un `sudo` interactif au moment de cette
    étape) - dumps stockés sous `/opt/golden-market/production/backups/` (untracked, survit à
    `git reset --hard`). Rétention 30 jours, cron quotidien à 4h (décalé d'une heure par rapport à
    staging). Testé : dump réel produit (57 Ko).
  - **Aucune commande de test placée en production** (contrairement au test API complet fait sur
    staging) - décision délibérée pour ne pas polluer les données réelles du marchand. Vérification
    limitée à : site HTTPS joignable avec le bon certificat, redirection `/` → `/bf`, contenu réel
    affiché (branding + catégories), région/catalogue/catégories/option de livraison identiques à
    staging (Burkina Faso, 29 produits, 6 catégories, 1 option de livraison), 4 conteneurs stables
    plusieurs heures après déploiement.
  - **Reste ouvert** : vrai test de checkout au navigateur (jamais fait, ni sur staging ni sur
    production - extension Chrome à reconnecter) ; harmoniser le chemin des sauvegardes avec
    `/opt/backups` si le propriétaire retrouve un accès `sudo` interactif (déjà fait pour staging
    après coup, voir entrée précédente).

- **2026-08-29 (soir, validation finale staging, Phase 3)** - Suite directe de l'entrée
  précédente. Deux bugs réels supplémentaires trouvés en poussant le pipeline CI/CD jusqu'au bout
  (jamais testé de bout en bout avant ce soir) :
  - **Race BuildKit** : `docker compose build` (sans argument de service) construisait backend et
    storefront en parallèle - même contexte de monorepo, même `package-lock.json`, panne
    aléatoire `ETXTBSY` sur un binaire postinstall (`esbuild`) quand les deux `npm ci`
    s'exécutent en même temps. Corrigé : build toujours séquentiel (`build backend` puis, après
    migration/seed/démarrage du backend, `build storefront`) - ordre qui corrige aussi un défaut
    de conception plus profond : le storefront ne doit être construit qu'une fois le backend
    joignable (`next build` fait de vraies requêtes réseau via `generateStaticParams`), jamais
    avant, comme le faisait le script précédent.
  - **Scripts de seed cassés en production** : `medusa exec ./src/scripts/*.ts` échoue sur
    l'image compilée (seule la sortie `.js` existe dans `.medusa/server`) - bug déjà documenté
    dans ce fichier (entrée Task 5 du 2026-08-27/28) mais jamais corrigé dans le code, seulement
    contourné à la main. Corrigé cette fois dans `apps/backend/package.json` : chaque script
    tente d'abord le `.ts` (dev) puis retombe sur le `.js` compilé (prod).
  - **Résultat** : premier déploiement CI/CD 100% automatisé réussi de bout en bout sur staging.
    Base reseedée proprement (région Burkina Faso uniquement, 29 produits réels, 6 catégories,
    1 option de livraison) - `db:migrate:scripts` confirmé sûr à répéter maintenant que le script
    de démo est supprimé.
  - **Clé publishable et compte admin recréés** après la remise à zéro de la base (perdus avec
    le `DROP DATABASE` de la tentative précédente) - positionnés directement sur le VPS, jamais
    commités.
  - **Test de checkout complet fait via l'API** (extension Chrome indisponible pour un test
    visuel réel - à refaire au navigateur dès que possible, voir mémoire session
    `feedback_visual_verification_required`) : panier → article (3000 XOF) → adresse Ouagadougou
    → option de livraison unique à 0 FCFA → session de paiement Orange Money (instructions
    correctes : `+226 64 94 73 73`, "Golden Market") → commande complétée
    (`order_01M17V6ET8AMEHNNW1BP2P9J5X`, `display_id 1`, statut `pending`, paiement non capturé -
    comportement attendu, capture manuelle par le marchand). Aucune erreur dans les logs du
    subscriber d'email de confirmation (clé Resend réelle désormais configurée).
  - **Cron de sauvegarde installé et testé** (dump réel produit, 64 Ko, contenant la commande de
    test ci-dessus). `/opt/backups` et `/var/log` appartiennent à `root` sur ce VPS partagé ; le
    propriétaire n'avait accès qu'à un terminal mobile pendant la session (pas de moyen simple de
    lancer un `sudo` interactif) - contourné temporairement en stockant dumps et logs sous
    `/opt/golden-market/staging/backups/` (déjà `admin:admin`). Le propriétaire a ensuite créé
    `/opt/backups/golden-market/staging` lui-même (accès root retrouvé) : dumps déplacés au
    chemin définitif prévu par le plan, cron mis à jour en conséquence. Seul le fichier de log
    reste à l'écart de `/var/log` (toujours `root`), stocké à côté des dumps
    (`/opt/backups/golden-market/staging/backup.log`) plutôt qu'à l'emplacement du plan - écart
    mineur, sans conséquence fonctionnelle. Rétention 7 jours, cron quotidien à 3h.
  - **Reste ouvert** : provisionner `/opt/golden-market/production` (même procédure) après
    validation explicite de ce staging par le propriétaire ; son propre cron (30 jours) ; vrai
    test de checkout au navigateur (extension Chrome à reconnecter).

- **2026-08-29 (premier déploiement staging réel, automatisation CI/CD, Phase 3)** - VPS
  provisionné (`/opt/golden-market/staging`, clé SSH dédiée `golden_market_deploy` distincte
  d'une clé personnelle, secrets GitHub Actions `VPS_HOST`/`VPS_SSH_USER`/`VPS_SSH_PRIVATE_KEY`
  configurés). Premier déploiement fait manuellement par nécessité (les secrets GitHub
  n'existaient pas encore), a révélé un bug réel non lié à la Phase 3 :
  - **`initial-data-seed.ts` (scaffold Medusa jamais nettoyé)** : ce script de démo
    (`apps/backend/src/migration-scripts/`, région Europe + 4 produits T-Shirt/Sweatshirt de
    démo - déjà connu comme résidu en dev, voir journal Phase 1.5) se réexécute automatiquement
    dès que `medusa db:migrate:scripts` tourne sur une base neuve, ce qui a pollué la première
    tentative de staging. **Supprimé définitivement** (commit sur `staging`) - les vrais scripts
    de seed du projet (`seed-region-bf.ts`, `import-catalog.ts`, `seed-categories-bf.ts`, tous
    idempotents) n'en dépendent pas.
  - **Base staging réinitialisée** (`DROP DATABASE` / `CREATE DATABASE` via `psql` dans le
    conteneur Postgres - aucune donnée réelle perdue, environnement neuf) puis reseedée
    proprement via le pipeline CI/CD corrigé ci-dessous.
  - **Automatisation étendue** (demande explicite du propriétaire : ne plus jamais rejouer ces
    étapes à la main pour la production) : `.github/workflows/deploy-{staging,production}.yml`
    exécutent désormais aussi `db:migrate:scripts`, `seed:region-bf`, `import:catalog` (ignoré
    silencieusement si `CATALOG_PATH` ne pointe vers aucun fichier - le fichier Excel du
    catalogue n'est jamais commité, placé manuellement une fois par environnement) et
    `seed:categories-bf`, dans cet ordre, à chaque déploiement. Tous idempotents (vérifient
    l'existant par nom/handle) - sûrs à rejouer indéfiniment, y compris le tout premier
    déploiement d'un environnement neuf.
  - **Reste manuel, structurellement** (le pipeline dépend de leur existence préalable) :
    création des répertoires `/opt/golden-market/*`, `.env.deploy`/`apps/backend/.env` avec les
    vrais secrets, vhost Apache + certbot (chicken-and-egg avec le DNS/TLS), les 3 secrets
    GitHub Actions eux-mêmes, création du premier utilisateur admin (`medusa user`, volontairement
    non automatisé - pas d'identifiants admin en clair dans la CI), cron de sauvegarde.
  - **Bug bloquant découvert et résolu en session** : le provider `resend`
    (`apps/backend/src/modules/resend/service.ts`) a une validation stricte
    (`validateOptions`) qui fait planter tout le démarrage du backend si `RESEND_API_KEY` est
    vide - pas un échec silencieux à l'envoi comme documenté ailleurs pour le comportement prévu
    hors-Resend. Clé réelle fournie par le propriétaire et positionnée dans `apps/backend/.env`
    de staging (jamais commitée).
  - **Vérifié en direct** : `https://staging.golden-market.co` répond en HTTPS valide (certbot),
    redirection HTTP→HTTPS confirmée (301), `X-Forwarded-For`/`X-Forwarded-Proto` bien copiés
    dans le vhost `-le-ssl.conf` généré par certbot, route `/static` Apache dédiée aux images en
    place, backend accessible via le reverse proxy (`/store/products` répond, 400 attendu sans
    clé publishable dans l'en-tête - confirme le bon routage). Clé publishable réelle déjà
    auto-créée par Medusa et liée au Default Sales Channel, positionnée dans `.env.deploy`.
  **Reste à faire avant validation finale du staging** : fournir le fichier Excel du catalogue
  (`Golden Market - Catalogue des produits.xlsx`, jamais commité) pour déclencher l'import réel
  des 29 produits ; construire et démarrer le service `storefront` (bloqué sur la région/le
  catalogue jusqu'ici) ; cron de sauvegarde restant à installer.

- **2026-08-29 (persistance des images produit, Phase 3)** - Investigation déclenchée par une
  question directe du propriétaire ("on ne doit pas perdre les images à chaque déploiement").
  Root cause identifiée par lecture du code source de `@medusajs/file-local`
  (`node_modules/@medusajs/file-local/dist/services/local-file.js`) et de `@medusajs/medusa`
  (aucune occurrence de `express.static` dans tout le package - confirmé par grep) : le module
  `file` n'était configuré nulle part dans `medusa-config.ts`, donc file-local tournait sur ses
  valeurs par défaut (`backend_url: "http://localhost:9000/static"`, `upload_dir: "static"`
  relatif à `process.cwd()`) - et rien, ni Medusa lui-même ni Apache, ne sert jamais ce chemin.
  Les images produit étaient donc cassées par construction, indépendamment de toute question de
  redéploiement (bug préexistant, pas introduit par la Phase 3). Le commentaire déjà présent dans
  `import-catalog.ts` (fonction `fixImageUrl`) documentait le symptôme (mauvais port en dev) sans
  corriger la cause racine.
  - **Choix tranché avec le propriétaire** : volume Docker + route Apache (pas de bascule vers un
    stockage objet S3-compatible - pas de compte/coût externe supplémentaire, cohérent avec
    l'infra VPS mono-serveur existante).
  - **Correctifs** : `apps/backend/medusa-config.ts` - module `file` configuré explicitement
    (`@medusajs/medusa/file` + provider `@medusajs/medusa/file-local`), `backend_url` construit
    depuis `MEDUSA_BACKEND_PUBLIC_URL` (fallback `http://localhost:9000` en dev, comportement
    inchangé en local). `docker-compose.prod.yml` - `MEDUSA_BACKEND_PUBLIC_URL` réutilise la même
    valeur que `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (même domaine public que le storefront) ; bind
    mount `./static-data:/app/static` sur le service `backend` (bind mount et non volume nommé
    Docker, délibérément : Apache tourne sur l'hôte, pas dans un conteneur, et doit lire ce même
    répertoire directement). `deploy/apache/*.conf` (staging et production) - `Alias /static/`
    vers `/opt/golden-market/{staging,production}/static-data/` avec `ProxyPass /static !` pour
    exclure ce chemin du reverse proxy vers le backend. `.gitignore` - `static-data/` ajouté (bind
    mount local, jamais commité, même traitement que `.env.deploy`).
  - **Vérifié** : `medusa build` repasse proprement (premier essai avait échoué -
    `@medusajs/medusa/file-local` ne s'utilise pas seul en `resolve` direct, il faut l'envelopper
    dans le module `@medusajs/medusa/file` avec un tableau `providers`, corrigé) ; suite unitaire
    toujours 40/40 verte ; `docker compose -f docker-compose.prod.yml --env-file ... config` valide
    sans erreur.
  - **Non fait dans ce lot, volontairement** : `fixImageUrl` dans `import-catalog.ts` (le
    contournement dev pour le port 9001) laissé en l'état - devenu inoffensif (no-op si
    `MEDUSA_BACKEND_PUBLIC_URL` est absent en dev, comportement par défaut inchangé) mais pas
    retiré, script sensible (tarifs de gros) hors périmètre de ce correctif ciblé.
  - Commité directement sur `staging` (pas de plan/subagent-driven-development pour ce
    correctif ciblé et déjà vérifié par build+tests - même traitement que les 3 correctifs
    TypeScript de la Task 3 originale de cette phase).

- **2026-08-27/28 (déploiement staging/production, Phase 3, artefacts de code)** - Design validé
  par brainstorming (`docs/superpowers/specs/2026-08-27-phase3-deploiement-staging-production-design.md`) :
  VPS unique partagé avec `n8n_automation`, Apache existant comme unique reverse proxy (pas de
  Traefik/Caddy), `docker-compose.prod.yml` unique paramétré par `.env.deploy` (préfixe `ENV_NAME`
  sur les noms de conteneurs, isolation réelle via le répertoire de déploiement), compte SSH `admin`
  existant réutilisé pour la CI/CD (décision explicite du propriétaire malgré le risque signalé -
  clé de déploiement avec accès sudo complet au VPS). Plan détaillé écrit
  (`docs/superpowers/plans/2026-08-27-phase3-deploiement-staging-production.md`), exécuté via
  `subagent-driven-development` dans un worktree isolé (`phase3-deploiement-staging-production`),
  8 tâches + une revue finale de branche (Opus) + un fix wave.
  - **Correctif préalable non planifié** : `medusa build` (jamais lancé en pratique avant cette
    phase, seul `medusa develop` l'avait été) échouait sur 3 erreurs TypeScript préexistantes sur
    `main`, sans rapport avec la Phase 3 - propriété `port` invalide dans `medusa-config.ts`
    (n'existe plus dans le type de `@medusajs/framework` 2.18.0), fichiers `__tests__/*.spec.ts`
    inclus dans la compilation `medusa build` (jamais utilisée par Jest, qui a sa propre
    transformation swc), et propriété `rules` (règle de prix de gros) invalide dans
    `import-catalog.ts` - traité avec l'accord explicite du propriétaire, correctif minimal et
    confirmé sans effet sur le comportement runtime (40/40 tests unitaires toujours verts, JS émis
    byte-identique pour le `@ts-expect-error`).
  - **Livrables** : `apps/backend/Dockerfile` et `apps/storefront/Dockerfile` (images construites
    sans `NODE_ENV=production`, secrets réels injectés seulement au runtime) ;
    `docker-compose.prod.yml` (Postgres/Redis dédiés sans port publié sur l'hôte,
    backend/storefront sur `127.0.0.1` uniquement, `network: host` sur le build du storefront -
    `next build` fait de vrais appels réseau au backend via `generateStaticParams` - et
    `?sslmode=disable` sur `DATABASE_URL`, Postgres du conteneur ne servant pas TLS) ;
    `deploy/backup-postgres.sh` (rétention 7 jours staging / 30 jours production) ;
    `deploy/apache/*.conf` (écrasement de `X-Forwarded-For`, condition du rate limiting Phase 2) ;
    `.github/workflows/deploy-{staging,production}.yml`.
  - **3 défauts de plan découverts et corrigés pendant l'exécution** (au-delà des tâches
    prévues) : (1) le test bout en bout local du storefront échouait contre le domaine de staging
    réel (sert un autre site sur le VPS partagé, mismatch TLS) - contourné en pointant vers le
    backend de dev local seedé pour valider le mécanisme de build ; (2) le `.env` de test prescrit
    par le plan utilisait des CORS `localhost`, rejetées par le garde-fou Phase 2 dès que
    `NODE_ENV=production` (ce que fixe le compose) - corrigé en `127.0.0.1` ; (3) `medusa start` ne
    migre jamais automatiquement le schéma, donc l'ordre initialement prévu (démarrer puis migrer)
    plantait en boucle sur une base neuve - corrigé en migrant via un conteneur jetable avant le
    démarrage du démon.
  - **Revue finale de branche (Opus)** : verdict "Ready to merge: With fixes", 3 findings Critical
    - tous liés au fait que le correctif du point (3) ci-dessus n'avait jamais été répercuté ni
    dans le Runbook manuel du plan ni dans les workflows GitHub Actions (corrigé dans le fix wave,
    re-review scoped clean, aucune régression). 7 findings Important corrigés dans le même fix wave
    (en-tête `X-Forwarded-Proto` codé en dur "http" cassant la redirection région en HTTPS,
    vérification manquante du redirect HTTP→HTTPS, absence de `concurrency:` sur les workflows,
    absence de nettoyage d'images Docker - risque disque sur le VPS partagé avec `n8n_automation` -,
    `generateStaticParams` de la page catégories sans gestion d'erreur contrairement à la page
    produit, avertissement manquant sur le piège CORS `localhost`).
  - **Point ouvert différé** (pas un défaut introduit par cette phase) : les images produit
    (`file-local`, pas de module `file` configuré) seraient perdues à chaque redéploiement et
    persisteraient des URLs `localhost` inatteignables en base - à résoudre avant tout import de
    catalogue réel en staging/production, nécessite une décision de conception (domaine public,
    volume) avec le propriétaire.
  - Merge local (fast-forward, pas de conflit) dans `main`, worktree et branche nettoyés. Aucun
    push effectué. Branche `staging` créée et poussée sur `origin` (Task 1 du plan, confirmée
    explicitement avant push) - reste vide de commits applicatifs au-delà de ce que `main`
    contenait au moment de sa création.
  **Reste à faire (Runbook manuel, hors périmètre automatisable)** : provisionnement réel du VPS
  (répertoires `/opt/golden-market/{staging,production}`, secrets réels dont Orange Money/Resend de
  test pour staging), installation effective des vhosts Apache + certbot, secrets GitHub Actions,
  cron de sauvegarde, premier déploiement staging suivi d'une validation explicite du propriétaire
  avant tout déploiement production - jamais enchaîné automatiquement.

- **2026-08-27 (durcissement sécurité, Phase 2)** - Phase 2 clôturée via un plan dédié
  (`.superpowers/sdd/2026-08-27-phase2-durcissement-securite/`, non commité comme le reste
  de `.superpowers/`, dans `.gitignore`), 2 tâches de code plus cette clôture documentaire :
  - **Garde-fou de démarrage** : `apps/backend/src/lib/assert-production-config.ts`, fonction
    `assertProductionConfig(env)` appelée au démarrage de `medusa-config.ts` (commit
    `be80946`). Fait échouer le boot en production (`throw`) si `JWT_SECRET` ou
    `COOKIE_SECRET` sont absents, égaux à la valeur de dev `"supersecret"`, ou trop courts
    (< 32 caractères), ou si `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` contiennent
    `"localhost"`. No-op hors production - ce qui répond aux deux premiers points du
    `ROADMAP.md` Phase 2 (secrets forts, CORS restreints) : désormais imposé au démarrage,
    plus seulement documenté.
  - **Rate limiting du reset de mot de passe** : middleware Medusa
    (`apps/backend/src/api/middlewares.ts` et
    `apps/backend/src/api/middlewares/rate-limiter.ts`, commits `a565ccd` puis `c966629`)
    qui limite `POST /auth/customer/emailpass/reset-password` à 5 requêtes / 15 minutes par
    IP, via le module cache Redis déjà en place (pas de nouvelle dépendance). Comptage
    best-effort (pas d'incrément atomique) - jugé suffisant pour ce cas d'usage (protection
    contre l'abus, pas une garantie stricte). En cas de panne du cache Redis, le middleware
    "fail open" : il logue un warning et laisse passer la requête plutôt que de bloquer tous
    les resets de mot de passe - choix (fail-open vs fail-closed) explicitement validé par le
    propriétaire du dépôt après qu'une revue de sécurité automatique en a suggéré l'inverse,
    précisément parce que Redis est déjà une dépendance dure ailleurs dans ce backend (cache
    et event bus, sans repli) : une panne Redis casse de toute façon d'autres flux en même
    temps.
  - **Deux points déjà satisfaits sans action de code**, vérifiés pendant le cadrage de ce
    plan : le compte admin dédié en prod (déjà documenté dans `ARCHITECTURE.md` ligne 64,
    fait partie de la procédure de déploiement listée en Phase 3 du `ROADMAP.md`) et
    l'hygiène des fichiers `.env` / `.env.local` (déjà correctement ignorés par git dans les
    `.gitignore` respectifs).
  Phase 2 marquée **fait** dans `ROADMAP.md` et ci-dessus : les 5 points sont couverts, 3 par
  du code réel (secrets forts et CORS via `assertProductionConfig`, rate limiting via le
  middleware Redis) et 2 par vérification sans changement de code (compte admin, hygiène
  `.env`).
- **2026-08-24/27 (refonte visuelle du storefront, Phase 1.5)** — Spec de design créée et
  validée par brainstorming (`docs/superpowers/specs/2026-08-24-storefront-redesign-design.md`) :
  palette violet/or extraite de la charte existante, typographie Baloo 2 + Inter, bibliothèque
  de composants partagés. 4 plans d'implémentation écrits puis exécutés via
  `subagent-driven-development`, chacun revu et mergé séparément sur `main` : Fondation (tokens
  Tailwind, `Button`/`Badge`/`Chip`/`Heading`), Accueil/Catalogue/Fiche produit, Panier/Paiement,
  Compte. Détail des tâches et rulings dans `docs/superpowers/plans/2026-08-24-storefront-redesign-*.md`.
  Après les 4 merges, session de finition autonome (accord explicite du propriétaire pour
  continuer sans reconfirmation à chaque étape) :
  - Accessibilité clavier du `Chip` (`span` → `button`, focus ring).
  - Vérification visuelle avec un vrai backend (jamais fait avant dans ce dépôt — voir mémoire
    session `feedback_visual_verification_required`) : a trouvé 3 bugs invisibles à `npm run
    build` seul — ordre d'import CSS cassant `next dev --turbopack` (mais pas le build webpack
    de prod), 500 sur un handle produit accentué (`params.handle` arrive percent-encodé, jamais
    décodé), chevauchement de texte dans le footer en mobile.
  - Branding Medusa résiduel retiré (composant `MedusaCTA`, icône, mentions footer), storefront
    traduit intégralement en français (nav, boutons, fiche produit, sélecteur de pays, panier,
    checkout, compte) — hors Profil/Adresses/Commandes et labels de champs individuels, hors
    périmètre explicite des 4 plans.
  - ~20 constats mineurs parqués dans les ledgers des 4 plans traités en un lot dédié (revu par
    le propriétaire avant traitement).
  - Vraie taxonomie de catégories créée (`apps/backend/src/scripts/seed-categories-bf.ts`,
    idempotent) : les 4 catégories de démo Medusa (Shirts/Sweatshirts/Merch/Pants, restées vides
    depuis l'import du vrai catalogue) remplacées par 6 catégories construites à partir des 29
    produits réels (Électronique et Gadgets, Maison et Cuisine, Beauté et Bien-être, Mode et
    Bagagerie, Jouets et Enfants, Équipement commercial et Boucherie). Bug Medusa découvert au
    passage : un `&` dans le nom d'une catégorie est conservé tel quel dans le handle généré
    (`maison-&-cuisine`), ce qui fait 404 sur la route catégorie du storefront — noms choisis
    avec « et » pour l'éviter (voir mémoire session `project_golden_market_category_handle_ampersand_bug`).
  - Fond du menu mobile retinté aux couleurs `gm-*` (était resté aux tokens Medusa génériques,
    seul point de la refonte non couvert par un plan explicite).
  **Point ouvert** : le contenu de l'onglet « Livraison et retours » (délais, politique
  d'échange/retour) reste une traduction du texte de démo Medusa d'origine, jamais confronté à
  la vraie politique du propriétaire — à vérifier avant lancement. Voir aussi Phase différée
  ci-dessus pour les TODOs hérités du template (Toaster, gestion email/mot de passe du compte)
  restés hors périmètre de cette refonte.
- **2026-08-16** — Analyse approfondie du dépôt effectuée. Constat clé : un seul
  commit d'initialisation (scaffold quasi intact) + travail non commité sur le
  provider `orange-money-manual` (bug bloquant : deux `export default` dans le même
  fichier). Décisions de périmètre prises avec l'utilisateur : MVP resserré (pas de
  sync n8n ni bouton WhatsApp au lancement), hébergement VPS + Docker, pas de date
  fixe, notification marchand via webhook n8n → WhatsApp, notification client via
  provider email Medusa. `ROADMAP.md` créé et validé. `HANDOFF.md` créé (ce fichier).
  Prochaine étape : plan d'implémentation détaillé de la Phase 0 via le skill
  `writing-plans`.
- **2026-08-16 (suite)** — Plan d'implémentation Phase 0 écrit (le plan détaillé de
  cette phase, écrit pendant la session — fichier de travail non commité :
  `docs/` n'est pas suivi par git, `.superpowers/` est dans `.gitignore`), 11 tâches
  (dont une ajoutée après coup) et exécuté via `subagent-driven-development`,
  directement sur `main`
  (décision utilisateur). Tasks 1 à 8 terminées et validées en review (détail des
  rulings conservé dans le ledger de session, lui aussi non commité). En cours :
  Tasks 9-10. Pendant l'exécution, l'utilisateur a
  fourni le catalogue produits réel (`Golden Market - Catalogue des produits.xlsx`,
  racine du dépôt, non versionné) : ~29 produits sur 2 feuilles (vente express / vente
  sur commande), 29 images intégrées. Décision : import automatisé (pas de saisie
  manuelle) via 2 collections Medusa + une règle de prix sur le variant pour le groupe
  client « Grossistes » (prix de gros, pas une price list — voir plus bas) —
  détail dans `ROADMAP.md` Phase 1. Ce travail sera traité comme un plan séparé après
  la clôture de la Phase 0.
- **2026-08-16 (clôture Phase 0)** — Task 9 (page de réinitialisation de mot de passe)
  et Task 10 (vérification E2E) terminées. Parcours complet rejoué en direct (backend
  `:9001` + storefront `:8001`, Postgres/Redis Docker) : panier → checkout → sélection
  Orange Money → instructions affichées au checkout (numéro, montant, texte FR) →
  commande passée → page de confirmation affichant les mêmes instructions Orange Money
  (Task 3 confirmé) → log backend `Commande ... placée — N8N_ORDER_WEBHOOK_URL non
  configuré, notification marchand ignorée` (fallback Task 2 propre, sans erreur) →
  admin Medusa : commande retrouvée, paiement `pending`, capture manuelle effectuée,
  passage à `Captured` / `paid` confirmé (`POST /admin/payments/.../capture` → 200).
  Suite de tests unitaires : 5 suites / 10 tests, tous verts (Tasks 1, 2, 4, 5, 6).
  Email de confirmation client (Task 5) : tentative bien déclenchée mais échoue
  proprement (log d'erreur explicite, capturé par le try/catch, ne bloque pas la
  commande) faute de `RESEND_API_KEY` réelle dans ce sandbox — vérification live de
  la réception email **différée à la Phase 5** (déjà signalé comme lacune connue
  depuis la review de la Task 9, pas une régression).
  **Bug non planifié découvert pendant la vérification** : le bouton « Place order »
  du storefront (`apps/storefront/src/modules/checkout/components/payment-button/index.tsx`,
  code du scaffold initial, jamais touché par aucune tâche de ce plan) ne gère pas le
  provider Orange Money dans son `switch` — seuls `isStripeLike` et `isManual` sont
  couverts, donc le bouton reste bloqué sur « Select a payment method » (disabled) dès
  qu'Orange Money est sélectionné, empêchant tout client réel de finaliser sa commande
  par ce moyen de paiement. Contourné temporairement (patch local non commité, retiré
  après usage) le temps de vérifier le reste du parcours ; **ce n'est pas un artefact
  Playwright/DOM** (le bouton est un vrai `<button disabled>` React, confirmé par
  lecture du code et par le comportement live) — c'est un vrai défaut applicatif, à
  corriger avant tout lancement réel. Recommandation : créer une tâche dédiée (ajouter
  un `case isOrangeMoney(...)` réutilisant `ManualTestPaymentButton`, les instructions
  de paiement Orange Money n'exigeant pas de saisie carte côté client) et l'inscrire
  dans `ROADMAP.md`. Par contraste, le flux de capture admin (dialogue de confirmation
  Radix) a fonctionné sans aucune friction d'automatisation ; le seul bruit console
  observé était un warning `validateDOMNesting` préexistant dans le composant
  `CostBreakdown` de l'admin Medusa lui-même, sans rapport avec ce plan.
  **Reste ouvert côté n8n** : le contrat exact du payload webhook (URL, méthode,
  structure JSON envoyée à `N8N_ORDER_WEBHOOK_URL`) n'a jamais été validé contre le
  dépôt `n8n_automation` — signalé depuis la Task 2, toujours non résolu. À faire avant
  de configurer une vraie URL n8n en production.
  Phase 0 marquée **fait** : les 5 points du `ROADMAP.md` sont couverts et vérifiés de
  bout en bout ; le bug du bouton « Place order » ci-dessus a été traité en Task 11
  (ajoutée après coup au plan, qui en compte donc 11 au lieu de 10).
- **2026-08-16 (Task 11)** — Correction du bug « Place order » décrit ci-dessus : ajout
  d'un `case isOrangeMoney(...)` réutilisant `ManualTestPaymentButton` dans
  `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`
  (commit `76f4973`, « Corrige le bouton "Place order" resté désactivé pour Orange
  Money »). Le bug ne reste donc plus un blocage réel — le paragraphe ci-dessus
  documente son historique (découverte, cause, contournement temporaire) mais est
  résolu depuis ce commit.
- **2026-08-16 (Phase 1)** — Phase 1 clôturée : catalogue et région Burkina Faso
  complètement implémentés via deux scripts idempotents (`seed-region-bf.ts`,
  `import-catalog.ts`). Livrables : région Burkina Faso (devise XOF, seul Orange Money
  comme payment provider, lieu de stock et fulfillment point, tax region), 29 produits
  réels importés depuis le fichier Excel « Golden Market - Catalogue des produits.xlsx »
  avec images intégrées (22 « Vente express » + 7 « Vente sur commande »), deux collections
  Medusa correspondantes, et customer group « Grossistes » pour le tarif de gros via une
  règle de prix sur le variant (pas une price list — voir avertissement plus bas).
  **Point ouvert intentionnel : la livraison est tarifiée à 0 XOF** (placeholder
  volontaire — le merchant négocie le coût réel de livraison après la commande via
  WhatsApp). Ce n'est pas un bug ; si une session future cherche à « fixer » ce prix,
  consulter d'abord l'utilisateur. Scripts ré-exécutables sans risque de doublon
  (vérification par nom/titre avant création).
- **2026-08-16 (Task 6 — vérification bout en bout)** — Storefront configuré
  (`apps/storefront/.env.local` : `NEXT_PUBLIC_DEFAULT_REGION=bf`, fichier gitignored,
  positionné manuellement) et parcours d'achat réel rejoué en direct (backend `:9001` +
  storefront `:8001`) : redirection `/` → `/bf` confirmée, 33 produits renvoyés par
  `/store/products` dont 29 réels (22 « Vente express » + 7 « Vente sur commande »,
  comptage vérifié via l'API par `collection_id`) + 4 produits de démo scaffold
  toujours présents (T-Shirt/Sweatpants/Shorts/Sweatshirt — non nettoyés, hors périmètre
  de ce plan) ; image produit vérifiée chargée (`naturalWidth` non nul) ; ajout au panier
  → checkout → option « Livraison — à convenir avec le marchand » sélectionnée à
  **F CFA 0** exact → Orange Money seul moyen de paiement proposé (aucun Stripe, aucun
  manuel générique) → commande passée avec succès, page de confirmation affichée
  (`order_...`, display_id 3, total 975 000 XOF, `payment_status: authorized`,
  `provider_id: pp_orange-money-manual_orange-money-manual`). Clé publishable du
  storefront déjà correctement liée au *Default Sales Channel* (vérifié via
  `/admin/api-keys`, aucune correction nécessaire).
  **Bug de données découvert et corrigé (hors scope des scripts Phase 1)** : le
  fulfillment set « European Warehouse delivery » avait une service zone renommée
  « Europe + Burkina Faso » avec un `geo_zone` `bf` orphelin (créé le 2026-08-12,
  donc résidu de la Phase 0 — ni `seed-region-bf.ts` ni `import-catalog.ts` ne touchent
  ce fulfillment set, vérifié par lecture du code). Conséquence concrète : le checkout
  BF proposait 3 options de livraison au lieu d'une seule — « Standard Shipping » et
  « Express Shipping » (du warehouse européen, prix `F CFA NaN` faute de prix XOF) en
  plus de la bonne option à 0 FCFA. Corrigé en direct via l'API admin
  (`POST /admin/fulfillment-sets/:id/service-zones/:zone_id`) : retrait du geo_zone
  `bf`, renommage de la zone en « Europe ». Après correction, `/store/shipping-options`
  ne renvoie plus que la bonne option. Un cache de fetch Next.js (disque,
  `.next/cache/fetch-cache`) a nécessité un redémarrage du storefront pour refléter le
  changement — comportement de cache normal, pas un bug applicatif.
  **Étape 4 (optionnelle) entièrement vérifiée, pas seulement documentée en limite** :
  le tarif de gros n'est pas implémenté via une `PriceList` Medusa (aucune trouvée sur
  `/admin/price-lists`) mais via une règle de prix directement sur le variant
  (`rules: { "customer.groups.id": ... }` dans `import-catalog.ts`). Client de test créé
  (`task6-grossiste@golden-market.co`), ajouté au groupe « Grossistes », connecté sur le
  vrai storefront (`/bf/account`) : le prix affiché passe de F CFA 975 000 (anonyme) à
  F CFA 875 000 (connecté, groupe Grossistes) sur la fiche produit et sur les produits
  liés — confirmé en direct dans l'UI, pas seulement via l'API.
  Comptes de vérification créés dans cette session (dev uniquement, non documentés comme
  identifiants permanents) : admin `task6-verify@golden-market.co`, client
  `task6-grossiste@golden-market.co`. Aucun code applicatif modifié (conforme au
  périmètre de la tâche) ; seule modification de fichier suivi par git : ce journal.
- **2026-08-16/17 (revue finale Phase 1 + correctif)** — La revue finale sur l'ensemble
  de la branche du plan « catalogue-region-bf » a trouvé un bug réel non détecté par la
  vérification E2E de la Task 6 : les 29 produits importés n'avaient pas de
  `shipping_profile_id`, donc Medusa les traitait silencieusement comme ne nécessitant
  pas de livraison (`requires_shipping: false`) — la commande de test avait donc réussi
  sans jamais réellement valider le flux de livraison. Corrigé : `import-catalog.ts`
  résout désormais le shipping profile par défaut et le passe à chaque produit créé ;
  les 29 produits déjà en base ont été réparés en direct (lien ajouté, vérifié 29/29).
  Autres correctifs du même lot : dédoublonnage de la devise XOF en cas de relance
  partielle de `seed-region-bf.ts`, `apps/backend/static/` ajouté au `.gitignore`
  (images uploadées, 7.5 Mo, non versionné), `NEXT_PUBLIC_DEFAULT_REGION` documenté
  dans `AGENTS.md` et rendu obligatoire au démarrage du storefront
  (`check-env-variables.js`), et durcissements sur `parse-catalog.ts` (association
  image/ligne par `Math.floor` au lieu de `Math.round`, vérification prix non-finis).
  `ROADMAP.md` corrigé : la case « retirer les régions de démo Europe » a été décochée
  (jamais fait, contrairement à ce qu'elle affirmait) et scindée en un item séparé.
  Revue ciblée du correctif : propre, aucun point bloquant résiduel.
- **2026-08-17 (réécriture d'historique git)** — L'utilisateur a signalé que Claude ne
  doit **jamais** être ajouté comme co-auteur dans les commits (préférence déjà énoncée
  avant cette session mais non documentée). Les 27 commits de la session portant la
  ligne `Co-Authored-By: Claude...` ont été réécrits via `git filter-repo` (hashes
  changés, contenu des fichiers inchangé) puis poussés en force
  (`git push --force-with-lease`) sur `origin/main`
  (`git@github.com:Abdazz/Golden-Market.git`, ajouté par l'utilisateur pendant la
  session). Vérifié après coup via l'API GitHub : aucune trace de Claude comme auteur
  ou co-auteur sur aucun commit. **Convention pour la suite : ne jamais inclure de
  trailer `Co-Authored-By: Claude...` dans un commit de ce dépôt, y compris dans les
  instructions données à un sous-agent qui committe.** Note : le panneau
  « Contributors » de la page d'accueil GitHub peut continuer à afficher « claude »
  pendant un moment après une réécriture d'historique — c'est un cache d'affichage
  asynchrone côté GitHub, indépendant des données réelles (déjà vérifiées propres via
  l'API `/commits` et `/contributors`), pas un signe d'échec de la correction.
