import React from 'react';
import { motion } from 'motion/react';
import { FileText, Edit2, Trash2, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { InventoryCount } from '../../types';

interface InventoryItemCardProps {
  item: InventoryCount;
  index: number;
  isCompleted: boolean;
  onViewPdf: (item: InventoryCount) => void;
  onEdit: (item: InventoryCount) => void;
  onDelete: (id: string) => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = React.memo(({
  item,
  index,
  isCompleted,
  onViewPdf,
  onEdit,
  onDelete,
}) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-white rounded-[2.5rem] shadow-modern-sm border border-gray-100 overflow-hidden group"
    >
      <div className="p-6 space-y-4">
        {/* Top row: Actions and Date */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-xs font-bold uppercase tracking-widest bg-brand-slate px-3 py-1 rounded-lg">
            {new Date(item.createdAt).toLocaleDateString('pt-BR')}
          </span>
          
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewPdf(item);
              }}
              className="w-11 h-11 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-white hover:shadow-md transition-all active:scale-90"
              title="Visualizar Comprovante / PDF"
            >
              <FileText size={18} strokeWidth={2.5} />
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              className="w-11 h-11 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-brand-blue hover:text-white transition-all active:scale-90"
              title="Editar"
            >
              <Edit2 size={18} strokeWidth={2.5} />
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-brand-red hover:text-white transition-all active:scale-90"
              title="Excluir"
            >
              <Trash2 size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Middle row: Brand (Bold), Gender & Completion Status */}
        <div className="space-y-1">
          <h3 className="font-display font-black text-brand-dark text-2xl leading-tight tracking-tight uppercase flex flex-wrap items-center gap-2">
            <span>{item.brand || item.model || 'SEM MARCA'}</span>
            {item.gender && (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                item.gender === 'M' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                item.gender === 'F' ? 'bg-pink-50 text-pink-600 border border-pink-100' :
                item.gender === 'IM' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                'bg-purple-50 text-purple-600 border border-purple-100'
              }`}>
                {item.gender === 'M' ? 'Masc' : item.gender === 'F' ? 'Fem' : item.gender === 'IM' ? 'Inf.M' : 'Inf.F'}
              </span>
            )}

            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 ${
              isCompleted 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80' 
                : 'bg-amber-50 text-amber-700 border border-amber-200/80'
            }`}>
              {isCompleted ? (
                <>
                  <CheckCircle2 size={11} className="text-emerald-600" />
                  Concluída
                </>
              ) : (
                <>
                  <Clock size={11} className="text-amber-600" />
                  Em Andamento
                </>
              )}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
            {item.model && <span>{item.model}</span>}
            {item.model && item.color && <span className="w-1 h-1 bg-gray-200 rounded-full"></span>}
            {item.color && <span>{item.color}</span>}
            {(item.arrivalMonth || item.arrivalYear) && (
              <>
                <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                <span className="text-brand-red flex items-center gap-1">
                  <TrendingUp size={10} />
                  {item.arrivalMonth}/{item.arrivalYear}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Bottom Row: Totals and Sizes */}
        <div className="pt-4 border-t border-gray-50 flex items-center gap-4">
          <div className="bg-brand-blue/10 px-4 py-3 rounded-2xl text-center min-w-[85px] border border-brand-blue/5">
            <p className="text-[9px] font-black text-brand-blue/40 uppercase tracking-widest mb-1 leading-none">Total</p>
            <p className="text-2xl font-display font-black text-brand-blue leading-none tracking-tighter">{item.total}</p>
          </div>
          
          <div className="flex-1 flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
            {Object.entries(item.sizes)
              .filter(([_, qty]) => (qty as any) > 0)
              .map(([size, qty]) => (
                <div 
                  key={size} 
                  className="bg-brand-slate px-3.5 py-2.5 rounded-xl text-center min-w-[55px] border border-white shadow-sm"
                >
                  <p className="text-[9px] font-bold text-brand-accent uppercase leading-none mb-1.5">{size}</p>
                  <p className="text-sm font-display font-black text-brand-dark leading-none">{qty as any}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

InventoryItemCard.displayName = 'InventoryItemCard';
