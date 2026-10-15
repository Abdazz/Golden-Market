import { mayEditPayment, PAYMENT_EDIT_WINDOW_MS, paymentEditStatus } from "../payment-edit-rules"

const T0 = new Date("2026-10-15T08:00:00.000Z")
const after = (ms: number) => new Date(T0.getTime() + ms)

describe("paymentEditStatus", () => {
  it("jamais enregistré : ni enregistré ni modifiable", () => {
    expect(paymentEditStatus(null, T0)).toEqual({ recorded: false, editable: false, editable_until: null })
  })

  it("1 h après : modifiable", () => {
    expect(paymentEditStatus(T0, after(3600 * 1000)).editable).toBe(true)
  })

  it("23 h 59 après : modifiable", () => {
    expect(paymentEditStatus(T0, after(23 * 3600 * 1000 + 59 * 60 * 1000)).editable).toBe(true)
  })

  it("exactement 24 h après : encore modifiable (limite incluse)", () => {
    const status = paymentEditStatus(T0, after(PAYMENT_EDIT_WINDOW_MS))
    expect(status.editable).toBe(true)
    expect(status.editable_until).toBe("2026-10-16T08:00:00.000Z")
  })

  it("24 h + 1 s après : plus modifiable", () => {
    expect(paymentEditStatus(T0, after(PAYMENT_EDIT_WINDOW_MS + 1000))).toMatchObject({ recorded: true, editable: false })
  })

  it("date en chaîne ISO", () => {
    expect(paymentEditStatus("2026-10-15T08:00:00.000Z", after(1000))).toMatchObject({ recorded: true, editable: true })
  })
})

describe("mayEditPayment", () => {
  const late = after(PAYMENT_EDIT_WINDOW_MS + 1000)
  it("jamais enregistré : autorisé", () => expect(mayEditPayment({ recordedAt: null, now: late })).toBe(true))
  it("fenêtre dépassée : refusé", () => expect(mayEditPayment({ recordedAt: T0, now: late })).toBe(false))
  it("fenêtre dépassée avec skipWindow : autorisé", () =>
    expect(mayEditPayment({ recordedAt: T0, now: late, skipWindow: true })).toBe(true))
  it("dans la fenêtre : autorisé", () => expect(mayEditPayment({ recordedAt: T0, now: after(1000) })).toBe(true))
})
