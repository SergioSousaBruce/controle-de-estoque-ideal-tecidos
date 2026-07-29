import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Barcode, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  RefreshCw, 
  Plus, 
  Minus, 
  Trash2, 
  History, 
  ChevronRight, 
  Calendar, 
  Clock, 
  Package, 
  Tag, 
  Layers, 
  ArrowRight, 
  X,
  Edit2,
  List,
  Sparkles,
  Check,
  AlertTriangle,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  Unlock
} from 'lucide-react';
import { 
  BarcodeReference, 
  getReferenceByBarcode, 
  saveBarcodeReference, 
  getAllBarcodeReferences, 
  deleteBarcodeReference,
  sanitizeBarcode,
  buscarProdutoPorCodigo,
  verificarCodigoDuplicado,
  cadastrarCodigo,
  atualizarProdutoPorCodigo
} from '../services/barcodeFirebaseService';
import { SizeGridType, InventoryCount } from '../../types';
import { PRODUCT_TYPES, LETTER_SIZES, NUMERIC_SIZES, MONTHS, YEARS, getGenderFromProductType, getDefaultProductTypeFromGender, syncProductTypeWithGender } from '../../constants';
import { DEFAULT_BRANDS_LIST } from '../services/inventoryDb';

interface BarcodeScannerManagerProps {
  currentUserId: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onReferenceSaved?: (ref: BarcodeReference) => void;
  onSelectForCounting?: (itemData: Partial<InventoryCount> & { barcode: string }) => void;
  activeLockedReference?: {
    barcode: string;
    brand: string;
    model: string;
    color?: string;
  } | null;
  onFinishActiveReference?: () => void;
}

