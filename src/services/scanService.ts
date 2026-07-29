import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { InventoryScanItem } from '../../types';
import { playSuccessBeep, playErrorBeep } from '../utils/audioBeep';
import { getProductFromCache, sanitizeBarcode } from './productService';
import { logAuditAction } from './auditService';

const SCANS_COLLECTION = 'inventory_scans';
const LOCAL_SCANS_KEY = 'ideal_tecidos_scan_items';

// Get local scan log
export function getLocalScanItems(inventoryId?: string): InventoryScanItem[] {
  try {
    const data = localStorage.getItem(LOCAL_SCANS_KEY);
    if (!data) return [];
    const list: InventoryScanItem[] = JSON.parse(data);
    if (inventoryId) {
      return list.filter(item => item.inventoryId === inventoryId);
    }
    return list;
  } catch (err) {
    return [];
  }
}

function saveLocalScanItem(item: InventoryScanItem) {
  try {
    const list = getLocalScanItems();
    localStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify([item, ...list.slice(0, 1000)]));
  } catch (err) {
    console.warn('LocalStorage limit for scan items:', err);
  }
}

export interface ScanResult {
  barcode: string;
  qty: number;
  isRegisteredProduct: boolean;
  productInfo?: {
    brand: string;
    model: string;
    category: string;
    color: string;
    size: string;
  };
}

// In-memory scan queue for non-blocking continuous Bluetooth scanner buffering
const scanWriteQueue: InventoryScanItem[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Background batch flush helper
async function flushScanQueue() {
  if (scanWriteQueue.length === 0) return;

  const itemsToFlush = [...scanWriteQueue];
  scanWriteQueue.length = 0; // Clear queue

  try {
    // Process in parallel background promises without blocking UI
    const promises = itemsToFlush.map(item => 
      addDoc(collection(db, SCANS_COLLECTION), item).catch(e => {
        console.warn('Scan item cloud write pending offline sync:', e);
      })
    );
    await Promise.allSettled(promises);
  } catch (e) {
    console.warn('Batch scan flush notice:', e);
  }
}

function scheduleQueueFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  // Schedule flush in 2 seconds or when idle
  flushTimer = setTimeout(() => {
    flushScanQueue();
  }, 2000);
}

// Process a single scan
export async function registerScanItem(
  inventoryId: string,
  rawBarcode: string,
  qty = 1,
  scanMethod: InventoryScanItem['scanMethod'] = 'USB_SCANNER',
  userName = 'Operador'
): Promise<ScanResult> {
  const barcode = sanitizeBarcode(rawBarcode);
  if (!barcode) throw new Error('Código de barras em branco.');

  const product = getProductFromCache(barcode);
  const isRegistered = !!product;

  // Audio feedback
  if (isRegistered) {
    playSuccessBeep();
  } else {
    playErrorBeep(); // distinct tone for unmapped barcode
  }

  const scanItem: InventoryScanItem = {
    id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    inventoryId,
    barcode,
    qty,
    scannedAt: Date.now(),
    scannedBy: userName,
    scanMethod,
    brand: product?.brand,
    model: product?.model,
    size: product?.size
  };

  // 1. Instant local persistence (< 1ms)
  saveLocalScanItem(scanItem);

  // 2. Queue for background non-blocking cloud batch write
  scanWriteQueue.push(scanItem);
  scheduleQueueFlush();

  // Audit log asynchronously
  setTimeout(() => {
    logAuditAction(
      'SCAN_ITEM',
      'BIPAGEM',
      `Bipado (${scanMethod}): ${barcode} [${product ? `${product.brand} - ${product.model}` : 'Sem cadastro'}] Qtd: +${qty}`,
      userName,
      'system',
      { inventoryId, barcode, qty }
    );
  }, 0);

  return {
    barcode,
    qty,
    isRegisteredProduct: isRegistered,
    productInfo: product ? {
      brand: product.brand,
      model: product.model,
      category: product.category,
      color: product.color,
      size: product.size
    } : undefined
  };
}
