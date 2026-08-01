import { collection, addDoc, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { StockMovement, MovementType } from '../../types';

const MOVEMENTS_COLLECTION = 'stock_movements';
const LOCAL_MOVEMENTS_KEY = 'ideal_tecidos_stock_movements';

/**
 * Get local cached stock movements
 */
export function getLocalStockMovements(): StockMovement[] {
  try {
    const data = localStorage.getItem(LOCAL_MOVEMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save local stock movements
 */
function saveLocalStockMovements(movements: StockMovement[]) {
  try {
    localStorage.setItem(LOCAL_MOVEMENTS_KEY, JSON.stringify(movements.slice(0, 1000)));
  } catch (err) {
    console.error('Failed to save local stock movements:', err);
  }
}

/**
 * Record a new stock movement
 */
export async function recordStockMovement(data: {
  userId: string;
  userName: string;
  brand: string;
  model: string;
  color: string;
  barcode: string;
  previousQty: number;
  movedQty: number;
  finalQty: number;
  type: MovementType;
  reason: string;
  destinationLocation?: string;
}): Promise<StockMovement> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR');

  const movement: StockMovement = {
    id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    date: dateStr,
    time: timeStr,
    userId: data.userId || 'system',
    userName: data.userName || 'Operador',
    brand: data.brand || 'N/I',
    model: data.model || 'N/I',
    color: data.color || 'N/I',
    barcode: data.barcode || 'N/A',
    previousQty: Number(data.previousQty) || 0,
    movedQty: Number(data.movedQty) || 0,
    finalQty: Number(data.finalQty) || 0,
    type: data.type,
    reason: data.reason || 'Movimentação Registrada',
    destinationLocation: data.destinationLocation
  };

  // 1. Save locally first for instant response
  const current = getLocalStockMovements();
  const updated = [movement, ...current];
  saveLocalStockMovements(updated);

  // 2. Persist to Firestore asynchronously
  try {
    await addDoc(collection(db, MOVEMENTS_COLLECTION), sanitizeForFirestore(movement));
  } catch (err) {
    console.warn('Stock movement write to cloud pending offline sync:', err);
  }

  return movement;
}

/**
 * Subscribe to real-time stock movements from Firestore with local fallback
 */
export function subscribeStockMovements(callback: (movements: StockMovement[]) => void): () => void {
  // Emit local cache immediately
  callback(getLocalStockMovements());

  try {
    const q = query(collection(db, MOVEMENTS_COLLECTION), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const cloudMovements: StockMovement[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockMovement));

        if (cloudMovements.length > 0) {
          saveLocalStockMovements(cloudMovements);
          callback(cloudMovements);
        }
      },
      (error) => {
        console.warn('Using local stock movements fallback:', error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to subscribe to stock movements Firestore collection:', err);
    return () => {};
  }
}
