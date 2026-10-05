import handler, { config } from "../order-canceled-deliveries"
import { updateDeliveryWorkflow } from "../../workflows/update-delivery"

jest.mock("../../workflows/update-delivery", () => ({ updateDeliveryWorkflow: jest.fn() }))

const makeContainer = (deliveries: { id: string; status: string }[]) => {
  const graph = jest.fn().mockResolvedValue({ data: deliveries })
  const logger = { error: jest.fn() }
  const container = { resolve: jest.fn((key: string) => (key === "logger" ? logger : { graph })) }
  return { container, graph, logger }
}

describe("order-canceled-deliveries", () => {
  const run = jest.fn().mockResolvedValue({ result: [] })
  beforeEach(() => {
    jest.clearAllMocks()
    ;(updateDeliveryWorkflow as unknown as jest.Mock).mockReturnValue({ run })
  })
  it("écoute order.canceled", () => {
    expect(config.event).toBe("order.canceled")
  })
  it("passe à « annulée » les livraisons confiées de la commande", async () => {
    const { container, graph } = makeContainer([
      { id: "d1", status: "assigned" },
      { id: "d2", status: "delivered" },
    ])
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "delivery", filters: { order_id: "order_1" } }))
    expect(run).toHaveBeenCalledWith({ input: [{ id: "d1", status: "canceled" }] })
  })
  it("rien à annuler : aucun workflow lancé", async () => {
    const { container } = makeContainer([{ id: "d2", status: "delivered" }])
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(run).not.toHaveBeenCalled()
  })
  it("échec : journalisé, jamais relancé", async () => {
    const { container, logger } = makeContainer([{ id: "d1", status: "assigned" }])
    run.mockRejectedValueOnce(new Error("base indisponible"))
    await expect(handler({ event: { data: { id: "order_1" } }, container } as any)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
