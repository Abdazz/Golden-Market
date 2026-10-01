import { activeProspectFor, prospectBadge } from "../prospect-match"

const p = (over: Record<string, unknown>) => ({
  id: "p",
  phone: "+22677406101",
  status: "to_follow_up",
  follow_up_on: "2026-10-02",
  product: null,
  ...over,
}) as any

describe("activeProspectFor", () => {
  it("retrouve le prospect actif quel que soit le format du numéro (liste triée, plus récent d'abord)", () => {
    const list = [p({ id: "recent" }), p({ id: "old" })]
    expect(activeProspectFor(list, "22677406101")?.id).toBe("recent")
    expect(activeProspectFor(list, "77406101")?.id).toBe("recent")
  })
  it("ignore les prospects convertis ou perdus et les autres numéros", () => {
    expect(activeProspectFor([p({ status: "converted" }), p({ status: "lost" })], "22677406101")).toBeNull()
    expect(activeProspectFor([p({ phone: "+22670000000" })], "22677406101")).toBeNull()
  })
})

describe("prospectBadge", () => {
  it("à relancer : avec la date, ou sans", () => {
    expect(prospectBadge(p({}))).toBe("Prospect · à relancer le 02/10")
    expect(prospectBadge(p({ follow_up_on: null }))).toBe("Prospect · à relancer")
  })
  it("attend le stock : avec le produit", () => {
    expect(prospectBadge(p({ status: "waiting_stock", product: "Balai-éponge" }))).toBe("Prospect · attend : Balai-éponge")
    expect(prospectBadge(p({ status: "waiting_stock" }))).toBe("Prospect · attend un produit")
  })
})
