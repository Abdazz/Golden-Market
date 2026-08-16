import ExcelJS from "exceljs"
import { parseWorkbook } from "../parse-catalog"

describe("parseWorkbook", () => {
  it("parses products from both sheets using header-based column mapping, with image and description fallback", () => {
    const workbook = new ExcelJS.Workbook()

    // Feuille 1 : ordre Nom, Prix détail, Prix gros, Description (comme le vrai fichier)
    const sheet1 = workbook.addWorksheet("Produits en vente express")
    sheet1.getCell("C3").value = "Nom du produit"
    sheet1.getCell("D3").value = "Prix en détail"
    sheet1.getCell("E3").value = "Prix en gros"
    sheet1.getCell("F3").value = "Description"

    sheet1.getCell("C4").value = "Produit sans description"
    sheet1.getCell("D4").value = 3000
    sheet1.getCell("E4").value = 2000
    // pas de F4 -> doit retomber sur le nom

    sheet1.getCell("C5").value = "Produit avec description"
    sheet1.getCell("D5").value = 9500
    sheet1.getCell("E5").value = 8500
    sheet1.getCell("F5").value = "Une belle description"

    const image1 = workbook.addImage({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      extension: "png",
    })
    sheet1.addImage(image1, { tl: { col: 1, row: 3 }, br: { col: 2, row: 4 } })
    const image2 = workbook.addImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      extension: "jpeg",
    })
    sheet1.addImage(image2, { tl: { col: 1, row: 4 }, br: { col: 2, row: 5 } })

    // Feuille 2 : ordre Nom, Description, Prix détail, Prix gros (inversé par rapport à la feuille 1)
    const sheet2 = workbook.addWorksheet("Prouits en vente sur commande")
    sheet2.getCell("C3").value = "Nom du produit"
    sheet2.getCell("D3").value = "Description"
    sheet2.getCell("E3").value = "Prix en détail"
    sheet2.getCell("F3").value = "Prix en gros"

    sheet2.getCell("C4").value = "Produit sur commande"
    sheet2.getCell("E4").value = 430500
    sheet2.getCell("F4").value = 380000

    const image3 = workbook.addImage({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      extension: "png",
    })
    sheet2.addImage(image3, { tl: { col: 1, row: 3 }, br: { col: 2, row: 4 } })

    const products = parseWorkbook(workbook)

    expect(products).toHaveLength(3)

    expect(products[0]).toMatchObject({
      name: "Produit sans description",
      description: "Produit sans description",
      retailPrice: 3000,
      wholesalePrice: 2000,
      collection: "express",
      imageExtension: "png",
    })
    expect(products[0].imageBuffer).toBeInstanceOf(Buffer)

    expect(products[1]).toMatchObject({
      name: "Produit avec description",
      description: "Une belle description",
      retailPrice: 9500,
      wholesalePrice: 8500,
      collection: "express",
      imageExtension: "jpeg",
    })

    expect(products[2]).toMatchObject({
      name: "Produit sur commande",
      description: "Produit sur commande",
      retailPrice: 430500,
      wholesalePrice: 380000,
      collection: "sur-commande",
      imageExtension: "png",
    })
  })

  it("throws a clear error naming the row when a product has no associated image", () => {
    const workbook = new ExcelJS.Workbook()
    const sheet1 = workbook.addWorksheet("Produits en vente express")
    sheet1.getCell("C3").value = "Nom du produit"
    sheet1.getCell("D3").value = "Prix en détail"
    sheet1.getCell("E3").value = "Prix en gros"
    sheet1.getCell("F3").value = "Description"
    sheet1.getCell("C4").value = "Produit sans image"
    sheet1.getCell("D4").value = 1000
    sheet1.getCell("E4").value = 800

    const sheet2 = workbook.addWorksheet("Prouits en vente sur commande")
    sheet2.getCell("C3").value = "Nom du produit"
    sheet2.getCell("D3").value = "Description"
    sheet2.getCell("E3").value = "Prix en détail"
    sheet2.getCell("F3").value = "Prix en gros"

    expect(() => parseWorkbook(workbook)).toThrow(/ligne 4/)
  })
})
