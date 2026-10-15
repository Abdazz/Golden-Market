import { parseReport, reportFields, reportState, summarizeDay } from "../courier-report-rules"

describe("reportFields", () => {
  it("Ouaga : montant encaissé et course, pas de frais d'expédition", () => {
    expect(reportFields("express")).toEqual({ amount_collected: true, transport_fee: false, courier_fee: true })
  })
  it("expédition : course et frais d'expédition, jamais de montant encaissé", () => {
    expect(reportFields("expedition")).toEqual({ amount_collected: false, transport_fee: true, courier_fee: true })
  })
})

describe("parseReport", () => {
  it("la question livrée est obligatoire (aucune réponse par défaut)", () => {
    expect(parseReport("express", {})).toEqual({ ok: false, message: "Indiquez si la commande a été livrée." })
    expect(parseReport("express", { delivered: "oui" })).toEqual({ ok: false, message: "Indiquez si la commande a été livrée." })
  })
  it("non livrée : motif obligatoire, montants ignorés", () => {
    expect(parseReport("express", { delivered: false, failure_reason: "  " })).toEqual({
      ok: false,
      message: "Indiquez pourquoi la commande n'a pas été livrée.",
    })
    expect(parseReport("express", { delivered: false, failure_reason: " Client absent ", amount_collected: 5000 })).toEqual({
      ok: true,
      values: { delivered: false, failure_reason: "Client absent", amount_collected: null, courier_fee: null, transport_fee: null },
    })
  })
  it("Ouaga livrée : montant encaissé entier positif et course obligatoires", () => {
    expect(parseReport("express", { delivered: true, amount_collected: 9500, courier_fee: 1000 })).toEqual({
      ok: true,
      values: { delivered: true, failure_reason: null, amount_collected: 9500, courier_fee: 1000, transport_fee: null },
    })
    expect(parseReport("express", { delivered: true, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("express", { delivered: true, amount_collected: 0, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("express", { delivered: true, amount_collected: 9500.5, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("express", { delivered: true, amount_collected: 9500 })).toMatchObject({ ok: false })
  })
  it("Ouaga : un Frais Expédition envoyé est ignoré", () => {
    const r = parseReport("express", { delivered: true, amount_collected: 9500, courier_fee: 1000, transport_fee: 700 })
    expect(r).toMatchObject({ ok: true, values: { transport_fee: null } })
  })
  it("expédition livrée : course et Frais Expédition obligatoires, montant encaissé refusé du livreur", () => {
    expect(parseReport("expedition", { delivered: true, courier_fee: 1000, transport_fee: 2000, amount_collected: 99999 })).toEqual({
      ok: true,
      values: { delivered: true, failure_reason: null, amount_collected: null, courier_fee: 1000, transport_fee: 2000 },
    })
    expect(parseReport("expedition", { delivered: true, courier_fee: 1000 })).toMatchObject({ ok: false })
    expect(parseReport("expedition", { delivered: true, transport_fee: 2000 })).toMatchObject({ ok: false })
  })
  it("0 accepté pour une course ou des frais, négatif refusé", () => {
    expect(parseReport("expedition", { delivered: true, courier_fee: 0, transport_fee: 0 })).toMatchObject({ ok: true })
    expect(parseReport("expedition", { delivered: true, courier_fee: -1, transport_fee: 0 })).toMatchObject({ ok: false })
  })
})

describe("reportState et summarizeDay", () => {
  it("état d'une ligne", () => {
    expect(reportState({ status: "assigned" }, null)).toBe("todo")
    expect(reportState({ status: "assigned" }, { status: "submitted" })).toBe("submitted")
    expect(reportState({ status: "assigned" }, { status: "returned" })).toBe("returned")
    expect(reportState({ status: "delivered" }, { status: "validated" })).toBe("validated")
    expect(reportState({ status: "shipped" }, null)).toBe("validated")
    expect(reportState({ status: "failed" }, { status: "applied" })).toBe("failed")
    expect(reportState({ status: "canceled" }, null)).toBe("canceled")
  })
  it("synthèse du jour (les annulées ne comptent pas)", () => {
    expect(summarizeDay(["todo", "submitted", "submitted", "returned", "validated", "failed", "canceled"])).toEqual({
      total: 6,
      todo: 1,
      submitted: 2,
      returned: 1,
      validated: 1,
      failed: 1,
    })
  })
})
