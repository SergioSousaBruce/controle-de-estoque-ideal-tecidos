import { ShoeBrand, ShoeProduct, ShoeInventory } from '../../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc,
  writeBatch
} from 'firebase/firestore';

const DB_NAME = 'ShoeInventoryLocalDB';
const DB_VERSION = 1;

export const DEFAULT_BRANDS_LIST = [
  'Addam', 'Adidas', 'Amora Maria', 'Aramis', 'Azaleia', 'Bebecê', 'Beira Rio', 'Bottero', 'Boxx 200', 'brSport', 'Calvest', 'Campesí', 'Carreiro', 'Coca-Cola', 'Comfortflex', 'Dakota', 'Democrata', 'Dray', 'Ferracini', 'Fila', 'Freeway', 'Gofer', 'Isadora Oliveira', 'Itapuã', 'Joma', 'Kemo', 'Kenner', 'Kidy', 'Klin', 'Kolosh', 'Leveterapia', 'Lynd', 'Maria Isabel', 'Mariotta', 'Mathaus', 'Mini Sua Cia', 'Mississipi', 'Mizuno', 'Modare', 'Moleca', 'Molekinha', 'Molekinho', 'New Balance', 'Nike', 'Olympikus', 'Oxn', 'Pampili', 'Ped Shoes', 'Penalty', 'Piccadilly', 'Princes', 'Puma', 'QIX', 'Rafithy', 'Ramarim', 'Rainha', 'Rekoba', 'Rissato', 'Skechers', 'Soft Works', 'Sua Cia', 'Topper', 'Umbro', 'Under Armour', 'Usaflex', 'Vans', 'Via Marte', 'Via Scarpa', 'Vizzano', 'West Coast', 'World Colors', 'Zebu'
];

let dbInstance: IDBDatabase | null = null;

