import { db, collection, getDocs, doc, updateDoc, query, where } from './firebase';
import { Sale } from '../types';

export const RECEIPT_EXPIRY_DAYS = 7;
export const RECEIPT_EXPIRY_MS = RECEIPT_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Checks if a customer receipt slip has passed the 7-day retention limit
 * or has been marked as deleted/expired.
 * NOTE: This applies ONLY to the customer/printable slip view.
 * The underlying sales transaction, revenue, profit, and inventory records are PERMANENT.
 */
export function isSlipExpired(saleOrTimestamp: Sale | string | null | undefined): boolean {
  if (!saleOrTimestamp) return false;

  // If passed a Sale object directly, check flag first
  if (typeof saleOrTimestamp === 'object') {
    if (saleOrTimestamp.isSlipDeleted || saleOrTimestamp.slipExpired) return true;
  }

  const timestampStr = typeof saleOrTimestamp === 'string' ? saleOrTimestamp : saleOrTimestamp.timestamp;
  if (!timestampStr) return false;
  
  const saleTime = new Date(timestampStr).getTime();
  if (isNaN(saleTime)) return false;

  return (Date.now() - saleTime) > RECEIPT_EXPIRY_MS;
}

// Backwards-compatible alias for existing imports
export const isSaleExpired = isSlipExpired;

/**
 * Gets remaining active days for a customer slip before automatic expiration (1-7 days)
 */
export function getReceiptRemainingDays(timestampStr: string): number {
  const saleTime = new Date(timestampStr).getTime();
  if (isNaN(saleTime)) return 0;
  
  const elapsedMs = Date.now() - saleTime;
  const remainingMs = RECEIPT_EXPIRY_MS - elapsedMs;
  if (remainingMs <= 0) return 0;
  
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/**
 * Auto-cleans expired customer receipt slips older than 7 days from digital access.
 * 
 * IMPORTANT: In accordance with supermarket accounting and inventory retention:
 * The SALES RECORD (Total Revenue, Profit, Total Stock, Sold Products, Items, Receipt #)
 * is NEVER DELETED from Firestore. Only the customer slip flag is set to expired/deleted.
 */
export async function cleanupExpiredReceipts(storeId?: string): Promise<number> {
  try {
    const cutoffTime = new Date(Date.now() - RECEIPT_EXPIRY_MS).toISOString();
    
    let salesQuery = storeId 
      ? query(collection(db, 'sales'), where('storeId', '==', storeId))
      : query(collection(db, 'sales'));

    const snapshot = await getDocs(salesQuery);
    let expiredSlipsCount = 0;

    const updatePromises: Promise<void>[] = [];
    snapshot.forEach((saleDoc) => {
      const data = saleDoc.data();
      const saleTimestamp = data.timestamp || data.createdAt;
      
      // If older than 7 days and not yet marked as slip deleted
      if (saleTimestamp && saleTimestamp < cutoffTime && !data.isSlipDeleted) {
        updatePromises.push(
          updateDoc(doc(db, 'sales', saleDoc.id), {
            isSlipDeleted: true,
            slipExpired: true,
            slipDeletedAt: new Date().toISOString()
          })
            .then(() => {
              expiredSlipsCount++;
            })
            .catch((e) => console.warn(`Failed to update slip expiration status for sale ${saleDoc.id}:`, e))
        );
      }
    });

    if (updatePromises.length > 0) {
      await Promise.allSettled(updatePromises);
      console.log(`[Slip Retention] Updated ${expiredSlipsCount} customer slips older than ${RECEIPT_EXPIRY_DAYS} days. Sales records, revenue, and product statistics remain permanently preserved.`);
    }

    return expiredSlipsCount;
  } catch (err) {
    console.warn('[Slip Retention] Cleanup error:', err);
    return 0;
  }
}

