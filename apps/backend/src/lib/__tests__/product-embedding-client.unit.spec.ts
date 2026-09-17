import { embedText } from "../product-embedding-client"

describe("embedText", () => {
  it("posts the text to the OpenAI embeddings API and returns the vector", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    })

    const result = await embedText(
      "Chargeur USB",
      "sk-test",
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/embeddings")
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-test",
    })
    expect(JSON.parse(init.body as string)).toEqual({
      model: "text-embedding-3-small",
      input: "Chargeur USB",
    })
  })

  it("throws when the API key is not configured", async () => {
    const fetchMock = jest.fn()

    await expect(
      embedText("Chargeur USB", "", fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/OPENAI_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when OpenAI responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 })

    await expect(
      embedText("Chargeur USB", "sk-test", fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/401/)
  })
})
