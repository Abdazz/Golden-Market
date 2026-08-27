# Phase 2 - Durcissement sécurité - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher un déploiement en production avec des secrets/CORS de développement, et limiter le débit de l'endpoint public de réinitialisation de mot de passe pour couper le vecteur d'abus/amplification d'emails.

**Architecture:** Deux garde-fous indépendants, tous deux dans `apps/backend` :
1. Une fonction de validation appelée au chargement de `medusa-config.ts` qui fait échouer le démarrage (`throw`) si `NODE_ENV=production` et que les secrets JWT/cookie ou les origines CORS ont encore des valeurs de développement.
2. Un middleware Medusa (`src/api/middlewares.ts`) qui limite `POST /auth/customer/emailpass/reset-password` à 5 requêtes / 15 minutes par IP, via le module `cache` (Redis) déjà en place - pas de nouvelle dépendance.

**Tech Stack:** Medusa 2.18 (`@medusajs/framework/http`, `@medusajs/framework/utils`), TypeScript, Jest (`@swc/jest`).

**Spec:** `ROADMAP.md` (racine du dépôt), section « Phase 2 - Durcissement sécurité ».

## Global Constraints

- Package manager : npm exclusivement (voir `AGENTS.md`).
- Commentaires, messages de commit et docstrings en français.
- Jamais de tiret cadratin (—) dans le code ou les commits, seulement le tiret simple (-).
- Jamais de trailer `Co-Authored-By: Claude...` dans un commit.
- Style backend : pas de point-virgule, guillemets doubles, indentation 2 espaces, fichiers en kebab-case (voir `AGENTS.md` > Code Style).
- Ne pas désactiver une règle `@medusajs/*` d'ESLint pour faire passer le lint.
- Ne jamais committer `.env` / `.env.local` ni imprimer leur contenu.
- Tests unitaires backend : fichiers `*.unit.spec.ts` sous `src/**/__tests__/`, lancés via `cd apps/backend && npm run test:unit`.

---

## Vérifications déjà faites (aucune action requise)

Deux points du `ROADMAP.md` Phase 2 sont déjà satisfaits, vérifié pendant le cadrage de ce plan - ne pas les retraiter :

- **Hygiène `.env`** : `apps/backend/.env`, `apps/storefront/.env.local` et `.env` racine sont bien ignorés par git (`git check-ignore` confirme les 3 règles dans les `.gitignore` respectifs).
- **Compte admin dédié en prod** : déjà documenté dans `ARCHITECTURE.md` ligne 64 (« Identifiants admin locaux : `admin@golden-market.co` (dev uniquement, à changer en prod) ») et fait partie de la procédure de déploiement listée en Phase 3 du `ROADMAP.md` (« création du user admin »). C'est une action humaine au moment du déploiement, pas un chantier de code - rien à livrer ici.

## Task 1: Garde de configuration production (secrets forts + CORS restreint)

**Files:**
- Create: `apps/backend/src/lib/assert-production-config.ts`
- Test: `apps/backend/src/lib/__tests__/assert-production-config.unit.spec.ts`
- Modify: `apps/backend/medusa-config.ts`

**Interfaces:**
- Produces: `assertProductionConfig(env: NodeJS.ProcessEnv): void` - lève une `Error` si la config est dangereuse pour la production, ne fait rien sinon. Consommée par `medusa-config.ts`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/backend/src/lib/__tests__/assert-production-config.unit.spec.ts` :

```ts
import { assertProductionConfig } from "../assert-production-config"

