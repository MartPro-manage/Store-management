import { Product } from '../types';
import { db, doc, updateDoc, cleanFirestoreData } from '../lib/firebase';

/**
 * Generates the next available unique 4-digit shortcut / serial number for a product.
 * Range: 1001 to 9999.
 */
export function generateNextShortcutCode(existingProducts: Array<{ shortcutCode?: string; serialNumber?: string }>): string {
  const usedCodes = new Set<number>();
  
  for (const p of existingProducts) {
    if (p.shortcutCode) {
      const num = parseInt(p.shortcutCode, 10);
      if (!isNaN(num) && num >= 1000 && num <= 9999) {
        usedCodes.add(num);
      }
    }
    if (p.serialNumber) {
      const num = parseInt(p.serialNumber, 10);
      if (!isNaN(num) && num >= 1000 && num <= 9999) {
        usedCodes.add(num);
      }
    }
  }

  // Find lowest available 4-digit code starting from 1001
  for (let candidate = 1001; candidate <= 9999; candidate++) {
    if (!usedCodes.has(candidate)) {
      return candidate.toString();
    }
  }

  // Fallback if all 1001-9999 are taken (rare in standard stores)
  const random4Digit = Math.floor(1000 + Math.random() * 9000).toString();
  return random4Digit;
}

/**
 * System assigned 4-digit serial number (1001 - 9999).
 */
export function generateNext4DigitSerialNumber(existingProducts: Array<{ shortcutCode?: string; serialNumber?: string }>): string {
  return generateNextShortcutCode(existingProducts);
}

/**
 * Generates a clean full numeric barcode (12 digits, e.g. 890000000000 - 890999999999).
 */
export function generate5DigitBarcode(): string {
  return '890' + Math.floor(100000000 + Math.random() * 900000000).toString();
}

export function generateFullBarcode(): string {
  return generate5DigitBarcode();
}

/**
 * Ensures all products in memory have a valid 4-digit shortcut code.
 */
export function ensureProductShortcutCodes(products: Product[]): Product[] {
  const usedCodes = new Set<string>();
  
  // First pass: collect existing valid 4-digit codes
  products.forEach(p => {
    if (p.shortcutCode && /^\d{4}$/.test(p.shortcutCode)) {
      usedCodes.add(p.shortcutCode);
    }
  });

  let currentCounter = 1001;
  const getNextAvailable = (): string => {
    while (currentCounter <= 9999) {
      const codeStr = currentCounter.toString();
      currentCounter++;
      if (!usedCodes.has(codeStr)) {
        usedCodes.add(codeStr);
        return codeStr;
      }
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  return products.map(p => {
    if (p.shortcutCode && /^\d{4}$/.test(p.shortcutCode)) {
      return p;
    }
    return {
      ...p,
      shortcutCode: getNextAvailable()
    };
  });
}

/**
 * Syncs and updates all existing products in Firestore that are missing 4-digit shortcut codes.
 * Ensures every single existing product in the database gets a unique 4-digit shortcut code (1001-9999).
 */
export async function syncMissingShortcutCodesInFirestore(products: Product[]): Promise<number> {
  if (!products || products.length === 0) return 0;

  const usedCodes = new Set<string>();
  const missingProducts: Product[] = [];

  // Pass 1: Collect valid existing codes
  products.forEach(p => {
    if (p.shortcutCode && /^\d{4}$/.test(p.shortcutCode)) {
      usedCodes.add(p.shortcutCode);
    } else {
      missingProducts.push(p);
    }
  });

  if (missingProducts.length === 0) {
    return 0;
  }

  let counter = 1001;
  const getNextAvailable = (): string => {
    while (counter <= 9999) {
      const codeStr = counter.toString();
      counter++;
      if (!usedCodes.has(codeStr)) {
        usedCodes.add(codeStr);
        return codeStr;
      }
    }
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    usedCodes.add(rand);
    return rand;
  };

  let updatedCount = 0;
  const updatePromises = missingProducts.map(async (prod) => {
    try {
      const assignedCode = getNextAvailable();
      const productDocRef = doc(db, 'products', prod.id);
      await updateDoc(productDocRef, cleanFirestoreData({
        shortcutCode: assignedCode,
        updatedAt: new Date().toISOString()
      }));
      updatedCount++;
    } catch (err) {
      console.warn(`Failed to backfill shortcut code for product ${prod.id}:`, err);
    }
  });

  await Promise.allSettled(updatePromises);
  return updatedCount;
}

/**
 * Matches a user entry to a product by 4-digit shortcut code, barcode, or serial number.
 */
export function findProductByShortcutOrBarcode(
  term: string, 
  products: Product[]
): Product | undefined {
  const cleanTerm = term.trim();
  if (!cleanTerm) return undefined;
  const cleanTermLower = cleanTerm.toLowerCase();

  // 1. High priority: Exact match by 4-digit shortcut code
  const byShortcut = products.find(p => p.shortcutCode === cleanTerm);
  if (byShortcut) return byShortcut;

  // 2. Exact match by barcode
  const byBarcode = products.find(p => p.barcode && p.barcode.toLowerCase() === cleanTermLower);
  if (byBarcode) return byBarcode;

  // 3. Exact match by serial number
  const bySerial = products.find(p => p.serialNumber && p.serialNumber.toLowerCase() === cleanTermLower);
  if (bySerial) return bySerial;

  return undefined;
}
