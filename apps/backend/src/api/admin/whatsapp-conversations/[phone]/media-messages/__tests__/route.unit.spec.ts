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
  const originalPublicUrl = process.env.MEDUSA_BACKEND_PUBLIC_URL
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.MEDUSA_BACKEND_PUBLIC_URL = "https://golden-market.co"
  })
  afterAll(() => {
    if (originalPublicUrl === undefined) delete process.env.MEDUSA_BACKEND_PUBLIC_URL
    else process.env.MEDUSA_BACKEND_PUBLIC_URL = originalPublicUrl
  })

  it("URL d'un autre hôte : aucune suppression", async () => {
    ;(runAdminAction as jest.Mock).mockResolvedValue({ kind: "whatsapp_error", message: "Refusé" })
    const { req, res, deleteFiles } = setup()
    req.body = { ...body, url: url.replace("golden-market.co", "autre.example") }
    await POST(req, res)
    expect(deleteFiles).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(502)
  })

  it("variable publique mal formée : aucune suppression", async () => {
    process.env.MEDUSA_BACKEND_PUBLIC_URL = "pas une url"
    ;(runAdminAction as jest.Mock).mockResolvedValue({ kind: "whatsapp_error", message: "Refusé" })
    const { req, res, deleteFiles } = setup()
    await POST(req, res)
    expect(deleteFiles).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(502)
  })

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
