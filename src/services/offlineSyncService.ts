import { InventoryCount } from '../../types';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

const OFFLINE_COUNTS_KEY = 'ideal_offline_counts_queue';
const OFFLINE_BARCODES_KEY = 'ideal_offline_barcodes_queue';

export interface PendingOfflineCount {
  tempId: string;
  count: InventoryCount;
  timestamp: number;
}

export interface PendingOfflineBarcode {
  barcode: string;
  data: any;
  timestamp: number;
}

// Queue offline count
export function queueOfflineCount(count: InventoryCount) {
  try {
    const existing: PendingOfflineCount[] = JSON.parse(localStorage.getItem(OFFLINE_COUNTS_KEY) || '[]');
    existing.push({
      tempId: count.id,
      count,
      timestamp: Date.now()
    });
    localStorage.setItem(OFFLINE_COUNTS_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error('Error queuing offline count:', e);
  }
}

// Get pending count queue length
export function getPendingOfflineCounts(): PendingOfflineCount[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_COUNTS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

// Queue offline barcode reference
export function queueOfflineBarcode(barcode: string, data: any) {
  try {
    const existing: PendingOfflineBarcode[] = JSON.parse(localStorage.getItem(OFFLINE_BARCODES_KEY) || '[]');
    // replace if already in queue
    const filtered = existing.filter(item => item.barcode !== barcode);
    filtered.push({
      barcode,
      data,
      timestamp: Date.now()
    });
    localStorage.setItem(OFFLINE_BARCODES_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Error queuing offline barcode:', e);
  }
}

export function getPendingOfflineBarcodes(): PendingOfflineBarcode[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_BARCODES_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

// Flush queue to Firebase Firestore
export async function syncOfflineQueueToFirebase(userId: string): Promise<{ syncedCounts: number; syncedBarcodes: number }> {
  if (!navigator.onLine) {
    throw new Error('Sem conexão com a internet');
  }

  let syncedCounts = 0;
  let syncedBarcodes = 0;

  // 1. Sync pending counts
  const pendingCounts = getPendingOfflineCounts();
  if (pendingCounts.length > 0) {
    const remainingCounts: PendingOfflineCount[] = [];
    for (const item of pendingCounts) {
      try {
        const countRef = doc(collection(db, 'counts'), item.count.id);
        await setDoc(countRef, sanitizeForFirestore({
          ...item.count,
          userId: userId || item.count.userId || '',
          syncedAt: Date.now()
        }), { merge: true });
        syncedCounts++;
      } catch (err) {
        console.error('Failed to sync item:', item, err);
        remainingCounts.push(item);
      }
    }
    localStorage.setItem(OFFLINE_COUNTS_KEY, JSON.stringify(remainingCounts));
  }

  // 2. Sync pending barcode references
  const pendingBarcodes = getPendingOfflineBarcodes();
  if (pendingBarcodes.length > 0) {
    const remainingBarcodes: PendingOfflineBarcode[] = [];
    for (const item of pendingBarcodes) {
      try {
        const refDoc = doc(collection(db, 'barcode_references'), item.barcode);
        await setDoc(refDoc, sanitizeForFirestore({
          ...item.data,
          updatedAt: Date.now()
        }), { merge: true });
        syncedBarcodes++;
      } catch (err) {
        console.error('Failed to sync barcode reference:', item, err);
        remainingBarcodes.push(item);
      }
    }
    localStorage.setItem(OFFLINE_BARCODES_KEY, JSON.stringify(remainingBarcodes));
  }

  return { syncedCounts, syncedBarcodes };
}
