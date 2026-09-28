import { REPLY_WINDOW_MS, computeReplyWindow } from "../whatsapp-reply-window"

describe("computeReplyWindow", () => {
  const now = new Date("2026-09-27T12:00:00Z")

  it("est fermée quand le client n'a jamais écrit", () => {
    expect(computeReplyWindow(null, now)).toEqual({ open: false, expiresAt: null })
  })

  it("est ouverte moins de 24 h après le dernier message client", () => {
    const last = new Date(now.getTime() - 23 * 3600 * 1000)
    expect(computeReplyWindow(last, now)).toEqual({
      open: true,
      expiresAt: new Date(last.getTime() + REPLY_WINDOW_MS),
    })
  })

  it("est fermée exactement 24 h après (borne exclue)", () => {
    const last = new Date(now.getTime() - REPLY_WINDOW_MS)
    expect(computeReplyWindow(last, now).open).toBe(false)
  })

  it("accepte une date ISO (valeur sérialisée par pg ou par l'API)", () => {
    const last = new Date(now.getTime() - 3600 * 1000).toISOString()
    expect(computeReplyWindow(last, now).open).toBe(true)
  })

  it("est fermée si Meta a refusé un message pour fenêtre dépassée après le dernier message client", () => {
    const last = new Date(now.getTime() - 3600 * 1000)
    const refused = new Date(now.getTime() - 60 * 1000)
    expect(computeReplyWindow(last, now, refused)).toEqual({ open: false, expiresAt: null })
  })

  it("un refus antérieur au dernier message client ne ferme plus la fenêtre", () => {
    const refused = new Date(now.getTime() - 2 * 3600 * 1000)
    const last = new Date(now.getTime() - 3600 * 1000)
    expect(computeReplyWindow(last, now, refused).open).toBe(true)
  })
})
