import { parseAmountInput } from "../delivery-amount"

describe("parseAmountInput", () => {
  it("séparateurs de milliers acceptés : espaces, points, virgules", () => {
    expect(parseAmountInput("7000")).toBe(7000)
    expect(parseAmountInput("7 000")).toBe(7000)
    expect(parseAmountInput("7.000")).toBe(7000)
    expect(parseAmountInput("7,000")).toBe(7000)
    expect(parseAmountInput(" 0 ")).toBe(0)
  })
  it("refuse une saisie vide, négative, non numérique ou trop grande", () => {
    expect(parseAmountInput("")).toBeNull()
    expect(parseAmountInput("-500")).toBeNull()
    expect(parseAmountInput("1e3")).toBeNull()
    expect(parseAmountInput("abc")).toBeNull()
    expect(parseAmountInput("10000001")).toBeNull()
  })
})
