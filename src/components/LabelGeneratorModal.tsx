import React, { useState, useRef } from 'react';
import { 
  Printer, 
  X, 
  Tag, 
  Layers, 
  CheckCircle2, 
  Sliders, 
  Copy, 
  Grid, 
  FileText,
  Sparkles
} from 'lucide-react';
import { InventoryCount } from '../../types';
import { NUMERIC_SIZES, LETTER_SIZES } from '../../constants';

interface LabelGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCount?: InventoryCount | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

// Pure SVG Barcode Renderer for Code128 / EAN representation
export const RenderSvgBarcode: React.FC<{ code: string; width?: number; height?: number }> = ({ 
  code, 
  width = 220, 
  height = 50 
}) => {
  const cleanCode = code.replace(/[^0-9A-Za-z]/g, '') || '7891234567890';
  
  // Deterministic bar pattern generator from string hash
  const bars: { x: number; w: number }[] = [];
  let currentX = 10;
  
  // Guard start bar
  bars.push({ x: currentX, w: 2 }); currentX += 4;
  bars.push({ x: currentX, w: 2 }); currentX += 4;

  for (let i = 0; i < cleanCode.length; i++) {
    const charCode = cleanCode.charCodeAt(i);
    const w1 = (charCode % 3) + 1;
    const w2 = ((charCode * 2) % 3) + 1;
    const gap = ((charCode * 3) % 4) + 2;

    bars.push({ x: currentX, w: w1 });
    currentX += w1 + gap;
    bars.push({ x: currentX, w: w2 });
    currentX += w2 + gap;
  }

  // Guard stop bar
  bars.push({ x: currentX, w: 2 }); currentX += 4;
  bars.push({ x: currentX, w: 2 }); currentX += 4;

  const totalWidth = Math.max(width, currentX + 10);

  return (
    <svg viewBox={`0 0 ${totalWidth} ${height}`} className="w-full h-auto max-h-16">
      <rect width={totalWidth} height={height} fill="white" />
      {bars.map((bar, idx) => (
        <rect key={idx} x={bar.x} y={4} width={bar.w} height={height - 18} fill="black" />
      ))}
      <text 
        x={totalWidth / 2} 
        y={height - 2} 
        textAnchor="middle" 
        fontSize="11" 
        fontWeight="bold" 
        fontFamily="monospace"
        fill="black"
      >
        {cleanCode}
      </text>
    </svg>
  );
};

export const LabelGeneratorModal: React.FC<LabelGeneratorModalProps> = ({
  isOpen,
  onClose,
  initialCount,
  showToast
}) => {
  const [brand, setBrand] = useState(initialCount?.brand || 'Ideal Calçados');
  const [model, setModel] = useState(initialCount?.model || 'Modelo 101');
  const [color, setColor] = useState(initialCount?.color || 'Preto');
  const [productType, setProductType] = useState(initialCount?.productType || 'Tênis Adulto Masculino');
  const [barcode, setBarcode] = useState('789' + Math.floor(100000000 + Math.random() * 900000000));
  const [selectedSize, setSelectedSize] = useState(
    initialCount?.sizes ? Object.keys(initialCount.sizes)[0] || '39/40' : '39/40'
  );
  const [copiesCount, setCopiesCount] = useState(1);
  
  // Layout Options
  const [printLayout, setPrintLayout] = useState<'THERMAL' | 'A4_GRID'>('THERMAL');

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Media Print Style Block */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-label-area, #printable-label-area * {
            visibility: visible !important;
          }
          #printable-label-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: auto;
            margin: 5mm;
          }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full p-6 text-slate-900 dark:text-white shadow-2xl space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 dark:bg-red-950/50 text-red-600 rounded-2xl">
              <Tag size={24} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Gerador de Etiquetas para Caixas de Calçados
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Imprima etiquetas individuais ou em lote para identificar o estoque de sapatos
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Settings Column */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders size={16} className="text-red-500" /> Dados da Etiqueta
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Marca</label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Modelo / Ref</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Cor</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Numeração</label>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs font-extrabold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                >
                  {[...NUMERIC_SIZES, ...LETTER_SIZES].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">Código de Barras (EAN-13)</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Formato de Impressão</label>
                <select
                  value={printLayout}
                  onChange={(e) => setPrintLayout(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="THERMAL">Térmica Individual (100x50mm)</option>
                  <option value="A4_GRID">Grade Folha A4 (10 etiquetas/página)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Quantidade de Cópias</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={copiesCount}
                  onChange={(e) => setCopiesCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          {/* Label Live Preview & Printable Layout Container */}
          <div className="lg:col-span-6 bg-slate-100 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
                <span>Pré-visualização da Etiqueta</span>
                <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-600 px-2 py-0.5 rounded font-bold">
                  {printLayout === 'THERMAL' ? '100x50mm' : 'Grade A4'}
                </span>
              </h3>

              {/* Printable Wrapper containing repeated labels based on copies */}
              <div id="printable-label-area" className="p-2">
                <div className={printLayout === 'A4_GRID' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                  {Array.from({ length: copiesCount }).map((_, index) => (
                    <div 
                      key={index}
                      className="bg-white text-black border-2 border-black p-3 rounded-lg shadow-md max-w-xs mx-auto text-center font-sans space-y-1 relative overflow-hidden"
                      style={{ width: '100%', minHeight: '120px' }}
                    >
                      <div className="border-b border-black pb-1 flex justify-between items-center">
                        <span className="text-xs font-black uppercase tracking-tight">{brand}</span>
                        <span className="text-[10px] font-bold border border-black px-1.5 py-0.2 rounded bg-black text-white">
                          TAM: {selectedSize}
                        </span>
                      </div>

                      <div className="text-left pt-1">
                        <p className="text-[11px] font-extrabold leading-tight uppercase">{model}</p>
                        <p className="text-[10px] text-gray-700 font-semibold">Cor: {color} • {productType}</p>
                      </div>

                      <div className="py-1">
                        <RenderSvgBarcode code={barcode} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 no-print flex gap-3">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Printer size={16} />
                Imprimir {copiesCount} {copiesCount === 1 ? 'Etiqueta' : 'Etiquetas'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
