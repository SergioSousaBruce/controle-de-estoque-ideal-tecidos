import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, ArrowUpRight, ArrowDownLeft, RefreshCw, ArrowRightLeft, 
  Plus, Filter, Search, Calendar, Tag, Barcode, User, FileText, 
  CheckCircle2, Download, Package, XCircle, Building2, MapPin
} from 'lucide-react';
import { StockMovement, MovementType } from '../../types';
import { subscribeStockMovements, recordStockMovement } from '../services/stockMovementService';
import { getCachedReferenceByBarcode, getReferenceByBarcode, sanitizeBarcode } from '../services/barcodeFirebaseService';

interface StockMovementHistoryModuleProps {
  currentUserId: string;
  userName?: string;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const StockMovementHistoryModule: React.FC<StockMovementHistoryModuleProps> = ({
  currentUserId,
  userName = 'Operador',
  showToast
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterBarcode, setFilterBarcode] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // New Movement Form State
  const [formType, setFormType] = useState<MovementType>('ENTRADA');
  const [formBarcode, setFormBarcode] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formPreviousQty, setFormPreviousQty] = useState<number>(0);
  const [formMovedQty, setFormMovedQty] = useState<number>(1);
  const [formReason, setFormReason] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscribe to movements real-time
  useEffect(() => {
    const unsubscribe = subscribeStockMovements((list) => {
      setMovements(list);
    });
    return () => unsubscribe();
  }, []);

  // Instant barcode lookup when entering barcode in modal form
  const handleBarcodeLookup = async (code: string) => {
    setFormBarcode(code);
    const clean = sanitizeBarcode(code);
    if (!clean) return;

    let ref = getCachedReferenceByBarcode(clean);
    if (!ref) {
      try {
        ref = await getReferenceByBarcode(clean);
      } catch (e) {
        console.warn('Barcode lookup notice:', e);
      }
    }

    if (ref) {
      if (ref.brand) setFormBrand(ref.brand);
      if (ref.model) setFormModel(ref.model);
      if (ref.color) setFormColor(ref.color);
      
      // Calculate previous quantity from last known movement for this barcode
      const lastMov = movements.find(m => sanitizeBarcode(m.barcode) === clean);
      if (lastMov) {
        setFormPreviousQty(lastMov.finalQty);
      } else {
        const totalRefQty = Object.values(ref.sizes || {}).reduce((a, b) => a + Number(b), 0);
        setFormPreviousQty(totalRefQty || 0);
      }
    }
  };

