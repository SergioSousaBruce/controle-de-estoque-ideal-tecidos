import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Download, FileSpreadsheet, Filter, Search, Calendar, 
  Tag, Barcode, AlertTriangle, CheckCircle2, MinusCircle, PlusCircle, 
  Layers, RefreshCw, XCircle, ChevronLeft, ArrowUpRight, ArrowDownLeft,
  ArrowRightLeft, Sparkles, Building2, Package, Eye
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { InventoryCount, StockMovement } from '../../types';
import { subscribeStockMovements } from '../services/stockMovementService';

interface ReportsModuleProps {
  counts: InventoryCount[];
  onBackToHome?: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export type ReportType = 
  | 'GERAL' 
  | 'DIVERGENCIAS' 
  | 'ZERADOS' 
  | 'ESTOQUE_BAIXO' 
  | 'POR_NUMERACAO'
  | 'MOVIMENTACOES';

export interface FlattenedStockItem {
  id: string;
  barcode: string;
  brand: string;
  model: string;
  color: string;
  size: string;
  productType: string;
  qty: number;
  expectedQty?: number;
  diff?: number;
  createdAt: number;
  dateFormatted: string;
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  counts,
  onBackToHome,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<ReportType>('GERAL');
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Filter States
  const [filterBrand, setFilterBrand] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterColor, setFilterColor] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterMovementType, setFilterMovementType] = useState<string>('ALL');
  const [filterStockStatus, setFilterStockStatus] = useState<string>('ALL'); // ALL, ZERADO, BAIXO, NORMAL
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Divergence ERP Input Text State (for Divergence tab)
  const [erpInputText, setErpInputText] = useState<string>('');
  const [erpParsedData, setErpParsedData] = useState<Array<{ brand: string; model: string; color: string; size: string; expected: number }>>([]);

  // Subscribe to Stock Movements
  useEffect(() => {
    const unsubscribe = subscribeStockMovements((list) => {
      setMovements(list);
    });
    return () => unsubscribe();
  }, []);

  // Unique Brand Options for Filter Dropdown
  const uniqueBrands = useMemo(() => {
    const setB = new Set<string>();
    counts.forEach(c => {
      if (c.brand && c.brand.trim()) setB.add(c.brand.trim());
    });
    return Array.from(setB).sort();
  }, [counts]);

  // Unique Color Options for Filter Dropdown
  const uniqueColors = useMemo(() => {
    const setC = new Set<string>();
    counts.forEach(c => {
      if (c.color && c.color.trim()) setC.add(c.color.trim());
    });
    return Array.from(setC).sort();
  }, [counts]);

  // Flatten counts into individual item rows (by size)
  const flattenedStock = useMemo(() => {
    const list: FlattenedStockItem[] = [];

    counts.forEach(c => {
      const brand = c.brand || 'Ideal Tecidos';
      const model = c.model || 'N/I';
      const color = c.color || 'Padrão';
      const productType = c.productType || 'Geral';
      const barcode = (c as any).barcode || 'S/C';
      const createdAt = c.createdAt || Date.now();
      const dateObj = new Date(createdAt);
      const dateFormatted = dateObj.toLocaleDateString('pt-BR');

      if (c.sizes && Object.keys(c.sizes).length > 0) {
        Object.entries(c.sizes).forEach(([sz, qty]) => {
          list.push({
            id: `${c.id}_${sz}`,
            barcode,
            brand,
            model,
            color,
            size: sz,
            productType,
            qty: Number(qty) || 0,
            createdAt,
            dateFormatted
          });
        });
      } else {
        // Product with no size grid, total qty
        list.push({
          id: c.id,
          barcode,
          brand,
          model,
          color,
          size: 'Único',
          productType,
          qty: c.total || 0,
          createdAt,
          dateFormatted
        });
      }
    });

    return list;
  }, [counts]);

  // Parse ERP CSV for Divergence Report
  const handleParseErpCsv = () => {
    if (!erpInputText.trim()) return;

    const lines = erpInputText.split('\n').filter(l => l.trim().length > 0);
    const parsed: Array<{ brand: string; model: string; color: string; size: string; expected: number }> = [];

    lines.forEach((line, idx) => {
      if (idx === 0 && (line.toLowerCase().includes('marca') || line.toLowerCase().includes('modelo'))) return;
      const cols = line.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        let brand = cols[0] || 'N/I';
        let model = cols[1] || 'N/I';
        let color = cols[2] || 'Padrão';
        let size = cols[3] || 'Único';
        let expected = parseInt(cols[4]) || parseInt(cols[2]) || 1;
        parsed.push({ brand, model, color, size, expected });
      }
    });

    setErpParsedData(parsed);
    showToast(`${parsed.length} itens do ERP processados para divergência.`, 'success');
  };

  // Computes Filtered Data based on selected tab and search/filter controls
  const filteredData = useMemo(() => {
    // 1. Base list based on Tab
    let baseList = [...flattenedStock];

    if (activeTab === 'ZERADOS') {
      baseList = baseList.filter(item => item.qty === 0);
    } else if (activeTab === 'ESTOQUE_BAIXO') {
      baseList = baseList.filter(item => item.qty > 0 && item.qty <= 3);
    }

    // 2. Apply Custom Filters
    return baseList.filter(item => {
      // Filter Brand
      if (filterBrand && item.brand.toLowerCase() !== filterBrand.toLowerCase()) {
        return false;
      }
      // Filter Model
      if (filterModel && !item.model.toLowerCase().includes(filterModel.toLowerCase())) {
        return false;
      }
      // Filter Color
      if (filterColor && item.color.toLowerCase() !== filterColor.toLowerCase()) {
        return false;
      }
      // Filter Stock Status Range
      if (filterStockStatus === 'ZERADO' && item.qty !== 0) return false;
      if (filterStockStatus === 'BAIXO' && (item.qty <= 0 || item.qty > 3)) return false;
      if (filterStockStatus === 'NORMAL' && item.qty <= 3) return false;

      // Filter Date Range
      if (filterDateFrom) {
        const itemDateStr = new Date(item.createdAt).toISOString().slice(0, 10);
        if (itemDateStr < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const itemDateStr = new Date(item.createdAt).toISOString().slice(0, 10);
        if (itemDateStr > filterDateTo) return false;
      }

      // Search Term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchBrand = item.brand.toLowerCase().includes(term);
        const matchModel = item.model.toLowerCase().includes(term);
        const matchColor = item.color.toLowerCase().includes(term);
        const matchBarcode = item.barcode.toLowerCase().includes(term);
        const matchSize = item.size.toLowerCase().includes(term);
        if (!matchBrand && !matchModel && !matchColor && !matchBarcode && !matchSize) {
          return false;
        }
      }

      return true;
    });
  }, [flattenedStock, activeTab, filterBrand, filterModel, filterColor, filterStockStatus, filterDateFrom, filterDateTo, searchTerm]);

  // Computes Filtered Movements (for MOVIMENTACOES tab)
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (filterBrand && !m.brand.toLowerCase().includes(filterBrand.toLowerCase())) return false;
      if (filterModel && !m.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
      if (filterColor && !m.color.toLowerCase().includes(filterColor.toLowerCase())) return false;
      if (filterMovementType !== 'ALL' && m.type !== filterMovementType) return false;

      if (filterDateFrom) {
        const movDateStr = m.date ? m.date.split('/').reverse().join('-') : '';
        if (movDateStr && movDateStr < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const movDateStr = m.date ? m.date.split('/').reverse().join('-') : '';
        if (movDateStr && movDateStr > filterDateTo) return false;
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchB = m.brand.toLowerCase().includes(term);
        const matchM = m.model.toLowerCase().includes(term);
        const matchC = m.color.toLowerCase().includes(term);
        const matchR = m.reason.toLowerCase().includes(term);
        const matchU = m.userName.toLowerCase().includes(term);
        if (!matchB && !matchM && !matchC && !matchR && !matchU) return false;
      }

      return true;
    });
  }, [movements, filterBrand, filterModel, filterColor, filterMovementType, filterDateFrom, filterDateTo, searchTerm]);

  // Computes Divergence Items (for DIVERGENCIAS tab)
  const divergenceItems = useMemo(() => {
    if (erpParsedData.length === 0) {
      // Default: compare expectedQty from product master with counted physical stock
      return counts.map(c => {
        const brand = c.brand || 'Ideal';
        const model = c.model || 'N/I';
        const color = c.color || 'Padrão';
        const countedQty = c.total || 0;
        const expectedQty = (c as any).expectedQty ?? (c as any).countedQty ?? countedQty;
        const diff = countedQty - expectedQty;
        return {
          brand,
          model,
          color,
          size: 'Grade Geral',
          expectedQty,
          countedQty,
          diff,
          status: diff === 0 ? 'EXACT' : diff > 0 ? 'SURPLUS' : 'DEFICIT'
        };
      }).filter(d => {
        if (filterBrand && !d.brand.toLowerCase().includes(filterBrand.toLowerCase())) return false;
        if (filterModel && !d.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
        if (filterColor && !d.color.toLowerCase().includes(filterColor.toLowerCase())) return false;
        return true;
      });
    }

    // Comparing uploaded ERP data with physical counts
    const physicalMap = new Map<string, number>();
    counts.forEach(c => {
      const b = (c.brand || 'N/I').trim().toLowerCase();
      const m = (c.model || 'N/I').trim().toLowerCase();
      const col = (c.color || 'Padrão').trim().toLowerCase();

      if (c.sizes) {
        Object.entries(c.sizes).forEach(([sz, qty]) => {
          const key = `${b}_${m}_${col}_${sz.toLowerCase()}`;
          physicalMap.set(key, (physicalMap.get(key) || 0) + (Number(qty) || 0));
        });
      }
    });

    return erpParsedData.map(erp => {
      const key = `${erp.brand.toLowerCase()}_${erp.model.toLowerCase()}_${erp.color.toLowerCase()}_${erp.size.toLowerCase()}`;
      const countedQty = physicalMap.get(key) || 0;
      const diff = countedQty - erp.expected;
      return {
        brand: erp.brand,
        model: erp.model,
        color: erp.color,
        size: erp.size,
        expectedQty: erp.expected,
        countedQty,
        diff,
        status: diff === 0 ? 'EXACT' : diff > 0 ? 'SURPLUS' : 'DEFICIT'
      };
    });
  }, [counts, erpParsedData, filterBrand, filterModel, filterColor]);

  // Size Breakdown Data (for POR_NUMERACAO tab)
  const sizeBreakdown = useMemo(() => {
    const map: Record<string, { size: string; totalQty: number; productCount: number; brands: Set<string> }> = {};

    filteredData.forEach(item => {
      const sz = item.size || 'Outros';
      if (!map[sz]) {
        map[sz] = { size: sz, totalQty: 0, productCount: 0, brands: new Set() };
      }
      map[sz].totalQty += item.qty;
      map[sz].productCount += 1;
      if (item.brand) map[sz].brands.add(item.brand);
    });

    return Object.values(map)
      .map(entry => ({
        ...entry,
        brandCount: entry.brands.size
      }))
      .sort((a, b) => {
        const numA = parseFloat(a.size);
        const numB = parseFloat(b.size);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.size.localeCompare(b.size);
      });
  }, [filteredData]);

  // Clean all active filters
  const resetFilters = () => {
    setFilterBrand('');
    setFilterModel('');
    setFilterColor('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMovementType('ALL');
    setFilterStockStatus('ALL');
    setSearchTerm('');
  };

  // ================= EXPORT ENGINES =================

  // 1. Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Title Header
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(`IDEAL TECIDOS - "A LOJA DA SUA FAMÍLIA"`, 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Relatório de Estoque (${getReportTitle(activeTab)}) | Emitido em: ${dateStr} às ${timeStr}`, 14, 25);

    // Active Filters Line
    const activeFiltersText = [
      filterBrand ? `Marca: ${filterBrand}` : null,
      filterModel ? `Modelo: ${filterModel}` : null,
      filterColor ? `Cor: ${filterColor}` : null,
      filterStockStatus !== 'ALL' ? `Estoque: ${filterStockStatus}` : null
    ].filter(Boolean).join(' | ');

    if (activeFiltersText) {
      doc.setFontSize(9);
      doc.text(`Filtros Aplicados: ${activeFiltersText}`, 14, 31);
    }

    let headCols: string[][] = [];
    let bodyRows: any[][] = [];

    if (activeTab === 'MOVIMENTACOES') {
      headCols = [['Data / Hora', 'Tipo', 'Marca', 'Modelo', 'Cor', 'Qtd', 'Usuário', 'Motivo']];
      bodyRows = filteredMovements.map(m => [
        `${m.date} ${m.time}`,
        m.type,
        m.brand,
        m.model,
        m.color,
        m.movedQty > 0 ? `+${m.movedQty}` : m.movedQty,
        m.userName,
        m.reason
      ]);
    } else if (activeTab === 'DIVERGENCIAS') {
      headCols = [['Marca', 'Modelo', 'Cor', 'Tamanho', 'Previsto ERP', 'Contado Físico', 'Diferença', 'Status']];
      bodyRows = divergenceItems.map(d => [
        d.brand,
        d.model,
        d.color,
        d.size,
        d.expectedQty,
        d.countedQty,
        d.diff > 0 ? `+${d.diff}` : d.diff,
        d.status === 'EXACT' ? 'Correto' : d.status === 'SURPLUS' ? 'Sobra (+)' : 'Falta (-)'
      ]);
    } else if (activeTab === 'POR_NUMERACAO') {
      headCols = [['Numeração / Tamanho', 'Total de Pares', 'Variedade de Produtos', 'Marcas Distintas']];
      bodyRows = sizeBreakdown.map(s => [
        `Tam ${s.size}`,
        `${s.totalQty} pares`,
        `${s.productCount} itens`,
        `${s.brandCount} marcas`
      ]);
    } else {
      // GERAL, ZERADOS, ESTOQUE_BAIXO
      headCols = [['Cód. Barras', 'Marca', 'Modelo', 'Cor', 'Tamanho', 'Qtd Estoque', 'Data Cadastro']];
      bodyRows = filteredData.map(item => [
        item.barcode,
        item.brand,
        item.model,
        item.color,
        item.size,
        `${item.qty} un`,
        item.dateFormatted
      ]);
    }

    autoTable(doc, {
      startY: activeFiltersText ? 36 : 30,
      head: headCols,
      body: bodyRows,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 }
    });

    doc.save(`relatorio_estoque_${activeTab.toLowerCase()}_${Date.now()}.pdf`);
    showToast('Relatório PDF exportado com sucesso!', 'success');
  };

  // 2. Export Excel (.xlsx)
  const handleExportExcel = () => {
    let exportData: any[] = [];

    if (activeTab === 'MOVIMENTACOES') {
      exportData = filteredMovements.map(m => ({
        'Data': m.date,
        'Hora': m.time,
        'Tipo Movimentação': m.type,
        'Marca': m.brand,
        'Modelo': m.model,
        'Cor': m.color,
        'Código Barras': m.barcode,
        'Qtd Anterior': m.previousQty,
        'Qtd Movimentada': m.movedQty,
        'Qtd Final': m.finalQty,
        'Usuário': m.userName,
        'Motivo': m.reason
      }));
    } else if (activeTab === 'DIVERGENCIAS') {
      exportData = divergenceItems.map(d => ({
        'Marca': d.brand,
        'Modelo': d.model,
        'Cor': d.color,
        'Tamanho': d.size,
        'Previsto ERP': d.expectedQty,
        'Contado Físico': d.countedQty,
        'Diferença': d.diff,
        'Status': d.status === 'EXACT' ? 'Correto' : d.status === 'SURPLUS' ? 'Sobra' : 'Falta'
      }));
    } else if (activeTab === 'POR_NUMERACAO') {
      exportData = sizeBreakdown.map(s => ({
        'Tamanho / Numeração': s.size,
        'Total Pares em Estoque': s.totalQty,
        'Produtos Cadastrados': s.productCount,
        'Marcas Atendidas': s.brandCount
      }));
    } else {
      exportData = filteredData.map(item => ({
        'Código Barras': item.barcode,
        'Marca': item.brand,
        'Modelo': item.model,
        'Cor': item.color,
        'Tamanho': item.size,
        'Quantidade Atual': item.qty,
        'Categoria': item.productType,
        'Data Cadastro': item.dateFormatted
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatorio');

    XLSX.writeFile(workbook, `relatorio_${activeTab.toLowerCase()}_${Date.now()}.xlsx`);
    showToast('Relatório Excel (.xlsx) baixado com sucesso!', 'success');
  };

  // 3. Export CSV (UTF-8 with BOM)
  const handleExportCSV = () => {
    let csvRows: string[] = [];

    if (activeTab === 'MOVIMENTACOES') {
      csvRows.push('Data;Hora;Tipo;Marca;Modelo;Cor;CodigoBarras;QtdAnterior;QtdMovimentada;QtdFinal;Usuario;Motivo');
      filteredMovements.forEach(m => {
        csvRows.push(`${m.date};${m.time};${m.type};"${m.brand}";"${m.model}";"${m.color}";${m.barcode};${m.previousQty};${m.movedQty};${m.finalQty};"${m.userName}";"${m.reason}"`);
      });
    } else if (activeTab === 'DIVERGENCIAS') {
      csvRows.push('Marca;Modelo;Cor;Tamanho;PrevistoERP;ContadoFisico;Diferenca;Status');
      divergenceItems.forEach(d => {
        csvRows.push(`"${d.brand}";"${d.model}";"${d.color}";"${d.size}";${d.expectedQty};${d.countedQty};${d.diff};${d.status}`);
      });
    } else if (activeTab === 'POR_NUMERACAO') {
      csvRows.push('Tamanho;TotalPares;VariedadeProdutos;TotalMarcas');
      sizeBreakdown.forEach(s => {
        csvRows.push(`"${s.size}";${s.totalQty};${s.productCount};${s.brandCount}`);
      });
    } else {
      csvRows.push('CodigoBarras;Marca;Modelo;Cor;Tamanho;Quantidade;Categoria;DataCadastro');
      filteredData.forEach(item => {
        csvRows.push(`${item.barcode};"${item.brand}";"${item.model}";"${item.color}";"${item.size}";${item.qty};"${item.productType}";${item.dateFormatted}`);
      });
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_${activeTab.toLowerCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Relatório CSV exportado com sucesso!', 'success');
  };

  const getReportTitle = (tab: ReportType) => {
    switch (tab) {
      case 'GERAL': return 'Estoque Geral Completo';
      case 'DIVERGENCIAS': return 'Relatório de Divergências (ERP vs. Físico)';
      case 'ZERADOS': return 'Produtos Sem Estoque (0 Pares)';
      case 'ESTOQUE_BAIXO': return 'Produtos Com Estoque Baixo (1 a 3 Pares)';
      case 'POR_NUMERACAO': return 'Relatório de Estoque por Numeração';
      case 'MOVIMENTACOES': return 'Histórico de Movimentações de Estoque';
      default: return 'Relatório';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPAL */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl sm:rounded-2xl transition-all shrink-0"
              title="Voltar"
            >
              <ChevronLeft size={18} className="sm:w-[20px] sm:h-[20px]" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 sm:p-2 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-xl shrink-0">
                <FileText size={18} className="sm:w-[22px] sm:h-[22px]" />
              </span>
              <h1 className="text-base sm:text-xl font-black uppercase tracking-tight text-white truncate">Módulo de Relatórios Avançados</h1>
            </div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 mt-1 leading-tight">
              Gere relatórios customizados com suporte completo a filtros, divergências e exportação em PDF, Excel e CSV.
            </p>
          </div>
        </div>

        {/* BOTÕES DE EXPORTAÇÃO */}
        <div className="grid grid-cols-3 w-full md:w-auto sm:flex sm:items-center gap-2">
          <button
            onClick={handleExportPDF}
            className="w-full sm:w-auto px-3 sm:px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-950/40 flex items-center justify-center gap-1.5 transition-all"
          >
            <Download size={14} /> PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="w-full sm:w-auto px-3 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5 transition-all"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="w-full sm:w-auto px-3 sm:px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-950/40 flex items-center justify-center gap-1.5 transition-all"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* REPOR TABS NAVIGATION */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'GERAL', label: 'Geral Completo', icon: Package, count: filteredData.length },
          { id: 'DIVERGENCIAS', label: 'Divergências', icon: AlertTriangle, count: divergenceItems.length },
          { id: 'ZERADOS', label: 'Sem Estoque (0)', icon: MinusCircle, count: flattenedStock.filter(i => i.qty === 0).length, alert: true },
          { id: 'ESTOQUE_BAIXO', label: 'Estoque Baixo (1-3)', icon: AlertTriangle, count: flattenedStock.filter(i => i.qty > 0 && i.qty <= 3).length, warning: true },
          { id: 'POR_NUMERACAO', label: 'Por Numeração', icon: Layers, count: sizeBreakdown.length },
          { id: 'MOVIMENTACOES', label: 'Movimentações', icon: RefreshCw, count: filteredMovements.length }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportType)}
              className={`px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shrink-0 border transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-white' : tab.alert ? 'text-rose-400' : tab.warning ? 'text-amber-400' : 'text-slate-400'} />
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* FILTROS UNIFICADOS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Filter size={16} className="text-emerald-400" /> Filtros Avançados do Relatório
          </span>
          {(filterBrand || filterModel || filterColor || filterDateFrom || filterDateTo || filterMovementType !== 'ALL' || filterStockStatus !== 'ALL' || searchTerm) && (
            <button
              onClick={resetFilters}
              className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
            >
              Limpar Todos os Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
          {/* Busca por Texto */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Palavra-Chave</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
              />
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          {/* Filtro por Marca */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Marca</label>
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
            >
              <option value="">Todas as Marcas</option>
              {uniqueBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Modelo */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Modelo / Ref</label>
            <input
              type="text"
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              placeholder="Ex: Sandália"
              className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Filtro por Cor */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cor</label>
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
            >
              <option value="">Todas as Cores</option>
              {uniqueColors.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Estoque */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Faixa de Estoque</label>
            <select
              value={filterStockStatus}
              onChange={(e) => setFilterStockStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Todas as Quantidades</option>
              <option value="ZERADO">Zerados (0 pares)</option>
              <option value="BAIXO">Estoque Baixo (1-3)</option>
              <option value="NORMAL">Estoque Normal (&gt;3)</option>
            </select>
          </div>

          {/* Data Inicio */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Data Início</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white px-2 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Data Fim */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Data Fim</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white px-2 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* DIVERGENCES TAB CUSTOM ERP IMPORT PANEL */}
      {activeTab === 'DIVERGENCIAS' && erpParsedData.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" /> Importar CSV do ERP para Comparativo
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Cole as linhas do seu relatório do ERP para comparar o saldo teórico com a contagem física real.
          </p>
          <textarea
            rows={3}
            value={erpInputText}
            onChange={(e) => setErpInputText(e.target.value)}
            placeholder="Exemplo de formato: Marca; Modelo; Cor; Tamanho; QuantidadeEsperada"
            className="w-full bg-slate-950 border border-slate-800 text-xs font-mono text-white p-3 rounded-2xl outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleParseErpCsv}
            disabled={!erpInputText.trim()}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/40"
          >
            Processar Divergências ERP
          </button>
        </div>
      )}

      {/* RESULT TABULAR DATA SHOWCASE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
            <span>{getReportTitle(activeTab)}</span>
          </h2>
          <span className="text-xs font-bold text-slate-400">
            Exibindo <strong className="text-emerald-400 font-mono">
              {activeTab === 'MOVIMENTACOES' ? filteredMovements.length :
               activeTab === 'DIVERGENCIAS' ? divergenceItems.length :
               activeTab === 'POR_NUMERACAO' ? sizeBreakdown.length :
               filteredData.length}
            </strong> registros
          </span>
        </div>

        {/* 1. TABELA MOVIMENTAÇÕES */}
        {activeTab === 'MOVIMENTACOES' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-3">Data/Hora</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Marca & Modelo</th>
                  <th className="py-3 px-3">Cor</th>
                  <th className="py-3 px-3 text-center">Movimentado</th>
                  <th className="py-3 px-3">Usuário & Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3 px-3 whitespace-nowrap text-white font-bold">{m.date} {m.time}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        m.type === 'ENTRADA' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        m.type === 'SAIDA' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                        'bg-blue-950 text-blue-400 border border-blue-800'
                      }`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-white font-extrabold">{m.brand} - {m.model}</td>
                    <td className="py-3 px-3 text-slate-300">{m.color}</td>
                    <td className="py-3 px-3 text-center font-mono font-black text-sm">
                      <span className={m.movedQty > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {m.movedQty > 0 ? `+${m.movedQty}` : m.movedQty}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px]">{m.userName} ({m.reason})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. TABELA DIVERGÊNCIAS */}
        {activeTab === 'DIVERGENCIAS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-3">Marca</th>
                  <th className="py-3 px-3">Modelo / Cor</th>
                  <th className="py-3 px-3">Tamanho</th>
                  <th className="py-3 px-3 text-center">Previsto ERP</th>
                  <th className="py-3 px-3 text-center">Contado Físico</th>
                  <th className="py-3 px-3 text-center">Diferença</th>
                  <th className="py-3 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {divergenceItems.map((d, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3 px-3 text-white font-black">{d.brand}</td>
                    <td className="py-3 px-3 text-slate-300">{d.model} ({d.color})</td>
                    <td className="py-3 px-3 font-mono text-slate-400">{d.size}</td>
                    <td className="py-3 px-3 text-center font-mono">{d.expectedQty}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-white">{d.countedQty}</td>
                    <td className="py-3 px-3 text-center font-mono font-black text-sm">
                      <span className={d.diff > 0 ? 'text-amber-400' : d.diff < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        {d.diff > 0 ? `+${d.diff}` : d.diff}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase border ${
                        d.status === 'EXACT' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                        d.status === 'SURPLUS' ? 'bg-amber-950 text-amber-400 border-amber-800' :
                        'bg-rose-950 text-rose-400 border-rose-800'
                      }`}>
                        {d.status === 'EXACT' ? 'Correto' : d.status === 'SURPLUS' ? 'Sobra (+)' : 'Falta (-)'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. TABELA POR NUMERAÇÃO */}
        {activeTab === 'POR_NUMERACAO' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-3">Numeração / Tamanho</th>
                  <th className="py-3 px-3 text-center">Total Pares em Estoque</th>
                  <th className="py-3 px-3 text-center">Variedade de Produtos</th>
                  <th className="py-3 px-3 text-center">Marcas Atendidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {sizeBreakdown.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3 px-3 text-amber-400 font-mono font-black text-sm">Tam {s.size}</td>
                    <td className="py-3 px-3 text-center font-mono font-black text-emerald-400 text-sm">{s.totalQty} pares</td>
                    <td className="py-3 px-3 text-center text-slate-300 font-bold">{s.productCount} produtos</td>
                    <td className="py-3 px-3 text-center text-slate-400">{s.brandCount} marcas</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. TABELA PADRÃO (GERAL, ZERADOS, ESTOQUE_BAIXO) */}
        {(activeTab === 'GERAL' || activeTab === 'ZERADOS' || activeTab === 'ESTOQUE_BAIXO') && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-3">Código Barras</th>
                  <th className="py-3 px-3">Marca</th>
                  <th className="py-3 px-3">Modelo</th>
                  <th className="py-3 px-3">Cor</th>
                  <th className="py-3 px-3 font-mono">Tamanho</th>
                  <th className="py-3 px-3 text-center">Qtd Atual</th>
                  <th className="py-3 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-400">{item.barcode}</td>
                    <td className="py-3 px-3 text-white font-extrabold">{item.brand}</td>
                    <td className="py-3 px-3 text-slate-200">{item.model}</td>
                    <td className="py-3 px-3 text-slate-300">{item.color}</td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-400">{item.size}</td>
                    <td className="py-3 px-3 text-center font-mono font-black text-sm text-white">{item.qty}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase border ${
                        item.qty === 0 ? 'bg-rose-950 text-rose-400 border-rose-800' :
                        item.qty <= 3 ? 'bg-amber-950 text-amber-400 border-amber-800' :
                        'bg-emerald-950 text-emerald-400 border-emerald-800'
                      }`}>
                        {item.qty === 0 ? 'Zerado' : item.qty <= 3 ? 'Estoque Baixo' : 'Normal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
