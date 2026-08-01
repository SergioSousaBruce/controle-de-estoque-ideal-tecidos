import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot,
  updateDoc
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { ShoeInventory } from '../../types';
import { logAuditAction } from './auditService';

const INVENTORIES_COLLECTION = 'inventories';
const LOCAL_INVENTORIES_KEY = 'ideal_tecidos_inventories_list';

// Memory cache
let inventoriesCache = new Map<string, ShoeInventory>();

export function getLocalInventories(): ShoeInventory[] {
  try {
    if (inventoriesCache.size > 0) {
      return Array.from(inventoriesCache.values());
    }
    const data = localStorage.getItem(LOCAL_INVENTORIES_KEY);
    if (data) {
      const list: ShoeInventory[] = JSON.parse(data);
      list.forEach(inv => inventoriesCache.set(inv.id, inv));
      return list;
    }
  } catch (err) {
    console.error('Error loading local inventories:', err);
  }
  return [];
}

function updateLocalInventoriesCache(list: ShoeInventory[]) {
  try {
    inventoriesCache.clear();
    list.forEach(inv => inventoriesCache.set(inv.id, inv));
    localStorage.setItem(LOCAL_INVENTORIES_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('LocalStorage limit reached for inventories:', err);
  }
}

// Subscribe to real-time inventory sessions
export function subscribeInventories(callback: (inventories: ShoeInventory[]) => void) {
  try {
    const q = collection(db, INVENTORIES_COLLECTION);
    return onSnapshot(q, (snapshot) => {
      const list: ShoeInventory[] = snapshot.docs.map(docSnap => docSnap.data() as ShoeInventory);
      updateLocalInventoriesCache(list);
      callback(list);
    }, (err) => {
      console.warn('Fallback to local inventories:', err);
      callback(getLocalInventories());
    });
  } catch (err) {
    callback(getLocalInventories());
    return () => {};
  }
}

// Create or Save an Inventory Session
export async function saveInventorySession(inventory: ShoeInventory, userName = 'Operador'): Promise<void> {
  if (!inventory.id) throw new Error('ID do inventário é obrigatório.');

  const now = Date.now();
  const normalized: ShoeInventory = {
    ...inventory,
    name: inventory.name.trim() || 'Inventário sem nome',
    employee: inventory.employee?.trim() || userName,
    status: inventory.status || 'IN_PROGRESS',
    counts: inventory.counts || {},
    createdAt: inventory.createdAt || now
  };

  inventoriesCache.set(normalized.id, normalized);
  updateLocalInventoriesCache(Array.from(inventoriesCache.values()));

  try {
    await setDoc(doc(db, INVENTORIES_COLLECTION, normalized.id), sanitizeForFirestore(normalized));
    await logAuditAction(
      'CREATE_INVENTORY',
      'INVENTARIOS',
      `Sessão de inventário "${normalized.name}" (${normalized.status}) salva pelo operador ${userName}.`,
      userName
    );
  } catch (err) {
    console.warn('Inventory saved locally, pending online sync:', err);
  }
}

// Close / Finish an inventory session
export async function closeInventorySession(inventoryId: string, userName = 'Operador'): Promise<void> {
  const inv = inventoriesCache.get(inventoryId);
  if (!inv) return;

  const updated: ShoeInventory = {
    ...inv,
    status: 'FINISHED',
    closedAt: Date.now(),
    closedBy: userName
  };

  inventoriesCache.set(inventoryId, updated);
  updateLocalInventoriesCache(Array.from(inventoriesCache.values()));

  try {
    await setDoc(doc(db, INVENTORIES_COLLECTION, inventoryId), sanitizeForFirestore(updated));
    await logAuditAction(
      'CLOSE_INVENTORY',
      'INVENTARIOS',
      `Sessão de inventário "${updated.name}" finalizada por ${userName}.`,
      userName
    );
  } catch (err) {
    console.warn('Inventory status change deferred to offline sync:', err);
  }
}

// Re-open a finished inventory session
export async function reopenInventorySession(inventoryId: string, userName = 'Operador'): Promise<void> {
  const inv = inventoriesCache.get(inventoryId);
  if (!inv) return;

  const updated: ShoeInventory = {
    ...inv,
    status: 'IN_PROGRESS'
  };

  inventoriesCache.set(inventoryId, updated);
  updateLocalInventoriesCache(Array.from(inventoriesCache.values()));

  try {
    await setDoc(doc(db, INVENTORIES_COLLECTION, inventoryId), sanitizeForFirestore(updated));
    await logAuditAction(
      'REOPEN_INVENTORY',
      'INVENTARIOS',
      `Sessão de inventário "${updated.name}" reaberta por ${userName}.`,
      userName
    );
  } catch (err) {
    console.warn('Reopen status pending sync:', err);
  }
}

// Delete inventory session
export async function deleteInventorySession(inventoryId: string, userName = 'Operador'): Promise<void> {
  const inv = inventoriesCache.get(inventoryId);
  inventoriesCache.delete(inventoryId);
  updateLocalInventoriesCache(Array.from(inventoriesCache.values()));

  try {
    await deleteDoc(doc(db, INVENTORIES_COLLECTION, inventoryId));
    await logAuditAction(
      'DELETE_INVENTORY',
      'INVENTARIOS',
      `Sessão de inventário "${inv?.name || inventoryId}" excluída por ${userName}.`,
      userName
    );
  } catch (err) {
    console.warn('Delete inventory pending sync:', err);
  }
}

// Compare 2 inventories side by side
export interface ComparisonResultItem {
  barcode: string;
  qty1: number;
  qty2: number;
  difference: number; // qty2 - qty1
}

export function compareTwoInventories(inv1: ShoeInventory, inv2: ShoeInventory): ComparisonResultItem[] {
  const allBarcodes = new Set([
    ...Object.keys(inv1.counts || {}),
    ...Object.keys(inv2.counts || {})
  ]);

  const results: ComparisonResultItem[] = [];
  allBarcodes.forEach(code => {
    const qty1 = inv1.counts[code] || 0;
    const qty2 = inv2.counts[code] || 0;
    results.push({
      barcode: code,
      qty1,
      qty2,
      difference: qty2 - qty1
    });
  });

  return results;
}
