import React from 'react';
import { 
  CheckCircle2, 
  Trash2, 
  Eye, 
  Edit2, 
  Download, 
  Plus, 
  FileText 
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
  onViewPdfItem,
  onEditItem,
  onDeleteItem,
}) => {
  return (
    <div 
      className={`bg-white rounded-3xl p-5 border transition-all shadow-sm space-y-4 ${
        brand.status === 'COMPLETED' 
          ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/30 to-white' 
          : brand.status === 'IN_PROGRESS'
            ? 'border-blue-200 bg-gradient-to-r from-blue-50/20 to-white'
            : 'border-gray-100'
      }`}
    >
      {/* Header: Brand Name, Status Badge & Trash Delete Brand */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h4 className="text-xl sm:text-2xl font-display font-black text-brand-dark uppercase tracking-tight truncate">
              {brand.name}
            </h4>
            
            {/* Status Badge */}
            {brand.status === 'COMPLETED' && (
              <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                <CheckCircle2 size={12} /> CONCLUÍDA
              </span>
            )}
            {brand.status === 'IN_PROGRESS' && (
              <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 shrink-0">
                ⏳ Em Contagem ({brand.totalPieces} pcs)
              </span>
            )}
          </div>

          {/* Stats Pills */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-600 flex-wrap pt-0.5">
            <span className="bg-gray-100/90 text-brand-dark px-3 py-1.5 rounded-xl whitespace-nowrap border border-gray-200/50">
              <strong className="text-brand-blue font-black">{brand.totalPieces}</strong> peças total
            </span>
            <span className="bg-gray-100/90 text-brand-dark px-3 py-1.5 rounded-xl whitespace-nowrap border border-gray-200/50">
              <strong className="text-brand-blue font-black">{brand.totalModels}</strong> modelos
            </span>
            <span className="bg-gray-100/90 text-brand-dark px-3 py-1.5 rounded-xl whitespace-nowrap border border-gray-200/50">
              <strong className="text-brand-blue font-black">{brand.totalLots}</strong> lotes
            </span>
          </div>
        </div>

        {/* Top Right Quick Delete Icon */}
        <button
          type="button"
          onClick={() => onDeleteBrand(brand.name, brand.totalLots, brand.totalPieces)}
          title={`Excluir a marca ${brand.name}`}
          className="p-2.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl active:scale-90 transition-all border border-transparent hover:border-rose-100 shrink-0 cursor-pointer"
        >
          <Trash2 size={20} strokeWidth={2.2} />
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
        {/* PRÉ-VISUALIZAR */}
        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onViewBrandPreview({ brandName: brand.name, items: brand.items })}
            title={`Pré-visualizar contagem geral da marca ${brand.name}`}
            className="p-2.5 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-black text-xs flex items-center gap-1.5 border border-indigo-200 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Eye size={16} strokeWidth={2.5} />
            <span className="text-[10px] uppercase tracking-wider">
              PRÉ-VISUALIZAR
            </span>
          </button>
        )}

        {/* EDITAR / ATUALIZAR */}
        <button
          type="button"
          onClick={() => onEditBrand(brand.name)}
          title={`Editar ou atualizar números da marca ${brand.name}`}
          className="p-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl font-black text-xs flex items-center gap-1.5 border border-amber-200 shadow-xs active:scale-95 transition-all cursor-pointer"
        >
          <Edit2 size={16} strokeWidth={2.5} />
          <span className="text-[10px] uppercase tracking-wider">
            EDITAR / ATUALIZAR
          </span>
        </button>

        {/* VER LOTES */}
        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleExpand(brand.name)}
            title={`Ver lotes de ${brand.name}`}
            className="p-2.5 px-3.5 bg-blue-50 hover:bg-blue-100 text-brand-blue rounded-2xl font-black text-xs flex items-center gap-1.5 border border-blue-200 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Eye size={16} strokeWidth={2.5} />
            <span className="text-[10px] uppercase tracking-wider">
              {isExpanded ? 'Ocultar Lotes' : 'VER LOTES'}
            </span>
          </button>
        )}

        {/* PDF */}
        {brand.items.length > 0 && (
          <button
            type="button"
            onClick={() => onGenerateBrandPdf(brand.name, brand.items)}
            title={`Baixar PDF da marca ${brand.name}`}
            className="p-2.5 px-3.5 bg-red-50 hover:bg-red-100 text-brand-red rounded-2xl font-black text-xs flex items-center gap-1.5 border border-red-200 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Download size={16} strokeWidth={2.5} />
            <span className="text-[10px] uppercase tracking-wider">
              PDF
            </span>
          </button>
        )}

        {/* CONCLUÍDA */}
        <button
          type="button"
          onClick={() => onToggleBrandCompletion(brand.name)}
          title={isCompleted ? 'Reabrir contagem' : 'Marcar como Concluída'}
          className={`p-2.5 px-3.5 rounded-2xl border font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
            isCompleted
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-gray-50 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 border-gray-200'
          }`}
        >
          <CheckCircle2 size={16} strokeWidth={2.5} />
          <span className="text-[10px] uppercase tracking-wider">
            {isCompleted ? 'CONCLUÍDA' : 'CONCLUIR'}
          </span>
        </button>

        {/* + CONTAR */}
        <button
          type="button"
          onClick={() => onStartWithSameBrand(brand.name)}
          className="p-2.5 px-3.5 bg-brand-dark hover:bg-black text-white rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all ml-auto cursor-pointer"
          title={`Contar ${brand.name}`}
        >
          <Plus size={16} strokeWidth={3} />
          <span className="text-[10px] uppercase tracking-wider">+ CONTAR</span>
        </button>
      </div>

      {/* Accordion list of lot items if expanded */}
      {isExpanded && brand.items.length > 0 && (
        <div className="pt-3 border-t border-gray-100 space-y-2 bg-gray-50/50 p-3 rounded-2xl">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 px-1">
            <span>Lotes Registrados ({brand.items.length})</span>
            <span>Ações</span>
          </div>
          <div className="grid gap-2">
            {brand.items.map(item => (
              <div key={item.id} className="bg-white p-3 rounded-xl border border-gray-200/60 flex items-center justify-between gap-2 shadow-2xs">
                <div className="min-w-0">
                  <p className="font-bold text-xs text-brand-dark truncate">
                    {item.model || 'Sem modelo'} - {item.color || 'Sem cor'}
                  </p>
                  <p className="text-[10px] text-gray-500 font-medium">
                    {item.gender ? `Gênero: ${item.gender} | ` : ''}
                    {item.arrivalMonth}/{item.arrivalYear} - <strong className="text-brand-blue">{item.total} pares</strong>
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onViewPdfItem(item)}
                    className="p-1.5 bg-gray-100 hover:bg-brand-blue hover:text-white rounded-lg text-gray-600 transition-colors cursor-pointer"
                    title="Comprovante"
                  >
                    <FileText size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditItem(item)}
                    className="p-1.5 bg-gray-100 hover:bg-amber-500 hover:text-white rounded-lg text-gray-600 transition-colors cursor-pointer"
                    title="Editar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1.5 bg-red-50 hover:bg-brand-red hover:text-white rounded-lg text-red-500 transition-colors cursor-pointer"
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

      {/* Footer with last launch date & Excluir Marca link */}
      <div className="flex items-center justify-between text-[11px] text-gray-400 font-bold pt-1 border-t border-gray-50">
        <span>{brand.lastDateStr ? `Último lançamento: ${brand.lastDateStr}` : 'Nenhum lançamento recente'}</span>
        <button
          type="button"
          onClick={() => onDeleteBrand(brand.name, brand.totalLots, brand.totalPieces)}
          className="text-rose-500 hover:text-rose-700 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider hover:underline cursor-pointer"
        >
          <Trash2 size={12} />
          EXCLUIR MARCA
        </button>
      </div>
    </div>
  );
});

BrandStatCard.displayName = 'BrandStatCard';
