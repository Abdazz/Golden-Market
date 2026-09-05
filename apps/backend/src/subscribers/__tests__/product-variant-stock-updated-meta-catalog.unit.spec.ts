import productVariantStockUpdatedMetaCatalogHandler from "../product-variant-stock-updated-meta-catalog"
import * as metaCatalogSync from "../../lib/meta-catalog-sync"

jest.mock("../../lib/meta-catalog-sync")

describe("productVariantStockUpdatedMetaCatalogHandler", () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  const graph = jest.fn()
  const retrieveInventoryLevel = jest.fn()
  const retrieveReservationItem = jest.fn()
  const inventoryModuleService = { retrieveInventoryLevel, retrieveReservationItem }

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return logger
      if (key === "query") return { graph }
      if (key === "inventory") return inventoryModuleService
      throw new Error(`Unexpected resolve: ${key}`)
    }),
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.META_CATALOG_ID = "catalog_123"
    process.env.META_CATALOG_ACCESS_TOKEN = "token_abc"
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it("resolves the inventory item from an inventory-level.updated event, then syncs every linked variant", async () => {
    retrieveInventoryLevel.mockResolvedValue({ id: "ilev_1", inventory_item_id: "iitem_1" })
    ;(metaCatalogSync.resolveVariantIdsForInventoryItem as jest.Mock).mockResolvedValue([
      "variant_1",
      "variant_2",
    ])
    ;(metaCatalogSync.syncVariantToMetaCatalog as jest.Mock).mockResolvedValue(undefined)

    await productVariantStockUpdatedMetaCatalogHandler({
      event: { name: "inventory-level.updated", data: { id: "ilev_1" } } as any,
      container: container as any,
    })

    expect(retrieveInventoryLevel).toHaveBeenCalledWith("ilev_1")
    expect(retrieveReservationItem).not.toHaveBeenCalled()
    expect(metaCatalogSync.syncVariantToMetaCatalog).toHaveBeenCalledTimes(2)
    expect(metaCatalogSync.syncVariantToMetaCatalog).toHaveBeenCalledWith({ graph }, "variant_1", {
      catalogId: "catalog_123",
      accessToken: "token_abc",
    })
    expect(metaCatalogSync.syncVariantToMetaCatalog).toHaveBeenCalledWith({ graph }, "variant_2", {
      catalogId: "catalog_123",
      accessToken: "token_abc",
    })
  })

  it("resolves the inventory item from a reservation-item event", async () => {
    retrieveReservationItem.mockResolvedValue({ id: "resitem_1", inventory_item_id: "iitem_1" })
    ;(metaCatalogSync.resolveVariantIdsForInventoryItem as jest.Mock).mockResolvedValue(["variant_1"])
    ;(metaCatalogSync.syncVariantToMetaCatalog as jest.Mock).mockResolvedValue(undefined)

    await productVariantStockUpdatedMetaCatalogHandler({
      event: { name: "reservation-item.created", data: { id: "resitem_1" } } as any,
      container: container as any,
    })

    expect(retrieveReservationItem).toHaveBeenCalledWith("resitem_1")
    expect(retrieveInventoryLevel).not.toHaveBeenCalled()
  })

  it("skips silently when Meta catalog env vars are not configured", async () => {
    delete process.env.META_CATALOG_ID

    await productVariantStockUpdatedMetaCatalogHandler({
      event: { name: "inventory-level.updated", data: { id: "ilev_1" } } as any,
      container: container as any,
    })

    expect(metaCatalogSync.resolveVariantIdsForInventoryItem).not.toHaveBeenCalled()
    expect(retrieveInventoryLevel).not.toHaveBeenCalled()
  })

  it("logs and does not throw when the reservation was already deleted", async () => {
    retrieveReservationItem.mockRejectedValue(new Error("not found"))

    await expect(
      productVariantStockUpdatedMetaCatalogHandler({
        event: { name: "reservation-item.deleted", data: { id: "resitem_gone" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("resitem_gone"),
      expect.any(Error)
    )
  })

  it("logs and does not throw when one of the variant syncs fails", async () => {
    retrieveInventoryLevel.mockResolvedValue({ id: "ilev_1", inventory_item_id: "iitem_1" })
    ;(metaCatalogSync.resolveVariantIdsForInventoryItem as jest.Mock).mockResolvedValue(["variant_1"])
    ;(metaCatalogSync.syncVariantToMetaCatalog as jest.Mock).mockRejectedValue(new Error("Meta 500"))

    await expect(
      productVariantStockUpdatedMetaCatalogHandler({
        event: { name: "inventory-level.updated", data: { id: "ilev_1" } } as any,
        container: container as any,
      })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })
})
