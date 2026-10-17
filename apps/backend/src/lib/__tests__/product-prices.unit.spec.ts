import { parsePriceInput } from "../product-prices"

describe("parsePriceInput", () => {
  it("accepte les trois prix", () => {
    expect(parsePriceInput({ standard: 3500, promo: "2500", wholesale: 2000 })).toEqual({ standard: 3500, promo: 2500, wholesale: 2000 })
  })
  it("promo et gros facultatifs", () => {
    expect(parsePriceInput({ standard: 3500, promo: "", wholesale: null })).toEqual({ standard: 3500, promo: null, wholesale: null })
  })
  it("refuse un standard vide ou non entier", () => {
    expect(typeof parsePriceInput({ standard: "" })).toBe("string")
    expect(typeof parsePriceInput({ standard: 10.5 })).toBe("string")
  })
  it("refuse une promo supérieure ou égale au standard", () => {
    expect(typeof parsePriceInput({ standard: 3500, promo: 3500 })).toBe("string")
  })
  it("refuse un prix de gros invalide", () => {
    expect(typeof parsePriceInput({ standard: 3500, wholesale: -1 })).toBe("string")
  })
})
