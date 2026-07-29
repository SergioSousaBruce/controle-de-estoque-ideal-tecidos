import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';
import { SizeGridType } from '../../types';

export interface BarcodeHistoryEntry {
  date: number;
  dateFormatted: string;
  total: number;
  sizes: Record<string, number>;
  user?: string;
  note?: string;
}

export interface BarcodeReference {
  barcode: string; // Document ID and unique key in Firebase
  brand: string;
  model: string;
  productType: string;
  color?: string;
  imageUrl?: string;
  arrivalMonth?: string;
  arrivalYear?: string;
  gridType: SizeGridType;
  sizes: Record<string, number>;
  total: number;
  gender?: string;
  createdAt: number;
  updatedAt: number;
  lastCountDate: number;
  userId: string;
  countHistory?: BarcodeHistoryEntry[];
}

// In-memory fast cache Map for instant <1ms barcode resolution during continuous Bluetooth scanning
const barcodeMemoryCache = new Map<string, BarcodeReference>();

/**
 * Clean barcode string to be safe for Firestore doc ID
 */
export function sanitizeBarcode(code: string): string {
  return code.trim().replace(/[\/\s#?\[\]]/g, '_');
}

/**
 * Fast synchronous lookup from in-memory cache
 */
export function getCachedReferenceByBarcode(barcode: string): BarcodeReference | null {
  const cleanCode = sanitizeBarcode(barcode);
  if (!cleanCode) return null;
  return barcodeMemoryCache.get(cleanCode) || null;
}

/**
 * Consult Firebase for a reference by Barcode, checking in-memory cache first
 */
export async function getReferenceByBarcode(barcode: string): Promise<BarcodeReference | null> {
  const cleanCode = sanitizeBarcode(barcode);
  if (!cleanCode) return null;

  // 1. FAST PATH: Check in-memory cache (< 1ms)
  const cached = barcodeMemoryCache.get(cleanCode);
  if (cached) {
    return cached;
  }

  try {
    const docRef = doc(db, 'inventory_barcodes', cleanCode);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as BarcodeReference;
      barcodeMemoryCache.set(cleanCode, data);
      return data;
    }

    // Fallback: search in legacy /inventory collection if needed
    const q = query(collection(db, 'inventory'), where('model', '==', cleanCode));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      const legacyRef: BarcodeReference = {
        barcode: cleanCode,
        brand: data.brand || '',
        model: data.model || '',
        productType: data.productType || 'Calçado',
        color: data.color || '',
        arrivalMonth: data.arrivalMonth || '',
        arrivalYear: data.arrivalYear || '',
        gridType: data.gridType || 'LETTER',
        sizes: data.sizes || {},
        total: data.total || 0,
        createdAt: data.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastCountDate: data.createdAt || Date.now(),
        userId: data.userId || 'guest',
        gender: data.gender || ''
      };
      barcodeMemoryCache.set(cleanCode, legacyRef);
      return legacyRef;
    }

    return null;
  } catch (error) {
    console.error("Error looking up barcode in Firebase:", error);
    handleFirestoreError(error, OperationType.GET, `inventory_barcodes/${cleanCode}`);
    return null;
  }
}

/**
 * Preload all barcode references into memory cache in background for zero-latency scanning
 */
export async function preloadBarcodeCache(): Promise<void> {
  try {
    const colRef = collection(db, 'inventory_barcodes');
    const snap = await getDocs(colRef);
    snap.forEach(d => {
      const data = d.data() as BarcodeReference;
      if (data && data.barcode) {
        barcodeMemoryCache.set(sanitizeBarcode(data.barcode), data);
      }
    });
  } catch (err) {
    console.warn("Background barcode cache preload notice:", err);
  }
}

/**
 * Create or update a Barcode Reference in Firebase
 */
