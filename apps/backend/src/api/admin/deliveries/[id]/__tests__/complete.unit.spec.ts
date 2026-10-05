import { POST } from "../complete/route"
import { completeDeliveryWorkflow } from "../../../../../workflows/complete-delivery"
import { takeDeliveryStockWorkflow } from "../../../../../workflows/courier-stock"
import { updateDeliveryWorkflow } from "../../../../../workflows/update-delivery"
import { recordAutoEntriesWorkflow } from "../../../../../workflows/cash-entries"
import { syncOrderAfterDelivery } from "../../../../../lib/delivery-order-sync"
import { STOCK_WARNING } from "../../../../../lib/courier-stock-rules"

jest.mock("../../../../../workflows/complete-delivery", () => ({ completeDeliveryWorkflow: jest.fn() }))
jest.mock("../../../../../workflows/courier-stock", () => ({ takeDeliveryStockWorkflow: jest.fn() }))
jest.mock("../../../../../workflows/update-delivery", () => ({ updateDeliveryWorkflow: jest.fn() }))
jest.mock("../../../../../workflows/cash-entries", () => ({ recordAutoEntriesWorkflow: jest.fn() }))
jest.mock("../../../../../lib/delivery-order-sync", () => ({ syncOrderAfterDelivery: jest.fn() }))

const delivery = {
  id: "del_1",
  order_id: "order_1",
  courier_id: "cou_1",
  status: "delivered",
  amount_collected: 5000,
}

// Un workflow simulé : wf(scope).run(...) renvoie le résultat ou lève l'erreur.
const runner = (run: jest.Mock) => () => ({ run })

function setup({
  take,
  graph,
  update = jest.fn().mockResolvedValue({ result: {} }),
  syncWarning = null,
}: {
  take: jest.Mock
  graph: jest.Mock
  update?: jest.Mock
  syncWarning?: string | null
}) {
  ;(completeDeliveryWorkflow as unknown as jest.Mock).mockImplementation(
    runner(jest.fn().mockResolvedValue({ result: delivery }))
  )
  ;(takeDeliveryStockWorkflow as unknown as jest.Mock).mockImplementation(runner(take))
  ;(updateDeliveryWorkflow as unknown as jest.Mock).mockImplementation(runner(update))
  const record = jest.fn().mockResolvedValue({ result: [] })
  ;(recordAutoEntriesWorkflow as unknown as jest.Mock).mockImplementation(runner(record))
  ;(syncOrderAfterDelivery as jest.Mock).mockResolvedValue(syncWarning)
  const logger = { error: jest.fn() }
  const req: any = {
    params: { id: "del_1" },
    validatedBody: { status: "delivered" },
    scope: { resolve: (key: string) => (key === "logger" ? logger : { graph }) },
  }
  const res: any = { json: jest.fn() }
  return { req, res, logger, update, record }
}

// Lecture des frais (courier, order) toujours possible dans ces tests.
const feeGraph = (entity: string) => {
  if (entity === "courier") return { data: [{ name: "Moussa" }] }
  if (entity === "order") return { data: [{ id: "order_1", custom_display_id: "20261006001" }] }
  return null
}

describe("POST /admin/deliveries/:id/complete", () => {
  afterEach(() => jest.clearAllMocks())

  it("déstockage en échec : stock_warning et sync_warning combiné avec l'avertissement de paiement", async () => {
    const graph = jest.fn(async ({ entity }: any) => feeGraph(entity) ?? { data: [] })
    const { req, res, update } = setup({
      take: jest.fn().mockRejectedValue(new Error("base indisponible")),
      graph,
      syncWarning: "Paiement non marqué.",
    })

    await POST(req, res)

    const body = res.json.mock.calls[0][0]
    expect(body.stock_warning).toBe(STOCK_WARNING)
    expect(body.sync_warning).toBe(`Paiement non marqué. ${STOCK_WARNING}`)
    expect(update).toHaveBeenCalledWith({ input: { id: "del_1", sync_warning: `Paiement non marqué. ${STOCK_WARNING}` } })
  })

  it("lecture des libellés en échec : pas de stock_warning, libellé « Article », erreur journalisée", async () => {
    const graph = jest.fn(async ({ entity }: any) => {
      if (entity === "inventory_item") throw new Error("lecture impossible")
      return feeGraph(entity) ?? { data: [] }
    })
    const { req, res, logger, update } = setup({
      take: jest.fn().mockResolvedValue({ result: [{ inventory_item_id: "iitem_1", quantity: -2 }] }),
      graph,
    })

    await POST(req, res)

    const body = res.json.mock.calls[0][0]
    expect(body.stock_warning).toBeNull()
    expect(body.sync_warning).toBeNull()
    expect(body.stock_taken).toEqual([{ label: "Article", quantity: 2 }])
    expect(update).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it("inscription de l'avertissement en échec : réponse renvoyée et journal de caisse quand même inscrit", async () => {
    const graph = jest.fn(async ({ entity }: any) => feeGraph(entity) ?? { data: [] })
    const { req, res, logger, record } = setup({
      take: jest.fn().mockRejectedValue(new Error("base indisponible")),
      graph,
      update: jest.fn().mockRejectedValue(new Error("écriture impossible")),
    })
    req.validatedBody = { status: "delivered", courier_fee: 1000 }
    ;(completeDeliveryWorkflow as unknown as jest.Mock).mockImplementation(
      runner(jest.fn().mockResolvedValue({ result: { ...delivery, courier_fee: 1000 } }))
    )

    await POST(req, res)

    const body = res.json.mock.calls[0][0]
    expect(body.stock_warning).toBe(STOCK_WARNING)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("del_1"))
    expect(record).toHaveBeenCalled()
  })
})