describe("assertProductionConfig", () => {
  const validEnv = {
    NODE_ENV: "production",
    JWT_SECRET: "a".repeat(32),
    COOKIE_SECRET: "b".repeat(32),
    STORE_CORS: "https://boutique.golden-market.co",
    ADMIN_CORS: "https://admin.golden-market.co",
    AUTH_CORS: "https://admin.golden-market.co",
  }

  it("ne fait rien hors production, même avec des valeurs de dev", () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: "development",
        JWT_SECRET: "supersecret",
        COOKIE_SECRET: "supersecret",
        STORE_CORS: "http://localhost:8000",
        ADMIN_CORS: "http://localhost:9000",
        AUTH_CORS: "http://localhost:9000",
      })
    ).not.toThrow()
  })

  it("ne lève rien en production quand toute la config est saine", () => {
    expect(() => assertProductionConfig(validEnv)).not.toThrow()
  })

  it("lève une erreur si JWT_SECRET vaut encore la valeur de dev", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, JWT_SECRET: "supersecret" })
    ).toThrow(/JWT_SECRET/)
  })

  it("lève une erreur si COOKIE_SECRET est trop court", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, COOKIE_SECRET: "trop-court" })
    ).toThrow(/COOKIE_SECRET/)
  })

  it("lève une erreur si JWT_SECRET est absent", () => {
    const { JWT_SECRET, ...rest } = validEnv
    expect(() => assertProductionConfig(rest)).toThrow(/JWT_SECRET/)
  })

  it("lève une erreur si STORE_CORS contient localhost", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, STORE_CORS: "https://boutique.golden-market.co,http://localhost:8000" })
    ).toThrow(/STORE_CORS/)
  })

  it("lève une erreur si ADMIN_CORS contient localhost", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, ADMIN_CORS: "http://localhost:9000" })
    ).toThrow(/ADMIN_CORS/)
  })

  it("lève une erreur si AUTH_CORS contient localhost", () => {
    expect(() =>
      assertProductionConfig({ ...validEnv, AUTH_CORS: "http://localhost:9000" })
    ).toThrow(/AUTH_CORS/)
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/assert-production-config.unit.spec.ts`
Expected: FAIL (le module `../assert-production-config` n'existe pas encore).

- [ ] **Step 3: Implémenter `assertProductionConfig`**

Créer `apps/backend/src/lib/assert-production-config.ts` :

```ts
const INSECURE_DEFAULT = "supersecret"
const MIN_SECRET_LENGTH = 32

export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") {
    return
  }

  assertStrongSecret("JWT_SECRET", env.JWT_SECRET)
  assertStrongSecret("COOKIE_SECRET", env.COOKIE_SECRET)
  assertNoLocalhost("STORE_CORS", env.STORE_CORS)
  assertNoLocalhost("ADMIN_CORS", env.ADMIN_CORS)
  assertNoLocalhost("AUTH_CORS", env.AUTH_CORS)
}

