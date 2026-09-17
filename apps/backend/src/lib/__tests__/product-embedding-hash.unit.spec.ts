import {
  computeProductContentHash,
  buildProductEmbeddingText,
} from "../product-embedding-hash"

describe("computeProductContentHash", () => {
  it("returns a stable hash for the same title and description", () => {
    const a = computeProductContentHash("Chargeur USB", "Câble 1m")
    const b = computeProductContentHash("Chargeur USB", "Câble 1m")
    expect(a).toBe(b)
  })

  it("returns a different hash when the title changes", () => {
    const a = computeProductContentHash("Chargeur USB", "Câble 1m")
    const b = computeProductContentHash("Chargeur USB 6A", "Câble 1m")
    expect(a).not.toBe(b)
  })

  it("returns a different hash when the description changes", () => {
    const a = computeProductContentHash("Chargeur USB", "Câble 1m")
    const b = computeProductContentHash("Chargeur USB", "Câble 2m")
    expect(a).not.toBe(b)
  })

  it("treats a missing description the same as an empty one", () => {
    const a = computeProductContentHash("Chargeur USB", null)
    const b = computeProductContentHash("Chargeur USB", "")
    expect(a).toBe(b)
  })
})

describe("buildProductEmbeddingText", () => {
  it("joins title and description with a newline", () => {
    expect(buildProductEmbeddingText("title", "description")).toBe("title\ndescription")
  })

  it("treats a null description as an empty string", () => {
    expect(buildProductEmbeddingText("title", null)).toBe("title\n")
  })

  it("treats an undefined description as an empty string", () => {
    expect(buildProductEmbeddingText("title", undefined)).toBe("title\n")
  })
})
