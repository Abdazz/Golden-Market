import ExcelJS from "exceljs"

// Parseur dédié au lot ponctuel "Golden_Market_New_products.xlsx" (2026-09) :
// une seule feuille (pas de distinction express/sur-commande dans le
// fichier), avec deux colonnes que le catalogue d'origine n'a pas (Stock,
// Prix unitaire promo, Livraison gratuite). Décision explicite du
// propriétaire : cas ponctuel, ne remplace pas parse-catalog.ts.
export type NewProduct = {
  name: string
  description: string
  retailPrice: number
  wholesalePrice: number
  promoPrice: number
  stock: number
  freeShippingNote: string | null
  imageBuffer: Buffer
  imageExtension: string
}

const HEADERS = {
  name: "Nom du produit",
  retailPrice: "Prix en détail",
  wholesalePrice: "Prix en gros",
  description: "Description",
  stock: "Stock",
  promoPrice: "Prix unitaire promo",
  freeShipping: "Livraison grauite", // faute d'orthographe présente dans le fichier source
} as const

type ColumnMap = Record<keyof typeof HEADERS, number | null>

function findHeaderColumns(worksheet: ExcelJS.Worksheet): ColumnMap {
  const headerRow = worksheet.getRow(3)
  const columns: ColumnMap = {
    name: null,
    retailPrice: null,
    wholesalePrice: null,
    description: null,
    stock: null,
    promoPrice: null,
    freeShipping: null,
  }

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.value ?? "").trim()
    for (const [key, header] of Object.entries(HEADERS)) {
      if (text === header) {
        columns[key as keyof typeof HEADERS] = colNumber
      }
    }
  })

  return columns
}

type UnillustratedProduct = Omit<NewProduct, "imageBuffer" | "imageExtension">

function parseSheet(worksheet: ExcelJS.Worksheet): UnillustratedProduct[] {
  const columns = findHeaderColumns(worksheet)

  const required = ["name", "retailPrice", "wholesalePrice", "stock", "promoPrice"] as const
  const missing = required.filter((key) => !columns[key])
  if (missing.length > 0) {
    throw new Error(
      `Colonnes obligatoires introuvables dans la feuille "${worksheet.name}" : ${missing
        .map((k) => HEADERS[k])
        .join(", ")}`
    )
  }

  const products: UnillustratedProduct[] = []
  let rowNumber = 4

  while (true) {
    const row = worksheet.getRow(rowNumber)
    const name = String(row.getCell(columns.name!).value ?? "").trim()

    if (!name) {
      break
    }

    const description = columns.description
      ? String(row.getCell(columns.description).value ?? "").trim()
      : ""

    const retailPrice = Number(row.getCell(columns.retailPrice!).value)
    const wholesalePrice = Number(row.getCell(columns.wholesalePrice!).value)
    const promoPrice = Number(row.getCell(columns.promoPrice!).value)
    const stock = Number(row.getCell(columns.stock!).value)

    for (const [label, value] of [
      ["prix détail", retailPrice],
      ["prix gros", wholesalePrice],
      ["prix promo", promoPrice],
      ["stock", stock],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new Error(
          `Valeur "${label}" invalide pour le produit "${name}" (ligne ${rowNumber})`
        )
      }
    }

    const freeShippingRaw = columns.freeShipping
      ? String(row.getCell(columns.freeShipping).value ?? "").trim()
      : ""

    products.push({
      name,
      description: description || name,
      retailPrice,
      wholesalePrice,
      promoPrice,
      stock,
      freeShippingNote: freeShippingRaw || null,
    })

    rowNumber += 1
  }

  return products
}

function attachImages(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  products: UnillustratedProduct[]
): NewProduct[] {
  const imagesByRow = new Map<number, { buffer: Buffer; extension: string }>()

  for (const image of worksheet.getImages()) {
    const excelRow = Math.floor(image.range.tl.row) + 1
    const media = workbook.getImage(Number(image.imageId))
    imagesByRow.set(excelRow, {
      buffer: Buffer.isBuffer(media.buffer)
        ? media.buffer
        : Buffer.from(media.buffer as ArrayBuffer),
      extension: media.extension,
    })
  }

  if (imagesByRow.size !== products.length) {
    throw new Error(
      `Désalignement images/produits : ${imagesByRow.size} image(s) trouvée(s) pour ${products.length} produit(s)`
    )
  }

  return products.map((product, index) => {
    const excelRow = index + 4
    const image = imagesByRow.get(excelRow)

    if (!image) {
      throw new Error(`Aucune image trouvée pour "${product.name}" (ligne ${excelRow})`)
    }

    return { ...product, imageBuffer: image.buffer, imageExtension: image.extension }
  })
}

export async function parseNewProducts(filePath: string): Promise<NewProduct[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const [sheet] = workbook.worksheets
  if (!sheet) {
    throw new Error("Le fichier ne contient aucune feuille")
  }

  return attachImages(workbook, sheet, parseSheet(sheet))
}
