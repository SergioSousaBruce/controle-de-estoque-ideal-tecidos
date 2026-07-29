import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  X, 
  RotateCcw, 
  PackageCheck, 
  Plus, 
  Search, 
  Barcode, 
  Sparkles, 
  Layers, 
  Grid,
  AlertCircle
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep, playDoubleBeep } from '../utils/audioBeep';
import { getReferenceByBarcode, sanitizeBarcode } from '../services/barcodeFirebaseService';
import { InventoryCount } from '../../types';
import { LETTER_SIZES, NUMERIC_SIZES, syncProductTypeWithGender } from '../../constants';

interface ContinuousScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSaveCount: (countData: Omit<InventoryCount, 'id' | 'createdAt' | 'userId'>) => Promise<any>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface ScannedLogItem {
  id: string;
  barcode: string;
  brand: string;
  model: string;
  color: string;
  size: string;
  productType: string;
  time: string;
  status: 'FOUND' | 'NEW' | 'AUTO_SAVED';
}

// Memoized subcomponent for scanned logs list to prevent re-rendering full modal frame
const ScannedLogList = React.memo(({ logs }: { logs: ScannedLogItem[] }) => {
  if (logs.length === 0) {
    return (
      <p className="text-xs text-slate-600 text-center py-6 font-medium">
        Nenhuma caixa bipada ainda. Passe o código de barras no leitor.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-slate-500">{log.time}</span>
            <span className="font-extrabold text-white">{log.brand}</span>
            <span className="text-slate-400">{log.model} ({log.color})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-bold">
              Tam: {log.size}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
              log.status === 'AUTO_SAVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
              log.status === 'FOUND' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
              'bg-red-950 text-red-400 border border-red-800'
            }`}>
              {log.status === 'AUTO_SAVED' ? '+1 Lançado' : log.status === 'FOUND' ? 'Consultado' : 'Sem Cadastro'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
});

export const ContinuousScannerModal: React.FC<ContinuousScannerModalProps> = ({
  isOpen,
  onClose,
  userId,
  onSaveCount,
  showToast
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [flashEffect, setFlashEffect] = useState<'GREEN' | 'RED' | null>(null);
  
  // Continuous Scan Mode
  const [mode, setMode] = useState<'AUTO_COUNT' | 'INSPECT'>('AUTO_COUNT');
  const [selectedDefaultSize, setSelectedDefaultSize] = useState<string>('39/40');
  
  // Active Scanned Product
  const [activeProduct, setActiveProduct] = useState<any | null>(null);
  const [activeSize, setActiveSize] = useState<string>('39/40');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Session Stats
  const [scannedLogs, setScannedLogs] = useState<ScannedLogItem[]>([]);
  const [totalSessionCount, setTotalSessionCount] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keep input focused constantly for USB scanner
  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = setInterval(() => {
      if (document.activeElement !== inputRef.current && inputRef.current) {
        inputRef.current.focus();
      }
    }, 1000);

    return () => clearInterval(focusTimer);
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerFlash = (color: 'GREEN' | 'RED') => {
    setFlashEffect(color);
    setTimeout(() => {
      setFlashEffect(null);
    }, 300);
  };

  const handleProcessBarcode = async (rawCode: string) => {
    const code = sanitizeBarcode(rawCode);
    if (!code) return;

    setIsProcessing(true);

    try {
      const refData = await getReferenceByBarcode(code);

      if (refData && refData.brand) {
        // Known product found
        if (soundEnabled) playSuccessBeep();
        triggerFlash('GREEN');

        const displaySize = (refData as any).defaultSize || (refData.sizes ? Object.keys(refData.sizes)[0] : null) || selectedDefaultSize || '39/40';
        setActiveProduct(refData);
        setActiveSize(displaySize);

        if (mode === 'AUTO_COUNT') {
          // Auto-save 1 unit for this shoe
          const gridType = refData.gridType || (LETTER_SIZES.includes(displaySize) ? 'LETTER' : 'NUMERIC');
          const pType = refData.productType || 'Tênis Adulto Masculino';
          
          onSaveCount({
            productType: pType,
            brand: refData.brand,
            model: refData.model || '',
            color: refData.color || '',
            arrivalMonth: refData.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
            arrivalYear: refData.arrivalYear || new Date().getFullYear().toString(),
            gridType,
            sizes: { [displaySize]: 1 },
            total: 1,
            gender: refData.gender || 'M'
          });

          setTotalSessionCount(prev => prev + 1);
          setScannedLogs(prev => [
            {
              id: `${Date.now()}_${Math.random()}`,
              barcode: code,
              brand: refData.brand,
              model: refData.model || 'N/I',
              color: refData.color || 'N/I',
              size: displaySize,
              productType: pType,
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              status: 'AUTO_SAVED'
            },
            ...prev
          ]);
        } else {
          setScannedLogs(prev => [
            {
              id: `${Date.now()}_${Math.random()}`,
              barcode: code,
              brand: refData.brand,
              model: refData.model || 'N/I',
              color: refData.color || 'N/I',
              size: displaySize,
              productType: refData.productType || 'Tênis Adulto',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              status: 'FOUND'
            },
            ...prev
          ]);
        }
      } else {
        // Barcode not found in catalog yet
        if (soundEnabled) playErrorBeep();
        triggerFlash('RED');

        setActiveProduct({ barcode: code, brand: 'Não Cadastrado', model: 'Aguardando Cadastro' });
        showToast(`Código ${code} não possui cadastro prévio.`, 'error');

        setScannedLogs(prev => [
          {
            id: `${Date.now()}_${Math.random()}`,
            barcode: code,
            brand: 'Sem Cadastro',
            model: 'Requer Identificação',
            color: '-',
            size: '-',
            productType: '-',
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            status: 'NEW'
          },
          ...prev
        ]);
      }
    } catch (err) {
      if (soundEnabled) playErrorBeep();
      triggerFlash('RED');
      console.error(err);
    } finally {
      setIsProcessing(false);
      setBarcodeInput('');
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      handleProcessBarcode(barcodeInput);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div 
        className={`bg-slate-900 border-2 rounded-3xl max-w-4xl w-full p-4 sm:p-6 text-white shadow-2xl transition-colors duration-300 relative ${
          flashEffect === 'GREEN' ? 'border-emerald-500 ring-8 ring-emerald-500/20' : 
          flashEffect === 'RED' ? 'border-red-500 ring-8 ring-red-500/20' : 
          'border-slate-800'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-600/20 text-red-500 rounded-2xl border border-red-500/30 animate-pulse">
              <Zap size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
                Modo Bipagem Contínua <span className="text-xs bg-red-600 px-2 py-0.5 rounded-full text-white">USB HIGH-SPEED</span>
              </h2>
              <p className="text-xs text-slate-400">
                Lançamento ultra-rápido de calçados direto pelo leitor óptico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                soundEnabled 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              <span className="hidden sm:inline">{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Mode Selector & Quick Config */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('AUTO_COUNT')}
              className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
                mode === 'AUTO_COUNT'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PackageCheck size={16} />
              Contagem Automática (+1)
            </button>
            <button
              type="button"
              onClick={() => setMode('INSPECT')}
              className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
                mode === 'INSPECT'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search size={16} />
              Apenas Consultar / Log
            </button>
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
              <Grid size={14} className="text-emerald-400" /> Numeração Padrão de Bip:
            </span>
            <select
              value={selectedDefaultSize}
              onChange={(e) => setSelectedDefaultSize(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-black rounded-lg px-3 py-1.5 outline-none focus:border-red-500"
            >
              {[...NUMERIC_SIZES, ...LETTER_SIZES].map(sz => (
                <option key={sz} value={sz}>Tamanho {sz}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Big USB Barcode Scan Field */}
        <form onSubmit={handleSubmit} className="mb-6 relative">
          <div className="relative">
            <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500 animate-pulse" size={28} />
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Aponte o leitor USB para o código de barras da caixa..."
              className="w-full pl-14 pr-12 py-5 text-xl font-mono font-bold bg-slate-950 border-2 border-red-500/50 focus:border-red-500 rounded-2xl text-white placeholder-slate-500 outline-none shadow-inner"
              autoComplete="off"
            />
            {isProcessing && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <span className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin block"></span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <Sparkles size={12} className="text-yellow-400" />
            O leitor dispara o evento automaticamente. Não é necessário clicar em nada.
          </p>
        </form>

        {/* Live Active Product Card */}
        {activeProduct && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                  {activeProduct.brand || 'Marca N/I'}
                </span>
                <h4 className="text-base font-extrabold text-white mt-1">
                  {activeProduct.model || 'Modelo Padrão'} - <span className="text-slate-400">{activeProduct.color || 'Cor Única'}</span>
                </h4>
                <p className="text-xs text-slate-400 font-mono">
                  Código: {activeProduct.barcode} • Tamanho: {activeSize}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-emerald-400">+1</span>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Registrado</p>
            </div>
          </motion.div>
        )}

        {/* Stats & Scan Stream Log */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
            <span className="text-xs font-bold text-slate-400 uppercase">Total Bipado nesta Sessão</span>
            <div className="text-3xl font-black text-red-500 mt-1">{totalSessionCount} <span className="text-xs text-slate-400 font-normal">caixas</span></div>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center sm:col-span-2 flex items-center justify-between px-6">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase">Status do Leitor</span>
              <div className="text-emerald-400 text-sm font-bold flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                Pronto para receber bipagem
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setScannedLogs([]);
                setTotalSessionCount(0);
                setActiveProduct(null);
                showToast('Sessão limpada', 'success');
              }}
              className="text-xs font-bold text-slate-400 hover:text-red-400 flex items-center gap-1 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-red-900 transition-colors"
            >
              <RotateCcw size={12} />
              Zerar Sessão
            </button>
          </div>
        </div>

        {/* Scanned Items History Stream */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 max-h-56 overflow-y-auto">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Layers size={14} className="text-red-500" /> Histórico em Tempo Real
          </h3>

          <ScannedLogList logs={scannedLogs} />
        </div>
      </div>
    </div>
  );
};
