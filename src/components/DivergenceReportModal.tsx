import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  MinusCircle, 
  PlusCircle, 
  Download, 
  FileText, 
  Search, 
  Sparkles,
  PieChart as PieIcon,
  HelpCircle,
  Filter
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InventoryCount } from '../../types';

interface DivergenceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  counts: InventoryCount[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export interface ErpItemInput {
  barcode: string;
  brand: string;
  model: string;
  color: string;
  size: string;
  expectedQty: number;
}

export interface DivergenceResult {
  barcode: string;
  brand: string;
  model: string;
  color: string;
  size: string;
  expectedQty: number;
  countedQty: number;
  diff: number; // counted - expected
  status: 'EXACT' | 'SURPLUS' | 'DEFICIT';
}

export const DivergenceReportModal: React.FC<DivergenceReportModalProps> = ({
  isOpen,
  onClose,
  counts,
  showToast
}) => {
  const [pastedText, setPastedText] = useState('');
  const [erpItems, setErpItems] = useState<ErpItemInput[]>([]);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DIVERGENT' | 'DEFICIT' | 'SURPLUS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Aggregate actual physical counts by barcode or Brand+Model+Color+Size key
  const physicalMap = new Map<string, { brand: string; model: string; color: string; size: string; count: number }>();

  counts.forEach(c => {
    const brand = (c.brand || 'N/I').trim();
    const model = (c.model || 'N/I').trim();
    const color = (c.color || 'N/I').trim();

    Object.entries(c.sizes || {}).forEach(([sz, qty]) => {
      const key = `${brand}_${model}_${color}_${sz}`.toLowerCase();
      const existing = physicalMap.get(key);
      if (existing) {
        existing.count += Number(qty) || 0;
      } else {
        physicalMap.get(key) || physicalMap.set(key, {
          brand,
          model,
          color,
          size: sz,
          count: Number(qty) || 0
        });
      }
    });
  });

  // Parse CSV text from ERP export
  const parseErpCsv = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) {
      showToast('Nenhum dado encontrado para importar', 'error');
      return;
    }

    const items: ErpItemInput[] = [];
    lines.forEach((line, index) => {
      // Ignore header row if contains letters like 'Marca' or 'Qtd'
      if (index === 0 && (line.toLowerCase().includes('marca') || line.toLowerCase().includes('modelo') || line.toLowerCase().includes('codigo'))) {
        return;
      }

      // Split by semicolon, comma or tab
      const cols = line.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        // Expected structure: [Marca, Modelo, Cor, Tamanho, QtdEsperada] or [EAN, Marca, Modelo, Cor, Tamanho, Qtd]
        let barcode = '';
        let brand = 'Marca N/I';
        let model = 'Modelo N/I';
        let color = 'Cor N/I';
        let size = '39/40';
        let expectedQty = 1;

        if (cols.length >= 6) {
          barcode = cols[0];
          brand = cols[1];
          model = cols[2];
          color = cols[3];
          size = cols[4];
          expectedQty = parseInt(cols[5]) || 1;
        } else if (cols.length === 5) {
          brand = cols[0];
          model = cols[1];
          color = cols[2];
          size = cols[3];
          expectedQty = parseInt(cols[4]) || 1;
        } else {
          brand = cols[0];
          model = cols[1];
          expectedQty = parseInt(cols[2]) || 1;
        }

        items.push({ barcode, brand, model, color, size, expectedQty });
      }
    });

    if (items.length > 0) {
      setErpItems(items);
      showToast(`${items.length} itens do ERP carregados com sucesso!`, 'success');
    } else {
      showToast('Formato de texto não reconhecido. Use colunas separadas por ponto e vírgula ou vírgula.', 'error');
    }
  };

  // Compute Divergence items
  const divergences: DivergenceResult[] = [];
  const processedKeys = new Set<string>();

  erpItems.forEach(item => {
    const key = `${item.brand}_${item.model}_${item.color}_${item.size}`.toLowerCase();
    processedKeys.add(key);

    const physical = physicalMap.get(key);
    const countedQty = physical ? physical.count : 0;
    const diff = countedQty - item.expectedQty;

    divergences.push({
      barcode: item.barcode || '-',
      brand: item.brand,
      model: item.model,
      color: item.color,
      size: item.size,
      expectedQty: item.expectedQty,
      countedQty,
      diff,
      status: diff === 0 ? 'EXACT' : diff > 0 ? 'SURPLUS' : 'DEFICIT'
    });
  });

  // Also include items physically counted but missing from ERP theoretical list
  physicalMap.forEach((val, key) => {
    if (!processedKeys.has(key)) {
      divergences.push({
        barcode: '-',
        brand: val.brand,
        model: val.model,
        color: val.color,
        size: val.size,
        expectedQty: 0,
        countedQty: val.count,
        diff: val.count,
        status: 'SURPLUS'
      });
    }
  });

  // Filtering
  const filtered = divergences.filter(d => {
    if (filterStatus === 'DIVERGENT' && d.status === 'EXACT') return false;
    if (filterStatus === 'DEFICIT' && d.status !== 'DEFICIT') return false;
    if (filterStatus === 'SURPLUS' && d.status !== 'SURPLUS') return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        d.brand.toLowerCase().includes(term) ||
        d.model.toLowerCase().includes(term) ||
        d.color.toLowerCase().includes(term) ||
        d.size.toLowerCase().includes(term) ||
        d.barcode.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Summary Metrics
  const totalItems = divergences.length;
  const exactCount = divergences.filter(d => d.status === 'EXACT').length;
  const deficitCount = divergences.filter(d => d.status === 'DEFICIT').length;
  const surplusCount = divergences.filter(d => d.status === 'SURPLUS').length;
  const accuracyPercent = totalItems > 0 ? Math.round((exactCount / totalItems) * 100) : 100;

  // Export PDF Report
  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Relatório de Divergência de Estoque (ERP vs. Físico)', 14, 20);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} | Acuracidade: ${accuracyPercent}%`, 14, 28);

    const tableData = filtered.map(d => [
      d.brand,
      d.model,
      `${d.color} / ${d.size}`,
      d.expectedQty,
      d.countedQty,
      d.diff > 0 ? `+${d.diff}` : d.diff,
      d.status === 'EXACT' ? 'Correto' : d.status === 'SURPLUS' ? 'Sobra (+)' : 'Falta (-)'
    ]);

    autoTable(doc, {
      startY: 34,
      head: [['Marca', 'Modelo', 'Cor/Tam', 'Previsto ERP', 'Contado Físico', 'Diferença', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38] }
    });

    doc.save(`divergencia_estoque_${Date.now()}.pdf`);
    showToast('Relatório PDF exportado com sucesso', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-5xl w-full p-6 text-slate-900 dark:text-white shadow-2xl space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-950/50 text-blue-600 rounded-2xl">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Relatório de Divergência (Estoque ERP vs. Contagem Físico)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compare o saldo teórico do seu sistema de gestão com o inventário real bipado
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step 1: Import ERP Data if Empty */}
        {erpItems.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Upload size={16} className="text-blue-500" /> Cole os Dados Teóricos Exportados do ERP
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Formato esperado por linha (separado por vírgula ou ponto e vírgula):<br />
                <code className="bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded text-[11px] font-mono text-red-600 dark:text-red-400">
                  Marca ; Modelo ; Cor ; Tamanho ; QuantidadeEsperada
                </code>
              </p>

              <textarea
                rows={6}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Exemplo:&#10;Olympikus; Corre 3; Preto; 39; 10&#10;Nike; Air Max; Branco; 40; 5"
                className="w-full p-3 font-mono text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
              />

              <div className="flex justify-end gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => parseErpCsv(pastedText)}
                  disabled={!pastedText.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all"
                >
                  Processar e Analisar Divergências
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Interactive Divergence Dashboard */
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase text-slate-500">Acuracidade</span>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{accuracyPercent}%</div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase text-emerald-600">Batendo (=)</span>
                <div className="text-2xl font-black text-emerald-600 mt-1">{exactCount} <span className="text-xs font-normal text-slate-400">itens</span></div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase text-red-600">Faltantes (-)</span>
                <div className="text-2xl font-black text-red-600 mt-1">{deficitCount} <span className="text-xs font-normal text-slate-400">itens</span></div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase text-amber-600">Sobras (+)</span>
                <div className="text-2xl font-black text-amber-600 mt-1">{surplusCount} <span className="text-xs font-normal text-slate-400">itens</span></div>
              </div>
            </div>

            {/* Filter & Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={16} className="text-slate-400" />
                <button
                  type="button"
                  onClick={() => setFilterStatus('ALL')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all ${
                    filterStatus === 'ALL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Todos ({divergences.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('DIVERGENT')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all ${
                    filterStatus === 'DIVERGENT' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Com Divergência ({deficitCount + surplusCount})
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setErpItems([])}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Re-importar ERP
                </button>
                <button
                  type="button"
                  onClick={exportPdf}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <Download size={14} /> Exportar PDF
                </button>
              </div>
            </div>

            {/* Divergence Table */}
            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black">
                    <th className="p-3">Marca</th>
                    <th className="p-3">Modelo / Cor</th>
                    <th className="p-3">Tam</th>
                    <th className="p-3 text-center">ERP Previsto</th>
                    <th className="p-3 text-center">Contado Físico</th>
                    <th className="p-3 text-center">Diferença</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-semibold">
                  {filtered.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                      <td className="p-3 font-extrabold text-slate-900 dark:text-white">{item.brand}</td>
                      <td className="p-3">{item.model} ({item.color})</td>
                      <td className="p-3 font-mono font-bold">{item.size}</td>
                      <td className="p-3 text-center font-mono">{item.expectedQty}</td>
                      <td className="p-3 text-center font-mono font-bold">{item.countedQty}</td>
                      <td className="p-3 text-center font-mono font-extrabold">
                        <span className={item.diff > 0 ? 'text-amber-600' : item.diff < 0 ? 'text-red-600' : 'text-emerald-600'}>
                          {item.diff > 0 ? `+${item.diff}` : item.diff}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                          item.status === 'EXACT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                          item.status === 'SURPLUS' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                          'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                        }`}>
                          {item.status === 'EXACT' ? 'Correto' : item.status === 'SURPLUS' ? 'Sobra' : 'Falta'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
