import { convertProspectsForOrder } from "../prospect-conversion"

describe("convertProspectsForOrder", () => {
  const setup = (order: unknown, prospects: unknown[]) => {
    const graph = jest.fn().mockResolvedValue({ data: order ? [order] : [] })
    const listProspects = jest.fn().mockResolvedValue(prospects)
    const logger = { error: jest.fn() }
    const container = {
      resolve: (key: string) => (key === "query" ? { graph } : key === "prospects" ? { listProspects } : logger),
    }
    const convert = jest.fn().mockResolvedValue(undefined)
    return { container, convert, logger }
  }

  it("convertit les fiches du numéro de livraison de la commande", async () => {
    const { container, convert } = setup({ id: "order_1", shipping_address: { phone: "+22670000000" } }, [
      { id: "a", phone: "+22670000000", status: "to_follow_up", follow_up_on: null, variant_id: null },
      { id: "b", phone: "+22676000000", status: "to_follow_up", follow_up_on: null, variant_id: null },
    ])
    await convertProspectsForOrder(container as any, "order_1", convert)
    expect(convert).toHaveBeenCalledWith({ ids: ["a"], order_id: "order_1" })
  })

  it("aucun prospect : rien n'est fait ; erreur : journalisée, jamais levée", async () => {
    const empty = setup({ id: "order_1", shipping_address: { phone: "+22670000000" } }, [])
    await convertProspectsForOrder(empty.container as any, "order_1", empty.convert)
    expect(empty.convert).not.toHaveBeenCalled()
    const failing = setup({ id: "order_1", shipping_address: { phone: "+22670000000" } }, [{ id: "a", phone: "+22670000000", status: "lost", follow_up_on: null, variant_id: null }])
    failing.convert.mockRejectedValue(new Error("base"))
    await expect(convertProspectsForOrder(failing.container as any, "order_1", failing.convert)).resolves.toBeUndefined()
    expect(failing.logger.error).toHaveBeenCalled()
  })
})
