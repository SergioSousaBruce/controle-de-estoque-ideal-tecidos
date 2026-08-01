import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch, 
  onSnapshot,
  query,
  limit
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { ShoeProduct, ColumnMapping } from '../../types';
import { logAuditAction } from './auditService';
import * as XLSX from 'xlsx';

const PRODUCTS_COLLECTION = 'products';
const LOCAL_PRODUCTS_KEY = 'ideal_tecidos_products_catalog';

// In-memory fast cache for instant <10ms EAN barcode resolution
let productsCacheMap = new Map<string, ShoeProduct>();
let isCacheLoaded = false;

export function sanitizeBarcode(code: string): string {
  if (!code) return '';
  return code.toString().trim().replace(/[\r\n\t]/g, '');
}

// Get product from local fast memory map (< 10ms lookup)
export function getProductFromCache(barcode: string): ShoeProduct | null {
  const cleanCode = sanitizeBarcode(barcode);
  return productsCacheMap.get(cleanCode) || null;
}

// Get all products from local cache / storage
export function getLocalProducts(): ShoeProduct[] {
  try {
    if (productsCacheMap.size > 0) {
      return Array.from(productsCacheMap.values());
    }
    const data = localStorage.getItem(LOCAL_PRODUCTS_KEY);
    if (data) {
      const list: ShoeProduct[] = JSON.parse(data);
      list.forEach(p => productsCacheMap.set(sanitizeBarcode(p.barcode), p));
      isCacheLoaded = true;
      return list;
    }
  } catch (e) {
    console.error('Error reading local products cache:', e);
  }
  return [];
}

// Save products list to local cache / storage
function updateLocalProductsCache(products: ShoeProduct[]) {
  try {
    productsCacheMap.clear();
    products.forEach(p => productsCacheMap.set(sanitizeBarcode(p.barcode), p));
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
    isCacheLoaded = true;
  } catch (e) {
    console.warn('LocalStorage limit exceeded, relying on memory map:', e);
  }
}

// Subscribe to Firebase real-time products collection
export function subscribeToProducts(callback: (products: ShoeProduct[]) => void) {
  try {
    const q = collection(db, PRODUCTS_COLLECTION);
    return onSnapshot(q, (snapshot) => {
      const products: ShoeProduct[] = snapshot.docs.map(docSnap => docSnap.data() as ShoeProduct);
      updateLocalProductsCache(products);
      callback(products);
    }, (err) => {
      console.warn('Using local products cache due to network state:', err);
      callback(getLocalProducts());
    });
  } catch (err) {
    callback(getLocalProducts());
    return () => {};
  }
}

// Add or update a single product
export async function saveProduct(product: ShoeProduct, userName = 'Operador'): Promise<void> {
  const cleanCode = sanitizeBarcode(product.barcode);
  if (!cleanCode) throw new Error('Código de barras é obrigatório.');

  const now = Date.now();
  const normalizedProduct: ShoeProduct = {
    ...product,
    barcode: cleanCode,
    brand: product.brand?.trim() || 'SEM MARCA',
    model: product.model?.trim() || 'SEM MODELO',
    category: product.category?.trim() || 'Geral',
    color: product.color?.trim() || 'Padrão',
    size: product.size?.trim() || 'U',
    expectedQty: Number(product.expectedQty) || 0,
    countedQty: Number(product.countedQty) || 0,
    lastUpdated: now,
    createdAt: product.createdAt || now
  };

  // Update local memory and local storage
  productsCacheMap.set(cleanCode, normalizedProduct);
  const currentList = Array.from(productsCacheMap.values());
  updateLocalProductsCache(currentList);

  // Sync to Firestore
  try {
    await setDoc(doc(db, PRODUCTS_COLLECTION, cleanCode), sanitizeForFirestore(normalizedProduct));
    await logAuditAction(
      'UPDATE_PRODUCT',
      'CADASTRO',
      `Produto ${normalizedProduct.brand} - ${normalizedProduct.model} (${cleanCode}) atualizado.`,
      userName
    );
  } catch (err) {
    console.warn('Product stored locally, will sync when online:', err);
  }
}

// Delete a product
export async function deleteProduct(barcode: string, userName = 'Operador'): Promise<void> {
  const cleanCode = sanitizeBarcode(barcode);
  const existing = productsCacheMap.get(cleanCode);

  productsCacheMap.delete(cleanCode);
  updateLocalProductsCache(Array.from(productsCacheMap.values()));

  try {
    await deleteDoc(doc(db, PRODUCTS_COLLECTION, cleanCode));
    await logAuditAction(
      'DELETE_PRODUCT',
      'CADASTRO',
      `Produto com código ${cleanCode} (${existing?.model || ''}) removido.`,
      userName
    );
  } catch (err) {
    console.warn('Delete pending sync:', err);
  }
}

// Bulk Import Products from Excel / CSV (Supports 50,000+ items)
export async function importProductsFromSpreadsheet(
  file: File,
  mapping: ColumnMapping,
  userName = 'Operador',
  onProgress?: (processed: number, total: number) => void
): Promise<{ successCount: number; errorCount: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          return resolve({ successCount: 0, errorCount: 0, errors: ['O arquivo selecionado está vazio.'] });
        }

        const total = rawRows.length;
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];
        const newProductsMap = new Map<string, ShoeProduct>();

        // Process rows in memory
        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          const rawBarcode = row[mapping.barcode];
          const barcode = sanitizeBarcode(rawBarcode);

          if (!barcode) {
            errorCount++;
            if (errors.length < 20) {
              errors.push(`Linha ${i + 2}: Código de barras ausente ou inválido.`);
            }
            continue;
          }

          const product: ShoeProduct = {
            barcode,
            brand: String(row[mapping.brand] || 'SEM MARCA').trim(),
            model: String(row[mapping.model] || 'SEM MODELO').trim(),
            category: String(row[mapping.category] || 'Calçados').trim(),
            color: String(row[mapping.color] || 'Padrão').trim(),
            size: String(row[mapping.size] || 'U').trim(),
            gender: mapping.gender ? String(row[mapping.gender] || '').trim() : '',
            expectedQty: Number(row[mapping.expectedQty]) || 0,
            countedQty: 0,
            lastUpdated: Date.now(),
            createdAt: Date.now()
          };

          newProductsMap.set(barcode, product);
          successCount++;

          if (onProgress && i % 1000 === 0) {
            onProgress(i, total);
          }
        }

        // Merge into local cache
        newProductsMap.forEach((p, code) => productsCacheMap.set(code, p));
        const updatedList = Array.from(productsCacheMap.values());
        updateLocalProductsCache(updatedList);

        // Batch upload to Firestore in chunks of 450
        const productsArray = Array.from(newProductsMap.values());
        const chunkSize = 450;
        for (let i = 0; i < productsArray.length; i += chunkSize) {
          const chunk = productsArray.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach(p => {
            const ref = doc(db, PRODUCTS_COLLECTION, p.barcode);
            batch.set(ref, p, { merge: true });
          });
          try {
            await batch.commit();
          } catch (batchErr) {
            console.warn('Batch cloud sync chunk deferred to offline storage:', batchErr);
          }
        }

        await logAuditAction(
          'IMPORT_EXCEL',
          'CADASTRO',
          `Importação concluída: ${successCount} produtos importados/atualizados a partir do arquivo ${file.name}.`,
          userName
        );

        resolve({ successCount, errorCount, errors });
      } catch (err: any) {
        reject(new Error(`Falha no processamento da planilha: ${err.message}`));
      }
    };

    reader.onerror = () => reject(new Error('Erro de leitura do arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}
