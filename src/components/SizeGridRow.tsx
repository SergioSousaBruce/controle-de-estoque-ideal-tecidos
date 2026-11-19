import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface SizeGridRowProps {
  size: string;
  value: number | string;
  onUpdate: (size: string, value: string | number) => void;
  onAdjust: (size: string, delta: number) => void;
}

export const SizeGridRow: React.FC<SizeGridRowProps> = React.memo(({
  size,
  value,
  onUpdate,
  onAdjust,
}) => {
  const numericVal = typeof value === 'string' ? parseInt(value, 10) || 0 : value || 0;
  const hasQty = numericVal > 0;

  return (
    <div 
      className={`grid grid-cols-[64px_1fr] items-center p-2.5 sm:p-3 rounded-2xl border transition-colors ${
        hasQty 
          ? 'bg-white dark:bg-slate-800 border-brand-blue/25 dark:border-blue-500/40 shadow-sm' 
          : 'bg-brand-slate/50 dark:bg-slate-950/60 border-gray-100 dark:border-slate-800 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:border-brand-accent/40 focus-within:shadow-md'
      }`}
    >
      <div className="text-center border-r border-gray-100 dark:border-slate-700 pr-2">
        <label className="text-[7px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest block mb-0.5">Tam</label>
        <span className={`text-lg sm:text-xl font-display font-black ${hasQty ? 'text-brand-blue dark:text-blue-400' : 'text-brand-dark dark:text-slate-200'}`}>
          {size}
        </span>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3">
        <button 
          type="button"
          onClick={() => onAdjust(size, -1)}
          aria-label={`Diminuir tamanho ${size}`}
          className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl shadow-xs text-red-500 border border-gray-200/70 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-rose-950/60 active:scale-90 transition-all cursor-pointer shrink-0"
        >
          <Minus size={17} strokeWidth={3} />
        </button>
        
        <input 
          type="number"
          inputMode="numeric"
          min="0"
          aria-label={`Quantidade tamanho ${size}`}
          className="flex-1 w-full min-w-0 bg-transparent border-none text-center text-2xl sm:text-3xl font-display font-black text-brand-blue dark:text-white focus:ring-0 focus:outline-none placeholder:text-gray-200 dark:placeholder:text-slate-700"
          value={value || ''}
          onChange={(e) => onUpdate(size, e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="0"
        />
        
        <button 
          type="button"
          onClick={() => onAdjust(size, 1)}
          aria-label={`Aumentar tamanho ${size}`}
          className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl shadow-xs text-brand-accent border border-gray-200/70 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/60 active:scale-90 transition-all cursor-pointer shrink-0"
        >
          <Plus size={17} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
});

SizeGridRow.displayName = 'SizeGridRow';