export async function saveBarcodeReference(
  data: Omit<BarcodeReference, 'createdAt' | 'updatedAt' | 'lastCountDate'> & {
    createdAt?: number;
    updatedAt?: number;
    lastCountDate?: number;
  },
  isUpdate: boolean = false,
  previousData?: BarcodeReference | null
): Promise<BarcodeReference> {
  const cleanCode = sanitizeBarcode(data.barcode);
  if (!cleanCode) {
    throw new Error('Código de barras inválido');
  }

  const now = Date.now();
  const dateFormatted = new Date(now).toLocaleString('pt-BR');

  const docRef = doc(db, 'inventory_barcodes', cleanCode);

  const historyEntry: BarcodeHistoryEntry = {
    date: now,
    dateFormatted,
    total: data.total,
    sizes: { ...data.sizes },
    user: data.userId,
    note: isUpdate ? 'Atualização de Contagem' : 'Cadastro Inicial'
  };

  const existingHistory = previousData?.countHistory || [];
  const updatedHistory = [historyEntry, ...existingHistory].slice(0, 50); // store last 50 updates

  const refPayload: BarcodeReference = {
    barcode: cleanCode,
    brand: (data.brand || '').trim(),
    model: (data.model || '').trim(),
    productType: (data.productType || 'Calçado').trim(),
    color: (data.color || '').trim(),
    arrivalMonth: data.arrivalMonth || '',
    arrivalYear: data.arrivalYear || '',
    gridType: data.gridType || 'LETTER',
    sizes: data.sizes || {},
    total: data.total || 0,
    gender: data.gender || '',
    createdAt: previousData?.createdAt || data.createdAt || now,
    updatedAt: now,
    lastCountDate: now,
    userId: data.userId,
    countHistory: updatedHistory
  };

  // Save to memory cache immediately
  barcodeMemoryCache.set(cleanCode, refPayload);

  try {
    await setDoc(docRef, refPayload, { merge: true });

    // Also mirror to legacy inventory collection for complete backward compatibility
    try {
      const invRef = doc(db, 'inventory', `bc_${cleanCode}`);
      await setDoc(invRef, {
        id: `bc_${cleanCode}`,
        productType: refPayload.productType,
        model: refPayload.model,
        brand: refPayload.brand,
        color: refPayload.color,
        arrivalMonth: refPayload.arrivalMonth,
        arrivalYear: refPayload.arrivalYear,
        gridType: refPayload.gridType,
        sizes: refPayload.sizes,
        total: refPayload.total,
        createdAt: refPayload.createdAt,
        userId: refPayload.userId,
        gender: refPayload.gender
      }, { merge: true });
    } catch (e) {
      console.warn("Mirror inventory doc save notice:", e);
    }

    return refPayload;
  } catch (error) {
    console.error("Error saving barcode reference to Firebase:", error);
    handleFirestoreError(error, OperationType.WRITE, `inventory_barcodes/${cleanCode}`);
    throw error;
  }
}

/**
 * Fetch all Barcode References from Firebase
 */
export async function getAllBarcodeReferences(): Promise<BarcodeReference[]> {
  try {
    const colRef = collection(db, 'inventory_barcodes');
    const snap = await getDocs(colRef);
    const list: BarcodeReference[] = [];
    snap.forEach(d => {
      list.push(d.data() as BarcodeReference);
    });
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  } catch (error) {
    console.error("Error fetching barcode references:", error);
    return [];
  }
}

/**
 * Delete a barcode reference from Firebase
 */
export async function deleteBarcodeReference(barcode: string): Promise<void> {
  const cleanCode = sanitizeBarcode(barcode);
  if (!cleanCode) return;
  barcodeMemoryCache.delete(cleanCode);
  try {
    const docRef = doc(db, 'inventory_barcodes', cleanCode);
    await deleteDoc(docRef);
    try {
      await deleteDoc(doc(db, 'inventory', `bc_${cleanCode}`));
    } catch (e) {
      // ignore mirror delete error
    }
  } catch (error) {
    console.error("Error deleting barcode reference:", error);
    handleFirestoreError(error, OperationType.DELETE, `inventory_barcodes/${cleanCode}`);
  }
}

/**
 * Consult Firebase for ALL parallel references registered under a given Barcode
 */
