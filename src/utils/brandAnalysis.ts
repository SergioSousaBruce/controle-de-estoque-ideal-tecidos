import { InventoryCount } from '../../types';

export interface BrandSizeAnalysis {
  brandName: string;
  totalItems: number;
  totalCountsCount: number;
  sizeTotals: Record<string, number>;
  highOutputSizes: { size: string; qty: number }[];
  mediumOutputSizes: { size: string; qty: number }[];
  lowOutputSizes: { size: string; qty: number }[];
}

export function computeBrandSizeAnalysis(countsList: InventoryCount[]): BrandSizeAnalysis[] {
  const brandMap: Record<string, InventoryCount[]> = {};
  
  countsList.forEach(item => {
    const brand = item.brand && item.brand.trim() ? item.brand.trim() : 'Outras / Sem Marca';
    if (!brandMap[brand]) {
      brandMap[brand] = [];
    }
    brandMap[brand].push(item);
  });

  const results: BrandSizeAnalysis[] = [];

  Object.entries(brandMap).forEach(([brandName, items]) => {
    const sizeTotals: Record<string, number> = {};
    let totalItems = 0;

    items.forEach(item => {
      totalItems += item.total || 0;
      if (item.sizes) {
        Object.entries(item.sizes).forEach(([size, qty]) => {
          const num = Number(qty) || 0;
          if (num > 0) {
            sizeTotals[size] = (sizeTotals[size] || 0) + num;
          }
        });
      }
    });

    const sizeEntries = Object.entries(sizeTotals).map(([size, qty]) => ({ size, qty }));
    
    // Natural sort sizes (e.g. 34, 35, 36 or P, M, G)
    sizeEntries.sort((a, b) => {
      const numA = parseFloat(a.size);
      const numB = parseFloat(b.size);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.size.localeCompare(b.size);
    });

    const maxQty = sizeEntries.length > 0 ? Math.max(...sizeEntries.map(e => e.qty)) : 0;

    const highOutputSizes: { size: string; qty: number }[] = [];
    const mediumOutputSizes: { size: string; qty: number }[] = [];
    const lowOutputSizes: { size: string; qty: number }[] = [];

    sizeEntries.forEach(e => {
      if (maxQty === 0) return;
      
      if (maxQty <= 2) {
        if (e.qty >= 2) highOutputSizes.push(e);
        else if (e.qty === 1) mediumOutputSizes.push(e);
        else lowOutputSizes.push(e);
      } else {
        const ratio = e.qty / maxQty;
        if (ratio >= 0.6 && e.qty >= 3) {
          highOutputSizes.push(e);
        } else if (ratio >= 0.25 || e.qty >= 2) {
          mediumOutputSizes.push(e);
        } else {
          lowOutputSizes.push(e);
        }
      }
    });

    results.push({
      brandName,
      totalItems,
      totalCountsCount: items.length,
      sizeTotals,
      highOutputSizes,
      mediumOutputSizes,
      lowOutputSizes,
    });
  });

  return results.sort((a, b) => b.totalItems - a.totalItems);
}