  // Submit new movement
  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMovedQty || formMovedQty <= 0) {
      showToast('A quantidade movimentada deve ser maior que zero.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      let deltaQty = formMovedQty;
      if (formType === 'SAIDA') {
        deltaQty = -formMovedQty;
      }

      const finalQty = Math.max(0, formPreviousQty + deltaQty);

      await recordStockMovement({
        userId: currentUserId,
        userName,
        brand: formBrand || 'Ideal Tecidos',
        model: formModel || 'N/I',
        color: formColor || 'Padrão',
        barcode: formBarcode || 'S/C',
        previousQty: formPreviousQty,
        movedQty: formType === 'SAIDA' ? -formMovedQty : formMovedQty,
        finalQty,
        type: formType,
        reason: formReason || `${formType} de Estoque Manual`,
        destinationLocation: formType === 'TRANSFERENCIA' ? formDestination : undefined
      });

      showToast(`Movimentação de ${formType} registrada com sucesso!`, 'success');
      
      // Reset form & close modal
      setIsModalOpen(false);
      setFormBarcode('');
      setFormBrand('');
      setFormModel('');
      setFormColor('');
      setFormPreviousQty(0);
      setFormMovedQty(1);
      setFormReason('');
      setFormDestination('');
    } catch (err) {
      console.error('Error creating movement:', err);
      showToast('Erro ao registrar movimentação.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered List Computation
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (filterBrand && !m.brand.toLowerCase().includes(filterBrand.toLowerCase())) return false;
      if (filterModel && !m.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
      if (filterBarcode && !m.barcode.toLowerCase().includes(filterBarcode.toLowerCase())) return false;
      if (filterType !== 'ALL' && m.type !== filterType) return false;
      if (filterDate && !m.date.includes(filterDate)) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchBrand = m.brand.toLowerCase().includes(term);
        const matchModel = m.model.toLowerCase().includes(term);
        const matchBarcode = m.barcode.toLowerCase().includes(term);
        const matchReason = m.reason.toLowerCase().includes(term);
        const matchUser = m.userName.toLowerCase().includes(term);
        if (!matchBrand && !matchModel && !matchBarcode && !matchReason && !matchUser) return false;
      }

      return true;
    });
  }, [movements, filterBrand, filterModel, filterBarcode, filterType, filterDate, searchTerm]);

  // Summary Metrics
  const stats = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let ajustes = 0;
    let transferencias = 0;

    movements.forEach(m => {
      if (m.type === 'ENTRADA') entradas += Math.abs(m.movedQty);
      if (m.type === 'SAIDA') saidas += Math.abs(m.movedQty);
      if (m.type === 'AJUSTE') ajustes += 1;
      if (m.type === 'TRANSFERENCIA') transferencias += 1;
    });

    return { entradas, saidas, ajustes, transferencias };
  }, [movements]);

  return (
    <div className="space-y-6">
      {/* SECTION HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-950 border border-indigo-800 text-indigo-400 rounded-xl">
              <History size={20} />
            </span>
            <h2 className="text-xl font-black uppercase tracking-tight">Histórico de Movimentações</h2>
          </div>
          <p className="text-xs font-bold text-slate-400 mt-1">
            Rastreabilidade completa de entradas, saídas, ajustes e transferências de estoque.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all"
        >
          <Plus size={18} />
          <span>Registrar Movimentação</span>
        </button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Entradas Total</p>
            <p className="text-2xl font-black text-emerald-400">+{stats.entradas}</p>
          </div>
          <div className="p-3 bg-emerald-950 border border-emerald-800/80 rounded-xl text-emerald-400">
            <ArrowDownLeft size={20} />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Saídas Total</p>
            <p className="text-2xl font-black text-rose-400">-{stats.saidas}</p>
          </div>
          <div className="p-3 bg-rose-950 border border-rose-800/80 rounded-xl text-rose-400">
            <ArrowUpRight size={20} />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ajustes</p>
            <p className="text-2xl font-black text-amber-400">{stats.ajustes}</p>
          </div>
          <div className="p-3 bg-amber-950 border border-amber-800/80 rounded-xl text-amber-400">
            <RefreshCw size={20} />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Transferências</p>
            <p className="text-2xl font-black text-blue-400">{stats.transferencias}</p>
          </div>
          <div className="p-3 bg-blue-950 border border-blue-800/80 rounded-xl text-blue-400">
            <ArrowRightLeft size={20} />
          </div>
        </div>
      </div>

      {/* FILTERS BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Filter size={16} className="text-indigo-400" /> Filtros de Busca Avançados
          </span>
          {(filterBrand || filterModel || filterBarcode || filterDate || filterType !== 'ALL' || searchTerm) && (
            <button
              onClick={() => {
                setFilterBrand('');
                setFilterModel('');
                setFilterBarcode('');
                setFilterDate('');
                setFilterType('ALL');
                setSearchTerm('');
              }}
              className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Buscar Geral</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
              />
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Tipo Movimentação</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="ENTRADA">Entrada (+)</option>
              <option value="SAIDA">Saída (-)</option>
              <option value="AJUSTE">Ajuste (=)</option>
              <option value="TRANSFERENCIA">Transferência (➔)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Marca</label>
            <input
              type="text"
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              placeholder="Ex: Moleca, Beira Rio"
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Modelo</label>
            <input
              type="text"
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              placeholder="Ex: Sandália Ref 123"
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Código de Barras</label>
            <input
              type="text"
              value={filterBarcode}
              onChange={(e) => setFilterBarcode(e.target.value)}
              placeholder="Código EAN..."
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Data</label>
            <input
              type="text"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              placeholder="DD/MM/YYYY"
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* MOVEMENTS TABLE LIST */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300">
            Registros Encontrados: <strong className="text-emerald-400">{filteredMovements.length}</strong>
          </span>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <History size={40} className="mx-auto opacity-30" />
            <p className="text-sm font-bold">Nenhuma movimentação registrada com estes filtros</p>
            <p className="text-xs text-slate-600">Registre novas movimentações ou altere os parâmetros de busca.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                  <th className="py-3 px-3">Data / Hora</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Marca & Modelo</th>
                  <th className="py-3 px-3">Código Barras</th>
                  <th className="py-3 px-3 text-center">Anterior</th>
                  <th className="py-3 px-3 text-center">Movimentado</th>
                  <th className="py-3 px-3 text-center">Final</th>
                  <th className="py-3 px-3">Usuário & Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredMovements.map((mov) => (
                  <tr key={mov.id} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-white">{mov.date}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{mov.time}</div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border inline-flex items-center gap-1 ${
                        mov.type === 'ENTRADA' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                        mov.type === 'SAIDA' ? 'bg-rose-950 text-rose-400 border-rose-800' :
                        mov.type === 'TRANSFERENCIA' ? 'bg-blue-950 text-blue-400 border-blue-800' :
                        'bg-amber-950 text-amber-400 border-amber-800'
                      }`}>
                        {mov.type === 'ENTRADA' && <ArrowDownLeft size={12} />}
                        {mov.type === 'SAIDA' && <ArrowUpRight size={12} />}
                        {mov.type === 'TRANSFERENCIA' && <ArrowRightLeft size={12} />}
                        {mov.type === 'AJUSTE' && <RefreshCw size={12} />}
                        <span>{mov.type}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="font-extrabold text-white">{mov.brand}</div>
                      <div className="text-slate-400 text-[11px]">{mov.model} ({mov.color})</div>
                    </td>

                    <td className="py-3.5 px-3 font-mono text-slate-300">
                      {mov.barcode}
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                      {mov.previousQty}
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono font-black text-sm">
                      <span className={mov.movedQty > 0 ? 'text-emerald-400' : mov.movedQty < 0 ? 'text-rose-400' : 'text-slate-300'}>
                        {mov.movedQty > 0 ? `+${mov.movedQty}` : mov.movedQty}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono font-black text-sm text-white">
                      {mov.finalQty}
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="text-slate-300 font-bold flex items-center gap-1">
                        <User size={12} className="text-slate-500" />
                        <span>{mov.userName}</span>
                      </div>
                      <div className="text-slate-500 text-[11px] italic truncate max-w-xs">
                        {mov.reason}
                        {mov.destinationLocation && ` ➔ ${mov.destinationLocation}`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR NOVA MOVIMENTAÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white uppercase tracking-tight flex items-center gap-2">
                <Plus size={20} className="text-emerald-400" /> Registrar Movimentação
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateMovement} className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['ENTRADA', 'SAIDA', 'AJUSTE', 'TRANSFERENCIA'] as MovementType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      className={`py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${
                        formType === t
                          ? t === 'ENTRADA' ? 'bg-emerald-600 text-white border-emerald-500'
                          : t === 'SAIDA' ? 'bg-rose-600 text-white border-rose-500'
                          : t === 'TRANSFERENCIA' ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-amber-600 text-white border-amber-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Código de Barras (Consulta Automática)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formBarcode}
                    onChange={(e) => handleBarcodeLookup(e.target.value)}
                    placeholder="Bipe ou digite o código EAN..."
                    className="w-full bg-slate-950 border border-slate-800 text-white font-mono px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                  <Barcode size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Marca</label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="Ex: Moleca"
                    className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Modelo / Ref.</label>
                  <input
                    type="text"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder="Ex: Sapatilha Sola Alta"
                    className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cor</label>
                  <input
                    type="text"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="Preto, Nude..."
                    className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Qtd. Anterior</label>
                  <input
                    type="number"
                    value={formPreviousQty}
                    onChange={(e) => setFormPreviousQty(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 text-white font-mono font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Qtd. Movimentada</label>
                  <input
                    type="number"
                    min="1"
                    value={formMovedQty}
                    onChange={(e) => setFormMovedQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-black text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {formType === 'TRANSFERENCIA' && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Local / Loja de Destino</label>
                  <input
                    type="text"
                    value={formDestination}
                    onChange={(e) => setFormDestination(e.target.value)}
                    placeholder="Ex: Depósito Filial 02"
                    className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Motivo / Observação</label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Ex: Recebimento de NF 4022, Venda balcão, Transferência de setor..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/40"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
