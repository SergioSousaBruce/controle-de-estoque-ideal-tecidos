import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { InventoryCount, RegisteredProduct } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

// Offline & error handling wrapper
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  console.warn(`[Firestore ${operationType}] Path: ${path || 'unknown'} - ${errMessage}`);
  return {
    error: errMessage,
    operationType,
    path
  };
}

// Real-time listener for Inventory Counts
export function subscribeToCounts(onData: (counts: InventoryCount[]) => void, onError?: (err: any) => void) {
  const path = 'inventory';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: InventoryCount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          productType: data.productType || '',
          model: data.model || '',
          brand: data.brand || '',
          color: data.color || '',
          gender: data.gender || '',
          arrivalMonth: data.arrivalMonth || '',
          arrivalYear: data.arrivalYear || '',
          observations: data.observations || '',
          gridType: data.gridType || 'LETTER',
          sizes: data.sizes || {},
          total: data.total || 0,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          countedBy: data.countedBy || 'Operador',
          userId: data.userId || 'guest',
          status: data.status || 'COUNTED'
        });
      });
      // Sort newest first
      items.sort((a, b) => b.createdAt - a.createdAt);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
      if (onError) onError(error);
    }
  );
}

// Real-time listener for Registered Products Catalog
export function subscribeToProducts(onData: (products: RegisteredProduct[]) => void, onError?: (err: any) => void) {
  const path = 'products_catalog';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: RegisteredProduct[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          code: data.code || '',
          productType: data.productType || '',
          model: data.model || '',
          brand: data.brand || '',
          color: data.color || '',
          gender: data.gender || '',
          arrivalMonth: data.arrivalMonth || '',
          arrivalYear: data.arrivalYear || '',
          gridType: data.gridType || 'LETTER',
          expectedQty: data.expectedQty || 0,
          createdAt: data.createdAt || Date.now()
        });
      });
      items.sort((a, b) => b.createdAt - a.createdAt);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
      if (onError) onError(error);
    }
  );
}

// Save or Update a Count to Firebase
export async function saveCountToFirebase(count: InventoryCount) {
  const path = 'inventory';
  try {
    const docRef = doc(db, path, count.id);
    await setDoc(docRef, {
      ...count,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Delete a Count from Firebase
export async function deleteCountFromFirebase(id: string) {
  const path = 'inventory';
  try {
    await deleteDoc(doc(db, path, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Batch delete multiple items from Firebase
export async function batchDeleteCountsFromFirebase(ids: string[]) {
  const path = 'inventory';
  if (!ids || ids.length === 0) return;
  
  try {
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = ids.slice(i, i + chunkSize);
      chunk.forEach(id => {
        batch.delete(doc(db, path, id));
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    // Fallback if batch fails
    await Promise.all(ids.map(id => deleteDoc(doc(db, path, id)).catch(() => {})));
  }
}

// Save Registered Product to Firebase Catalog
export async function saveProductToFirebase(product: RegisteredProduct) {
  const path = 'products_catalog';
  try {
    const docRef = doc(db, path, product.id);
    await setDoc(docRef, product, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Delete Registered Product from Firebase Catalog
export async function deleteProductFromFirebase(id: string) {
  const path = 'products_catalog';
  try {
    await deleteDoc(doc(db, path, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

