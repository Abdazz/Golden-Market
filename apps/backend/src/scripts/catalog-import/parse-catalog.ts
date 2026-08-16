import ExcelJS from "exceljs"
import path from "path"

export type ParsedProduct = {
  name: string
  description: string
  retailPrice: number
  wholesalePrice: number
  imageBuffer: Buffer
  imageExtension: string
  collection: "express" | "sur-commande"
}

const HEADERS = {
  name: "Nom du produit",
  retailPrice: "Prix en détail",
  wholesalePrice: "Prix en gros",
  description: "Description",
} as const

type ColumnMap = Record<keyof typeof HEADERS, number | null>

function findHeaderColumns(worksheet: ExcelJS.Worksheet): ColumnMap {
  const headerRow = worksheet.getRow(3)
  const columns: ColumnMap = {
    name: null,
    retailPrice: null,
    wholesalePrice: null,
    description: null,
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

type UnillustratedProduct = Omit<ParsedProduct, "imageBuffer" | "imageExtension">

function parseSheet(
  worksheet: ExcelJS.Worksheet,
  collection: ParsedProduct["collection"]
): UnillustratedProduct[] {
  const columns = findHeaderColumns(worksheet)

  if (!columns.name || !columns.retailPrice || !columns.wholesalePrice) {
    throw new Error(
      `Colonnes obligatoires introuvables dans la feuille "${worksheet.name}" (attendu : "${HEADERS.name}", "${HEADERS.retailPrice}", "${HEADERS.wholesalePrice}")`
    )
  }

  const products: UnillustratedProduct[] = []
  let rowNumber = 4

  // Les lignes produit sont contiguës à partir de la ligne 4 (vérifié sur le
  // fichier réel : aucune ligne vide au milieu des données).
  while (true) {
    const row = worksheet.getRow(rowNumber)
    const name = String(row.getCell(columns.name).value ?? "").trim()

    if (!name) {
      break
    }

    const description = columns.description
      ? String(row.getCell(columns.description).value ?? "").trim()
      : ""

    const retailPrice = Number(row.getCell(columns.retailPrice).value)
    const wholesalePrice = Number(row.getCell(columns.wholesalePrice).value)

    if (!Number.isFinite(retailPrice) || !Number.isFinite(wholesalePrice)) {
      throw new Error(
        `Prix invalide pour le produit "${name}" (feuille "${worksheet.name}", ligne ${rowNumber}) : ` +
          `prix détail=${JSON.stringify(row.getCell(columns.retailPrice).value)}, ` +
          `prix gros=${JSON.stringify(row.getCell(columns.wholesalePrice).value)}`
      )
    }

    products.push({
      name,
      description: description || name,
      retailPrice,
      wholesalePrice,
      collection,
    })

    rowNumber += 1
  }

  return products
}

function attachImages(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  products: UnillustratedProduct[]
): ParsedProduct[] {
  const imagesByRow = new Map<number, { buffer: Buffer; extension: string }>()

  for (const image of worksheet.getImages()) {
    // .row est la coordonnée flottante du coin haut-gauche de l'ancre ; la ligne
    // qui la contient est le sol de cette coordonnée, pas la valeur arrondie —
    // arrondir risquerait de rattacher une image à la mauvaise ligne si un futur
    // export du fichier source déplace légèrement une ancre près d'une frontière
    // de ligne.
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
      `Désalignement images/produits dans la feuille "${worksheet.name}" : ` +
        `${imagesByRow.size} image(s) trouvée(s) pour ${products.length} produit(s)`
    )
  }

  return products.map((product, index) => {
    const excelRow = index + 4
    const image = imagesByRow.get(excelRow)

    if (!image) {
      throw new Error(
        `Aucune image trouvée pour le produit "${product.name}" (feuille "${worksheet.name}", ligne ${excelRow})`
      )
    }

    return { ...product, imageBuffer: image.buffer, imageExtension: image.extension }
  })
}

export function parseWorkbook(workbook: ExcelJS.Workbook): ParsedProduct[] {
  const [expressSheet, onOrderSheet] = workbook.worksheets

  if (!expressSheet || !onOrderSheet) {
    throw new Error(
      `Le fichier doit contenir 2 feuilles (vente express, vente sur commande) — trouvé ${workbook.worksheets.length}`
    )
  }

  const expressProducts = attachImages(workbook, expressSheet, parseSheet(expressSheet, "express"))
  const onOrderProducts = attachImages(
    workbook,
    onOrderSheet,
    parseSheet(onOrderSheet, "sur-commande")
  )

  return [...expressProducts, ...onOrderProducts]
}

export async function parseCatalog(filePath: string): Promise<ParsedProduct[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return parseWorkbook(workbook)
}

// CATALOG_PATH permet de pointer vers le fichier source dans un déploiement où le
// build compilé ne l'embarque pas à côté de ce script (Phase 3, pas encore fait) ;
// le chemin relatif à __dirname reste le comportement par défaut inchangé pour tous
// les usages actuels (dev, `medusa exec` depuis un checkout source).
export const DEFAULT_CATALOG_PATH =
  process.env.CATALOG_PATH ??
  path.join(__dirname, "Golden Market - Catalogue des produits.xlsx")
