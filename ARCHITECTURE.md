# Golden Market — Plateforme e-commerce (Medusa)

Document d'architecture — à mettre à jour à chaque décision structurante.

## Contexte

Golden Market vend au Burkina Faso (FCFA/XOF). Canal historique : WhatsApp via un agent n8n
(voir le dépôt `n8n` — workflows dans le volume Docker de n8n, source de vérité :
`guide-golden-market-agent.md`). Ce dépôt ajoute la **plateforme e-commerce** :

- **Medusa v2 (backend)** : produits, régions, paniers, commandes, promotions — API Store/Admin.
- **Admin Medusa** : back-office produits/commandes/clients (servi par le backend, `/app`).
- **Storefront Next.js** : boutique vitrine + panier.

Décisions actées (à ne pas reprendre sans discussion) :

1. **Nouveau dépôt dédié** — ce dépôt est applicatif (Medusa), `n8n` reste l'infra seule.
2. **Base dédiée** `medusa-backend` pour Medusa ; le catalogue existant (`public.products` /
   `product_images` dans la base n8n) sera **migré une seule fois** (script d'import ci-dessous).
3. **Agent n8n WhatsApp conservé tel quel** pour l'instant : il continue de lire/écrire
   `public.products` et `public.orders`. Une **synchronisation catalogue Medusa → `public.products`**
   est donc nécessaire (voir « Synchronisation »).
4. **Paiement manuel** : pas d'API Mobile Money. Flux : commande créée → confirmation humaine.

## Stack et ports (développement local)

| Composant | Port | Accès |
|---|---|---|
| Backend Medusa (`apps/backend`) | `9001` | API : `http://localhost:9001` — Admin : `http://localhost:9001/app` |
| Storefront (`apps/storefront`) | `8001` | `http://localhost:8001` |
| Postgres (Docker) | `5433` (hôte) → `5432` | base `medusa-backend`, user `medusa` |
| Redis (Docker) | `6379` | cache + event bus Medusa |

> Les ports par défaut Medusa (9000) et Next (8000) sont **occupés sur cette machine** par d'autres
> conteneurs (`pgadmin`, `chatbot`) — d'où le choix de 9001/8001. Config port : `PORT` dans
> `apps/backend/.env` et `-p 8001` au lancement du storefront.
>
> Le backend et le storefront tournent **sur l'hôte** (`npm run dev`) ; seuls Postgres et Redis sont
> conteneurisés (`docker-compose.yml` à la racine). Pour la prod VPS, tout deviendra conteneurisé
> (tâche à venir).

## Commandes de développement

```bash
docker compose up -d                      # infra : postgres (5433) + redis (6379)

# Backend (depuis apps/backend)
npm run dev                               # medusa develop, hot reload
npx medusa db:migrate                     # migrations + scripts de migration (seed inclus)
npx medusa user -e admin@golden-market.co -p 'mdp'   # créer le compte admin

# Storefront (depuis apps/storefront)
npm run dev -- -p 8001                    # next dev (littéralement : npx next dev -p 8001)

# Arrêt : fuser -k 9001/tcp 8001/tcp (éviter pkill -f qui peut tuer le shell appelant)
```

## Configuration initiale (faite en local)

- Région **Burkina Faso** (`xof`, BF) créée — le storefront redirige par défaut sur `/dk` (région seed),
  le sélecteur de région permet de passer en BF.
- **Clé publishable** liée au *Default Sales Channel* (sinon `GET /store/products` renvoie 0 produit —
  piège connu, cf. AGENTS.md du projet Medusa).
- Identifiants admin locaux : `admin@golden-market.co` (dev uniquement, à changer en prod).

## Synchronisation catalogue Medusa → `public.products` (n8n)

L'agent n8n lit toujours `public.products`/`product_images` (base `golden_market`). Le back-office
Medusa est la nouvelle source de vérité du catalogue. Il faut donc **écrire en aval** :

- **Approche retenue** : workflow n8n périodique (ex. toutes les 30 min) qui appelle
  `GET /admin/products?fields=id,title,description,price.xof.*,stock` avec un token Admin Medusa
  (credential HTTP dans n8n) puis **upsert** dans `public.products`/`product_images`.
- Colonnes cibles : `name` ← title, `description`, `price` ← montant XOF ajusté (Medusa stocke
  l'unité monétaire en 1/100 ; diviser par 100), `stock_qty` ← inventaire du canal par défaut.
- Alternative si n8n tombe : job Medusa (`src/jobs/`) qui appelle un webhook n8n. **A construire**
  dans le dépôt `n8n` ; le guide doit alors être mis à jour (source de vérité).

## Migration du catalogue existant (one-shot)

Script Node dans `apps/backend/src/migration-scripts/` (ou script autonome) : lecture de la base
`golden_market` (schéma `public` : `products`, `product_images`) puis **création via Admin API**
(`POST /admin/products`, puis upload images Medusa + média, stock, sales channel). Produits de test
actuels (`Exemple Produit 1/2`) à migrer ou supprimer au choix. **A écrire.**

## Paiement manuel (flux retenu)

Aucun payment provider Mobile Money (décision actée). Comportement cible :

- Storefront : checkout complet, à l'étape paiement on affiche les **instructions Orange Money**
  statiques (numéro, nom — déjà présents dans `ORANGE_MONEY_*` de l'infra n8n).
- Commande créée en `pending` ; **subscriber Medusa** (`order.placed`) → notification du marchand
  (WhatsApp via webhook n8n, ou email).
- Confirmation manuelle dans l'admin (statut `paid`) ; le client est notifié de la confirmation
  livraison via le canal WhatsApp existant (agent n8n) ou un email template.
- Variante « Commander via WhatsApp » : bouton panier → message prérempli `wa.me` vers le numéro
  boutique ; la commande passe alors par l'agent n8n existant (flux `orders` actuel) **sans** passer
  par Medusa. Les deux canaux coexistent ; la réconciliation (optionnelle) viendra après.

## Références

- `AGENTS.md` (racine) : conventions du scaffold Medusa (commandes, off-limits : ne pas committer
  `.env*`, ne pas réécrire les migrations existantes, lint `@medusajs/*` obligatoire).
- Dépôt `n8n` : infra de prod, base `golden_market`, agent WhatsApp.