import { POST } from "../route"
import {
  convertDraftOrderWorkflow,
  createCustomersWorkflow,
  createOrUpdateOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"

jest.mock("@medusajs/medusa/core-flows", () => ({
  convertDraftOrderWorkflow: jest.fn(),
  createCustomersWorkflow: jest.fn(),
  createOrUpdateOrderPaymentCollectionWorkflow: jest.fn(),
  createOrderWorkflow: jest.fn(),
}))

const runs = {
  customers: jest.fn().mockResolvedValue({ result: [{ id: "cus_new" }] }),
  order: jest.fn().mockResolvedValue({ result: { id: "order_1" } }),
  convert: jest.fn().mockResolvedValue({}),
  payment: jest.fn().mockResolvedValue({}),
}

const res = () => {
  const r: any = {}
  r.status = jest.fn(() => r)
  r.json = jest.fn(() => r)
  return r
}

const body = {
  phone: "70 00 00 00",
  first_name: "Awa",
  city: "Kaya",
  address: "Secteur 1",
  payment_method: "orange-money",
  items: [{ variant_id: "var_1", quantity: 1 }],
}

const scope = (opts: { existingCustomer?: boolean; fee?: number; noShipping?: boolean } = {}) => {
  const graph = jest.fn(async ({ entity }: any) => {
    if (entity === "region") return { data: [{ id: "reg_bf", currency_code: "xof", countries: [{ iso_2: "bf" }] }] }
    if (entity === "sales_channel") return { data: [{ id: "sc_1" }] }
    if (entity === "shipping_option") return { data: opts.noShipping ? [] : [{ id: "so_1", name: "Livraison", rules: [] }] }
    if (entity === "product_variant") return { data: [{ id: "var_1", product: { id: "p1", metadata: { frais_expedition_xof: opts.fee ?? 1000 } } }] }
    if (entity === "customer") return { data: opts.existingCustomer ? [{ id: "cus_old" }] : [] }
    if (entity === "order") return { data: [{ id: "order_1", display_id: 7, custom_display_id: "20261006001" }] }
    return { data: [] }
  })
  return { graph, req: (b: unknown) => ({ body: b, scope: { resolve: () => ({ graph }) } }) as any }
}

describe("POST /admin/phone-orders", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(createCustomersWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.customers })
    ;(createOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.order })
    ;(convertDraftOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.convert })
    ;(createOrUpdateOrderPaymentCollectionWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.payment })
  })

  it("requête invalide : 400 avec le message de validation", async () => {
    const r = res()
    await POST(scope().req({ ...body, phone: "" }), r)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(r.json).toHaveBeenCalledWith({ message: expect.any(String) })
  })

  it("hors Ouagadougou : frais du produit transmis au brouillon, client créé", async () => {
    const r = res()
    await POST(scope({ fee: 1500 }).req(body), r)
    expect(runs.customers).toHaveBeenCalled()
    const draft = runs.order.mock.calls[0][0].input
    expect(draft.shipping_methods).toEqual([{ name: "Livraison", shipping_option_id: "so_1", amount: 1500 }])
    expect(r.json).toHaveBeenCalledWith({ order_id: "order_1", display_id: 7, order_number: "20261006001" })
  })

  it("Ouagadougou : livraison gratuite, client existant réutilisé", async () => {
    await POST(scope({ existingCustomer: true }).req({ ...body, city: "Ouagadougou" }), res())
    expect(runs.customers).not.toHaveBeenCalled()
    expect(runs.order.mock.calls[0][0].input.shipping_methods).toEqual([
      { name: "Livraison", shipping_option_id: "so_1", amount: 0 },
    ])
  })

  it("configuration incomplète : 500", async () => {
    const r = res()
    await POST(scope({ noShipping: true }).req(body), r)
    expect(r.status).toHaveBeenCalledWith(500)
  })
})
