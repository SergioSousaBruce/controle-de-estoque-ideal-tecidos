import React, { useState, useRef, useEffect } from 'react';
import { 
  CheckCircle2, 
  Trash2, 
  Eye, 
  Edit2, 
  Download, 
  FileSpreadsheet,
  Plus, 
  FileText,
  MoreVertical,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { InventoryCount } from '../../types';

export interface BrandStat {
  name: string;
  totalPieces: number;
  totalModels: number;
  totalLots: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  lastDateStr: string;
  items: InventoryCount[];
}

interface BrandStatCardProps {
  brand: BrandStat;
  isExpanded: boolean;
  isCompleted: boolean;
  onToggleExpand: (brandName: string) => void;
  onStartWithSameBrand: (brandName: string) => void;
  onToggleBrandCompletion: (brandName: string) => void;
  onDeleteBrand: (brandName: string, totalLots: number, totalPieces: number) => void;
  onViewBrandPreview: (data: { brandName: string; items: InventoryCount[] }) => void;
  onEditBrand: (brandName: string) => void;
  onGenerateBrandPdf: (brandName: string, items: InventoryCount[]) => void;
  onGenerateBrandExcel: (brandName: string, items: InventoryCount[]) => void;
  onViewPdfItem: (item: InventoryCount) => void;
  onEditItem: (item: InventoryCount) => void;
  onDeleteItem: (id: string) => void;
}

export const BrandStatCard: React.FC<BrandStatCardProps> = React.memo(({
  brand,
  isExpanded,
  isCompleted,
  onToggleExpand,
  onStartWithSameBrand,
  onToggleBrandCompletion,
  onDeleteBrand,
  onViewBrandPreview,
  onEditBrand,
  onGenerateBrandPdf,
  onGenerateBrandExcel,
  onViewPdfItem,
  onEditItem,
  onDeleteItem,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div 
      className={`bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border transition-colors shadow-sm space-y-3.5 relative ${
        brand.status === 'COMPLETED' 
          ? 'border-emerald-200/90 dark:border-emerald-800/70 bg-gradient-to-br from-emerald-50/40 via-white to-white dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900' 
          : brand.status === 'IN_PROGRESS'
            ? 'border-blue-200/80 dark:border-blue-800/70 bg-gradient-to-br from-blue-50/30 via-white to-white dark:from-blue-950/30 dark:via-slate-900 dark:to-slate-900'
            : 'border-gray-200/80 dark:border-slate-800'
      }`}
    >
      {/* Header: Brand Name, Status Badge & Compact Overflow Menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h4 className="text-lg sm:text-xl font-display font-black text-brand-dark dark:text-white uppercase tracking-tight truncate">
              {brand.name}
            </h4>
            
            {brand.status === 'COMPLETED' && (
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 shrink-0">
                <CheckCircle2 size={11} /> Concluída
              </span>
            )}
            {brand.status === 'IN_PROGRESS' && (
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1 shrink-0">
                ⏳ Em Contagem
              </span>
            )}
            {brand.status === 'PENDING' && (
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700 shrink-0">
                ⚪ Pendente
              </span>
            )}
          </div>

          {/* Clean Metric Summary */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold text-gray-600 dark:text-slate-300 flex-wrap">
            <span className="bg-slate-100/90 dark:bg-slate-800 text-brand-dark dark:text-slate-200 px-2.5 py-1 rounded-xl whitespace-nowrap border border-gray-200/60 dark:border-slate-700">
              <strong className="text-brand-blue dark:text-blue-400 font-black">{brand.totalPieces}</strong> peças
            </span>
            <span className="bg-slate-100/90 dark:bg-slate-800 text-brand-dark dark:text-slate-200 px-2.5 py-1 rounded-xl whitespace-nowrap border border-gray-200/60 dark:border-slate-700">
              <strong className="text-brand-blue dark:text-blue-400 font-black">{brand.totalModels}</strong> modelos
            </span>
            <span className="bg-slate-100/90 dark:bg-slate-800 text-brand-dark dark:text-slate-200 px-2.5 py-1 rounded-xl whitespace-nowrap border border-gray-200/60 dark:border-slate-700">
              <strong className="text-brand-blue dark:text-blue-400 font-black">{brand.totalLots}</strong> lotes
            </span>
          </div>
        </div>

        {/* Overflow Menu (Edit / Delete safely tucked away) */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            title="Mais opções"
            aria-label={`Mais opções para ${brand.name}`}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-brand-dark dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 z-30 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 p-1.5 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEditBrand(brand.name);
                }}
                className="w-full px-3 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/60 hover:text-amber-900 dark:hover:text-amber-300 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Edit2 size={14} className="text-amber-600 dark:text-amber-400" />
                Editar / Atualizar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteBrand(brand.name, brand.totalLots, brand.totalPieces);
                }}
                className="w-full px-3 py-2.5 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                Excluir Marca
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Row (Clean & Easy to Tap) */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pt-2.5 border-t border-gray-100 dark:border-slate-800">
        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onViewBrandPreview({ brandName: brand.name, items: brand.items })}
            title={`Pré-visualizar grade consolidada da marca ${brand.name}`}
            className="px-2.5 py-2 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 border border-indigo-200/80 dark:border-indigo-800 active:scale-95 transition-all cursor-pointer"
          >
            <Eye size={14} strokeWidth={2.5} />
            <span>Ver Grade</span>
          </button>
        )}

        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleExpand(brand.name)}
            title={`Ver lotes de ${brand.name}`}
            className="px-2.5 py-2 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 dark:hover:bg-blue-900/70 text-brand-blue dark:text-blue-300 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1 border border-blue-200/80 dark:border-blue-800 active:scale-95 transition-all cursor-pointer"
          >
            {isExpanded ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
            <span>{isExpanded ? 'Ocultar' : 'Lotes'}</span>
          </button>
        )}

        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onGenerateBrandPdf(brand.name, brand.items)}
            title={`Baixar PDF da marca ${brand.name}`}
            className="px-2.5 py-2 bg-red-50 dark:bg-rose-950/70 hover:bg-red-100 dark:hover:bg-rose-900/70 text-brand-red dark:text-rose-300 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1 border border-red-200/80 dark:border-rose-800 active:scale-95 transition-all cursor-pointer"
          >
            <Download size={14} strokeWidth={2.5} />
            <span>PDF</span>
          </button>
        )}

        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onGenerateBrandExcel(brand.name, brand.items)}
            title={`Baixar planilha Excel (.xlsx) da marca ${brand.name}`}
            className="px-2.5 py-2 bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1 border border-emerald-200/80 dark:border-emerald-800 active:scale-95 transition-all cursor-pointer"
          >
            <FileSpreadsheet size={14} strokeWidth={2.5} />
            <span>Excel</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggleBrandCompletion(brand.name)}
          title={isCompleted ? 'Reabrir contagem' : 'Marcar como Concluída'}
          className={`px-2.5 py-2 rounded-xl border font-black text-[10px] uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
            isCompleted
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-gray-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-gray-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 border-gray-200 dark:border-slate-700'
          }`}
        >
          <CheckCircle2 size={14} strokeWidth={2.5} />
          <span>{isCompleted ? 'Concluída' : 'Concluir'}</span>
        </button>

        <button
          type="button"
          onClick={() => onStartWithSameBrand(brand.name)}
          className="px-3.5 py-2 bg-brand-dark dark:bg-blue-600 hover:bg-brand-blue dark:hover:bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all ml-auto cursor-pointer"
          title={`Contar ${brand.name}`}
        >
          <Plus size={14} strokeWidth={3} />
          <span>Contar</span>
        </button>
      </div>

      {/* Accordion list of lot items if expanded */}
      {isExpanded && brand.items.length > 0 && (
        <div className="pt-2.5 border-t border-gray-100 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-slate-950/70 p-2.5 sm:p-3 rounded-2xl">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 dark:text-slate-500 px-1">
            <span>Lotes Registrados ({brand.items.length})</span>
            <span>Ações</span>
          </div>
          <div className="grid gap-2">
            {brand.items.map(item => (
              <div key={item.id} className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-gray-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-xs text-brand-dark dark:text-white truncate">
                    {item.model || 'Sem modelo'} {item.color ? `• ${item.color}` : ''}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">
                    {item.gender ? `${item.gender} | ` : ''}
                    {item.arrivalMonth}/{item.arrivalYear} — <strong className="text-brand-blue dark:text-blue-400">{item.total} pares</strong>
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onViewPdfItem(item)}
                    className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-slate-800 hover:bg-brand-blue hover:text-white rounded-lg text-gray-600 dark:text-slate-300 transition-colors cursor-pointer"
                    title="Comprovante"
                  >
                    <FileText size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditItem(item)}
                    className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-white rounded-lg text-gray-600 dark:text-slate-300 transition-colors cursor-pointer"
                    title="Editar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    className="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-rose-950/60 hover:bg-brand-red hover:text-white rounded-lg text-red-500 dark:text-rose-400 transition-colors cursor-pointer"
                    title="Excluir lote"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtle Footer with date */}
      {brand.lastDateStr && (
        <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-slate-500 font-semibold pt-1">
          <span>Último lançamento: {brand.lastDateStr}</span>
        </div>
      )}
    </div>
  );
});

BrandStatCard.displayName = 'BrandStatCard';
