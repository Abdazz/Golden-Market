import { getConversation, listConversations, normalizeAttachments } from "../whatsapp-chat-db"

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

  it("marks a conversation as awaiting a reply whenever the client wrote last, whatever its status", async () => {
    // Sans ça, "Rendre la main à l'IA" faisait disparaître le point rouge alors
    // que la dernière question du client restait sans réponse (relecture finale 2026-09-27).
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })

    await listConversations(undefined, { query: queryMock })

    const sql = queryMock.mock.calls[0][0] as string
    expect(sql).toContain("(m.role = 'user') AS awaiting_reply")
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
          { role: "human", content: "Je m'en occupe", created_at: humanAt, delivery_status: "failed", delivery_error: "131047: Message failed" },
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
        { role: "user", content: "Bonjour", createdAt: userAt, attachments: [], deliveryError: null },
        { role: "human", content: "Je m'en occupe", createdAt: humanAt, attachments: [], deliveryError: "131047: Message failed" },
      ],
    })
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("ORDER BY seq ASC"), ["conv-1"])
    expect(queryMock.mock.calls[1][0]).toContain("delivery_error")
  })

  it("returns image attachments (photos sent by the agent or the client), empty list when none", async () => {
    const at = new Date("2026-09-27T10:00:00Z")
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "conv-1", phone_number: "1", customer_name: null, status: "active", human_last_action_at: null, last_user_message_at: at }],
      })
      .mockResolvedValueOnce({
        rows: [
          { role: "user", content: "[Photo envoyée par le client]", created_at: at, attachments: [{ type: "image", url: "https://x/photo.jpg" }] },
          { role: "assistant", content: "Bonjour", created_at: at, attachments: null },
        ],
      })

    const result = await getConversation("1", { query: queryMock })

    expect(result !== null && result !== "not_found" && result.messages.map((m) => m.attachments)).toEqual([
      [{ type: "image", url: "https://x/photo.jpg" }],
      [],
    ])
    expect(queryMock.mock.calls[1][0]).toContain("attachments")
  })

  it("returns null when a query fails", async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error("connection refused"))

    expect(await getConversation("22670000000", { query: queryMock })).toBeNull()
  })
})

describe("normalizeAttachments", () => {
  it("garde les anciennes photos et les nouveaux types, ignore le reste", () => {
    expect(
      normalizeAttachments([
        { type: "image", url: "https://x/a.jpg" },
        { type: "video", url: "https://x/b.mp4", mime_type: "video/mp4" },
        { type: "audio", url: null, expired: true, voice: true },
        { type: "document", url: "https://x/c.pdf", filename: "Facture.pdf", size: 1200 },
        { type: "sticker", url: "https://x/d.webp" },
        "n'importe quoi",
      ])
    ).toEqual([
      { type: "image", url: "https://x/a.jpg" },
      { type: "video", url: "https://x/b.mp4", mime_type: "video/mp4" },
      { type: "audio", url: null, expired: true, voice: true },
      { type: "document", url: "https://x/c.pdf", filename: "Facture.pdf", size: 1200 },
    ])
    expect(normalizeAttachments(null)).toEqual([])
  })
})
