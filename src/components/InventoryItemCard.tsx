import React from 'react';
import { FileText, Edit2, Trash2, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { InventoryCount } from '../../types';

interface InventoryItemCardProps {
  item: InventoryCount;
  index?: number;
  isCompleted: boolean;
  onViewPdf: (item: InventoryCount) => void;
  onEdit: (item: InventoryCount) => void;
  onDelete: (id: string) => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = React.memo(({
  item,
  isCompleted,
  onViewPdf,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] shadow-modern-sm border border-gray-100 dark:border-slate-800 hover:border-gray-200 dark:hover:border-slate-700 transition-colors overflow-hidden group">
      <div className="p-5 sm:p-6 space-y-4">
        {/* Top row: Actions and Date */}
        <div className="flex justify-between items-center gap-2">
          <span className="text-gray-500 dark:text-slate-300 text-xs font-bold uppercase tracking-widest bg-brand-slate dark:bg-slate-800 px-3 py-1 rounded-lg">
            {new Date(item.createdAt).toLocaleDateString('pt-BR')}
          </span>
          
          <div className="flex gap-1.5 sm:gap-2">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewPdf(item);
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-brand-slate dark:bg-slate-800 text-brand-blue dark:text-blue-300 rounded-xl hover:bg-brand-blue/10 dark:hover:bg-slate-700 transition-colors active:scale-90 cursor-pointer"
              title="Visualizar Comprovante / PDF"
            >
              <FileText size={17} strokeWidth={2.5} />
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-brand-slate dark:bg-slate-800 text-brand-blue dark:text-blue-300 rounded-xl hover:bg-brand-blue hover:text-white transition-colors active:scale-90 cursor-pointer"
              title="Editar"
            >
              <Edit2 size={17} strokeWidth={2.5} />
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-red-50 dark:bg-rose-950/60 text-red-500 dark:text-rose-400 rounded-xl hover:bg-brand-red hover:text-white transition-colors active:scale-90 cursor-pointer"
              title="Excluir"
            >
              <Trash2 size={17} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Middle row: Brand (Bold), Gender & Completion Status */}
        <div className="space-y-1">
          <h3 className="font-display font-black text-brand-dark dark:text-white text-xl sm:text-2xl leading-tight tracking-tight uppercase flex flex-wrap items-center gap-2">
            <span>{item.brand || item.model || 'SEM MARCA'}</span>
            {item.gender && (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                item.gender === 'M' ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-800' :
                item.gender === 'F' ? 'bg-pink-50 dark:bg-pink-950 text-pink-600 dark:text-pink-300 border border-pink-100 dark:border-pink-800' :
                item.gender === 'IM' ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800' :
                'bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300 border border-purple-100 dark:border-purple-800'
              }`}>
                {item.gender === 'M' ? 'Masc' : item.gender === 'F' ? 'Fem' : item.gender === 'IM' ? 'Inf.M' : 'Inf.F'}
              </span>
            )}

            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 ${
              isCompleted 
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800' 
                : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800'
            }`}>
              {isCompleted ? (
                <>
                  <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
                  Concluída
                </>
              ) : (
                <>
                  <Clock size={11} className="text-amber-600 dark:text-amber-400" />
                  Em Andamento
                </>
              )}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
            {item.model && <span>{item.model}</span>}
            {item.model && item.color && <span className="w-1 h-1 bg-gray-300 dark:bg-slate-600 rounded-full"></span>}
            {item.color && <span>{item.color}</span>}
            {(item.arrivalMonth || item.arrivalYear) && (
              <>
                <span className="w-1 h-1 bg-gray-300 dark:bg-slate-600 rounded-full"></span>
                <span className="text-brand-red dark:text-rose-400 flex items-center gap-1">
                  <TrendingUp size={10} />
                  {item.arrivalMonth}/{item.arrivalYear}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Bottom Row: Totals and Sizes */}
        <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center gap-3 sm:gap-4">
          <div className="bg-brand-blue/10 dark:bg-blue-950/60 px-3.5 py-2.5 rounded-2xl text-center min-w-[78px] border border-brand-blue/5 dark:border-blue-800/50 shrink-0">
            <p className="text-[9px] font-black text-brand-blue/50 dark:text-blue-300/70 uppercase tracking-widest mb-1 leading-none">Total</p>
            <p className="text-2xl font-display font-black text-brand-blue dark:text-blue-300 leading-none tracking-tighter">{item.total}</p>
          </div>
          
          <div className="flex-1 flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
            {Object.entries(item.sizes)
              .filter(([_, qty]) => (qty as any) > 0)
              .map(([size, qty]) => (
                <div 
                  key={size} 
                  className="bg-brand-slate dark:bg-slate-800 px-3 py-2 rounded-xl text-center min-w-[50px] border border-gray-100 dark:border-slate-700 shrink-0"
                >
                  <p className="text-[9px] font-bold text-brand-accent uppercase leading-none mb-1">{size}</p>
                  <p className="text-sm font-display font-black text-brand-dark dark:text-white leading-none">{qty as any}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
});

InventoryItemCard.displayName = 'InventoryItemCard';
