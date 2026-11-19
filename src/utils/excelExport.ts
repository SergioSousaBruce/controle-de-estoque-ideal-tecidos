import * as XLSX from 'xlsx';
import { InventoryCount } from '../../types';

export interface PurchasingGapRow {
  id: string;
  brand: string;
  model: string;
  color: string;
  gender: string;
  productType: string;
  arrival: string;
  total: number;
  zeroSizes: string[];
  lowSizes: Array<{ size: string; qty: number }>;
  okSizes: Array<{ size: string; qty: number }>;
  priority: 'CRITICO' | 'REPOR' | 'OK';
  item: InventoryCount;
}

const sortSizeKeys = (a: string, b: string) => {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
};

export function exportBrandToExcel(brandName: string, items: InventoryCount[]): void {
  if (!items || items.length === 0) return;

  // Sheet 1: Grade Consolidada da Marca
  const aggregated: Record<string, number> = {};
  items.forEach((item) => {
    Object.entries(item.sizes || {}).forEach(([sz, q]) => {
      const val = Number(q) || 0;
      if (val > 0) {
        aggregated[sz] = (aggregated[sz] || 0) + val;
      }
    });
  });

  const sortedSizes = Object.entries(aggregated).sort(([a], [b]) => sortSizeKeys(a, b));
  const totalPieces = sortedSizes.reduce((acc, [, q]) => acc + q, 0);

  const consolidatedRows = sortedSizes.map(([size, qty]) => ({
    'Marca': brandName,
    'Tamanho / Numeração': size,
    'Quantidade Total': qty,
    'Status Compras': qty <= 2 ? 'REPOR (Baixo)' : qty <= 5 ? 'Médio' : 'Cheio',
  }));

  consolidatedRows.push({
    'Marca': brandName,
    'Tamanho / Numeração': 'TOTAL GERAL',
    'Quantidade Total': totalPieces,
    'Status Compras': `${items.length} lote(s)`,
  });

  // Sheet 2: Lotes e Modelos Detalhados
  const allSizeKeys = Array.from(
    new Set(
      items.flatMap((i) =>
        Object.entries(i.sizes || {})
          .filter(([, q]) => Number(q) > 0)
          .map(([sz]) => sz)
      )
    )
  ).sort(sortSizeKeys);

  const lotRows = items.map((item) => {
    const base: Record<string, string | number> = {
      'Data': item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '-',
      'Marca': item.brand || brandName,
      'Modelo': item.model || '-',
      'Cor': item.color || '-',
      'Gênero': item.gender || '-',
      'Categoria': item.productType || '-',
      'Chegada': `${item.arrivalMonth || '--'}/${item.arrivalYear || '--'}`,
      'Total': item.total || 0,
    };

    allSizeKeys.forEach((sz) => {
      base[`Tam ${sz}`] = Number(item.sizes?.[sz]) || 0;
    });

    return base;
  });

  const wb = XLSX.utils.book_new();
  const wsConsolidated = XLSX.utils.json_to_sheet(consolidatedRows);
  const wsLots = XLSX.utils.json_to_sheet(lotRows);

  XLSX.utils.book_append_sheet(wb, wsConsolidated, 'Grade Consolidada');
  XLSX.utils.book_append_sheet(wb, wsLots, 'Lotes e Modelos');

  const safeBrand = brandName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  XLSX.writeFile(wb, `Estoque_${safeBrand}_${dateStr}.xlsx`);
}

