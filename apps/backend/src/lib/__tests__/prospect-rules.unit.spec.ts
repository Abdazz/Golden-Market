import { addDays, dueToday, matchProspectsForOrder, parseProspect, sortWaiting, type ProspectLike } from "../prospect-rules"

const p = (over: Partial<ProspectLike>): ProspectLike => ({
  id: "p",
  phone: "+22670000000",
  status: "to_follow_up",
  follow_up_on: "2026-09-28",
  variant_id: null,
  ...over,
})

describe("parseProspect", () => {
  it("normalise le numéro, relance demain par défaut", () => {
    expect(parseProspect({ phone: "70 00 00 00", name: " Awa ", product_label: "Balai" }, "2026-09-28")).toEqual({
      ok: true,
      values: { phone: "+22670000000", name: "Awa", variant_id: null, product_label: "Balai", status: "to_follow_up", follow_up_on: "2026-09-29", note: null },
    })
  })
  it("en attente de stock : pas de date de relance", () => {
    expect(parseProspect({ phone: "+226 70000000", status: "waiting_stock", variant_id: "variant_1" }, "2026-09-28")).toMatchObject({
      ok: true,
      values: { status: "waiting_stock", follow_up_on: null, variant_id: "variant_1" },
    })
  })
  it("refuse un numéro invalide ou une date invalide", () => {
    expect(parseProspect({ phone: "12" }, "2026-09-28").ok).toBe(false)
    expect(parseProspect({ phone: "70000000", follow_up_on: "28/09/2026" }, "2026-09-28").ok).toBe(false)
  })
})

describe("addDays", () => {
  it("ajoute des jours à une date AAAA-MM-JJ", () => {
    expect(addDays("2026-09-28", 3)).toBe("2026-10-01")
  })
})

describe("dueToday", () => {
  it("à relancer aujourd'hui ou en retard, les retards d'abord ; ignore le reste", () => {
    const list = [
      p({ id: "today", follow_up_on: "2026-09-28" }),
      p({ id: "late", follow_up_on: "2026-09-25" }),
      p({ id: "future", follow_up_on: "2026-09-30" }),
      p({ id: "waiting", status: "waiting_stock", follow_up_on: null }),
      p({ id: "done", status: "converted", follow_up_on: "2026-09-20" }),
    ]
    expect(dueToday(list, "2026-09-28").map((x) => [x.id, x.overdue])).toEqual([
      ["late", true],
      ["today", false],
    ])
  })
})

describe("matchProspectsForOrder", () => {
  it("trouve toutes les fiches non converties du même numéro (formats différents)", () => {
    const list = [
      p({ id: "a", phone: "+22670000000", status: "to_follow_up" }),
      p({ id: "b", phone: "+22670000000", status: "lost" }),
      p({ id: "c", phone: "+22670000000", status: "converted" }),
      p({ id: "d", phone: "+22676000000" }),
    ]
    expect(matchProspectsForOrder(list, "70 00 00 00").map((x) => x.id)).toEqual(["a", "b"])
    expect(matchProspectsForOrder(list, "pas un numéro")).toEqual([])
  })
})

describe("sortWaiting", () => {
  it("en attente de stock : les produits de nouveau disponibles en premier", () => {
    const list = [
      p({ id: "out", status: "waiting_stock", variant_id: "v_out" }),
      p({ id: "back", status: "waiting_stock", variant_id: "v_back" }),
      p({ id: "unknown", status: "waiting_stock", variant_id: "v_deleted" }),
      p({ id: "other", status: "to_follow_up" }),
    ]
    expect(sortWaiting(list, { v_out: false, v_back: true }).map((x) => [x.id, x.available])).toEqual([
      ["back", true],
      ["out", false],
      ["unknown", null],
    ])
  })
})