function assertStrongSecret(name: string, value: string | undefined): void {
  if (!value || value === INSECURE_DEFAULT || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} n'est pas configuré pour la production : définissez une valeur aléatoire d'au moins ${MIN_SECRET_LENGTH} caractères, différente de la valeur de développement "${INSECURE_DEFAULT}".`
    )
  }
}

function assertNoLocalhost(name: string, value: string | undefined): void {
  if (value && value.toLowerCase().includes("localhost")) {
    throw new Error(
      `${name} contient "localhost" : retirez les origines de développement de la configuration de production.`
    )
  }
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/assert-production-config.unit.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Brancher la garde dans `medusa-config.ts`**

Modifier `apps/backend/medusa-config.ts` (fichier actuel de 65 lignes lu intégralement pendant le cadrage) :

```ts
import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { assertProductionConfig } from './src/lib/assert-production-config'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

assertProductionConfig(process.env)

module.exports = defineConfig({
```

(seules les deux lignes `import { assertProductionConfig }...` et `assertProductionConfig(process.env)` sont ajoutées, le reste du fichier - `projectConfig`, modules `cache`/`eventBus`/`payment`/`notification` - ne change pas.)

- [ ] **Step 6: Vérifier que le backend démarre toujours normalement en dev**

Run: `ss -tlnp | grep -E ':8002|:9002'` pour confirmer l'état des process en arrière-plan (voir mémoire session « Local dev stack for Golden Market » pour la procédure complète si rien ne tourne).

Si le backend tourne déjà en arrière-plan sur le port 9002, redémarrer ce process (ou lancer `cd apps/backend && npm run dev` dans un terminal jetable) et vérifier dans les logs qu'aucune erreur `assertProductionConfig` n'apparaît - normal, `NODE_ENV` vaut `development` en local donc la garde est un no-op. Ne pas laisser tourner un process de vérification ad hoc après ce test ; revenir à l'état de process décrit dans `HANDOFF.md` si un redémarrage a été nécessaire.

- [ ] **Step 7: Lancer toute la suite de tests unitaires backend**

Run: `cd apps/backend && npm run test:unit`
Expected: PASS (toutes les suites existantes + la nouvelle).

- [ ] **Step 8: Commit**

```bash
cd apps/backend
git add src/lib/assert-production-config.ts src/lib/__tests__/assert-production-config.unit.spec.ts medusa-config.ts
git commit -m "Empêche le démarrage en production avec des secrets ou un CORS de développement"
```

## Task 2: Limiter le débit de POST /auth/customer/emailpass/reset-password

**Files:**
- Create: `apps/backend/src/api/middlewares/rate-limiter.ts`
- Test: `apps/backend/src/api/middlewares/__tests__/rate-limiter.unit.spec.ts`
- Create: `apps/backend/src/api/middlewares.ts`

**Interfaces:**
- Consumes: rien de Task 1 (tâches indépendantes).
- Produces: `checkRateLimit(cache: ICacheService, key: string, options: { maxRequests: number; windowSeconds: number }, now?: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>` - utilisé uniquement par `src/api/middlewares.ts` dans cette tâche.

**Contexte technique vérifié pendant le cadrage** (pas dans la doc Medusa locale, confirmé en lisant les `.d.ts` du monorepo) :
- L'endpoint core Medusa pour la réinitialisation de mot de passe client est bien à l'URL exacte `/auth/customer/emailpass/reset-password` (route dynamique `src/api/auth/[actor_type]/[auth_provider]/reset-password` dans `@medusajs/medusa`), répond toujours 201 par design.
- `defineMiddlewares`, `MedusaRequest`, `MedusaResponse`, `MedusaNextFunction` s'importent depuis `@medusajs/framework/http` (`node_modules/@medusajs/framework/dist/http/index.d.ts`).
- Le service de cache Redis déjà configuré dans `medusa-config.ts` (module `cache`, resolve `@medusajs/medusa/cache-redis`) s'obtient via `req.scope.resolve(Modules.CACHE)` (`Modules.CACHE === "cache"`, depuis `@medusajs/framework/utils`) et expose `get<T>(key): Promise<T | null>`, `set(key, data, ttlSeconds?): Promise<void>`, `invalidate(key): Promise<void>` (`ICacheService`, importable depuis `@medusajs/framework/types`) - pas d'opération atomique d'incrément, donc le compteur ci-dessous est une fenêtre glissante approximative (best-effort), pas une garantie stricte sous forte concurrence. C'est suffisant pour l'usage visé (dissuader l'abus automatisé d'un point d'accès à faible trafic), pas pour un rate limiting de haute précision.
- `MedusaRequest` étend `express.Request`, donc `req.ip` est disponible nativement.

- [ ] **Step 1: Écrire le test du limiteur qui échoue**

Créer `apps/backend/src/api/middlewares/__tests__/rate-limiter.unit.spec.ts` :

```ts
import { checkRateLimit } from "../rate-limiter"

function createFakeCache() {
  const store = new Map<string, unknown>()
  return {
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, data: unknown) => {
      store.set(key, data)
    }),
    invalidate: jest.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

describe("checkRateLimit", () => {
  const options = { maxRequests: 3, windowSeconds: 60 }

  it("autorise les requêtes tant que la limite n'est pas atteinte", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    const first = await checkRateLimit(cache as any, "rl:test", options, now)
    const second = await checkRateLimit(cache as any, "rl:test", options, now + 1_000)
    const third = await checkRateLimit(cache as any, "rl:test", options, now + 2_000)

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(true)
  })

  it("bloque la requête une fois la limite atteinte dans la fenêtre", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    await checkRateLimit(cache as any, "rl:test", options, now)
    await checkRateLimit(cache as any, "rl:test", options, now + 1_000)
    await checkRateLimit(cache as any, "rl:test", options, now + 2_000)
    const fourth = await checkRateLimit(cache as any, "rl:test", options, now + 3_000)

    expect(fourth.allowed).toBe(false)
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("réautorise une fois la fenêtre expirée", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    await checkRateLimit(cache as any, "rl:test", options, now)
    await checkRateLimit(cache as any, "rl:test", options, now + 1_000)
    await checkRateLimit(cache as any, "rl:test", options, now + 2_000)

    const afterWindow = await checkRateLimit(
      cache as any,
      "rl:test",
      options,
      now + options.windowSeconds * 1000 + 1
    )

    expect(afterWindow.allowed).toBe(true)
  })

  it("traite des clés différentes indépendamment", async () => {
    const cache = createFakeCache()
    const now = 1_000_000

    await checkRateLimit(cache as any, "rl:ip-a", options, now)
    await checkRateLimit(cache as any, "rl:ip-a", options, now)
    await checkRateLimit(cache as any, "rl:ip-a", options, now)

    const otherKey = await checkRateLimit(cache as any, "rl:ip-b", options, now)

    expect(otherKey.allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `cd apps/backend && npm run test:unit -- src/api/middlewares/__tests__/rate-limiter.unit.spec.ts`
Expected: FAIL (le module `../rate-limiter` n'existe pas encore).

- [ ] **Step 3: Implémenter `checkRateLimit`**

Créer `apps/backend/src/api/middlewares/rate-limiter.ts` :

```ts
import type { ICacheService } from "@medusajs/framework/types"

export type RateLimitOptions = {
  maxRequests: number
  windowSeconds: number
}

export type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

type RateLimitRecord = {
  count: number
  resetAt: number
}

export async function checkRateLimit(
  cache: ICacheService,
  key: string,
  options: RateLimitOptions,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const record = await cache.get<RateLimitRecord>(key)

  if (record && record.resetAt > now) {
    if (record.count >= options.maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000) }
    }

    const remainingTtl = Math.ceil((record.resetAt - now) / 1000)
    await cache.set(key, { count: record.count + 1, resetAt: record.resetAt }, remainingTtl)
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const resetAt = now + options.windowSeconds * 1000
  await cache.set(key, { count: 1, resetAt }, options.windowSeconds)
  return { allowed: true, retryAfterSeconds: 0 }
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `cd apps/backend && npm run test:unit -- src/api/middlewares/__tests__/rate-limiter.unit.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Brancher le middleware sur la route Medusa**

Créer `apps/backend/src/api/middlewares.ts` :

```ts
import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { checkRateLimit } from "./middlewares/rate-limiter"

const RESET_PASSWORD_MAX_REQUESTS = 5
const RESET_PASSWORD_WINDOW_SECONDS = 15 * 60

export default defineMiddlewares({
  routes: [
    {
      matcher: "/auth/customer/emailpass/reset-password",
      methods: ["POST"],
      middlewares: [
        async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          const cache = req.scope.resolve(Modules.CACHE)
          const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"

          const result = await checkRateLimit(cache, `rate-limit:auth-reset-password:${ip}`, {
            maxRequests: RESET_PASSWORD_MAX_REQUESTS,
            windowSeconds: RESET_PASSWORD_WINDOW_SECONDS,
          })

          if (!result.allowed) {
            res.setHeader("Retry-After", String(result.retryAfterSeconds))
            res.status(429).json({
              message: "Trop de demandes de réinitialisation de mot de passe. Réessayez plus tard.",
            })
            return
          }

          next()
        },
      ],
    },
  ],
})
```

- [ ] **Step 6: Vérifier le typage et le lint**

Run: `cd apps/backend && npm run lint`
Expected: aucune nouvelle erreur sur les fichiers créés/modifiés (`src/api/middlewares.ts`, `src/api/middlewares/rate-limiter.ts`).

- [ ] **Step 7: Vérification manuelle en direct sur le backend réel**

Backend supposé déjà lancé sur le port 9002 (voir `HANDOFF.md`, sinon `ss -tlnp | grep :9002` puis relancer via la mémoire session « Local dev stack for Golden Market »).

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:9002/auth/customer/emailpass/reset-password \
    -H "Content-Type: application/json" \
    -d '{"identifier":"verification-rate-limit@golden-market.co"}'
done
```

Expected: les 5 premiers appels renvoient `201`, le 6e renvoie `429`. Relancer la même commande une fois passé la fenêtre de 15 minutes (ou redémarrer le backend, ce qui vide le compteur puisqu'il vit dans Redis sous une clé sans persistance particulière au-delà du TTL) pour confirmer que le compteur se réinitialise - ne pas bloquer la fin de la tâche sur cette re-vérification si le délai est trop long pour la session, le test unitaire de Step 4 couvre déjà ce cas.

- [ ] **Step 8: Lancer toute la suite de tests unitaires backend**

Run: `cd apps/backend && npm run test:unit`
Expected: PASS (toutes les suites existantes + les 4 nouveaux tests du rate limiter).

- [ ] **Step 9: Commit**

```bash
cd apps/backend
git add src/api/middlewares.ts src/api/middlewares/rate-limiter.ts src/api/middlewares/__tests__/rate-limiter.unit.spec.ts
git commit -m "Limite le débit de la réinitialisation de mot de passe client à 5 requêtes / 15 min par IP"
```

## Task 3: Mettre à jour HANDOFF.md et ROADMAP.md

**Files:**
- Modify: `HANDOFF.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: le résultat des Task 1 et Task 2 (doit être fait après elles).

- [ ] **Step 1: Cocher les cases de la Phase 2 dans `ROADMAP.md`**

Dans `ROADMAP.md`, section « Phase 2 - Durcissement sécurité » :
- Cocher `[x]` la ligne « Secrets de production distincts des valeurs de `.env.template` » et ajouter une phrase précisant que c'est désormais appliqué par un garde-fou de démarrage (`assertProductionConfig`), pas seulement documenté.
- Cocher `[x]` la ligne CORS, même remarque.
- Cocher `[x]` la ligne « Compte admin dédié en prod » en renvoyant vers `ARCHITECTURE.md` ligne 64 (déjà couvert, aucun code requis - voir section « Vérifications déjà faites » de ce plan).
- Cocher `[x]` la ligne hygiène `.env` (déjà couvert, vérifié pendant ce plan).
- Cocher `[x]` la ligne rate limiting reset-password.

- [ ] **Step 2: Mettre à jour le statut global de la Phase 2**

Dans `ROADMAP.md`, changer « Statut global : **à faire** » en « Statut global : **fait** » sous la section Phase 2.

- [ ] **Step 3: Ajouter une entrée de journal dans `HANDOFF.md`**

Dans `HANDOFF.md`, section « Statut par phase » : ajouter la Phase 2 avec `[x]` sur les 5 points (les 3 premiers marqués comme vérifiés sans changement de code, les 2 derniers comme implémentés avec un lien vers ce plan). Dans la section « Journal », ajouter une entrée datée du jour de l'exécution résumant : garde de démarrage `assertProductionConfig` (secrets forts + CORS sans localhost, no-op hors production), rate limiting Redis sur `POST /auth/customer/emailpass/reset-password` (5 req / 15 min / IP, best-effort - pas atomique), et le fait que les deux autres points du `ROADMAP.md` (compte admin, hygiène `.env`) étaient déjà satisfaits sans action de code. Mettre à jour la ligne « Dernière mise à jour » en tête du fichier.

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md ROADMAP.md
git commit -m "Documente la clôture de la Phase 2 (durcissement sécurité) dans HANDOFF/ROADMAP"
```
