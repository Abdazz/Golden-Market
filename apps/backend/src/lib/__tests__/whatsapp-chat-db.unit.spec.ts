import { getConversationMessages, listConversations } from "../whatsapp-chat-db"

describe("listConversations", () => {
  it("returns null when no executor is configured", async () => {
    const result = await listConversations(undefined, null)

    expect(result).toBeNull()
  })

  it("maps rows into conversation summaries, converting the bigint message count", async () => {
    const lastMessageAt = new Date("2026-09-07T10:00:00Z")
    const queryMock = jest.fn().mockResolvedValue({
      rows: [
        {
          phone_number: "+22670000000",
          customer_name: "Awa",
          status: "active",
          last_message_at: lastMessageAt,
          last_message_preview: "Merci, à bientôt !",
          // pg renvoie COUNT(*) en chaîne (bigint) - jamais un number natif
          message_count: "4",
        },
      ],
    })

    const result = await listConversations(undefined, { query: queryMock })

    expect(result).toEqual([
      {
        phoneNumber: "+22670000000",
        customerName: "Awa",
        status: "active",
        lastMessageAt,
        lastMessagePreview: "Merci, à bientôt !",
        messageCount: 4,
      },
    ])
  })

  it("passes null (never undefined) as the search bind parameter when no search is given", async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })

    await listConversations(undefined, { query: queryMock })

    // pg lève une erreur si un paramètre lié vaut `undefined` - null uniquement.
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [null])
  })

  it("passes the search term through as the bind parameter", async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })

    await listConversations("+22670", { query: queryMock })

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["+22670"])
  })

  it("returns null when the query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    const result = await listConversations(undefined, { query: queryMock })

    expect(result).toBeNull()
  })

  it("handles a null last_message_preview and null customer_name", async () => {
    const queryMock = jest.fn().mockResolvedValue({
      rows: [
        {
          phone_number: "+22670000001",
          customer_name: null,
          status: "active",
          last_message_at: new Date("2026-09-07T10:00:00Z"),
          last_message_preview: null,
          message_count: "0",
        },
      ],
    })

    const result = await listConversations(undefined, { query: queryMock })

    expect(result?.[0].customerName).toBeNull()
    expect(result?.[0].lastMessagePreview).toBeNull()
    expect(result?.[0].messageCount).toBe(0)
  })
})

describe("getConversationMessages", () => {
  it("returns null when no executor is configured", async () => {
    const result = await getConversationMessages("+22670000000", null)

    expect(result).toBeNull()
  })

  it("maps rows into chat messages, preserving query order", async () => {
    const queryMock = jest.fn().mockResolvedValue({
      rows: [
        { role: "user", content: "Bonjour", created_at: new Date("2026-09-07T10:00:00Z") },
        {
          role: "assistant",
          content: "Bonjour, comment puis-je vous aider ?",
          created_at: new Date("2026-09-07T10:00:01Z"),
        },
      ],
    })

    const result = await getConversationMessages("+22670000000", { query: queryMock })

    expect(result).toEqual([
      { role: "user", content: "Bonjour", createdAt: new Date("2026-09-07T10:00:00Z") },
      {
        role: "assistant",
        content: "Bonjour, comment puis-je vous aider ?",
        createdAt: new Date("2026-09-07T10:00:01Z"),
      },
    ])
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["+22670000000"])
  })

  it("returns null when the query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    const result = await getConversationMessages("+22670000000", { query: queryMock })

    expect(result).toBeNull()
  })
})
