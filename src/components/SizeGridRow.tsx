import React from 'react';
import { motion } from 'motion/react';
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
  return (
    <motion.div 
      layout
      className="grid grid-cols-[80px_1fr] items-center p-3 rounded-2xl bg-brand-slate/40 border border-white focus-within:bg-white focus-within:shadow-lg transition-all"
    >
      <div className="text-center border-r border-gray-100 pr-2">
        <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Tamanho</label>
        <span className="text-xl font-display font-black text-brand-dark">{size}</span>
      </div>
      
      <div className="flex items-center gap-4 px-3">
        <motion.button 
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => onAdjust(size, -1)}
          className="w-11 h-11 flex items-center justify-center bg-white rounded-xl shadow-sm text-red-500 border border-gray-100 active:bg-red-50 cursor-pointer"
        >
          <Minus size={18} strokeWidth={3} />
        </motion.button>
        
        <input 
          type="number"
          inputMode="numeric"
          min="0"
          className="flex-1 w-full bg-transparent border-none text-center text-3xl font-display font-black text-brand-blue focus:ring-0 focus:outline-none placeholder:text-gray-100"
          value={value || ''}
          onChange={(e) => onUpdate(size, e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="0"
        />
        
        <motion.button 
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => onAdjust(size, 1)}
          className="w-11 h-11 flex items-center justify-center bg-white rounded-xl shadow-sm text-brand-accent border border-gray-100 active:bg-blue-50 cursor-pointer"
        >
          <Plus size={18} strokeWidth={3} />
        </motion.button>
      </div>
    </motion.div>
  );
});

SizeGridRow.displayName = 'SizeGridRow';
