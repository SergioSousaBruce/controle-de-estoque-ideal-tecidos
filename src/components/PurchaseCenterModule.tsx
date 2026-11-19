import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  ShoppingCart,
  AlertTriangle,
  Search,
  XCircle,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  ChevronLeft,
  Edit2,
  Package,
  Layers,
  Filter
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InventoryCount } from '../../types';
import { getDefaultSizesArray } from '../../constants';
import { exportPurchasingReportToExcel, PurchasingGapRow } from '../utils/excelExport';

interface PurchaseCenterModuleProps {
  counts: InventoryCount[];
  initialPriorityFilter?: 'ALL' | 'CRITICO' | 'ZERADOS' | 'BAIXO';
  onBackToHome: () => void;
  onEditItem: (item: InventoryCount) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const sortSizeKeys = (a: string, b: string) => {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
};

export const PurchaseCenterModule: React.FC<PurchaseCenterModuleProps> = ({
  counts,
  initialPriorityFilter = 'ALL',
  onBackToHome,
  onEditItem,
  showToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'M' | 'F' | 'IM' | 'IF'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'CRITICO' | 'ZERADOS' | 'BAIXO'>(initialPriorityFilter);
  const [sizeQuery, setSizeQuery] = useState('');
  const [viewMode, setViewMode] = useState<'MODELS' | 'BRANDS'>('MODELS');
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(25);

  // Build Purchasing Gap analysis for every lot/model
  const allRows = useMemo<PurchasingGapRow[]>(() => {
    return counts.map((item) => {
      const expectedGrid = getDefaultSizesArray(item.gridType, item.gender, item.productType);
      const itemSizes = item.sizes || {};
      const extraSizes = Object.keys(itemSizes).filter((s) => !expectedGrid.includes(s) && (Number(itemSizes[s]) || 0) > 0);
      const fullGrid = [...expectedGrid, ...extraSizes].sort(sortSizeKeys);

      const zeroSizes: string[] = [];
      const lowSizes: Array<{ size: string; qty: number }> = [];
      const okSizes: Array<{ size: string; qty: number }> = [];

      fullGrid.forEach((sz) => {
        const qty = Number(itemSizes[sz]) || 0;
        if (qty === 0) {
          zeroSizes.push(sz);
        } else if (qty <= 2) {
          lowSizes.push({ size: sz, qty });
        } else {
          okSizes.push({ size: sz, qty });
        }
      });

      const total = Number(item.total) || 0;
      let priority: 'CRITICO' | 'REPOR' | 'OK' = 'OK';
      if (total <= 3 || zeroSizes.length >= Math.ceil(fullGrid.length * 0.5)) {
        priority = 'CRITICO';
      } else if (zeroSizes.length > 0 || lowSizes.length > 0) {
        priority = 'REPOR';
      }

      return {
        id: item.id,
        brand: (item.brand || 'Sem Marca').trim(),
        model: (item.model || 'Sem Modelo').trim(),
        color: (item.color || '').trim(),
        gender: item.gender || '',
        productType: item.productType || '',
        arrival: `${item.arrivalMonth || '--'}/${item.arrivalYear || '--'}`,
        total,
        zeroSizes,
        lowSizes,
        okSizes,
        priority,
        item,
      };
    });
  }, [counts]);

  const filteredRows = useMemo(() => {
    const lowSearch = deferredSearch.toLowerCase().trim();
    const cleanSize = sizeQuery.trim().toUpperCase();

    return allRows
      .filter((row) => {
        if (genderFilter !== 'ALL' && row.gender !== genderFilter) return false;

        if (priorityFilter === 'CRITICO') {
          if (row.priority !== 'CRITICO') return false;
        } else if (priorityFilter === 'ZERADOS') {
          if (row.total !== 0 && row.zeroSizes.length === 0) return false;
        } else if (priorityFilter === 'BAIXO') {
          if (row.lowSizes.length === 0 && !(row.total > 0 && row.total <= 3)) return false;
        } else {
          // ALL: show everything that has at least 1 gap or low size (or total === 0)
          if (row.zeroSizes.length === 0 && row.lowSizes.length === 0 && row.total > 3) return false;
        }

        if (cleanSize) {
          const isZeroInSize = row.zeroSizes.some((s) => s.toUpperCase() === cleanSize);
          const isLowInSize = row.lowSizes.some((s) => s.size.toUpperCase() === cleanSize);
          if (!isZeroInSize && !isLowInSize) return false;
        }

        if (lowSearch) {
          const match =
            row.brand.toLowerCase().includes(lowSearch) ||
            row.model.toLowerCase().includes(lowSearch) ||
            row.color.toLowerCase().includes(lowSearch);
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const pOrder = { CRITICO: 0, REPOR: 1, OK: 2 };
        if (pOrder[a.priority] !== pOrder[b.priority]) {
          return pOrder[a.priority] - pOrder[b.priority];
        }
        return b.zeroSizes.length - a.zeroSizes.length || a.total - b.total;
      });
  }, [allRows, deferredSearch, genderFilter, priorityFilter, sizeQuery]);

  // Brand-grouped purchasing summary
  const brandSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        brand: string;
        totalPairs: number;
        modelsCount: number;
        criticalModels: number;
        zeroSizeMap: Record<string, number>;
        lowSizeMap: Record<string, number>;
        rows: PurchasingGapRow[];
      }
    >();

    filteredRows.forEach((row) => {
      const existing = map.get(row.brand) || {
        brand: row.brand,
        totalPairs: 0,
        modelsCount: 0,
        criticalModels: 0,
        zeroSizeMap: {},
        lowSizeMap: {},
        rows: [],
      };
      existing.totalPairs += row.total;
      existing.modelsCount += 1;
      if (row.priority === 'CRITICO') existing.criticalModels += 1;
      row.zeroSizes.forEach((sz) => {
        existing.zeroSizeMap[sz] = (existing.zeroSizeMap[sz] || 0) + 1;
      });
      row.lowSizes.forEach(({ size }) => {
        existing.lowSizeMap[size] = (existing.lowSizeMap[size] || 0) + 1;
      });
      existing.rows.push(row);
      map.set(row.brand, existing);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.criticalModels - a.criticalModels || b.modelsCount - a.modelsCount
    );
  }, [filteredRows]);

  const metrics = useMemo(() => {
    const critical = allRows.filter((r) => r.priority === 'CRITICO').length;
    const withGap = allRows.filter((r) => r.zeroSizes.length > 0 || r.lowSizes.length > 0).length;
    const totalZeroHits = allRows.reduce((acc, r) => acc + r.zeroSizes.length, 0);
    const totalLowHits = allRows.reduce((acc, r) => acc + r.lowSizes.length, 0);
    return { critical, withGap, totalZeroHits, totalLowHits };
  }, [allRows]);

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      showToast('Nenhum item filtrado para exportar.', 'error');
      return;
    }
    exportPurchasingReportToExcel(filteredRows);
    showToast('Planilha de Compras (.xlsx) baixada com sucesso!', 'success');
  };

  const handleExportPdf = () => {
    if (filteredRows.length === 0) {
      showToast('Nenhum item filtrado para gerar PDF.', 'error');
      return;
    }
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 16, 'F');
    doc.setFillColor(225, 29, 72);
    doc.rect(0, 16, 210, 2, 'F');

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text('IDEAL TECIDOS - LISTA DE COMPRAS E GRADE FURADA', 14, 28);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont(undefined, 'normal');
    doc.text(`Emitido em ${dateStr} às ${timeStr} | ${filteredRows.length} modelo(s) analisado(s)`, 14, 34);

    const tableRows = filteredRows.map((r) => [
      r.priority === 'CRITICO' ? 'CRÍTICO' : 'REPOR',
      r.brand,
      `${r.model}${r.color ? ` (${r.color})` : ''}${r.gender ? ` [${r.gender}]` : ''}`,
      r.total.toString(),
      r.zeroSizes.join(', ') || '-',
      r.lowSizes.map((s) => `${s.size}(${s.qty})`).join(', ') || '-',
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Prior.', 'Marca', 'Modelo / Cor', 'Saldo', 'Zerados (Falta)', 'Baixos (1-2)']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 18, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 28, fontStyle: 'bold' },
        2: { cellWidth: 44 },
        3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 46 },
        5: { cellWidth: 36 },
      },
    });

    doc.save(`Lista_Compras_IdealTecidos_${dateStr.replace(/\//g, '-')}.pdf`);
    showToast('PDF de Compras baixado com sucesso!', 'success');
  };

  const handleCopyWhatsApp = async () => {
    if (filteredRows.length === 0) {
      showToast('Nenhum item para copiar.', 'error');
      return;
    }
    const topItems = filteredRows.slice(0, 30);
    const lines = topItems.map((r) => {
      const zeros = r.zeroSizes.length > 0 ? `Falta: ${r.zeroSizes.join(', ')}` : '';
      const lows = r.lowSizes.length > 0 ? `Baixo: ${r.lowSizes.map((s) => `${s.size}(${s.qty})`).join(', ')}` : '';
      const detail = [zeros, lows].filter(Boolean).join(' | ');
      return `• *${r.brand}* - ${r.model}${r.color ? ` (${r.color})` : ''} [Saldo: ${r.total}]\n  _${detail}_`;
    });

    const header = `🛒 *LISTA DE REPOSIÇÃO / GRADE FURADA - A IDEAL TECIDOS*\n(${filteredRows.length} modelo(s) com necessidade de compra)\n\n`;
    const footer = filteredRows.length > 30 ? `\n\n...e mais ${filteredRows.length - 30} modelo(s) na planilha Excel.` : '';

    try {
      await navigator.clipboard.writeText(header + lines.join('\n') + footer);
      setCopiedWhatsApp(true);
      showToast('Lista de compras copiada para o WhatsApp!', 'success');
      setTimeout(() => setCopiedWhatsApp(false), 2500);
    } catch {
      showToast('Não foi possível copiar automaticamente.', 'error');
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-[#172554] to-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToHome}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl transition-all shrink-0 cursor-pointer"
            title="Voltar"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-2 bg-amber-500/20 border border-amber-400/30 text-amber-300 rounded-xl shrink-0">
                <ShoppingCart size={20} />
              </span>
              <h1 className="text-lg sm:text-2xl font-display font-black uppercase tracking-tight text-white">
                Central de Compras & Grade Furada
              </h1>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-blue-200/80 mt-1">
              Veja numerações zeradas, tamanhos críticos (1–2 pares) e exporte direto para Excel ou WhatsApp.
            </p>
          </div>
        </div>

        {/* Export Actions */}
        <div className="grid grid-cols-3 w-full lg:w-auto sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <FileSpreadsheet size={15} />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-2.5 bg-brand-red hover:brightness-110 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Download size={15} />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white border border-white/20 font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            {copiedWhatsApp ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedWhatsApp ? 'Copiado' : 'WhatsApp'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setPriorityFilter('CRITICO')}
          className="text-left bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-4 shadow-sm hover:border-rose-400 transition-all cursor-pointer"
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 block">Críticos</span>
          <p className="text-2xl sm:text-3xl font-display font-black text-brand-dark dark:text-white mt-1">{metrics.critical}</p>
          <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">Modelos c/ falta grave</span>
        </button>

        <button
          type="button"
          onClick={() => setPriorityFilter('ALL')}
          className="text-left bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 shadow-sm hover:border-amber-400 transition-all cursor-pointer"
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">Para Repor</span>
          <p className="text-2xl sm:text-3xl font-display font-black text-brand-dark dark:text-white mt-1">{metrics.withGap}</p>
          <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">Grades incompletas</span>
        </button>

        <button
          type="button"
          onClick={() => setPriorityFilter('ZERADOS')}
          className="text-left bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-brand-accent transition-all cursor-pointer"
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 block">Furos (0 pares)</span>
          <p className="text-2xl sm:text-3xl font-display font-black text-rose-600 dark:text-rose-400 mt-1">{metrics.totalZeroHits}</p>
          <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">Numerações zeradas</span>
        </button>

        <button
          type="button"
          onClick={() => setPriorityFilter('BAIXO')}
          className="text-left bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-brand-accent transition-all cursor-pointer"
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 block">Baixo (1-2 prs)</span>
          <p className="text-2xl sm:text-3xl font-display font-black text-amber-600 dark:text-amber-400 mt-1">{metrics.totalLowHits}</p>
          <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">Tamanhos quase acabando</span>
        </button>
      </div>

      {/* Filters Panel */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar marca, modelo ou cor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-brand-slate dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl text-sm font-bold text-brand-dark dark:text-white focus:border-brand-accent focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rose-500"
              >
                <XCircle size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-36 sm:w-44">
              <Filter size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Nº em falta (ex: 36)"
                value={sizeQuery}
                onChange={(e) => setSizeQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-3 bg-brand-slate dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl text-xs font-black text-brand-dark dark:text-white focus:border-brand-accent focus:outline-none uppercase"
              />
              {sizeQuery && (
                <button
                  type="button"
                  onClick={() => setSizeQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rose-500"
                >
                  <XCircle size={14} />
                </button>
              )}
            </div>

            <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-2xl border border-gray-200 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('MODELS')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all ${
                  viewMode === 'MODELS'
                    ? 'bg-brand-dark text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-300'
                }`}
              >
                <Package size={12} /> Modelos
              </button>
              <button
                type="button"
                onClick={() => setViewMode('BRANDS')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all ${
                  viewMode === 'BRANDS'
                    ? 'bg-brand-dark text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-300'
                }`}
              >
                <Layers size={12} /> Por Marca
              </button>
            </div>
          </div>
        </div>

        {/* Priority & Gender Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL', label: 'Todos c/ Falta' },
              { id: 'CRITICO', label: '🔴 Críticos' },
              { id: 'ZERADOS', label: '⚠️ Com Furos (0)' },
              { id: 'BAIXO', label: '🟡 Baixo (1-2)' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriorityFilter(p.id as any)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all border cursor-pointer ${
                  priorityFilter === p.id
                    ? 'bg-brand-dark text-white border-brand-dark dark:bg-emerald-600 dark:border-emerald-500'
                    : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL', label: 'Todos Gêneros' },
              { id: 'M', label: 'Masc' },
              { id: 'F', label: 'Fem' },
              { id: 'IM', label: 'Inf.M' },
              { id: 'IF', label: 'Inf.F' },
            ].map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGenderFilter(g.id as any)}
                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all border cursor-pointer ${
                  genderFilter === g.id
                    ? 'bg-brand-blue text-white border-brand-blue dark:bg-blue-600 dark:border-blue-500'
                    : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results List */}
      {viewMode === 'BRANDS' ? (
        brandSummaries.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-dashed border-gray-200 dark:border-slate-800">
            <p className="font-bold text-gray-400 text-sm uppercase">Nenhuma marca com falta de numeração neste filtro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {brandSummaries.map((b) => {
              const topMissing = Object.entries(b.zeroSizeMap)
                .sort((a, c) => c[1] - a[1])
                .slice(0, 8);
              const topLow = Object.entries(b.lowSizeMap)
                .sort((a, c) => c[1] - a[1])
                .slice(0, 8);

              return (
                <div
                  key={b.brand}
                  className="bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-display font-black text-brand-dark dark:text-white uppercase">{b.brand}</h3>
                      <p className="text-xs font-bold text-gray-500 dark:text-slate-400">
                        {b.modelsCount} modelo(s) p/ repor • {b.totalPairs} pares restantes
                      </p>
                    </div>
                    {b.criticalModels > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-black uppercase">
                        {b.criticalModels} crítico(s)
                      </span>
                    )}
                  </div>

                  {topMissing.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Mais zerados na marca:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {topMissing.map(([sz, hits]) => (
                          <span key={sz} className="px-2 py-0.5 bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-[10px] font-black">
                            Tam {sz} ({hits}x)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {topLow.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Baixos (1-2 pares):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {topLow.map(([sz, hits]) => (
                          <span key={sz} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] font-black">
                            Tam {sz} ({hits}x)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : filteredRows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-dashed border-gray-200 dark:border-slate-800 space-y-2">
          <AlertTriangle size={32} className="mx-auto text-emerald-500" />
          <p className="font-display font-black text-brand-dark dark:text-white text-base">Nenhum furo encontrado neste filtro!</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">Tente limpar a busca de numeração ou mudar o filtro de prioridade.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredRows.slice(0, visibleLimit).map((row) => (
              <div
                key={row.id}
                className={`bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border shadow-sm space-y-3 ${
                  row.priority === 'CRITICO'
                    ? 'border-rose-200 dark:border-rose-900/70'
                    : 'border-gray-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                          row.priority === 'CRITICO'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {row.priority === 'CRITICO' ? 'Crítico' : 'Repor'}
                      </span>
                      <span className="text-xs font-black uppercase text-brand-blue dark:text-blue-400">{row.brand}</span>
                      {row.gender && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase">
                          {row.gender}
                        </span>
                      )}
                    </div>
                    <h4 className="font-display font-black text-base sm:text-lg text-brand-dark dark:text-white uppercase truncate mt-1">
                      {row.model} {row.color ? `• ${row.color}` : ''}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                      <span className="text-[8px] font-black uppercase text-gray-500 dark:text-slate-400 block leading-none">Saldo</span>
                      <span className="text-base font-black text-brand-dark dark:text-white">{row.total}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditItem(row.item)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 cursor-pointer"
                      title="Editar contagem deste modelo"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>
                </div>

                {row.zeroSizes.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 block">
                      Zerados / Faltando ({row.zeroSizes.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {row.zeroSizes.map((sz) => (
                        <span
                          key={sz}
                          className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-black"
                        >
                          {sz}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {row.lowSizes.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block">
                      Estoque Baixo (1–2 pares):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {row.lowSizes.map((s) => (
                        <span
                          key={s.size}
                          className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-black"
                        >
                          {s.size}: {s.qty}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredRows.length > visibleLimit && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 25)}
                className="px-6 py-3 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-brand-dark dark:text-white border border-gray-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-wider shadow-xs cursor-pointer"
              >
                Carregar mais ({filteredRows.length - visibleLimit} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
