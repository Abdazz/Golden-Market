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