export function exportPurchasingReportToExcel(rows: PurchasingGapRow[]): void {
  if (!rows || rows.length === 0) return;

  const sheetRows = rows.map((r) => ({
    'Prioridade': r.priority === 'CRITICO' ? 'CRÍTICO' : r.priority === 'REPOR' ? 'REPOR' : 'OK',
    'Marca': r.brand,
    'Modelo': r.model,
    'Cor': r.color || '-',
    'Gênero': r.gender || '-',
    'Chegada': r.arrival || '-',
    'Total Atual': r.total,
    'Numerações Zeradas (Falta)': r.zeroSizes.join(', ') || '-',
    'Numerações Baixas (1-2 prs)': r.lowSizes.map((s) => `${s.size} (${s.qty})`).join(', ') || '-',
    'Numerações OK (3+ prs)': r.okSizes.map((s) => `${s.size} (${s.qty})`).join(', ') || '-',
  }));

  // Brand summary sheet
  const byBrand = new Map<
    string,
    { brand: string; totalPairs: number; modelsWithGap: number; criticalCount: number; zeroSizeHits: number; lowSizeHits: number }
  >();

  rows.forEach((r) => {
    const cur = byBrand.get(r.brand) || {
      brand: r.brand,
      totalPairs: 0,
      modelsWithGap: 0,
      criticalCount: 0,
      zeroSizeHits: 0,
      lowSizeHits: 0,
    };
    cur.totalPairs += r.total;
    if (r.zeroSizes.length > 0 || r.lowSizes.length > 0) cur.modelsWithGap += 1;
    if (r.priority === 'CRITICO') cur.criticalCount += 1;
    cur.zeroSizeHits += r.zeroSizes.length;
    cur.lowSizeHits += r.lowSizes.length;
    byBrand.set(r.brand, cur);
  });

  const brandSummaryRows = Array.from(byBrand.values())
    .sort((a, b) => b.criticalCount - a.criticalCount || b.zeroSizeHits - a.zeroSizeHits)
    .map((b) => ({
      'Marca': b.brand,
      'Modelos Analisados': b.modelsWithGap,
      'Lotes Críticos': b.criticalCount,
      'Tamanhos Zerados': b.zeroSizeHits,
      'Tamanhos Baixos (1-2)': b.lowSizeHits,
      'Total Pares Restantes': b.totalPairs,
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Grade Furada e Repor');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(brandSummaryRows), 'Resumo por Marca');

  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  XLSX.writeFile(wb, `Lista_Compras_Grade_Furada_${dateStr}.xlsx`);
}

export function exportAllInventoryToExcel(counts: InventoryCount[]): void {
  if (!counts || counts.length === 0) return;

  const allSizeKeys = Array.from(
    new Set(
      counts.flatMap((c) =>
        Object.entries(c.sizes || {})
          .filter(([, q]) => Number(q) > 0)
          .map(([sz]) => sz)
      )
    )
  ).sort(sortSizeKeys);

  const lotRows = counts.map((item) => {
    const row: Record<string, string | number> = {
      'Data': item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '-',
      'Marca': item.brand || '-',
      'Modelo': item.model || '-',
      'Cor': item.color || '-',
      'Gênero': item.gender || '-',
      'Categoria': item.productType || '-',
      'Chegada': `${item.arrivalMonth || '--'}/${item.arrivalYear || '--'}`,
      'Total': item.total || 0,
    };
    allSizeKeys.forEach((sz) => {
      row[`Tam ${sz}`] = Number(item.sizes?.[sz]) || 0;
    });
    return row;
  });

  const brandTotals = new Map<string, { total: number; lots: number; models: Set<string> }>();
  counts.forEach((c) => {
    const b = (c.brand || 'Sem Marca').trim();
    const entry = brandTotals.get(b) || { total: 0, lots: 0, models: new Set() };
    entry.total += Number(c.total) || 0;
    entry.lots += 1;
    if (c.model) entry.models.add(c.model);
    brandTotals.set(b, entry);
  });

  const brandRows = Array.from(brandTotals.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([brand, info]) => ({
      'Marca': brand,
      'Total de Peças': info.total,
      'Modelos': info.models.size,
      'Lotes': info.lots,
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lotRows), 'Estoque Completo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(brandRows), 'Resumo por Marca');

  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  XLSX.writeFile(wb, `Estoque_Geral_IdealTecidos_${dateStr}.xlsx`);
}
