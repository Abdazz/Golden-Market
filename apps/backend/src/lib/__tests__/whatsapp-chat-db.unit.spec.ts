import { getConversation, listConversations } from "../whatsapp-chat-db"

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
          awaiting_reply: true,
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
        awaitingReply: true,
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

describe("getConversation", () => {
  it("returns null when no executor is configured", async () => {
    expect(await getConversation("22670000000", null)).toBeNull()
  })

  it("returns not_found when the conversation does not exist", async () => {
    const queryMock = jest.fn().mockResolvedValueOnce({ rows: [] })

    expect(await getConversation("22670000000", { query: queryMock })).toBe("not_found")
  })

  it("maps the conversation and its messages, human role included, ordered by the query", async () => {
    const humanAt = new Date("2026-09-27T10:00:00Z")
    const userAt = new Date("2026-09-27T09:00:00Z")
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "conv-1",
            phone_number: "22670000000",
            customer_name: null,
            status: "escalated",
            human_last_action_at: humanAt,
            last_user_message_at: userAt,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { role: "user", content: "Bonjour", created_at: userAt },
          { role: "human", content: "Je m'en occupe", created_at: humanAt },
        ],
      })

    const result = await getConversation("22670000000", { query: queryMock })

    expect(result).toEqual({
      phoneNumber: "22670000000",
      customerName: null,
      status: "escalated",
      humanLastActionAt: humanAt,
      lastUserMessageAt: userAt,
      messages: [
        { role: "user", content: "Bonjour", createdAt: userAt },
        { role: "human", content: "Je m'en occupe", createdAt: humanAt },
      ],
    })
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("ORDER BY seq ASC"), ["conv-1"])
  })

  it("returns null when a query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    expect(await getConversation("22670000000", { query: queryMock })).toBeNull()
  })
})