export async function getAllMatchingReferencesByBarcode(barcode: string): Promise<BarcodeReference[]> {
  const cleanCode = sanitizeBarcode(barcode);
  if (!cleanCode) return [];

  const results: BarcodeReference[] = [];
  const seenKeys = new Set<string>();

  try {
    // 1. Check primary inventory_barcodes doc
    const docRef = doc(db, 'inventory_barcodes', cleanCode);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as BarcodeReference;
      const key = `${(data.brand || '').toLowerCase()}_${(data.model || '').toLowerCase()}_${(data.color || '').toLowerCase()}`;
      seenKeys.add(key);
      results.push(data);
    }

    // 2. Query inventory collection for all items matching this barcode
    const qBarcode = query(collection(db, 'inventory'), where('barcode', '==', cleanCode));
    const snapBarcode = await getDocs(qBarcode);
    snapBarcode.forEach(d => {
      const data = d.data();
      const key = `${(data.brand || '').toLowerCase()}_${(data.model || '').toLowerCase()}_${(data.color || '').toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          barcode: cleanCode,
          brand: data.brand || '',
          model: data.model || '',
          productType: data.productType || 'Calçado',
          color: data.color || '',
          arrivalMonth: data.arrivalMonth || '',
          arrivalYear: data.arrivalYear || '',
          gridType: data.gridType || 'LETTER',
          sizes: data.sizes || {},
          total: data.total || 0,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          lastCountDate: data.createdAt || Date.now(),
          userId: data.userId || 'guest',
          gender: data.gender || ''
        });
      }
    });

    // 3. Fallback: search inventory collection for items where model == cleanCode
    const qModel = query(collection(db, 'inventory'), where('model', '==', cleanCode));
    const snapModel = await getDocs(qModel);
    snapModel.forEach(d => {
      const data = d.data();
      const key = `${(data.brand || '').toLowerCase()}_${(data.model || '').toLowerCase()}_${(data.color || '').toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          barcode: cleanCode,
          brand: data.brand || '',
          model: data.model || '',
          productType: data.productType || 'Calçado',
          color: data.color || '',
          arrivalMonth: data.arrivalMonth || '',
          arrivalYear: data.arrivalYear || '',
          gridType: data.gridType || 'LETTER',
          sizes: data.sizes || {},
          total: data.total || 0,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          lastCountDate: data.createdAt || Date.now(),
          userId: data.userId || 'guest',
          gender: data.gender || ''
        });
      }
    });

    return results;
  } catch (error) {
    console.error("Error fetching matching parallel barcode references:", error);
    return results;
  }
}

/**
 * REQUISITO: buscarProdutoPorCodigo
 * Localiza instantaneamente o produto no banco de dados pelo código de barras único.
 */
export async function buscarProdutoPorCodigo(barcode: string): Promise<BarcodeReference | null> {
  return await getReferenceByBarcode(barcode);
}

/**
 * REQUISITO: verificarCodigoDuplicado
 * Verifica se um determinado código de barras já existe no banco de dados para evitar duplicidade.
 */
export async function verificarCodigoDuplicado(barcode: string): Promise<boolean> {
  const ref = await getReferenceByBarcode(barcode);
  return ref !== null;
}

/**
 * REQUISITO: cadastrarCodigo
 * Registra um novo produto com seu código de barras único e estoque inicial.
 */
export async function cadastrarCodigo(
  data: Omit<BarcodeReference, 'createdAt' | 'updatedAt' | 'lastCountDate'>
): Promise<BarcodeReference> {
  const duplicate = await verificarCodigoDuplicado(data.barcode);
  if (duplicate) {
    throw new Error('Este produto já está cadastrado no banco de dados.');
  }
  return await saveBarcodeReference(data, false, null);
}

/**
 * REQUISITO: atualizarProdutoPorCodigo
 * Atualiza e substitui o estoque de um produto existente localizado pelo código de barras, gerando histórico de auditoria.
 */
export async function atualizarProdutoPorCodigo(
  barcode: string,
  newSizes: Record<string, number>,
  newTotal: number,
  userId: string
): Promise<BarcodeReference> {
  const existing = await getReferenceByBarcode(barcode);
  if (!existing) {
    throw new Error('Produto não localizado para atualização.');
  }

  const updatedData: BarcodeReference = {
    ...existing,
    sizes: newSizes,
    total: newTotal,
    userId: userId,
    updatedAt: Date.now(),
    lastCountDate: Date.now()
  };

  return await saveBarcodeReference(updatedData, true, existing);
}
