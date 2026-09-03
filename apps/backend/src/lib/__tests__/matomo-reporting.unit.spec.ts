import { fetchAnalyticsSummary } from "../matomo-reporting"

describe("fetchAnalyticsSummary", () => {
  it("returns unavailable when Matomo is not configured", async () => {
    const result = await fetchAnalyticsSummary({})

    expect(result).toEqual({ available: false })
  })

  it("aggregates the bulk API response into a summary", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { value: 12 }, // VisitsSummary.get (day)
        { value: 54 }, // VisitsSummary.get (week)
        [
          { label: "/products/coupe-ongles", nb_visits: 8 },
          { label: "/", nb_visits: 6 },
        ], // Actions.getPageUrls
        [
          { label: "Direct Entry", nb_visits: 7 },
          { label: "Search Engines", nb_visits: 5 },
        ], // Referrers.getReferrerType
        { ecommerceOrder: { nb_conversions: 2, conversion_rate: "16.7%" } }, // Goals.get
      ],
    })

    const result = await fetchAnalyticsSummary(
      {
        reportingUrl: "http://matomo",
        siteId: "1",
        apiToken: "test-token",
      },
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual({
      available: true,
      visitsToday: 12,
      visitsWeek: 54,
      topPages: [
        { label: "/products/coupe-ongles", visits: 8 },
        { label: "/", visits: 6 },
      ],
      topReferrerType: "Direct Entry",
      conversionRate: "16.7%",
    })
  })

  it("returns unavailable when the request fails", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("network error"))

    const result = await fetchAnalyticsSummary(
      { reportingUrl: "http://matomo", siteId: "1", apiToken: "test-token" },
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual({ available: false })
  })

  it("returns unavailable when Matomo responds with a non-ok status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) })

    const result = await fetchAnalyticsSummary(
      { reportingUrl: "http://matomo", siteId: "1", apiToken: "test-token" },
      fetchMock as unknown as typeof fetch
    )

    expect(result).toEqual({ available: false })
  })
})
