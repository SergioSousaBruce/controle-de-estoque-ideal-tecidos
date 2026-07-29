import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Barcode, CheckCircle2, Zap, ArrowLeft, Save, AlertTriangle, Package, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { getCachedReferenceByBarcode, getReferenceByBarcode, BarcodeReference, sanitizeBarcode } from '../services/barcodeFirebaseService';
import { recordStockMovement } from '../services/stockMovementService';
import { playSuccessBeep, playErrorBeep } from '../utils/audioBeep';
import { db } from '../lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';

export interface InventoryModeItem {
  barcode: string;
  brand: string;
  model: string;
  color: string;
  productType: string;
  size: string;
  gridType: string;
  quantity: number;
  lastScannedTime: number;
  isNewRef?: boolean;
}

interface InventoryModeModuleProps {
  currentUserId: string;
  onExit: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const InventoryModeModule: React.FC<InventoryModeModuleProps> = ({
  currentUserId,
  onExit,
  showToast
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [sessionItems, setSessionItems] = useState<Record<string, InventoryModeItem>>({});
  const [lastScannedItem, setLastScannedItem] = useState<InventoryModeItem | null>(null);
  const [totalScansCount, setTotalScansCount] = useState<number>(0);
  const [flashEffect, setFlashEffect] = useState<'green' | 'amber' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus on barcode input continuously without interrupting the user
  useEffect(() => {
    const focusInterval = setInterval(() => {
      if (document.activeElement !== inputRef.current && inputRef.current && !isSaving && !isConfirmingFinish) {
        inputRef.current.focus();
      }
    }, 800);

    return () => clearInterval(focusInterval);
  }, [isSaving, isConfirmingFinish]);

  // Initial focus
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const triggerFlash = (color: 'green' | 'amber') => {
    setFlashEffect(color);
    setTimeout(() => {
      setFlashEffect(null);
    }, 300);
  };

  // Immediate Process Barcode Handler (< 1ms from memory cache)
  const processBarcode = useCallback(async (rawCode: string) => {
    const cleanCode = sanitizeBarcode(rawCode);
    if (!cleanCode) return;

    // 1. Check in-memory cache first
    let ref = getCachedReferenceByBarcode(cleanCode);

    // 2. If not in cache, query Firebase
    if (!ref) {
      try {
        ref = await getReferenceByBarcode(cleanCode);
      } catch (err) {
        console.warn('Reference lookup notice:', err);
      }
    }

    const now = Date.now();
    let updatedItem: InventoryModeItem;

    setSessionItems(prev => {
      const existing = prev[cleanCode];
      const newQty = (existing?.quantity || 0) + 1;

      if (ref) {
        const displaySize = Object.keys(ref.sizes || {})[0] || 'UN';
        updatedItem = {
          barcode: cleanCode,
          brand: ref.brand || 'Ideal Tecidos / Calçados',
          model: ref.model || cleanCode,
          color: ref.color || 'Padrão',
          productType: ref.productType || 'Calçado',
          size: displaySize,
          gridType: ref.gridType || 'NUMERIC',
          quantity: newQty,
          lastScannedTime: now,
          isNewRef: false
        };
      } else {
        updatedItem = {
          barcode: cleanCode,
          brand: 'Item Sem Cadastro',
          model: cleanCode,
          color: 'N/I',
          productType: 'Calçado',
          size: 'UN',
          gridType: 'NUMERIC',
          quantity: newQty,
          lastScannedTime: now,
          isNewRef: true
        };
      }

      setLastScannedItem(updatedItem);
      return {
        ...prev,
        [cleanCode]: updatedItem
      };
    });

    setTotalScansCount(count => count + 1);
    playSuccessBeep();
    triggerFlash(ref ? 'green' : 'amber');
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.trim();
      if (code) {
        processBarcode(code);
        setBarcodeInput('');
      }
    }
  };

  // Batch save all accumulated session counts to Firebase at the end of the session
  const handleFinalizeInventory = async () => {
    const itemsList = Object.values(sessionItems);
    if (itemsList.length === 0) {
      showToast('Nenhum item foi lido neste inventário.', 'error');
      onExit();
      return;
    }

    setIsSaving(true);
    setSyncError(null);

    try {
      const batch = writeBatch(db);
      const inventoryCol = collection(db, 'inventory');
      const sessionDate = new Date().toLocaleDateString('pt-BR');

      itemsList.forEach(item => {
        const newDocRef = doc(inventoryCol);
        batch.set(newDocRef, {
          brand: item.brand,
          model: item.model,
          color: item.color,
          productType: item.productType,
          arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
          arrivalYear: new Date().getFullYear().toString(),
          gridType: item.gridType,
          sizes: { [item.size]: item.quantity },
          total: item.quantity,
          userId: currentUserId,
          createdAt: Date.now(),
          notes: `Modo Inventário - Sessão ${sessionDate}`
        });

        // Record stock movement for complete traceability
        recordStockMovement({
          userId: currentUserId,
          userName: 'Operador',
          brand: item.brand,
          model: item.model,
          color: item.color,
          barcode: item.barcode,
          previousQty: 0,
          movedQty: item.quantity,
          finalQty: item.quantity,
          type: 'AJUSTE',
          reason: `Modo Inventário Rápido (${sessionDate})`
        }).catch(err => console.warn('Movement record notice:', err));
      });

      await batch.commit();

      playSuccessBeep();
      showToast(`Inventário finalizado! ${itemsList.length} referências salvas com sucesso no Firebase.`, 'success');
      onExit();
    } catch (error: any) {
      console.error('Erro ao finalizar inventário no Firebase:', error);
      playErrorBeep();
      setSyncError('Erro de sincronização ao salvar no Firebase. Verifique a conexão e tente novamente.');
      showToast('Erro ao salvar no Firebase', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const sessionList = Object.values(sessionItems).sort((a, b) => b.lastScannedTime - a.lastScannedTime);

  return (
    <div className={`min-h-screen bg-slate-950 text-white flex flex-col transition-colors duration-200 ${
      flashEffect === 'green' ? 'bg-emerald-950/80' :
      flashEffect === 'amber' ? 'bg-amber-950/80' : ''
    }`}>
      {/* HEADER EXCLUSIVO MODO INVENTÁRIO */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-40 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (Object.keys(sessionItems).length > 0) {
                setIsConfirmingFinish(true);
              } else {
                onExit();
              }
            }}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
            title="Sair do Modo Inventário"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h1 className="font-black text-lg uppercase tracking-tight text-white flex items-center gap-2">
                MODO INVENTÁRIO
              </h1>
            </div>
            <p className="text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
              Contagem Contínua em Alta Velocidade
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsConfirmingFinish(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition-all"
        >
          <Save size={16} />
          <span>Finalizar Inventário</span>
        </button>
      </header>

      {/* INPUT PRINCIPAL (Foco automático constante para leitor Bluetooth) */}
      <div className="p-4 bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-2xl mx-auto space-y-2">
          <label className="text-xs font-extrabold uppercase text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Zap size={14} /> Leitor Ativo (Aguardando Bipagem)
            </span>
            <span className="font-mono text-slate-400">Total Bips: <strong className="text-white text-sm">{totalScansCount}</strong></span>
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Aproxime o bipador Bluetooth ou digite o código..."
              className="w-full bg-slate-950 border-2 border-emerald-500/50 focus:border-emerald-400 text-white font-mono font-bold text-lg px-4 py-3 rounded-2xl shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all placeholder:text-slate-600 placeholder:text-sm"
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <Barcode className="text-emerald-400 animate-pulse" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* SYNC ERROR NOTICE */}
      {syncError && (
        <div className="mx-4 mt-4 p-4 bg-red-950 border border-red-800 text-red-200 rounded-2xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-red-400 shrink-0" size={18} />
            <span>{syncError}</span>
          </div>
          <button
            onClick={handleFinalizeInventory}
            className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-black uppercase"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* PAINEL PRINCIPAL DE LEITURA */}
      <main className="flex-1 p-4 max-w-2xl w-full mx-auto space-y-6">
        {/* ÚLTIMO PRODUTO LIDO */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-400" /> Último Produto Lido
            </span>
            {lastScannedItem && (
              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                lastScannedItem.isNewRef ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              }`}>
                {lastScannedItem.isNewRef ? 'Sem Cadastro Anterior' : 'Cadastrado'}
              </span>
            )}
          </div>

          {lastScannedItem ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Nome da Marca</p>
                  <p className="text-xl font-black text-white truncate">{lastScannedItem.brand}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Modelo / Ref.</p>
                  <p className="text-xl font-black text-emerald-400 truncate">{lastScannedItem.model}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Cor</p>
                  <p className="text-sm font-bold text-slate-200 truncate">{lastScannedItem.color}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Código de Barras</p>
                  <p className="text-xs font-mono font-bold text-slate-300 truncate">{lastScannedItem.barcode}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Quantidade Atual</p>
                  <p className="text-2xl font-black text-emerald-400">{lastScannedItem.quantity}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-600 space-y-2">
              <Barcode size={36} className="mx-auto opacity-40" />
              <p className="text-sm font-bold">Nenhum produto lido até o momento</p>
              <p className="text-xs text-slate-500">Inicie as leituras bipando o primeiro código de barras.</p>
            </div>
          )}
        </section>

        {/* LISTA RESUMIDA DAS LEITURAS NESTA SESSÃO */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Package size={16} className="text-indigo-400" />
              Itens do Inventário Atual ({sessionList.length})
            </h3>
            <span className="text-xs font-mono font-extrabold text-emerald-400">
              Total Peças: {sessionList.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>

          {sessionList.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-6 font-medium">
              Sua lista de inventário está vazia. Bipe os produtos para acumular as contagens.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sessionList.map((item) => (
                <div
                  key={item.barcode}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs hover:border-slate-700 transition-all"
                >
                  <div className="space-y-0.5 max-w-[65%]">
                    <p className="font-extrabold text-white truncate">{item.brand} - {item.model}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Cor: {item.color} • Barcode: {item.barcode}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-slate-400 block">Qtd</span>
                    <span className="text-base font-black text-emerald-400">{item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* MODAL DE CONFIRMAÇÃO DE FINALIZAÇÃO DE INVENTÁRIO */}
      {isConfirmingFinish && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-emerald-950 border border-emerald-800 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto">
              <Save size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-black text-lg text-white uppercase">Finalizar Inventário?</h3>
              <p className="text-xs text-slate-400">
                Foram lidas <strong>{totalScansCount} peças</strong> em <strong>{sessionList.length} referências</strong>. Deseja salvar todas as alterações de uma vez no Firebase?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setIsConfirmingFinish(false);
                  handleFinalizeInventory();
                }}
                disabled={isSaving}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{isSaving ? 'Salvando no Firebase...' : 'Sim, Salvar Tudo'}</span>
              </button>

              <button
                onClick={() => setIsConfirmingFinish(false)}
                disabled={isSaving}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Continuar Bipando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
