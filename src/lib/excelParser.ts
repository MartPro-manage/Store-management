import * as XLSX from 'xlsx';
import { Product } from '../types';

export interface BatchProductRow {
  id: string;
  barcode: string;
  serialNumber?: string;
  shortcutCode?: string;
  name: string;
  category: string;
  sellBy: 'unit' | 'weight';
  unitType: 'piece' | 'kg' | 'g' | 'liter' | 'dozen';
  quantity: number;
  costPrice: number;
  price: number; // Retail selling price (per piece or per kg/liter)
  status?: 'valid' | 'warning' | 'error';
  errorMessage?: string;
}

/**
 * Generates a clean full random barcode (12 digits, e.g. 890000000000 - 890999999999)
 */
export function generateRandomBarcode(): string {
  return '890' + Math.floor(100000000 + Math.random() * 900000000).toString();
}

/**
 * Robustly sanitizes and extracts clean barcode number from any Excel cell value.
 * Handles numbers, scientific notation (8.90...E+12), trailing floats (.0), quotes, and apostrophes.
 */
export function cleanBarcodeString(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // Scientific notation handling (e.g. 8.90123456789E+12 or 8.90123e+12)
  if (/^[0-9.]+[eE][+-]?[0-9]+$/i.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {
      // fallback to original string
    }
  }

  // Remove trailing .0 or .00 if Excel/Pandas/CSV exported integer barcodes as floats
  str = str.replace(/\.0+$/, '');

  // Strip surrounding quotes or single apostrophes commonly used in CSV/Excel text formatting
  str = str.replace(/^['"]+|['"]+$/g, '').trim();

  return str;
}

/**
 * Checks if a string or number looks like a genuine barcode (8 to 18 digits or EAN/UPC)
 */
function isBarcodeFormat(val: string): boolean {
  if (!val) return false;
  // Standard EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14, or code-128 numeric codes (8 to 18 digits)
  if (/^\d{8,18}$/.test(val)) return true;
  // Alphanumeric barcodes with letters and numbers (at least 5 chars, containing numbers)
  if (/^[a-zA-Z0-9_-]{5,24}$/.test(val) && /\d/.test(val) && !val.includes(' ')) return true;
  return false;
}

/**
 * Parse Excel (.xlsx, .xls) or CSV file into batch product rows.
 * Features smart multi-row header detection, dynamic column mapping,
 * and intelligent content-based barcode discovery.
 */
export async function parseExcelProductFile(file: File): Promise<BatchProductRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('No sheets found in the uploaded spreadsheet.');
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // 1. Read sheet as 2D array of rows (Header: 1)
  const rawSheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });

  if (!rawSheetData || rawSheetData.length === 0) {
    throw new Error('The spreadsheet is empty. Please ensure it contains product data.');
  }

  // 2. Automatically locate the header row (scanning first 15 rows)
  let headerRowIndex = -1;
  let maxHeaderMatches = 0;

  for (let r = 0; r < Math.min(rawSheetData.length, 15); r++) {
    const row = rawSheetData[r];
    if (!Array.isArray(row)) continue;
    let matches = 0;
    for (const cell of row) {
      const c = String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        c.includes('barcode') || 
        c.includes('ean') || 
        c.includes('upc') || 
        c.includes('gtin') || 
        c.includes('sku') || 
        c.includes('scancode')
      ) {
        matches += 4;
      }
      if (
        c.includes('name') || 
        c.includes('product') || 
        c.includes('item') || 
        c.includes('description') || 
        c.includes('title')
      ) {
        matches += 3;
      }
      if (
        c.includes('price') || 
        c.includes('rate') || 
        c.includes('mrp') || 
        c.includes('cost') || 
        c.includes('qty') || 
        c.includes('stock')
      ) {
        matches += 2;
      }
    }

    if (matches > maxHeaderMatches && matches >= 3) {
      maxHeaderMatches = matches;
      headerRowIndex = r;
    }
  }

  // 3. Map column indices from detected header row
  const headerRow: any[] = headerRowIndex >= 0 ? rawSheetData[headerRowIndex] : [];
  let nameColIdx = -1;
  let barcodeColIdx = -1;
  let costColIdx = -1;
  let priceColIdx = -1;
  let qtyColIdx = -1;
  let categoryColIdx = -1;
  let unitColIdx = -1;

  if (headerRow.length > 0) {
    headerRow.forEach((cell, idx) => {
      const c = String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!c) return;

      // Barcode column identification
      if (
        barcodeColIdx === -1 && (
          c.includes('barcode') || 
          c.includes('barcodes') || 
          c.includes('barcodeno') || 
          c.includes('barcodenumber') || 
          c.includes('ean') || 
          c.includes('upc') || 
          c.includes('gtin') || 
          c.includes('scancode') || 
          c.includes('itemcode') || 
          c.includes('productcode') || 
          c.includes('bcode') || 
          c.includes('serial') || 
          c.includes('srno') || 
          c.includes('serialno') || 
          c.includes('sku') ||
          (c === 'code' && !c.includes('zip') && !c.includes('postal'))
        )
      ) {
        barcodeColIdx = idx;
      }

      // Name column identification
      if (
        nameColIdx === -1 && (
          c.includes('name') || 
          c.includes('product') || 
          c.includes('item') || 
          c.includes('desc') || 
          c.includes('title') || 
          c.includes('particular')
        ) && !c.includes('code') && !c.includes('price') && !c.includes('cost') && !c.includes('qty')
      ) {
        nameColIdx = idx;
      }

      // Cost price identification
      if (
        costColIdx === -1 && (
          c.includes('cost') || 
          c.includes('wholesale') || 
          c.includes('purchase') || 
          c.includes('buyprice') || 
          c.includes('buyrate') || 
          c.includes('unitcost') || 
          c === 'cp'
        )
      ) {
        costColIdx = idx;
      }

      // Selling price identification
      if (
        priceColIdx === -1 && (
          c.includes('selling') || 
          c.includes('retail') || 
          c.includes('price') || 
          c.includes('rate') || 
          c.includes('mrp') || 
          c.includes('sale') || 
          c.includes('unitprice') || 
          c === 'sp'
        ) && !c.includes('cost') && !c.includes('wholesale') && !c.includes('purchase')
      ) {
        priceColIdx = idx;
      }

      // Quantity identification
      if (
        qtyColIdx === -1 && (
          c.includes('qty') || 
          c.includes('quantity') || 
          c.includes('stock') || 
          c.includes('units') || 
          c.includes('count') || 
          c.includes('pcs') || 
          c.includes('pieces')
        )
      ) {
        qtyColIdx = idx;
      }

      // Category identification
      if (
        categoryColIdx === -1 && (
          c.includes('category') || 
          c.includes('cat') || 
          c.includes('dept') || 
          c.includes('department') || 
          c.includes('group')
        )
      ) {
        categoryColIdx = idx;
      }

      // Unit identification
      if (
        unitColIdx === -1 && (
          c.includes('unit') || 
          c.includes('uom') || 
          c.includes('type') || 
          c.includes('packaging')
        ) && !c.includes('price') && !c.includes('cost')
      ) {
        unitColIdx = idx;
      }
    });
  }

  // 4. Content-Based Barcode Column Discovery:
  // If barcode column was not found from header names, scan data columns for barcode patterns!
  const dataStartRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

  if (barcodeColIdx === -1) {
    const colBarcodeMatches: Record<number, number> = {};

    for (let r = dataStartRow; r < Math.min(rawSheetData.length, dataStartRow + 30); r++) {
      const row = rawSheetData[r];
      if (!Array.isArray(row)) continue;

      row.forEach((cell, idx) => {
        if (idx === nameColIdx || idx === priceColIdx || idx === costColIdx || idx === qtyColIdx) return;
        const cleaned = cleanBarcodeString(cell);
        if (isBarcodeFormat(cleaned)) {
          colBarcodeMatches[idx] = (colBarcodeMatches[idx] || 0) + 1;
        }
      });
    }

    let highestCount = 0;
    for (const [colIdxStr, count] of Object.entries(colBarcodeMatches)) {
      if (count > highestCount && count >= 1) {
        highestCount = count;
        barcodeColIdx = Number(colIdxStr);
      }
    }
  }

  // 5. Build parsed products array
  const products: BatchProductRow[] = [];

  for (let r = dataStartRow; r < rawSheetData.length; r++) {
    const row = rawSheetData[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Extract name
    let name = '';
    if (nameColIdx >= 0 && row[nameColIdx] !== undefined) {
      name = String(row[nameColIdx] || '').trim();
    }
    // Fallback: check first column if nameColIdx wasn't set or was empty
    if (!name && row[0] !== undefined) {
      const firstColStr = String(row[0] || '').trim();
      if (firstColStr && !isBarcodeFormat(cleanBarcodeString(firstColStr))) {
        name = firstColStr;
      }
    }
    // Skip empty lines
    if (!name) continue;

    // Extract Barcode
    let barcode = '';
    if (barcodeColIdx >= 0 && row[barcodeColIdx] !== undefined) {
      barcode = cleanBarcodeString(row[barcodeColIdx]);
    }

    // Dynamic row fallback: if barcode column cell was empty, check other cells in this row for barcode
    if (!barcode) {
      for (let c = 0; c < row.length; c++) {
        if (c === nameColIdx || c === priceColIdx || c === costColIdx || c === qtyColIdx) continue;
        const candidate = cleanBarcodeString(row[c]);
        if (isBarcodeFormat(candidate)) {
          barcode = candidate;
          break;
        }
      }
    }

    // Extract Cost Price
    let costPrice = 0;
    if (costColIdx >= 0 && row[costColIdx] !== undefined) {
      const numCost = parseFloat(String(row[costColIdx]).replace(/[^0-9.]/g, ''));
      if (!isNaN(numCost) && numCost >= 0) costPrice = numCost;
    }

    // Extract Selling Price
    let price = 0;
    if (priceColIdx >= 0 && row[priceColIdx] !== undefined) {
      const numPrice = parseFloat(String(row[priceColIdx]).replace(/[^0-9.]/g, ''));
      if (!isNaN(numPrice) && numPrice >= 0) price = numPrice;
    }

    // Extract Quantity
    let quantity = 1;
    if (qtyColIdx >= 0 && row[qtyColIdx] !== undefined) {
      const numQty = parseFloat(String(row[qtyColIdx]).replace(/[^0-9.]/g, ''));
      if (!isNaN(numQty) && numQty >= 0) quantity = numQty;
    }

    // Extract Category
    let category = 'General';
    if (categoryColIdx >= 0 && row[categoryColIdx] !== undefined) {
      const catStr = String(row[categoryColIdx] || '').trim();
      if (catStr) category = catStr;
    }

    // Extract Unit Type & Sell By
    let unitType: 'piece' | 'kg' | 'g' | 'liter' | 'dozen' = 'piece';
    let sellBy: 'unit' | 'weight' = 'unit';

    if (unitColIdx >= 0 && row[unitColIdx] !== undefined) {
      const unitStr = String(row[unitColIdx] || '').toLowerCase().trim();
      if (unitStr.includes('kg') || unitStr.includes('kilo') || unitStr.includes('weight')) {
        sellBy = 'weight';
        unitType = 'kg';
      } else if (unitStr.includes('l') || unitStr.includes('liter') || unitStr.includes('litre') || unitStr.includes('ml')) {
        sellBy = 'weight';
        unitType = 'liter';
      } else if (unitStr.includes('g') || unitStr.includes('gram')) {
        sellBy = 'weight';
        unitType = 'g';
      } else if (unitStr.includes('doz') || unitStr.includes('dozen')) {
        sellBy = 'unit';
        unitType = 'dozen';
      }
    }

    // Fallback: check if product name indicates kg/liter
    if (sellBy === 'unit') {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('/kg') || lowerName.includes('per kg') || lowerName.includes('per-kg')) {
        sellBy = 'weight';
        unitType = 'kg';
      } else if (lowerName.includes('/liter') || lowerName.includes('per liter')) {
        sellBy = 'weight';
        unitType = 'liter';
      }
    }

    products.push({
      id: `row-${Date.now()}-${r}-${Math.random().toString(36).slice(2, 6)}`,
      barcode,
      name,
      category,
      sellBy,
      unitType,
      quantity,
      costPrice,
      price,
      status: price > 0 ? 'valid' : 'warning',
      errorMessage: price === 0 ? 'Selling price is 0' : undefined
    });
  }

  // 6. If table parser found nothing (e.g. non-standard format), use object-based fallback
  if (products.length === 0) {
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

    rawRows.forEach((row, index) => {
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        normalized[cleanKey] = value;
      }

      const name = String(
        normalized['productname'] ||
        normalized['product'] ||
        normalized['itemname'] ||
        normalized['item'] ||
        normalized['name'] ||
        normalized['description'] ||
        normalized['title'] ||
        ''
      ).trim();

      if (!name) return;

      let barcode = '';
      for (const [key, val] of Object.entries(normalized)) {
        if (
          key.includes('barcode') || 
          key.includes('ean') || 
          key.includes('upc') || 
          key.includes('gtin') || 
          key.includes('scancode') || 
          key.includes('code') || 
          key.includes('sku') || 
          key.includes('serial')
        ) {
          const cleaned = cleanBarcodeString(val);
          if (cleaned) {
            barcode = cleaned;
            break;
          }
        }
      }

      // If barcode still not found, check values in row
      if (!barcode) {
        for (const val of Object.values(row)) {
          const cleaned = cleanBarcodeString(val);
          if (isBarcodeFormat(cleaned)) {
            barcode = cleaned;
            break;
          }
        }
      }

      const costVal = parseFloat(
        String(
          normalized['cost'] ||
          normalized['costprice'] ||
          normalized['wholesaleprice'] ||
          normalized['purchaseprice'] ||
          normalized['buyprice'] ||
          '0'
        ).replace(/[^0-9.]/g, '')
      );
      const costPrice = isNaN(costVal) ? 0 : Math.max(0, costVal);

      const priceVal = parseFloat(
        String(
          normalized['price'] ||
          normalized['sellingprice'] ||
          normalized['retailprice'] ||
          normalized['rate'] ||
          normalized['mrp'] ||
          normalized['unitprice'] ||
          normalized['sale'] ||
          '0'
        ).replace(/[^0-9.]/g, '')
      );
      const price = isNaN(priceVal) ? 0 : Math.max(0, priceVal);

      const qtyVal = parseFloat(
        String(
          normalized['quantity'] ||
          normalized['qty'] ||
          normalized['stock'] ||
          normalized['stockquantity'] ||
          normalized['units'] ||
          '1'
        ).replace(/[^0-9.]/g, '')
      );
      const quantity = isNaN(qtyVal) ? 1 : Math.max(0, qtyVal);

      const category = String(
        normalized['category'] ||
        normalized['cat'] ||
        normalized['department'] ||
        'General'
      ).trim();

      products.push({
        id: `row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        barcode,
        name,
        category: category || 'General',
        sellBy: 'unit',
        unitType: 'piece',
        quantity,
        costPrice,
        price,
        status: price > 0 ? 'valid' : 'warning'
      });
    });
  }

  return products;
}
