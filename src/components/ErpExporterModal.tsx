import React, { useState } from 'react';
import { 
  Download, 
  X, 
  FileSpreadsheet, 
  CheckCircle2, 
  Sparkles, 
  Settings, 
  Table, 
  Layers 
} from 'lucide-react';
import { InventoryCount } from '../../types';

interface ErpExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  counts: InventoryCount[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export type ErpSystemProfile = 'BLING' | 'TINY' | 'LINX' | 'EXCEL_GENERIC';

export const ErpExporterModal: React.FC<ErpExporterModalProps> = ({
  isOpen,
  onClose,
  counts,
  showToast
}) => {
  const [selectedProfile, setSelectedProfile] = useState<ErpSystemProfile>('BLING');
  const [delimiter, setDelimiter] = useState<';' | ',' | '\t'>(';');
  const [includeHeader, setIncludeHeader] = useState(true);

  if (!isOpen) return null;

  // Flatten count items into rows (Brand + Model + Color + Size)
  const rows: Array<{
    barcode: string;
    brand: string;
    model: string;
    color: string;
    size: string;
    productType: string;
    qty: number;
  }> = [];

  counts.forEach(c => {
    const brand = c.brand || 'Ideal Calçados';
    const model = c.model || 'Modelo 101';
    const color = c.color || 'Preto';
    const productType = c.productType || 'Tênis Adulto';

    Object.entries(c.sizes || {}).forEach(([size, qty]) => {
      const numericQty = Number(qty) || 0;
      if (numericQty > 0) {
        rows.push({
          barcode: (c as any).barcode || '789' + Math.floor(100000000 + Math.random() * 900000000),
          brand,
          model,
          color,
          size,
          productType,
          qty: numericQty
        });
      }
    });
  });

  // Generate CSV String based on chosen ERP Profile
  const generateCsvContent = (): string => {
    let headerStr = '';
    const formattedRows: string[] = [];

    if (selectedProfile === 'BLING') {
      headerStr = `Codigo${delimiter}Descricao${delimiter}Marca${delimiter}Categoria${delimiter}Cor${delimiter}Tamanho${delimiter}EstoqueAtual${delimiter}Unidade`;
      rows.forEach(r => {
        const desc = `${r.brand} ${r.model}`.replace(/;/g, ' ');
        formattedRows.push(
          `${r.barcode}${delimiter}"${desc}"${delimiter}"${r.brand}"${delimiter}"${r.productType}"${delimiter}"${r.color}"${delimiter}"${r.size}"${delimiter}${r.qty}${delimiter}UN`
        );
      });
    } else if (selectedProfile === 'TINY') {
      headerStr = `GTIN_EAN${delimiter}Nome_Produto${delimiter}Marca${delimiter}Variacao_Tamanho${delimiter}Variacao_Cor${delimiter}Saldo_Fisico`;
      rows.forEach(r => {
        const desc = `${r.brand} ${r.model}`.replace(/;/g, ' ');
        formattedRows.push(
          `${r.barcode}${delimiter}"${desc}"${delimiter}"${r.brand}"${delimiter}"${r.size}"${delimiter}"${r.color}"${delimiter}${r.qty}`
        );
      });
    } else if (selectedProfile === 'LINX') {
      headerStr = `EAN${delimiter}Referencia${delimiter}Descricao${delimiter}Grade${delimiter}Cor${delimiter}Quantidade`;
      rows.forEach(r => {
        formattedRows.push(
          `${r.barcode}${delimiter}"${r.model}"${delimiter}"${r.brand} ${r.model}"${delimiter}"${r.size}"${delimiter}"${r.color}"${delimiter}${r.qty}`
        );
      });
    } else {
      // Excel Generic
      headerStr = `Codigo_Barras${delimiter}Marca${delimiter}Modelo${delimiter}Cor${delimiter}Tamanho${delimiter}Categoria${delimiter}Quantidade`;
      rows.forEach(r => {
        formattedRows.push(
          `${r.barcode}${delimiter}"${r.brand}"${delimiter}"${r.model}"${delimiter}"${r.color}"${delimiter}"${r.size}"${delimiter}"${r.productType}"${delimiter}${r.qty}`
        );
      });
    }

    const fullLines = includeHeader ? [headerStr, ...formattedRows] : formattedRows;
    return fullLines.join('\n');
  };

  const handleDownload = () => {
    const csvData = generateCsvContent();
    // Add UTF-8 BOM (\uFEFF) so Excel opens Portuguese accents cleanly
    const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const filename = `inventario_${selectedProfile.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Arquivo ${filename} exportado com sucesso!`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full p-6 text-slate-900 dark:text-white shadow-2xl space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 rounded-2xl">
              <Download size={24} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Exportação Personalizada para ERPs
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gere arquivos de inventário no formato exato exigido pelo seu sistema de gestão
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

        {/* Profile Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: 'BLING', name: 'Bling ERP', desc: 'Padrão Bling Variações' },
            { id: 'TINY', name: 'Tiny ERP', desc: 'Padrão Tiny GTIN/EAN' },
            { id: 'LINX', name: 'Linx / Microvix', desc: 'Padrão Linx Varejo' },
            { id: 'EXCEL_GENERIC', name: 'Excel / CSV', desc: 'Colunas Personalizáveis' }
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProfile(p.id as any)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                selectedProfile === p.id 
                  ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/40 dark:border-emerald-500 text-emerald-900 dark:text-emerald-100 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-extrabold text-xs">{p.name}</span>
                {selectedProfile === p.id && <CheckCircle2 size={16} className="text-emerald-600" />}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{p.desc}</p>
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Separador de Colunas</label>
            <select
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value as any)}
              className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
            >
              <option value=";">Ponto e Vírgula ( ; ) - Padrão Excel Brasil</option>
              <option value=",">Vírgula ( , )</option>
              <option value="	">Tabulação ( TAB )</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Incluir Linha de Cabeçalho</span>
            <input
              type="checkbox"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.target.checked)}
              className="w-5 h-5 accent-emerald-600 rounded"
            />
          </div>
        </div>

        {/* Live Data Preview */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase text-slate-400 flex items-center gap-1.5">
              <Table size={14} className="text-emerald-400" /> Pré-visualização do Arquivo
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Total de registros: <strong className="text-white">{rows.length}</strong>
            </span>
          </div>

          <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-40 overflow-y-auto leading-relaxed border border-slate-800">
            {generateCsvContent().split('\n').slice(0, 10).join('\n')}
            {rows.length > 10 ? '\n...' : ''}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={rows.length === 0}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 active:scale-95"
          >
            <Download size={16} /> Download Arquivo CSV ({selectedProfile})
          </button>
        </div>
      </div>
    </div>
  );
};
