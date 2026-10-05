# Entretien des médias WhatsApp - plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** supprimer le fichier d'un média dont l'envoi WhatsApp a échoué de façon certaine, et empêcher la purge nocturne de relire indéfiniment des messages qu'elle ne traitera jamais.

**Architecture:** règle pure `orphanMediaFileKey(url)` + suppression par le module fichier de Medusa dans la route `POST /admin/whatsapp-conversations/:phone/media-messages` ; requête SQL du workflow n8n `PurgeClientPhot1` modifiée par le contrôleur.

**Tech Stack:** Medusa v2.18 (module `Modules.FILE`), Jest, n8n 2.x (CLI sur le VPS).

**Spec:** `docs/superpowers/specs/2026-10-06-entretien-medias-whatsapp-design.md`

## Global Constraints

- Code, commentaires et commits en français ; pas d'emoji ; pas de trailer `Co-Authored-By` ; pas de point-virgule, guillemets doubles, 2 espaces.
- Ne jamais toucher à la production, au VPS, à n8n ni aux `.env` (le contrôleur s'en charge).
- Suppression seulement pour les échecs certains `invalid_request`, `not_found`, `window_expired`, `whatsapp_error` ; jamais pour `unavailable` ni en cas de succès.
- Motif exact du dernier segment de l'URL : `^\d+-wa-media-[0-9a-f]{20}\.[a-z0-9]+$`.

## Review Focus

- URL avec paramètres de requête ou fragment (`...ogg?x=1`) : refusée (pas de suppression), plutôt que de deviner une clé.
- URL encodée (`%2F` dans le dernier segment) : refusée par le motif (pas de traversée de répertoire).
- Échec de `deleteFiles` (fichier déjà absent) : la réponse d'erreur à l'admin reste exactement celle de n8n.
- Succès de l'envoi : aucun appel au module fichier.
- `unavailable` (délai dépassé) : fichier conservé.

---

### Task 1: Suppression du fichier d'un envoi refusé

**Files:**
- Create: `apps/backend/src/lib/whatsapp-media-cleanup.ts`
- Create: `apps/backend/src/lib/__tests__/whatsapp-media-cleanup.unit.spec.ts`
- Modify: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/media-messages/route.ts`
- Create: `apps/backend/src/api/admin/whatsapp-conversations/[phone]/media-messages/__tests__/route.unit.spec.ts`

**Interfaces:**
- Produces: `orphanMediaFileKey(url: string | null | undefined): string | null` ; `CERTAIN_SEND_FAILURES: readonly string[]` ; `isCertainSendFailure(kind: string): boolean`.
- Consumes: `runAdminAction` (`src/lib/whatsapp-admin-actions-client.ts`, résultat `{ kind: "ok" | "window_expired" | "whatsapp_error" | "not_found" | "invalid_request" | "unavailable", ... }`), `parseSendMediaBody`, `toHttpResponse` (`src/lib/whatsapp-admin-action-http.ts`).

- [ ] **Step 1: Failing tests** (`lib/__tests__/whatsapp-media-cleanup.unit.spec.ts`) :

```ts
import { isCertainSendFailure, orphanMediaFileKey } from "../whatsapp-media-cleanup"

describe("orphanMediaFileKey", () => {
  it("renvoie la clé d'un fichier wa-media de notre stockage", () => {
    expect(orphanMediaFileKey("https://golden-market.co/static/1790557958412-wa-media-5f1339f0485129788bf1.ogg")).toBe(
      "1790557958412-wa-media-5f1339f0485129788bf1.ogg"
    )
  })
  it("refuse tout autre fichier ou une URL douteuse", () => {
    expect(orphanMediaFileKey("https://golden-market.co/static/1790557958412-client-photo-5f1339f0485129788bf1.jpg")).toBeNull()
    expect(orphanMediaFileKey("https://golden-market.co/static/1790557958412-balai.jpg")).toBeNull()
    expect(orphanMediaFileKey("https://golden-market.co/static/1790557958412-wa-media-5f1339f0485129788bf1.ogg?x=1")).toBeNull()
    expect(orphanMediaFileKey("https://golden-market.co/static/..%2F1790557958412-wa-media-5f1339f0485129788bf1.ogg")).toBeNull()
    expect(orphanMediaFileKey("https://golden-market.co/static/1790557958412-wa-media-5f13.ogg")).toBeNull()
    expect(orphanMediaFileKey("")).toBeNull()
    expect(orphanMediaFileKey(null)).toBeNull()
    expect(orphanMediaFileKey("pas une url")).toBeNull()
  })
})

describe("isCertainSendFailure", () => {
  it("échecs certains : rien n'a été enregistré par n8n", () => {
    for (const kind of ["invalid_request", "not_found", "window_expired", "whatsapp_error"]) {
      expect(isCertainSendFailure(kind)).toBe(true)
    }
  })
  it("succès ou échec incertain : on garde le fichier", () => {
    expect(isCertainSendFailure("ok")).toBe(false)
    expect(isCertainSendFailure("unavailable")).toBe(false)
  })
})
```

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/whatsapp-media-cleanup.unit.spec.ts` -> FAIL.

- [ ] **Step 2: Implement** (`lib/whatsapp-media-cleanup.ts`) :

```ts
// Fichier joint depuis l'admin dont l'envoi WhatsApp a échoué (spec
// 2026-10-06 entretien-medias-whatsapp) : n8n n'a rien enregistré, aucun
// message ne le référence, la purge à 90 jours ne le trouverait jamais.

// Échecs où n8n a répondu sans enregistrer le message. "unavailable" (n8n
// injoignable, délai dépassé) est incertain : le message a pu partir.
export const CERTAIN_SEND_FAILURES = ["invalid_request", "not_found", "window_expired", "whatsapp_error"] as const

export const isCertainSendFailure = (kind: string) => (CERTAIN_SEND_FAILURES as readonly string[]).includes(kind)

// Nom donné par la route .../media (préfixé de l'horodatage par file-local).
const WA_MEDIA_KEY = /^\d+-wa-media-[0-9a-f]{20}\.[a-z0-9]+$/

export const orphanMediaFileKey = (url: string | null | undefined): string | null => {
  if (!url) return null
  let pathname: string
  try {
    const parsed = new URL(url)
    if (parsed.search || parsed.hash) return null
    pathname = parsed.pathname
  } catch {
    return null
  }
  const key = pathname.split("/").pop() ?? ""
  return WA_MEDIA_KEY.test(key) ? key : null
}
```

Run le test : PASS.

- [ ] **Step 3: Failing route test** (`.../media-messages/__tests__/route.unit.spec.ts`) :

```ts
import { POST } from "../route"
import { runAdminAction } from "../../../../../../lib/whatsapp-admin-actions-client"

jest.mock("../../../../../../lib/whatsapp-admin-actions-client", () => ({ runAdminAction: jest.fn() }))

const url = "https://golden-market.co/static/1790557958412-wa-media-5f1339f0485129788bf1.ogg"
const body = { url, kind: "audio", mime_type: "audio/ogg", filename: "vocal.ogg", size: 1000, voice: true, caption: "" }

const setup = () => {
  const deleteFiles = jest.fn().mockResolvedValue(undefined)
  const logger = { error: jest.fn() }
  const req: any = {
    body,
    params: { phone: "22677406101" },
    scope: { resolve: jest.fn((key: string) => (key === "logger" ? logger : { deleteFiles })) },
  }
  const res: any = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return { req, res, deleteFiles, logger }
}

describe("POST .../media-messages", () => {
  beforeEach(() => jest.clearAllMocks())

  it("envoi refusé par WhatsApp : fichier supprimé, erreur transmise", async () => {
    ;(runAdminAction as jest.Mock).mockResolvedValue({ kind: "whatsapp_error", message: "Refusé" })
    const { req, res, deleteFiles } = setup()
    await POST(req, res)
    expect(deleteFiles).toHaveBeenCalledWith(["1790557958412-wa-media-5f1339f0485129788bf1.ogg"])
    expect(res.status).toHaveBeenCalledWith(502)
  })

  it("n8n injoignable : fichier conservé", async () => {
    ;(runAdminAction as jest.Mock).mockResolvedValue({ kind: "unavailable", message: "Indisponible" })
    const { req, res, deleteFiles } = setup()
    await POST(req, res)
    expect(deleteFiles).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it("succès : fichier conservé", async () => {
    ;(runAdminAction as jest.Mock).mockResolvedValue({ kind: "ok", message: null, warning: null })
    const { req, res, deleteFiles } = setup()
    await POST(req, res)
    expect(deleteFiles).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("suppression en échec : journalisée, réponse d'erreur inchangée", async () => {
    ;(runAdminAction as jest.Mock).mockResolvedValue({ kind: "window_expired", message: "Fenêtre fermée" })
    const { req, res, deleteFiles, logger } = setup()
    deleteFiles.mockRejectedValueOnce(new Error("absent"))
    await POST(req, res)
    expect(logger.error).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ ok: false, error_code: "window_expired", message: "Fenêtre fermée" })
  })
})
```

Avant d'écrire le test, lire `parseSendMediaBody` (`src/lib/whatsapp-admin-action-http.ts`) pour que `body` soit accepté tel quel (noms de champs exacts, légende) et que `parsed.media.url` soit bien l'URL ; adapter `body` si besoin. Les clés de conteneur réelles : `Modules.FILE` (valeur `"file"`) et `ContainerRegistrationKeys.LOGGER` (`"logger"`) ; le simulacre ci-dessus renvoie le module fichier pour toute clé autre que `"logger"`.

Run: `npm run test:unit -- "src/api/admin/whatsapp-conversations/\[phone\]/media-messages"` -> FAIL (aucune suppression).

- [ ] **Step 4: Implement the route** : après `const result = await runAdminAction(...)`, avant la réponse :

```ts
  // Envoi refusé de façon certaine : n8n n'a rien enregistré, le fichier
  // téléversé ne serait jamais purgé ("Réessayer" en téléverse un nouveau).
  const key = result.kind !== "ok" && isCertainSendFailure(result.kind) ? orphanMediaFileKey(parsed.media.url) : null
  if (key) {
    try {
      await req.scope.resolve(Modules.FILE).deleteFiles([key])
    } catch (error) {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`Média ${key} non supprimé après un envoi refusé (${(error as Error).message})`)
    }
  }
  const { status, body } = toHttpResponse(result)
  res.status(status).json(body)
```

Imports : `ContainerRegistrationKeys, Modules` depuis `@medusajs/framework/utils`, `isCertainSendFailure, orphanMediaFileKey` depuis `../../../../../lib/whatsapp-media-cleanup`. Mettre à jour le commentaire d'en-tête de la route.

- [ ] **Step 5: Run tests, typecheck, lint** : `npm run test:unit -- src/lib/__tests__/whatsapp-media-cleanup.unit.spec.ts "src/api/admin/whatsapp-conversations"` puis la suite complète ; `npx tsc --noEmit -p . 2>&1 | grep -E "media-messages|whatsapp-media-cleanup"` ; `npx eslint src/lib/whatsapp-media-cleanup.ts "src/api/admin/whatsapp-conversations/[phone]/media-messages"`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/whatsapp-media-cleanup.ts apps/backend/src/lib/__tests__/whatsapp-media-cleanup.unit.spec.ts "apps/backend/src/api/admin/whatsapp-conversations/[phone]/media-messages"
git commit -m "fix(chat-whatsapp): fichier d'un média refusé supprimé du stockage"
```

---

### Task 2 (contrôleur) : purge n8n, documentation, déploiement

- [ ] n8n `PurgeClientPhot1` : export dans un fichier au nom unique (vérifier que l'export a réussi), sauvegarde, ajout dans `Find Expired Photos` de la condition `AND EXISTS (SELECT 1 FROM jsonb_array_elements(m.attachments) a WHERE a->>'url' ~ '(client-photo-|client-media-|wa-media-)')` (à la place de l'actuelle condition `a->>'url' IS NOT NULL`), import, publication, redémarrage ; exécution manuelle et contrôle (0 message sélectionné aujourd'hui, aucun fichier de moins de 90 jours).
- [ ] `../n8n_automation/guide-golden-market-agent.md` (§ Purge 90 jours) et `AGENTS.md` (médias du chat) à jour.
- [ ] Revue finale, staging, production.