export const BarcodeScannerManager: React.FC<BarcodeScannerManagerProps> = ({ 
  currentUserId, 
  showToast,
  onReferenceSaved,
  onSelectForCounting,
  activeLockedReference,
  onFinishActiveReference
}) => {
  // Input & Lookup States
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Active Lookup Result
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [existingRef, setExistingRef] = useState<BarcodeReference | null>(null);
  const [isNewReference, setIsNewReference] = useState<boolean>(false);
  
  // Confirmation state before editing/updating
  const [isConfirmedToEdit, setIsConfirmedToEdit] = useState<boolean>(false);

  // Form State for Registration or Update
  const [formData, setFormData] = useState<{
    barcode: string;
    brand: string;
    model: string;
    productType: string;
    color: string;
    arrivalMonth: string;
    arrivalYear: string;
    gridType: SizeGridType;
    sizes: Record<string, number>;
    total: number;
    gender: string;
  }>({
    barcode: '',
    brand: '',
    model: '',
    productType: 'Tênis Adulto Masculino',
    color: '',
    arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    arrivalYear: new Date().getFullYear().toString(),
    gridType: 'NUMERIC',
    sizes: {},
    total: 0,
    gender: 'M'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [newSizeInput, setNewSizeInput] = useState('');

  // Firebase Database list & Tab selection
  const [activeTab, setActiveTab] = useState<'SCAN' | 'DATABASE'>('SCAN');
  const [databaseList, setDatabaseList] = useState<BarcodeReference[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbSearchTerm, setDbSearchTerm] = useState('');
  const [selectedHistoryRef, setSelectedHistoryRef] = useState<BarcodeReference | null>(null);

  // Safety Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Debounce & Concurrency Control Refs for Firestore Barcode Lookups
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSearchingRef = useRef<boolean>(false);
  const lastSearchedCodeRef = useRef<string>('');

  // Cleanup pending search timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Auto-focus input on mount or tab change
  useEffect(() => {
    if (activeTab === 'SCAN') {
      setTimeout(() => barcodeInputRef.current?.focus(), 150);
    } else {
      loadDatabaseList();
    }
  }, [activeTab]);

  const loadDatabaseList = async () => {
    setIsLoadingDb(true);
    try {
      const list = await getAllBarcodeReferences();
      setDatabaseList(list);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar banco de dados de códigos', 'error');
    } finally {
      setIsLoadingDb(false);
    }
  };

  const handleBarcodeSearchDirect = async (codeToSearch: string) => {
    const clean = sanitizeBarcode(codeToSearch);
    if (!clean) return;

    // Prevent duplicate simultaneous requests while a lookup is actively in progress
    if (isSearchingRef.current) {
      return;
    }

    // Cancel any scheduled debounced search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    isSearchingRef.current = true;
    setIsSearching(true);
    setScannedCode(clean);
    setIsConfirmedToEdit(false);
    lastSearchedCodeRef.current = clean;

    try {
      const found = await getReferenceByBarcode(clean);

      const targetBrand = found ? (found.brand || '') : '';
      const targetModel = found ? (found.model || '') : '';
      const targetGender = found ? (found.gender || getGenderFromProductType(found.productType, '') || 'M') : '';
      const targetProductType = found ? (found.productType || getDefaultProductTypeFromGender(targetGender, '') || '') : '';
      const targetColor = found ? (found.color || '') : '';
      const targetMonth = found ? (found.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0')) : (new Date().getMonth() + 1).toString().padStart(2, '0');
      const targetYear = found ? (found.arrivalYear || new Date().getFullYear().toString()) : new Date().getFullYear().toString();
      const targetGrid = found ? (found.gridType || 'NUMERIC') : 'NUMERIC';
      const targetSizes = found ? { ...(found.sizes || {}) } : {};
      const targetTotal = found ? (found.total || 0) : 0;

      if (found) {
        setExistingRef(found);
        setIsNewReference(false);
        setIsConfirmedToEdit(true);
        setFormData({
          barcode: found.barcode,
          brand: targetBrand,
          model: targetModel,
          productType: targetProductType,
          color: targetColor,
          arrivalMonth: targetMonth,
          arrivalYear: targetYear,
          gridType: targetGrid,
          sizes: targetSizes,
          total: targetTotal,
          gender: targetGender
        });
        showToast(`Produto Localizado: ${found.brand} ${found.model}`, 'success');
      } else {
        setExistingRef(null);
        setIsNewReference(true);
        setIsConfirmedToEdit(true);

        const initialSizes: Record<string, number> = {};
        NUMERIC_SIZES.slice(0, 8).forEach(s => { initialSizes[s] = 0; });

        setFormData({
          barcode: clean,
          brand: '',
          model: '',
          productType: 'Tênis Adulto Masculino',
          color: '',
          arrivalMonth: targetMonth,
          arrivalYear: targetYear,
          gridType: 'NUMERIC',
          sizes: initialSizes,
          total: 0,
          gender: 'M'
        });

        showToast('Código lido! Direcionando para tela de cadastro/contagem...', 'success');
      }

      if (onSelectForCounting) {
        onSelectForCounting({
          barcode: clean,
          brand: targetBrand,
          model: targetModel,
          productType: targetProductType,
          color: targetColor,
          arrivalMonth: targetMonth,
          arrivalYear: targetYear,
          gridType: targetGrid,
          sizes: targetSizes,
          total: targetTotal,
          gender: targetGender
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao consultar Firebase', 'error');
    } finally {
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  };

  // Debounced input change for barcode scanner typing / fast inputs
  const handleBarcodeInputChange = (value: string) => {
    setBarcodeInput(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    const clean = sanitizeBarcode(value);
    // Automatically trigger debounced lookup when barcode reaches full scan length (e.g. >= 8 digits)
    if (clean.length >= 8 && clean !== lastSearchedCodeRef.current && !isSearchingRef.current) {
      searchTimeoutRef.current = setTimeout(() => {
        handleBarcodeSearchDirect(clean);
      }, 350);
    }
  };

  // Perform Lookup in Firebase
  const handleBarcodeSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    const rawCode = barcodeInput.trim();
    if (!rawCode) {
      showToast('Digite ou bipe um código de barras', 'error');
      return;
    }
    await handleBarcodeSearchDirect(rawCode);
  };

  // Switch size grid type (LETTER vs NUMERIC)
  const handleGridTypeChange = (newType: SizeGridType) => {
    const defaultSizes = newType === 'LETTER' ? LETTER_SIZES : NUMERIC_SIZES;
    const initialSizes: Record<string, number> = {};
    defaultSizes.forEach(s => {
      initialSizes[s] = formData.sizes[s] || 0;
    });

    const newTotal = Object.values(initialSizes).reduce((a, b) => a + (b || 0), 0);

    setFormData(prev => ({
      ...prev,
      gridType: newType,
      sizes: initialSizes,
      total: newTotal
    }));
  };

  // Adjust quantity for a size
  const updateSizeQty = (size: string, value: number) => {
    const cleanQty = Math.max(0, isNaN(value) ? 0 : value);
    setFormData(prev => {
      const updatedSizes = { ...prev.sizes, [size]: cleanQty };
      const newTotal = Object.values(updatedSizes).reduce((sum, val) => sum + (val || 0), 0);
      return {
        ...prev,
        sizes: updatedSizes,
        total: newTotal
      };
    });
  };

  const adjustSizeQty = (size: string, delta: number) => {
    const current = formData.sizes[size] || 0;
    updateSizeQty(size, current + delta);
  };

  const handleAddCustomSize = () => {
    const s = newSizeInput.trim().toUpperCase();
    if (!s) return;
    if (formData.sizes[s] !== undefined) {
      showToast('Este tamanho já está na grade', 'error');
      setNewSizeInput('');
      return;
    }
    updateSizeQty(s, 0);
    setNewSizeInput('');
  };

  // Initiate Save - Opens Safety Confirmation Modal showing stock differences
  const handleInitiateSave = () => {
    if (!formData.barcode.trim()) {
      showToast('O Código de Barras é obrigatório', 'error');
      return;
    }
    if (!formData.brand.trim() || !formData.model.trim()) {
      showToast('Por favor, preencha a Marca e o Modelo do produto', 'error');
      return;
    }
    setShowConfirmModal(true);
  };

  // Final Save to Firebase after User Confirmation
  const handleConfirmAndSaveToFirebase = async () => {
    setShowConfirmModal(false);
    setIsSaving(true);
    try {
      const savedRef = await saveBarcodeReference({
        barcode: formData.barcode,
        brand: formData.brand,
        model: formData.model,
        productType: formData.productType,
        color: formData.color,
        arrivalMonth: formData.arrivalMonth,
        arrivalYear: formData.arrivalYear,
        gridType: formData.gridType,
        sizes: formData.sizes,
        total: formData.total,
        gender: formData.gender,
        userId: currentUserId
      }, !isNewReference, existingRef);

      showToast(
        isNewReference 
          ? `Sucesso: Nova referência ${savedRef.brand} - ${savedRef.model} cadastrada no Firebase!` 
          : `Sucesso: Estoque de ${savedRef.brand} - ${savedRef.model} substituído e auditado no Firebase!`,
        'success'
      );

      if (onReferenceSaved) {
        onReferenceSaved(savedRef);
      }

      // Auto-reset search and form state for next barcode scan
      setBarcodeInput('');
      setScannedCode(null);
      setExistingRef(null);
      setIsNewReference(false);
      setIsConfirmedToEdit(false);

      if (activeTab === 'DATABASE') {
        loadDatabaseList();
      }

      setTimeout(() => barcodeInputRef.current?.focus(), 300);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar no Firebase', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset current search
  const handleClearSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    lastSearchedCodeRef.current = '';
    setBarcodeInput('');
    setScannedCode(null);
    setExistingRef(null);
    setIsNewReference(false);
    setIsConfirmedToEdit(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 150);
  };

  // Delete from Firebase
  const handleDeleteRef = async (barcodeToDelete: string) => {
    if (!confirm(`Tem certeza que deseja excluir o código [${barcodeToDelete}] do Firebase?`)) return;
    try {
      await deleteBarcodeReference(barcodeToDelete);
      showToast('Registro excluído do Firebase com sucesso', 'success');
      loadDatabaseList();
    } catch (err) {
      showToast('Erro ao excluir do Firebase', 'error');
    }
  };

  // Select item from DB list to edit/update count
  const handleSelectFromDb = (item: BarcodeReference) => {
    setBarcodeInput(item.barcode);
    setScannedCode(item.barcode);
    setExistingRef(item);
    setIsNewReference(false);
    setIsConfirmedToEdit(true);

    setFormData({
      barcode: item.barcode,
      brand: item.brand || '',
      model: item.model || '',
      productType: item.productType || 'Calçado Feminino',
      color: item.color || '',
      arrivalMonth: item.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
      arrivalYear: item.arrivalYear || new Date().getFullYear().toString(),
      gridType: item.gridType || 'NUMERIC',
      sizes: { ...(item.sizes || {}) },
      total: item.total || 0,
      gender: item.gender || 'F'
    });

    setActiveTab('SCAN');
  };

  const filteredDbList = databaseList.filter(item => {
    const term = dbSearchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      item.barcode.toLowerCase().includes(term) ||
      (item.brand || '').toLowerCase().includes(term) ||
      (item.model || '').toLowerCase().includes(term) ||
      (item.color || '').toLowerCase().includes(term) ||
      (item.productType || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 p-2 sm:p-4">
      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('SCAN')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'SCAN'
                ? 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-md shadow-red-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Leitura / Consulta Código de Barras</span>
          </button>
          <button
            onClick={() => setActiveTab('DATABASE')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'DATABASE'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <List className="w-4 h-4" />
            <span>Itens no Firebase ({databaseList.length})</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-5-00 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 rounded-lg">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-medium">Firebase Conectado: Chave Única = Código de Barras</span>
        </div>
      </div>

      {activeTab === 'SCAN' && (
        <div className="space-y-6">
          {activeLockedReference && (
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-4 sm:p-5 rounded-2xl shadow-xl border border-indigo-500/30 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/30 shrink-0">
                    <Lock size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Contagem da Marca em Andamento
                      </span>
                      {activeLockedReference.barcode && (
                        <span className="font-mono text-xs font-bold text-white/70">
                          • {activeLockedReference.barcode}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-black uppercase text-white mt-0.5">
                      Marca: <span className="text-emerald-300">{activeLockedReference.brand || 'Não Informada'}</span>
                      {activeLockedReference.model && <span className="text-white/80 font-normal ml-2">• Ref: {activeLockedReference.model}</span>}
                    </p>
                  </div>
                </div>

                {onFinishActiveReference && (
                  <button
                    type="button"
                    onClick={onFinishActiveReference}
                    className="w-full sm:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
                  >
                    <CheckCircle2 size={16} />
                    Concluir Marca Atual
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BARCODE SCANNER / INPUT BANNER */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Barcode className="w-5 h-5 text-red-600" />
                  <span>Consultar Código de Barras no Firebase</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Bipe com o leitor ou digite o código de barras para carregar ou cadastrar.
                </p>
              </div>

              {scannedCode && (
                <button
                  onClick={handleClearSearch}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar Busca</span>
                </button>
              )}
            </div>

            <form onSubmit={handleBarcodeSearch} className="relative flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => handleBarcodeInputChange(e.target.value)}
                  placeholder="Bipe ou digite o código de barras (Ex: 7891234567890)"
                  className="w-full pl-11 pr-10 py-3.5 text-base font-mono font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none"
                  autoComplete="off"
                />
                {barcodeInput && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSearching || !barcodeInput.trim()}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-red-600/20"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Consultando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Consultar Firebase</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* LOOKUP RESULT SECTION */}
          {scannedCode && (
            <AnimatePresence mode="wait">
              {/* CASE 1: EXISTING BARCODE IN FIREBASE */}
              {!isNewReference && existingRef && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Status Banner */}
                  <div className="bg-emerald-500/10 border-2 border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-emerald-500 text-white rounded-xl mt-0.5">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white">
                            Código Já Cadastrado no Firebase
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            ID: {existingRef.barcode}
                          </span>
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                          {existingRef.brand} — {existingRef.model}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          Cor: <strong className="text-slate-800 dark:text-slate-100">{existingRef.color || 'Padrão'}</strong> | 
                          Categoria: <strong className="text-slate-800 dark:text-slate-100">{existingRef.productType}</strong> | 
                          Chegada: <strong className="text-slate-800 dark:text-slate-100">{existingRef.arrivalMonth}/{existingRef.arrivalYear}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:border-l border-emerald-200 dark:border-emerald-800/50 sm:pl-6 pt-2 sm:pt-0 w-full sm:w-auto">
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">Contagem Anterior</span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        {existingRef.total} <span className="text-sm font-normal text-slate-600 dark:text-slate-300">peças</span>
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Última atualização: {new Date(existingRef.updatedAt || existingRef.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Confirmation Step */}
                  {!isConfirmedToEdit ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-sm">
                      <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                        <Check className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                          Confirmação de Leitura
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1">
                          Localizamos os dados do produto <strong>{existingRef.brand} {existingRef.model}</strong>. Deseja carregar as informações para realizar uma nova contagem ou atualização?
                        </p>
                      </div>

                      {/* Display breakdown of previous count */}
                      <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 max-w-lg mx-auto text-left">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          Grade Anterior em Estoque:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(existingRef.sizes || {}).map(([size, qty]) => (
                            <div key={size} className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center gap-1.5">
                              <span className="font-bold text-slate-700 dark:text-slate-300">{size}:</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{qty} un</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                          onClick={() => setIsConfirmedToEdit(true)}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Sim, Carregar para Atualizar Contagem</span>
                        </button>
                        <button
                          onClick={handleClearSearch}
                          className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl transition-all"
                        >
                          Buscar Outro Código
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* FORM TO UPDATE EXISTING REFERENCE */
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-emerald-600" />
                          <span>Atualização de Referência e Nova Contagem</span>
                        </h4>
                        <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-1 rounded-md font-mono">
                          Código: {formData.barcode}
                        </span>
                      </div>

                      {/* Product Metadata Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Código de Barras *
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={formData.barcode}
                              onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                              placeholder="Código de barras"
                              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <Barcode className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Marca *
                          </label>
                          <input
                            type="text"
                            value={formData.brand}
                            onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Modelo *
                          </label>
                          <input
                            type="text"
                            value={formData.model}
                            onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Cor / Descrição
                          </label>
                          <input
                            type="text"
                            value={formData.color}
                            onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Mês de Chegada
                          </label>
                          <select
                            value={formData.arrivalMonth}
                            onChange={(e) => setFormData(prev => ({ ...prev, arrivalMonth: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          >
                            <option value="">Selecione o mês...</option>
                            {MONTHS.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Ano de Chegada
                          </label>
                          <select
                            value={formData.arrivalYear}
                            onChange={(e) => setFormData(prev => ({ ...prev, arrivalYear: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          >
                            {YEARS.map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* SIZE GRID COUNTERS */}
                      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Layers className="w-4 h-4 text-red-600" />
                            <span>Nova Contagem por Numeração (Grade)</span>
                          </label>

                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => handleGridTypeChange('NUMERIC')}
                              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                                formData.gridType === 'NUMERIC'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Numérica (33-44)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGridTypeChange('LETTER')}
                              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                                formData.gridType === 'LETTER'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Letras (P-GG)
                            </button>
                          </div>
                        </div>

                        {/* Size Counter Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {Object.keys(formData.sizes).map(size => {
                            const qty = formData.sizes[size] || 0;
                            return (
                              <div
                                key={size}
                                className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2"
                              >
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block uppercase">
                                  Tam {size}
                                </span>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => adjustSizeQty(size, -1)}
                                    className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-red-100 hover:text-red-600 rounded-lg transition-all"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={qty === 0 ? '' : qty}
                                    onChange={(e) => updateSizeQty(size, parseInt(e.target.value, 10) || 0)}
                                    placeholder="0"
                                    className="w-14 text-center font-black text-base bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-red-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => adjustSizeQty(size, 1)}
                                    className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-emerald-100 hover:text-emerald-600 rounded-lg transition-all"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add Custom Size */}
                        <div className="flex items-center gap-2 pt-2">
                          <input
                            type="text"
                            value={newSizeInput}
                            onChange={(e) => setNewSizeInput(e.target.value)}
                            placeholder="Adicionar tamanho extra (Ex: 33, G1)"
                            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomSize}
                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-lg"
                          >
                            + Adicionar Tamanho
                          </button>
                        </div>
                      </div>

                      {/* Total Bar & Submit Button */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl">
                        <div>
                          <span className="text-xs text-slate-500 block">Comparativo de Contagem</span>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                              Anterior: <strong>{existingRef.total} un</strong>
                            </span>
                            <ArrowRight className="w-4 h-4 text-slate-400" />
                            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                              Novo Total: {formData.total} peças
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleInitiateSave}
                            disabled={isSaving}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                          >
                            {isSaving ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Salvando no Firebase...</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                <span>Atualizar Registro no Firebase</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* CASE 2: NEW REFERENCE (BARCODE NOT FOUND IN FIREBASE) */}
              {isNewReference && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Status Banner */}
                  <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-amber-500 text-white rounded-xl mt-0.5">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500 text-white">
                            Nova Referência
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Código: {scannedCode}
                          </span>
                        </div>
                        <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
                          Código de barras não cadastrado no Firebase
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          Preencha as informações abaixo para cadastrar esta referência no banco de dados. Nas próximas contagens, basta bipar este código!
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* INITIAL REGISTRATION FORM */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Plus className="w-4 h-4 text-red-600" />
                        <span>Formulário de Cadastro Inicial</span>
                      </h4>
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md font-mono">
                        Chave Firebase: {formData.barcode}
                      </span>
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Código de Barras *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.barcode}
                            onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                            placeholder="Digite ou bipe o código de barras"
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
                          />
                          <Barcode className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Marca *
                        </label>
                        <input
                          type="text"
                          list="brand-suggestions"
                          value={formData.brand}
                          onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                          placeholder="Digite ou selecione a marca"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
                        />
                        <datalist id="brand-suggestions">
                          {DEFAULT_BRANDS_LIST.map(b => (
                            <option key={b} value={b} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Modelo / Referência *
                        </label>
                        <input
                          type="text"
                          value={formData.model}
                          onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                          placeholder="Ex: Revolution 7, Sapatilha Comfort"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Cor / Variante
                        </label>
                        <input
                          type="text"
                          value={formData.color}
                          onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                          placeholder="Ex: Preto, Nude, Branco"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Tipo de Produto / Categoria
                        </label>
                        <select
                          value={formData.productType}
                          onChange={(e) => setFormData(prev => ({ ...prev, productType: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none"
                        >
                          {PRODUCT_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Mês de Chegada
                        </label>
                        <select
                          value={formData.arrivalMonth}
                          onChange={(e) => setFormData(prev => ({ ...prev, arrivalMonth: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none"
                        >
                          <option value="">Selecione o mês...</option>
                          {MONTHS.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Ano de Chegada
                        </label>
                        <select
                          value={formData.arrivalYear}
                          onChange={(e) => setFormData(prev => ({ ...prev, arrivalYear: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none"
                        >
                          {YEARS.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* SIZE GRID COUNTERS */}
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-red-600" />
                          <span>Quantidade Inicial por Numeração (Grade)</span>
                        </label>

                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleGridTypeChange('NUMERIC')}
                            className={`px-3 py-1 rounded-md font-semibold transition-all ${
                              formData.gridType === 'NUMERIC'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Numérica (33-44)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGridTypeChange('LETTER')}
                            className={`px-3 py-1 rounded-md font-semibold transition-all ${
                              formData.gridType === 'LETTER'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Letras (P-GG)
                          </button>
                        </div>
                      </div>

                      {/* Size counter grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {Object.keys(formData.sizes).map(size => {
                          const qty = formData.sizes[size] || 0;
                          return (
                            <div
                              key={size}
                              className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2"
                            >
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block uppercase">
                                Tam {size}
                              </span>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => adjustSizeQty(size, -1)}
                                  className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-red-100 hover:text-red-600 rounded-lg transition-all"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={qty === 0 ? '' : qty}
                                  onChange={(e) => updateSizeQty(size, parseInt(e.target.value, 10) || 0)}
                                  placeholder="0"
                                  className="w-14 text-center font-black text-base bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-red-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => adjustSizeQty(size, 1)}
                                  className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-emerald-100 hover:text-emerald-600 rounded-lg transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add custom size */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          value={newSizeInput}
                          onChange={(e) => setNewSizeInput(e.target.value)}
                          placeholder="Adicionar tamanho extra"
                          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomSize}
                          className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-lg"
                        >
                          + Adicionar Tamanho
                        </button>
                      </div>
                    </div>

                    {/* Total Bar & Submit Button */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl">
                      <div>
                        <span className="text-xs text-slate-500 block">Total Geral Calculado</span>
                        <span className="text-xl font-black text-red-600 dark:text-red-400">
                          {formData.total} peças em estoque
                        </span>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handleClearSearch}
                          className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleInitiateSave}
                          disabled={isSaving}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-600/20 transition-all"
                        >
                          {isSaving ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Salvando no Firebase...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Salvar Nova Referência no Firebase</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* DATABASE TAB: VIEW ALL FIREBASE BARCODE REFERENCES */}
      {activeTab === 'DATABASE' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={dbSearchTerm}
                onChange={(e) => setDbSearchTerm(e.target.value)}
                placeholder="Filtrar por código de barras, marca, modelo ou cor..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <button
              onClick={loadDatabaseList}
              disabled={isLoadingDb}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDb ? 'animate-spin' : ''}`} />
              <span>Atualizar Lista</span>
            </button>
          </div>

          {isLoadingDb ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
              <span>Carregando itens cadastrados no Firebase...</span>
            </div>
          ) : filteredDbList.length === 0 ? (
            <div className="py-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <Barcode className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Nenhum código de barras cadastrado no Firebase {dbSearchTerm ? 'com esse filtro' : ''}.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Bipe um código na aba "Leitura" para cadastrar sua primeira referência!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDbList.map(item => (
                <div
                  key={item.barcode}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-2xl p-4 shadow-sm transition-all flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-slate-800 dark:text-slate-200">
                        {item.barcode}
                      </span>
                      <span className="text-xs font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2.5 py-1 rounded-md">
                        {item.total} un
                      </span>
                    </div>

                    <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                      {item.brand} — {item.model}
                    </h4>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {item.productType} | Cor: {item.color || '-'} | Chegada: {item.arrivalMonth}/{item.arrivalYear}
                    </p>

                    {/* Grade preview */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {Object.entries(item.sizes || {})
                        .filter(([_, qty]) => qty > 0)
                        .map(([size, qty]) => (
                          <span
                            key={size}
                            className="text-[11px] font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300"
                          >
                            {size}: <strong className="text-slate-900 dark:text-white">{qty}</strong>
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-400">
                    <span>Atualizado: {new Date(item.updatedAt || item.createdAt).toLocaleDateString('pt-BR')}</span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedHistoryRef(item)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg flex items-center gap-1 font-semibold"
                        title="Ver histórico de atualizações"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Histórico</span>
                      </button>

                      <button
                        onClick={() => handleSelectFromDb(item)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Carregar / Nova Contagem</span>
                      </button>

                      <button
                        onClick={() => handleDeleteRef(item.barcode)}
                        className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg"
                        title="Excluir do Firebase"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HISTORY MODAL */}
      {selectedHistoryRef && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-red-600" />
                  <span>Histórico de Atualizações</span>
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {selectedHistoryRef.brand} {selectedHistoryRef.model} ({selectedHistoryRef.barcode})
                </p>
              </div>
              <button
                onClick={() => setSelectedHistoryRef(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!selectedHistoryRef.countHistory || selectedHistoryRef.countHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhum histórico registrado ainda.</p>
            ) : (
              <div className="space-y-3">
                {selectedHistoryRef.countHistory.map((h, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>{h.dateFormatted || new Date(h.date).toLocaleString('pt-BR')}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{h.total} peças</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{h.note || 'Atualização de Contagem'}</p>
                    <div className="flex flex-wrap gap-1 text-[11px] pt-1">
                      {Object.entries(h.sizes || {}).map(([sz, q]) => (
                        <span key={sz} className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                          {sz}: {q}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setSelectedHistoryRef(null)}
              className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
            >
              Fechar
            </button>
          </div>
        </div>
      )}



      {/* SAFETY CONFIRMATION MODAL - DIFFERENCES BREAKDOWN */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600 text-white rounded-xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">
                    Confirmar Atualização de Estoque
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Confira as diferenças antes de substituir os dados no Firebase.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product & User Summary Card */}
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-bold block text-[10px]">Produto</span>
                  <strong className="text-slate-900 dark:text-white text-sm">{formData.brand} — {formData.model}</strong>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block text-[10px]">Código de Barras</span>
                  <strong className="font-mono text-slate-800 dark:text-slate-200 text-xs bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">{formData.barcode}</strong>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block text-[10px]">Cor / Variante</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{formData.color || 'Padrão'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block text-[10px]">Responsável</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{currentUserId} ({new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</span>
                </div>
              </div>
            </div>

            {/* Differences Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Relatório de Diferenças por Numeração</span>
                <span className="text-[10px] text-slate-400 lowercase font-normal">(Estoque digitado substituirá o anterior)</span>
              </h4>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Tamanho</th>
                      <th className="px-3 py-2 text-center">Estoque Anterior</th>
                      <th className="px-3 py-2 text-center">Novo Digitado</th>
                      <th className="px-3 py-2 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {Array.from(new Set([
                      ...Object.keys(existingRef?.sizes || {}),
                      ...Object.keys(formData.sizes || {})
                    ])).map(size => {
                      const oldQ = existingRef?.sizes?.[size] || 0;
                      const newQ = formData.sizes?.[size] || 0;
                      const diff = newQ - oldQ;
                      return (
                        <tr key={size} className="hover:bg-slate-50 dark:hover:bg-slate-950/50">
                          <td className="px-3 py-2 font-bold text-slate-900 dark:text-white uppercase">Tam {size}</td>
                          <td className="px-3 py-2 text-center text-slate-500 font-semibold">{oldQ} un</td>
                          <td className="px-3 py-2 text-center font-bold text-slate-900 dark:text-white">{newQ} un</td>
                          <td className="px-3 py-2 text-right font-black">
                            {diff > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded font-mono">
                                +{diff} un
                              </span>
                            ) : diff < 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded font-mono">
                                {diff} un
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white">
                    <tr>
                      <td className="px-3 py-2.5">Total Geral</td>
                      <td className="px-3 py-2.5 text-center">{existingRef?.total || 0} un</td>
                      <td className="px-3 py-2.5 text-center text-red-600 dark:text-red-400">{formData.total} un</td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formData.total - (existingRef?.total || 0) > 0 
                          ? `+${formData.total - (existingRef?.total || 0)} un`
                          : `${formData.total - (existingRef?.total || 0)} un`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Voltar e Corrigir
              </button>

              <button
                type="button"
                onClick={handleConfirmAndSaveToFirebase}
                disabled={isSaving}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Salvando no Firebase...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Substituir Estoque no Firebase</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