export function initLocalDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains('brands')) {
        database.createObjectStore('brands', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('products')) {
        database.createObjectStore('products', { keyPath: 'barcode' });
      }
      if (!database.objectStoreNames.contains('inventories')) {
        database.createObjectStore('inventories', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Generically perform a transaction
function getStore(storeName: 'brands' | 'products' | 'inventories', mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  return initLocalDB().then((database) => {
    const transaction = database.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

export function getBrandIdFromName(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, '_') // keep only alphanumeric
    .replace(/_+/g, '_') // compress multiple underscores
    .replace(/^_+|_+$/g, ''); // trim underscores
  return `brand_${normalized || 'unknown'}`;
}

export async function getLocalBrands(): Promise<ShoeBrand[]> {
  const dbInst = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInst.transaction('brands', 'readwrite');
    const store = transaction.objectStore('brands');
    const request = store.getAll();
    
    request.onsuccess = async () => {
      let brands = request.result as ShoeBrand[];
      
      // Auto-deduplicate existing local brands in IndexedDB if any
      const grouped = new Map<string, ShoeBrand[]>();
      brands.forEach(b => {
        const key = b.name.toLowerCase().trim();
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(b);
      });
      
      let needsRefetch = false;
      for (const [nameKey, list] of grouped.entries()) {
        const preferredId = getBrandIdFromName(list[0].name);
        if (list.length > 1 || list[0].id !== preferredId) {
          needsRefetch = true;
          const activeItem = list.find(b => b.active) || list[0];
          const cleanedBrand: ShoeBrand = {
            ...activeItem,
            id: preferredId,
            name: activeItem.name.trim()
          };
          store.put(cleanedBrand);
          list.forEach(b => {
            if (b.id !== preferredId) {
              store.delete(b.id);
            }
          });
        }
      }
      
      if (needsRefetch) {
        transaction.oncomplete = () => {
          getLocalBrands().then(resolve).catch(reject);
        };
        return;
      }
      
      if (brands.length === 0) {
        // Prepopulate
        const defaultBrands: ShoeBrand[] = DEFAULT_BRANDS_LIST.map((name) => ({
          id: getBrandIdFromName(name),
          name,
          active: true,
          createdAt: Date.now()
        }));
        defaultBrands.forEach(brand => store.put(brand));
        transaction.oncomplete = () => {
          resolve(defaultBrands.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
        };
      } else {
        // Auto-merge any missing brands
        const existingNames = new Set(brands.map(b => b.name.toLowerCase().trim()));
        const missingBrands: ShoeBrand[] = [];
        DEFAULT_BRANDS_LIST.forEach((name) => {
          if (!existingNames.has(name.toLowerCase().trim())) {
            missingBrands.push({
              id: getBrandIdFromName(name),
              name,
              active: true,
              createdAt: Date.now()
            });
          }
        });
        if (missingBrands.length > 0) {
          missingBrands.forEach(brand => store.put(brand));
          brands = [...brands, ...missingBrands];
        }
        transaction.oncomplete = () => {
          brands.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
          resolve(brands);
        };
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalBrands(brands: ShoeBrand[]): Promise<void> {
  const dbInst = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInst.transaction('brands', 'readwrite');
    const store = transaction.objectStore('brands');
    brands.forEach(brand => store.put(brand));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveLocalBrand(brand: ShoeBrand, userId?: string): Promise<void> {
  const store = await getStore('brands', 'readwrite');
  if (userId && userId !== 'guest') {
    try {
      await setDoc(doc(db, 'users', userId, 'shoe_brands', brand.id), brand);
    } catch (error) {
      console.error("Cloud save brand error:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/shoe_brands/${brand.id}`);
    }
  }
  return new Promise((resolve, reject) => {
    const request = store.put(brand);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLocalBrand(id: string, userId?: string): Promise<void> {
  const store = await getStore('brands', 'readwrite');
  if (userId && userId !== 'guest') {
    try {
      await deleteDoc(doc(db, 'users', userId, 'shoe_brands', id));
    } catch (error) {
      console.error("Cloud delete brand error:", error);
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}/shoe_brands/${id}`);
    }
  }
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Products helpers
export async function getLocalProducts(): Promise<ShoeProduct[]> {
  const store = await getStore('products');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as ShoeProduct[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalProductByBarcode(barcode: string): Promise<ShoeProduct | null> {
  const store = await getStore('products');
  return new Promise((resolve, reject) => {
    const request = store.get(barcode);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalProduct(product: ShoeProduct, userId?: string): Promise<void> {
  const store = await getStore('products', 'readwrite');
  if (userId && userId !== 'guest') {
    try {
      await setDoc(doc(db, 'users', userId, 'shoe_products', product.barcode), product);
    } catch (error) {
      console.error("Cloud save product error:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/shoe_products/${product.barcode}`);
    }
  }
  return new Promise((resolve, reject) => {
    const request = store.put(product);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalProducts(products: ShoeProduct[]): Promise<void> {
  const dbInst = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInst.transaction('products', 'readwrite');
    const store = transaction.objectStore('products');
    products.forEach(product => store.put(product));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Inventories helpers
export async function getLocalInventories(): Promise<ShoeInventory[]> {
  const store = await getStore('inventories');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const list = request.result as ShoeInventory[];
      list.sort((a, b) => b.createdAt - a.createdAt);
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalInventory(id: string): Promise<ShoeInventory | null> {
  const store = await getStore('inventories');
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalInventory(inventory: ShoeInventory, userId?: string): Promise<void> {
  const store = await getStore('inventories', 'readwrite');
  if (userId && userId !== 'guest') {
    try {
      await setDoc(doc(db, 'users', userId, 'shoe_inventories', inventory.id), inventory);
    } catch (error) {
      console.error("Cloud save inventory error:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/shoe_inventories/${inventory.id}`);
    }
  }
  return new Promise((resolve, reject) => {
    const request = store.put(inventory);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLocalInventory(id: string, userId?: string): Promise<void> {
  const store = await getStore('inventories', 'readwrite');
  if (userId && userId !== 'guest') {
    try {
      await deleteDoc(doc(db, 'users', userId, 'shoe_inventories', id));
    } catch (error) {
      console.error("Cloud delete inventory error:", error);
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}/shoe_inventories/${id}`);
    }
  }
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Cloud Service Sync Interface (PREPARATION FOR THE FUTURE + Durable Persistence)
// We will sync with collections 'shoe_brands', 'shoe_products', and 'shoe_inventories'
// associated with the user's ID/device ID.

export async function syncLocalToCloud(userId: string): Promise<void> {
  if (!userId || userId === 'guest') return;
  try {
    // 1. Sync Brands
    const localBrands = await getLocalBrands();
    const batchBrands = writeBatch(db);
    localBrands.forEach(brand => {
      const docRef = doc(db, 'users', userId, 'shoe_brands', brand.id);
      batchBrands.set(docRef, brand);
    });
    await batchBrands.commit();

    // 2. Sync Inventories
    const localInventories = await getLocalInventories();
    const batchInv = writeBatch(db);
    localInventories.forEach(inv => {
      const docRef = doc(db, 'users', userId, 'shoe_inventories', inv.id);
      batchInv.set(docRef, inv);
    });
    await batchInv.commit();

    // 3. Sync Products (only up to 500 at a time if they are too many, or batch size limits)
    const localProducts = await getLocalProducts();
    // Batch save products
    const chunks = [];
    for (let i = 0; i < localProducts.length; i += 400) {
      chunks.push(localProducts.slice(i, i + 400));
    }
    for (const chunk of chunks) {
      const batchProd = writeBatch(db);
      chunk.forEach(prod => {
        const docRef = doc(db, 'users', userId, 'shoe_products', prod.barcode);
        batchProd.set(docRef, prod);
      });
      await batchProd.commit();
    }
  } catch (error) {
    console.error("Cloud Sync Error:", error);
  }
}

export async function syncCloudToLocal(userId: string): Promise<void> {
  if (!userId || userId === 'guest') return;
  try {
    // 1. Fetch Cloud Brands
    const brandSnap = await getDocs(collection(db, 'users', userId, 'shoe_brands'));
    if (!brandSnap.empty) {
      const cloudBrands = brandSnap.docs.map(d => d.data() as ShoeBrand);
      await saveLocalBrands(cloudBrands);
    }

    // 2. Fetch Cloud Inventories
    const invSnap = await getDocs(collection(db, 'users', userId, 'shoe_inventories'));
    if (!invSnap.empty) {
      const cloudInvs = invSnap.docs.map(d => d.data() as ShoeInventory);
      for (const inv of cloudInvs) {
        await saveLocalInventory(inv);
      }
    }

    // 3. Fetch Cloud Products
    const prodSnap = await getDocs(collection(db, 'users', userId, 'shoe_products'));
    if (!prodSnap.empty) {
      const cloudProds = prodSnap.docs.map(d => d.data() as ShoeProduct);
      await saveLocalProducts(cloudProds);
    }
  } catch (error) {
    console.error("Cloud to Local Sync Error:", error);
  }
}

// Seed mock products so that they have some database items if they want to test with "thousands of products"
export async function seedDemoProductsIfNeeded(): Promise<void> {
  const currentProds = await getLocalProducts();
  if (currentProds.length > 0) return;

  const demoProducts: ShoeProduct[] = [];
  const categories = ['Sapatilha Feminina Adulta', 'Sapatilha Feminina Infantil', 'Rasteirinhas', 'Saltos', 'Papetes Adulto', 'Botas Masculinas'];
  const colors = ['Preto', 'Bege', 'Branco', 'Rosa', 'Azul', 'Vermelho', 'Nude'];
  const models = ['Revolution 7', 'Comfort Soft', 'Casual Classic', 'Zaxy Love', 'Beira Rio Flex', 'Vizzano Classy'];
  
  // Let's generate 200 high-quality demo products to give the system real, performant data
  const brands = DEFAULT_BRANDS_LIST.slice(0, 10);

  let barcodeIndex = 7891000000001;
  for (let i = 0; i < 200; i++) {
    const brand = brands[i % brands.length];
    const category = categories[i % categories.length];
    const color = colors[i % colors.length];
    const model = models[i % models.length] + ' ' + (20 + (i % 50));
    const size = String(34 + (i % 8));
    const barcode = String(barcodeIndex + i);
    
    demoProducts.push({
      barcode,
      brand,
      model,
      category,
      color,
      size,
      expectedQty: Math.floor(Math.random() * 15) + 3,
      countedQty: 0,
      lastUpdated: Date.now()
    });
  }

  await saveLocalProducts(demoProducts);
}
