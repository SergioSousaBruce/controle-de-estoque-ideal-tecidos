import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  Save, 
  Search, 
  Download, 
  Barcode, 
  CheckCircle2, 
  AlertCircle, 
  LayoutGrid, 
  ClipboardList, 
  User, 
  Calendar, 
  Clock, 
  ArrowRight, 
  FileSpreadsheet, 
  FileText,
  X,
  Printer,
  Eye,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  XCircle,
  Camera,
  Layers,
  Tag
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ShoeBrand, ShoeProduct, ShoeInventory } from '../../types';
import { 
  getLocalBrands, 
  saveLocalBrand, 
  deleteLocalBrand, 
  getLocalProducts, 
  getLocalProductByBarcode, 
  saveLocalProduct, 
  getLocalInventories, 
  saveLocalInventory, 
  deleteLocalInventory, 
  syncLocalToCloud,
  syncCloudToLocal,
  seedDemoProductsIfNeeded,
  getBrandIdFromName
} from '../services/inventoryDb';
import { 
  getReferenceByBarcode, 
  saveBarcodeReference, 
  verificarCodigoDuplicado, 
  buscarProdutoPorCodigo, 
  cadastrarCodigo, 
  atualizarProdutoPorCodigo 
} from '../services/barcodeFirebaseService';
import { PRODUCT_TYPES, NUMERIC_SIZES, LETTER_SIZES, MONTHS, YEARS } from '../../constants';

interface ShoeInventoryManagerProps {
  currentUserId: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ShoeInventoryManager: React.FC<ShoeInventoryManagerProps> = ({ currentUserId, showToast }) => {
  // Tabs & Views
  const [activeTab, setActiveTab] = useState<'COUNTS' | 'HISTORY' | 'MANAGE'>('COUNTS');
  
  // Database States
  const [brands, setBrands] = useState<ShoeBrand[]>([]);
  const [inventories, setInventories] = useState<ShoeInventory[]>([]);
  const [products, setProducts] = useState<ShoeProduct[]>([]);
  
  // Navigation sub-views (inside tabs)
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const [activeCountSession, setActiveCountSession] = useState<ShoeInventory | null>(null);
  const [detailedSession, setDetailedSession] = useState<ShoeInventory | null>(null);
  
  // 2-Step New Count Workflow Form states
  const [isStartingNewSession, setIsStartingNewSession] = useState(false);
  const [newCountStep, setNewCountStep] = useState<1 | 2>(1);
  const [newCountBarcode, setNewCountBarcode] = useState('');
  const [newCountProductFound, setNewCountProductFound] = useState(false);
  const [isNewCountCameraActive, setIsNewCountCameraActive] = useState(false);
  const newCountQrRef = useRef<Html5Qrcode | null>(null);
  const newCountBarcodeRef = useRef<HTMLInputElement>(null);

  const [newSessionForm, setNewSessionForm] = useState({
    barcode: '',
    brand: '',
    model: '',
    color: '',
    category: 'Tênis Adulto Masculino',
    arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    arrivalYear: new Date().getFullYear().toString(),
    employee: '',
    observations: '',
    sizes: { '34': 1, '35': 1, '36': 1, '37': 1, '38': 1 } as Record<string, number>
  });
  
  // Brand Form State
  const [editingBrand, setEditingBrand] = useState<ShoeBrand | null>(null);
  const [brandFormName, setBrandFormName] = useState('');

  // Search Terms
  const [searchBrandTerm, setSearchBrandTerm] = useState('');
  const [searchHistoryTerm, setSearchHistoryTerm] = useState('');

  // Active Count states
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScannedProduct, setLastScannedProduct] = useState<ShoeProduct | null>(null);
  const [scannedFeedback, setScannedFeedback] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Missing Product Form Modal
  const [showMissingProductModal, setShowMissingProductModal] = useState(false);
  const [missingBarcode, setMissingBarcode] = useState('');
  const [missingForm, setMissingForm] = useState({
    brand: '',
    model: '',
    category: 'Tênis Adulto Masculino',
    color: '',
    size: '',
    expectedQty: 1
  });

  // Load Data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const b = await getLocalBrands();
      const p = await getLocalProducts();
      const i = await getLocalInventories();

      // Deduplicate brands
      const uniqueBrands: ShoeBrand[] = [];
      const seenBrandNames = new Set<string>();
      b.forEach(brand => {
        const nameLower = brand.name.toLowerCase().trim();
        if (!seenBrandNames.has(nameLower)) {
          seenBrandNames.add(nameLower);
          uniqueBrands.push(brand);
        }
      });

      // Deduplicate products
      const uniqueProducts: ShoeProduct[] = [];
      const seenBarcodes = new Set<string>();
      p.forEach(prod => {
        if (!seenBarcodes.has(prod.barcode)) {
          seenBarcodes.add(prod.barcode);
          uniqueProducts.push(prod);
        }
      });

      // Deduplicate inventories
      const uniqueInventories: ShoeInventory[] = [];
      const seenInvIds = new Set<string>();
      i.forEach(inv => {
        if (!seenInvIds.has(inv.id)) {
          seenInvIds.add(inv.id);
          uniqueInventories.push(inv);
        }
      });

      setBrands(uniqueBrands);
      setProducts(uniqueProducts);
      setInventories(uniqueInventories);

      // Check if there is an in-progress count session to resume
      const inProgress = uniqueInventories.find(session => session.status === 'IN_PROGRESS');
      if (inProgress && !activeCountSession) {
        setActiveCountSession(inProgress);
        setSelectedBrandName(inProgress.brand || null);
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao carregar banco local', 'error');
    }
  };

  const seedProducts = async () => {
    try {
      await seedDemoProductsIfNeeded();
      await loadData();
      showToast('Produtos de demonstração carregados com sucesso!');
    } catch (e) {
      showToast('Erro ao carregar demonstração', 'error');
    }
  };

  const handleSyncToCloud = async () => {
    if (!currentUserId || currentUserId === 'guest') {
      showToast('Identificação do usuário indisponível', 'error');
      return;
    }
    showToast('Sincronizando com a nuvem...');
    await syncLocalToCloud(currentUserId);
    showToast('Dados sincronizados com a nuvem!');
  };

  const handleSyncFromCloud = async () => {
    if (!currentUserId || currentUserId === 'guest') {
      showToast('Identificação do usuário indisponível', 'error');
      return;
    }
    showToast('Buscando dados da nuvem...');
    await syncCloudToLocal(currentUserId);
    await loadData();
    showToast('Dados da nuvem baixados com sucesso!');
  };

  // Brands management
  const handleSaveBrand = async () => {
    if (!brandFormName.trim()) {
      showToast('Nome da marca é obrigatório', 'error');
      return;
    }

    const nameExists = brands.some(b => b.name.toLowerCase() === brandFormName.trim().toLowerCase() && b.id !== editingBrand?.id);
    if (nameExists) {
      showToast('Esta marca já existe', 'error');
      return;
    }

    try {
      const b: ShoeBrand = {
        id: editingBrand?.id || getBrandIdFromName(brandFormName.trim()),
        name: brandFormName.trim(),
        active: editingBrand ? editingBrand.active : true,
        createdAt: editingBrand ? editingBrand.createdAt : Date.now()
      };
      await saveLocalBrand(b, currentUserId);
      setBrandFormName('');
      setEditingBrand(null);
      await loadData();
      showToast(editingBrand ? 'Marca editada com sucesso!' : 'Nova marca adicionada!');
    } catch (e) {
      showToast('Erro ao salvar marca', 'error');
    }
  };

  const handleToggleBrandActive = async (brand: ShoeBrand) => {
    try {
      const updated = { ...brand, active: !brand.active };
      await saveLocalBrand(updated, currentUserId);
      await loadData();
      showToast(updated.active ? 'Marca ativada!' : 'Marca desativada!');
    } catch (e) {
      showToast('Erro ao alterar status', 'error');
    }
  };

  const handleDeleteBrand = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta marca?')) return;
    try {
      await deleteLocalBrand(id, currentUserId);
      await loadData();
      showToast('Marca excluída com sucesso');
    } catch (e) {
      showToast('Erro ao deletar marca', 'error');
    }
  };

  // --- 2-STEP NEW COUNT WORKFLOW HANDLERS ---
  const handleStep1BarcodeSubmit = async (codeToUse?: string) => {
    const code = (codeToUse || newCountBarcode).trim();
    if (!code) {
      showToast('Por favor, informe ou bipe o código de barras', 'error');
      return;
    }

    try {
      // 1. Search in Firebase / Local DB by unique barcode
      let existingRef = await getReferenceByBarcode(code);
      let localProd = await getLocalProductByBarcode(code);

      if (existingRef) {
        setNewCountProductFound(true);
        setNewSessionForm({
          barcode: existingRef.barcode,
          brand: existingRef.brand || selectedBrandName || (brands[0]?.name || 'Outras Marcas'),
          model: existingRef.model || '',
          color: existingRef.color || '',
          category: existingRef.productType || 'Sapatilha Feminina Adulta',
          arrivalMonth: existingRef.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
          arrivalYear: existingRef.arrivalYear || new Date().getFullYear().toString(),
          employee: newSessionForm.employee || '',
          observations: newSessionForm.observations || '',
          sizes: existingRef.sizes && Object.keys(existingRef.sizes).length > 0 
            ? { ...existingRef.sizes } 
            : { '35': 1, '36': 1, '37': 1 }
        });
        showToast('Produto localizado com sucesso!');
      } else if (localProd) {
        setNewCountProductFound(true);
        setNewSessionForm({
          barcode: localProd.barcode,
          brand: localProd.brand || selectedBrandName || (brands[0]?.name || 'Outras Marcas'),
          model: localProd.model || '',
          color: localProd.color || '',
          category: localProd.category || 'Sapatilha Feminina Adulta',
          arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
          arrivalYear: new Date().getFullYear().toString(),
          employee: newSessionForm.employee || '',
          observations: newSessionForm.observations || '',
          sizes: { [localProd.size]: localProd.countedQty || 1 }
        });
        showToast('Produto localizado!');
      } else {
        setNewCountProductFound(false);
        setNewSessionForm({
          barcode: code,
          brand: selectedBrandName || (brands.length > 0 ? brands[0].name : 'Outras Marcas'),
          model: '',
          color: '',
          category: 'Sapatilha Feminina Adulta',
          arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
          arrivalYear: new Date().getFullYear().toString(),
          employee: newSessionForm.employee || '',
          observations: newSessionForm.observations || '',
          sizes: { '34': 1, '35': 1, '36': 1, '37': 1, '38': 1 }
        });
        showToast('Código lido! Preencha a marca, modelo, cor, datas e tamanhos.');
      }

      setNewCountStep(2);
    } catch (err) {
      console.error(err);
      showToast('Erro ao consultar código de barras', 'error');
    }
  };

  const handleConfirmAndStartSession = async () => {
    if (!newSessionForm.barcode.trim()) {
      showToast('Código de barras é obrigatório', 'error');
      return;
    }
    if (!newSessionForm.brand.trim()) {
      showToast('Selecione ou informe a marca do calçado', 'error');
      return;
    }
    if (!newSessionForm.model.trim()) {
      showToast('Informe o modelo do calçado', 'error');
      return;
    }

    try {
      const totalPairs = Object.values(newSessionForm.sizes).reduce((acc, q) => acc + (q || 0), 0);

      // Save/Update reference in Firebase
      await saveBarcodeReference({
        barcode: newSessionForm.barcode.trim(),
        brand: newSessionForm.brand.trim(),
        model: newSessionForm.model.trim(),
        productType: newSessionForm.category,
        color: newSessionForm.color.trim(),
        arrivalMonth: newSessionForm.arrivalMonth,
        arrivalYear: newSessionForm.arrivalYear,
        gridType: 'NUMERIC',
        sizes: newSessionForm.sizes,
        total: totalPairs,
        userId: currentUserId
      });

      // Save individual local products
      for (const [sz, qty] of Object.entries(newSessionForm.sizes)) {
        if (qty > 0) {
          const prod: ShoeProduct = {
            barcode: newSessionForm.barcode.trim(),
            brand: newSessionForm.brand.trim(),
            model: newSessionForm.model.trim(),
            category: newSessionForm.category,
            color: newSessionForm.color.trim(),
            size: sz,
            expectedQty: qty,
            countedQty: qty,
            lastUpdated: Date.now(),
            lastCountedTime: Date.now()
          };
          await saveLocalProduct(prod, currentUserId);
        }
      }

      // Create new Inventory session
      const date = new Date();
      const formattedDate = date.toLocaleDateString('pt-BR');
      const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const countsMap: Record<string, number> = {
        [newSessionForm.barcode.trim()]: totalPairs
      };

      const newSession: ShoeInventory = {
        id: `count_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `Contagem ${newSessionForm.brand.trim()}`,
        brand: newSessionForm.brand.trim(),
        description: `Contagem de ${newSessionForm.model.trim()} (${newSessionForm.color.trim()})`,
        date: formattedDate,
        time: formattedTime,
        employee: newSessionForm.employee.trim() || 'Conferente',
        observations: newSessionForm.observations.trim(),
        status: 'IN_PROGRESS',
        brandsStatus: { [newSessionForm.brand.trim()]: 'IN_PROGRESS' },
        counts: countsMap,
        createdAt: Date.now()
      };

      await saveLocalInventory(newSession, currentUserId);
      setActiveCountSession(newSession);
      setIsStartingNewSession(false);
      await loadData();

      showToast(`Contagem iniciada para ${newSessionForm.brand} - ${newSessionForm.model}!`);
      setTimeout(() => barcodeInputRef.current?.focus(), 350);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar e iniciar contagem', 'error');
    }
  };

  const startNewCountCamera = () => {
    setIsNewCountCameraActive(true);
    setTimeout(async () => {
      try {
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        const html5QrCode = new Html5Qrcode("new-count-camera-reader");
        newCountQrRef.current = html5QrCode;

        let cameraIdOrConfig: any = { facingMode: "environment" };
        if (devices && devices.length > 0) {
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('traseira') || 
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('rear')
          );
          if (backCam) cameraIdOrConfig = backCam.id;
          else cameraIdOrConfig = devices[devices.length - 1].id;
        }

        await html5QrCode.start(
          cameraIdOrConfig,
          { fps: 15, qrbox: { width: 260, height: 160 } },
          (decodedText) => {
            stopNewCountCamera();
            setNewCountBarcode(decodedText);
            handleStep1BarcodeSubmit(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.warn("Camera start error:", err);
        showToast("Não foi possível acessar a câmera. Digite o código de barras.", "error");
        setIsNewCountCameraActive(false);
      }
    }, 250);
  };

  const stopNewCountCamera = async () => {
    if (newCountQrRef.current) {
      try {
        if (newCountQrRef.current.isScanning) {
          await newCountQrRef.current.stop();
        }
      } catch (e) {
        console.warn(e);
      }
      newCountQrRef.current = null;
    }
    setIsNewCountCameraActive(false);
  };

  // Start New Count Session
  const handleStartCountSession = async () => {
    if (!selectedBrandName) return;
    
    try {
      const date = new Date();
      const formattedDate = date.toLocaleDateString('pt-BR');
      const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      const newSession: ShoeInventory = {
        id: `count_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `Contagem ${selectedBrandName}`,
        brand: selectedBrandName,
        description: `Contagem física de ${selectedBrandName}`,
        date: formattedDate,
        time: formattedTime,
        employee: newSessionForm.employee.trim() || 'Conferente',
        observations: newSessionForm.observations.trim(),
        status: 'IN_PROGRESS',
        brandsStatus: { [selectedBrandName]: 'IN_PROGRESS' },
        counts: {},
        createdAt: Date.now()
      };

      await saveLocalInventory(newSession, currentUserId);
      setActiveCountSession(newSession);
      setIsStartingNewSession(false);
      setNewSessionForm({
        barcode: '',
        brand: '',
        model: '',
        color: '',
        category: 'Sapatilha Feminina Adulta',
        arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
        arrivalYear: new Date().getFullYear().toString(),
        employee: '',
        observations: '',
        sizes: { '34': 1, '35': 1, '36': 1, '37': 1, '38': 1 }
      });
      await loadData();
      
      // Auto-focus barcode input
      setTimeout(() => barcodeInputRef.current?.focus(), 350);
      showToast(`Iniciada contagem de ${selectedBrandName}`);
    } catch (err) {
      showToast('Erro ao iniciar contagem', 'error');
    }
  };

  // Barcode Submission
  const handleBarcodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;

    setBarcodeInput('');
    
    if (!activeCountSession) {
      showToast('Nenhuma sessão de contagem ativa', 'error');
      return;
    }

    try {
      let product = await getLocalProductByBarcode(barcode);

      // Fallback: Check Firebase if not found in local DB
      if (!product) {
        const fbRef = await getReferenceByBarcode(barcode);
        if (fbRef) {
          product = {
            barcode: fbRef.barcode,
            brand: fbRef.brand,
            model: fbRef.model,
            category: fbRef.productType || 'Calçado',
            color: fbRef.color || '',
            size: Object.keys(fbRef.sizes || {})[0] || 'UN',
            expectedQty: fbRef.total || 1,
            countedQty: 0,
            lastUpdated: Date.now(),
            lastCountedTime: Date.now()
          };
          await saveLocalProduct(product, currentUserId);
        }
      }

      if (product) {
        // Enforce brand matches active count brand
        if (product.brand.toLowerCase() !== activeCountSession.brand?.toLowerCase()) {
          if (!confirm(`Atenção: Este calçado pertence à marca "${product.brand}", mas você está contando "${activeCountSession.brand}". Deseja contar mesmo assim?`)) {
            setTimeout(() => barcodeInputRef.current?.focus(), 200);
            return;
          }
        }

        const updatedSession = { ...activeCountSession };
        const currentCount = updatedSession.counts[barcode] || 0;
        updatedSession.counts[barcode] = currentCount + 1;
        
        await saveLocalInventory(updatedSession, currentUserId);
        setActiveCountSession(updatedSession);

        // Update overall last counted details in product
        product.countedQty = (product.countedQty || 0) + 1;
        product.lastUpdated = Date.now();
        product.lastCountedTime = Date.now();
        await saveLocalProduct(product, currentUserId);

        setLastScannedProduct(product);
        setScannedFeedback({ 
          message: `LIDO: ${product.model} (${product.size}) - Qtd: ${updatedSession.counts[barcode]}`, 
          type: 'success' 
        });
        
        await loadData();
        setTimeout(() => setScannedFeedback({ message: '', type: null }), 1800);
      } else {
        // Product not found, prompt fast creation
        setMissingBarcode(barcode);
        setMissingForm({
          brand: activeCountSession.brand || '',
          model: '',
          category: 'Sapatilha Feminina Adulta',
          color: '',
          size: '',
          expectedQty: 1
        });
        setShowMissingProductModal(true);
      }
    } catch (err) {
      showToast('Erro ao ler código de barras', 'error');
    }
  };

  // Save new registered product during count
  const handleSaveMissingProduct = async () => {
    if (!missingBarcode.trim()) {
      showToast('Informe o código de barras', 'error');
      return;
    }
    if (!missingForm.model.trim() || !missingForm.color.trim() || !missingForm.size.trim()) {
      showToast('Preencha modelo, cor e tamanho', 'error');
      return;
    }

    try {
      // Check duplicate barcode
      const isDuplicate = await verificarCodigoDuplicado(missingBarcode.trim());
      if (isDuplicate) {
        showToast('Este produto/código de barras já está cadastrado no sistema!', 'error');
        return;
      }

      const newProd: ShoeProduct = {
        barcode: missingBarcode,
        brand: missingForm.brand || activeCountSession?.brand || 'Outras Marcas',
        model: missingForm.model.trim(),
        category: missingForm.category,
        color: missingForm.color.trim(),
        size: missingForm.size.trim(),
        expectedQty: missingForm.expectedQty,
        countedQty: 1, 
        lastUpdated: Date.now(),
        lastCountedTime: Date.now()
      };

      await saveLocalProduct(newProd, currentUserId);

      // Save to Firebase using Barcode as Unique Key!
      try {
        await saveBarcodeReference({
          barcode: missingBarcode,
          brand: newProd.brand,
          model: newProd.model,
          productType: newProd.category,
          color: newProd.color,
          gridType: 'NUMERIC',
          sizes: { [newProd.size]: 1 },
          total: 1,
          userId: currentUserId
        });
      } catch (fbErr) {
        console.warn("Notice: Firebase barcode save failed, stored locally:", fbErr);
      }
      
      if (activeCountSession) {
        const updatedSession = { ...activeCountSession };
        updatedSession.counts[missingBarcode] = 1;
        await saveLocalInventory(updatedSession, currentUserId);
        setActiveCountSession(updatedSession);
      }

      setShowMissingProductModal(false);
      setLastScannedProduct(newProd);
      setScannedFeedback({ 
        message: `Cadastrado no Firebase e Lido: ${newProd.model} (Tam: ${newProd.size})`, 
        type: 'success' 
      });
      
      await loadData();
      setTimeout(() => setScannedFeedback({ message: '', type: null }), 2000);
      setTimeout(() => barcodeInputRef.current?.focus(), 300);
    } catch (e) {
      showToast('Erro ao cadastrar novo produto', 'error');
    }
  };

  // Adjust item quantities manually during active count
  const handleAdjustQuantity = async (barcode: string, amount: number) => {
    if (!activeCountSession) return;

    const updatedSession = { ...activeCountSession };
    const currentQty = updatedSession.counts[barcode] || 0;
    const newQty = currentQty + amount;

    if (newQty <= 0) {
      if (!confirm('Deseja remover este item da contagem?')) return;
      delete updatedSession.counts[barcode];
    } else {
      updatedSession.counts[barcode] = newQty;
    }

    try {
      await saveLocalInventory(updatedSession, currentUserId);
      setActiveCountSession(updatedSession);
      await loadData();
    } catch (err) {
      showToast('Erro ao atualizar quantidade', 'error');
    }
  };

  // Delete a counted item completely from active session
  const handleDeleteCountItem = async (barcode: string) => {
    if (!activeCountSession) return;
    if (!confirm('Deseja realmente excluir este item desta contagem?')) return;

    const updatedSession = { ...activeCountSession };
    delete updatedSession.counts[barcode];

    try {
      await saveLocalInventory(updatedSession, currentUserId);
      setActiveCountSession(updatedSession);
      await loadData();
      showToast('Item excluído da contagem com sucesso');
    } catch (err) {
      showToast('Erro ao excluir item', 'error');
    }
  };

  // Delete a counted item completely from a historical session
  const handleDeleteHistoryItem = async (barcode: string) => {
    if (!detailedSession) return;
    if (!confirm('Deseja realmente excluir permanentemente este calçado deste histórico de contagem?')) return;

    const updatedSession = { ...detailedSession };
    delete updatedSession.counts[barcode];

    try {
      await saveLocalInventory(updatedSession, currentUserId);
      setDetailedSession(updatedSession);
      await loadData();
      showToast('Item excluído do histórico com sucesso');
    } catch (err) {
      showToast('Erro ao atualizar histórico', 'error');
    }
  };

  // Finish session
  const handleFinishSession = async () => {
    if (!activeCountSession) return;
    if (!confirm('Deseja realmente finalizar esta contagem? Nenhuma alteração adicional poderá ser feita.')) return;

    try {
      const finishedSession = {
        ...activeCountSession,
        status: 'FINISHED' as const,
        brandsStatus: { ...activeCountSession.brandsStatus, [activeCountSession.brand || '']: 'COMPLETED' as const }
      };

      await saveLocalInventory(finishedSession, currentUserId);
      showToast('Contagem finalizada e salva permanentemente!');

      setActiveCountSession(null);
      setDetailedSession(finishedSession);
      await loadData();
    } catch (err) {
      showToast('Erro ao finalizar contagem', 'error');
    }
  };

  // Cancel/Delete active count session completely
  const handleCancelSession = async () => {
    if (!activeCountSession) return;
    if (!confirm('Deseja realmente EXCLUIR e DESCARTAR esta contagem em andamento? Todos os dados lidos serão excluídos permanentemente.')) return;

    try {
      await deleteLocalInventory(activeCountSession.id, currentUserId);
      showToast('Contagem excluída e descartada com sucesso.');
      setActiveCountSession(null);
      await loadData();
    } catch (err) {
      showToast('Erro ao excluir contagem', 'error');
    }
  };

  // PDF Report Engine
  const generateBrandCountPDF = (inv: ShoeInventory, action: 'view' | 'download' | 'print' = 'download') => {
    const doc = new jsPDF();
    
    // Header Style
    doc.setFillColor(31, 41, 55); 
    doc.rect(0, 0, 210, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('A IDEAL TECIDOS - CALÇADOS', 15, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`CONTAGEM DE ESTOQUE - SISTEMA PROFISSIONAL DE INVENTÁRIO`, 15, 28);
    doc.text(`ID da Contagem: ${inv.id}`, 15, 36);

    // Meta Information Block
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMAÇÕES GERAIS', 15, 55);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Marca: ${inv.brand || inv.name}`, 15, 62);
    doc.text(`Responsável: ${inv.employee || 'Não informado'}`, 15, 68);
    doc.text(`Data: ${inv.date}  |  Hora: ${inv.time}`, 15, 74);
    
    const statusLabel = inv.status === 'FINISHED' ? 'FINALIZADA' : inv.status === 'CANCELLED' ? 'CANCELADA' : 'EM ANDAMENTO';
    doc.text(`Status: ${statusLabel}`, 15, 80);

    // Grouping counts by model, color, and size
    const tableData: any[] = [];
    let grandTotal = 0;
    
    Object.entries(inv.counts).forEach(([barcode, qty]) => {
      const prod = products.find(p => p.barcode === barcode);
      const model = prod?.model || 'Desconhecido';
      const color = prod?.color || '-';
      const size = prod?.size || '-';
      grandTotal += qty;
      
      tableData.push([
        model,
        color,
        size,
        qty,
        barcode
      ]);
    });

    autoTable(doc, {
      startY: 88,
      head: [['Modelo', 'Cor', 'Tamanho (Numeração)', 'Qtd Contada', 'Código de Barras']],
      body: tableData,
      headStyles: { fillColor: [31, 41, 55], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      foot: [
        ['Total Geral', '', '', `${grandTotal} pares`, '']
      ],
      footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold' }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 120;
    
    // Observations field
    if (inv.observations) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Observações:', 15, finalY + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const splitObs = doc.splitTextToSize(inv.observations, 180);
      doc.text(splitObs, 15, finalY + 22);
    }

    // PDF Actions
    if (action === 'download') {
      doc.save(`Contagem_${inv.brand || inv.name}_${inv.date.replace(/\//g, '-')}.pdf`);
      showToast('PDF baixado com sucesso!');
    } else if (action === 'view') {
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
      showToast('PDF aberto para visualização!');
    } else if (action === 'print') {
      const blobUrl = doc.output('bloburl');
      const printWindow = window.open(blobUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      showToast('Impressora iniciada!');
    }
  };

  // Group size counts for UI summary
  const getSizesGroupedForUi = (counts: Record<string, number>) => {
    const sizeMap: Record<string, number> = {};
    Object.entries(counts).forEach(([barcode, qty]) => {
      const prod = products.find(p => p.barcode === barcode);
      const size = prod?.size || 'S/N';
      sizeMap[size] = (sizeMap[size] || 0) + qty;
    });
    return Object.entries(sizeMap).sort((a, b) => {
      const numA = parseFloat(a[0]);
      const numB = parseFloat(b[0]);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a[0].localeCompare(b[0]);
    });
  };

  // Export to CSV/Excel
  const handleExportCSV = (inv: ShoeInventory) => {
    const headers = ['Marca', 'Modelo', 'Categoria', 'Cor', 'Tamanho', 'Quantidade Contada', 'Código de Barras', 'Responsável', 'Data', 'Hora', 'Status'];
    const rows = Object.entries(inv.counts).map(([barcode, qty]) => {
      const prod = products.find(p => p.barcode === barcode);
      return [
        inv.brand || '-',
        prod?.model || 'Desconhecido',
        prod?.category || '-',
        prod?.color || '-',
        prod?.size || '-',
        qty,
        barcode,
        inv.employee,
        inv.date,
        inv.time,
        inv.status
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Contagem_${(inv.brand || inv.name).replace(/\s+/g, '_')}_${inv.date.replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Planilha CSV exportada!');
  };

  // Brand Lists filtering
  const filteredBrands = brands.filter(brand => {
    const queryLower = searchBrandTerm.toLowerCase();
    return brand.name.toLowerCase().includes(queryLower);
  });

  // History Multi-criteria Search
  const filteredHistory = inventories.filter(i => {
    const queryLower = searchHistoryTerm.toLowerCase().trim();
    if (!queryLower) return true;

    // Search by brand
    const brandMatch = (i.brand || i.name).toLowerCase().includes(queryLower);
    
    // Search by date
    const dateMatch = i.date.includes(queryLower);

    // Search by status (translate statuses)
    const statusPt = i.status === 'FINISHED' ? 'finalizada' : i.status === 'CANCELLED' ? 'cancelada' : 'em andamento';
    const statusMatch = statusPt.includes(queryLower) || i.status.toLowerCase().includes(queryLower);

    // Search by responsible operator
    const respMatch = i.employee.toLowerCase().includes(queryLower);

    // Search by size (numeração) inside count list
    const sizeMatch = Object.keys(i.counts).some(barcode => {
      const prod = products.find(p => p.barcode === barcode);
      return prod?.size.toLowerCase() === queryLower;
    });

    return brandMatch || dateMatch || statusMatch || respMatch || sizeMatch;
  });

  return (
    <div className="space-y-6">
      
      {/* LOCAL / CLOUD DATABASE BAR */}
      <div className="flex flex-wrap gap-3 justify-between items-center p-4 bg-brand-slate rounded-[2rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <Barcode size={18} className="text-brand-blue" />
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-dark">Sincronização Física & Local</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={seedProducts}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-brand-blue hover:text-white transition-all text-[9px] font-black uppercase tracking-wider border border-gray-100 flex items-center gap-1 shadow-sm"
          >
            <Sparkles size={11} />
            Simular Catálogo
          </button>
          <button 
            onClick={handleSyncFromCloud}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-brand-blue hover:text-white transition-all text-[9px] font-black uppercase tracking-wider border border-gray-100 flex items-center gap-1 shadow-sm"
          >
            Baixar Nuvem
          </button>
          <button 
            onClick={handleSyncToCloud}
            className="px-3 py-1.5 rounded-lg bg-brand-blue text-white hover:brightness-110 transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm"
          >
            Sincronizar Subida
          </button>
        </div>
      </div>

      {/* TOP SEGMENTED TAB CONTROL */}
      {!activeCountSession && (
        <div className="flex p-1.5 bg-brand-slate rounded-[2rem] border border-gray-100">
          <button 
            onClick={() => {
              setActiveTab('COUNTS');
              setSelectedBrandName(null);
              setDetailedSession(null);
            }}
            className={`flex-1 py-4 rounded-[1.6rem] font-display font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'COUNTS' ? 'bg-white text-brand-blue shadow-md' : 'text-gray-400 hover:text-brand-dark'}`}
          >
            <LayoutGrid size={15} />
            Contar Estoque
          </button>
          <button 
            onClick={() => {
              setActiveTab('HISTORY');
              setSelectedBrandName(null);
              setDetailedSession(null);
            }}
            className={`flex-1 py-4 rounded-[1.6rem] font-display font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white text-brand-blue shadow-md' : 'text-gray-400 hover:text-brand-dark'}`}
          >
            <ClipboardList size={15} />
            Histórico Geral
          </button>
          <button 
            onClick={() => {
              setActiveTab('MANAGE');
              setSelectedBrandName(null);
              setDetailedSession(null);
            }}
            className={`flex-1 py-4 rounded-[1.6rem] font-display font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'MANAGE' ? 'bg-white text-brand-blue shadow-md' : 'text-gray-400 hover:text-brand-dark'}`}
          >
            <SlidersHorizontal size={15} />
            Gerenciar Marcas
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <AnimatePresence mode="wait">
        
        {/* ACTIVE BARCODE COUNT SCREEN */}
        {activeCountSession && (
          <motion.div 
            key="active-count"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            {/* Header info */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-modern flex justify-between items-center flex-wrap gap-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 text-[8px] font-black text-brand-red uppercase tracking-widest bg-brand-red/5 px-2.5 py-1 rounded-full animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
                  Sessão em Andamento
                </span>
                <h3 className="font-display font-black text-2xl text-brand-dark uppercase tracking-tight leading-none pt-1">
                  {activeCountSession.brand}
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase">
                  Responsável: {activeCountSession.employee} | Iniciada em: {activeCountSession.date} às {activeCountSession.time}
                </p>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={handleCancelSession}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 flex items-center gap-1.5"
                  title="Excluir ou descartar esta contagem"
                >
                  <Trash2 size={13} />
                  Excluir Contagem
                </button>
                <button 
                  onClick={handleFinishSession}
                  className="px-5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-black uppercase text-[10px] tracking-widest transition-all shadow-md shadow-green-500/10 active:scale-95 flex items-center gap-1.5"
                >
                  <CheckCircle2 size={13} />
                  Finalizar Contagem
                </button>
              </div>
            </div>

            {/* SCANNER CONTROL BOARD */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-modern space-y-6">
              
              {/* Feedback Alert Flash Screen */}
              <div className="min-h-[110px] flex flex-col items-center justify-center p-5 bg-brand-slate rounded-[2rem] border border-gray-50 text-center relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {scannedFeedback.message ? (
                    <motion.div 
                      key="feedback"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      className="space-y-2 relative z-10"
                    >
                      <div className="mx-auto w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-500 shadow-inner">
                        <CheckCircle2 size={24} />
                      </div>
                      <p className="text-sm font-black text-brand-dark uppercase tracking-wide leading-snug">
                        {scannedFeedback.message}
                      </p>
                    </motion.div>
                  ) : lastScannedProduct ? (
                    <motion.div 
                      key="last-scanned"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-1.5"
                    >
                      <span className="text-[8px] font-black text-brand-blue uppercase tracking-widest bg-brand-blue/5 px-2.5 py-1 rounded-md">ÚLTIMO LIDO</span>
                      <h5 className="font-display font-black text-lg text-brand-dark uppercase leading-none">{lastScannedProduct.model}</h5>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">
                        Cor: {lastScannedProduct.color} | Tam: {lastScannedProduct.size} | Código: {lastScannedProduct.barcode}
                      </p>
                    </motion.div>
                  ) : (
                    <div className="space-y-1.5 text-gray-400">
                      <Barcode size={32} className="mx-auto text-gray-300 animate-pulse" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Aguardando Leitura de Código de Barras</p>
                      <p className="text-[8px] uppercase tracking-wide">Bipe com o leitor Bluetooth HID ou digite na caixa abaixo</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* BARCODE INPUT BOX FOR SPEEDY SCAN */}
              <form onSubmit={handleBarcodeSubmit} className="space-y-3">
                <div className="relative">
                  <input 
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="Passe o leitor ou digite o código..."
                    className="w-full px-6 py-5 bg-brand-slate rounded-2xl border border-gray-100 focus:border-brand-blue/40 focus:ring-4 focus:ring-brand-blue/5 focus:outline-none transition-all font-mono font-bold text-center text-lg text-brand-dark placeholder:text-gray-300 placeholder:font-sans placeholder:text-sm"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    autoComplete="off"
                  />
                  <button 
                    type="submit"
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-brand-blue hover:brightness-110 text-white text-[9px] font-black uppercase tracking-widest px-4 py-3 rounded-xl transition-all"
                  >
                    Bipar
                  </button>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[8px] text-gray-400 font-black uppercase tracking-wide flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Leitor Bluetooth HID Ativo
                  </span>
                  <button 
                    type="button"
                    onClick={() => barcodeInputRef.current?.focus()}
                    className="text-[9px] text-brand-blue font-black uppercase tracking-widest hover:underline"
                  >
                    Focar Caixa de Entrada
                  </button>
                </div>
              </form>
            </div>

            {/* LIVE SESSIONS COUNTED ITEMS */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-2">
                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Lista de Calçados Lidos ({Object.values(activeCountSession.counts).reduce((a, b) => a + b, 0)} pares)
                </h5>
                <button 
                  onClick={() => {
                    if (confirm('Zerar toda a contagem atual?')) {
                      const updated = { ...activeCountSession, counts: {} };
                      saveLocalInventory(updated, currentUserId).then(() => {
                        setActiveCountSession(updated);
                        loadData();
                      });
                    }
                  }}
                  className="text-red-400 text-[9px] font-black uppercase tracking-wider hover:text-brand-red flex items-center gap-1"
                >
                  <XCircle size={12} />
                  Zerar Contagem
                </button>
              </div>

              {Object.keys(activeCountSession.counts).length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl text-gray-400 text-xs font-bold border border-gray-100 shadow-sm">
                  Nenhum sapato lido ainda nesta sessão.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(activeCountSession.counts).map(([barcode, qty]) => {
                    const prod = products.find(p => p.barcode === barcode);
                    return (
                      <div key={barcode} className="bg-white p-4 rounded-2xl shadow-modern-sm border border-gray-100 flex justify-between items-center">
                        <div>
                          <h6 className="font-display font-black text-sm text-brand-dark uppercase leading-none mb-1">
                            {prod?.model || 'Desconhecido'}
                          </h6>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                            Tam: {prod?.size || '-'} | Cor: {prod?.color || '-'} | Código: {barcode}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => handleAdjustQuantity(barcode, -1)}
                            className="w-8 h-8 bg-brand-slate text-brand-dark font-black rounded-lg hover:bg-gray-200 flex items-center justify-center text-sm"
                            title="Diminuir"
                          >
                            -
                          </button>
                          <span className="font-display font-black text-base text-brand-blue min-w-[20px] text-center">
                            {qty}
                          </span>
                          <button 
                            onClick={() => handleAdjustQuantity(barcode, 1)}
                            className="w-8 h-8 bg-brand-slate text-brand-blue font-black rounded-lg hover:bg-blue-50 flex items-center justify-center text-sm"
                            title="Aumentar"
                          >
                            +
                          </button>

                          <div className="w-[1px] h-6 bg-gray-100 mx-1"></div>

                          <button 
                            onClick={() => handleDeleteCountItem(barcode)}
                            className="w-8 h-8 bg-brand-slate text-gray-400 hover:text-brand-red hover:bg-red-50 rounded-lg flex items-center justify-center transition-all"
                            title="Excluir contagem deste item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 1: BRANDS GRID / COUNT INITIATION */}
        {activeTab === 'COUNTS' && !activeCountSession && !selectedBrandName && (
          <motion.div 
            key="brands-selector"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* PROMINENT NEW COUNT WITH BARCODE ACTION CARD */}
            <div 
              onClick={() => {
                setIsStartingNewSession(true);
                setNewCountStep(1);
                setNewCountBarcode('');
              }}
              className="bg-gradient-to-r from-brand-blue via-indigo-600 to-blue-700 text-white p-6 rounded-[2.5rem] shadow-modern-lg cursor-pointer space-y-2 border border-white/10 group relative overflow-hidden transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 text-white border border-white/20 flex items-center justify-center shadow-inner">
                    <Barcode size={26} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-lg uppercase tracking-wider text-white">Nova Contagem por Código de Barras</h3>
                    <p className="text-[11px] text-white/90 font-bold mt-0.5">
                      1º Passo: Bipe o Código → 2º Passo: Marca, Modelo, Cor, Mês/Ano e Tamanhos
                    </p>
                  </div>
                </div>
                <div className="px-4 py-2 bg-white text-brand-blue font-black uppercase text-[10px] tracking-wider rounded-xl shadow-md group-hover:bg-blue-50 transition-colors">
                  Iniciar Leitura
                </div>
              </div>
            </div>

            {/* 2-STEP NEW COUNT WIZARD */}
            {isStartingNewSession && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 sm:p-6 bg-white rounded-2xl sm:rounded-[2.5rem] border-2 border-brand-blue/30 shadow-xl space-y-4 sm:space-y-6"
              >
                {/* Wizard Header */}
                <div className="flex justify-between items-center pb-3 sm:pb-4 border-b border-gray-100 gap-2">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[8px] sm:text-[9px] font-black text-brand-blue uppercase tracking-widest bg-brand-blue/10 px-2.5 py-1 rounded-full inline-block">
                      NOVA CONTAGEM FÍSICA DE ESTOQUE
                    </span>
                    <h4 className="font-display font-black text-base sm:text-xl text-brand-dark uppercase truncate">
                      {newCountStep === 1 
                        ? 'Passo 1 de 2: Leitura do Código de Barras' 
                        : 'Passo 2 de 2: Marca, Modelo, Cor e Tamanhos'}
                    </h4>
                  </div>
                  <button 
                    onClick={() => {
                      setIsStartingNewSession(false);
                      stopNewCountCamera();
                    }} 
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-brand-slate text-gray-400 hover:text-brand-dark hover:bg-gray-200 flex items-center justify-center transition-all shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* STEP 1: BARCODE SCANNER / TYPING */}
                {newCountStep === 1 && (
                  <div className="space-y-4 sm:space-y-5">
                    <div className="p-3.5 sm:p-4 bg-brand-slate rounded-2xl border border-gray-100 text-center">
                      <p className="text-xs text-brand-dark font-bold uppercase tracking-wide">
                        Bipe o código de barras da caixa com o leitor USB/Bluetooth ou use a câmera do celular
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium mt-1">
                        Ao ler, o sistema abre automaticamente o segundo passo com marca, modelo, cor, datas e tamanhos.
                      </p>
                    </div>

                    {isNewCountCameraActive ? (
                      <div className="space-y-3">
                        <div id="new-count-camera-reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-brand-blue shadow-md"></div>
                        <button 
                          onClick={stopNewCountCamera}
                          className="w-full py-3 bg-red-100 hover:bg-red-200 text-red-600 font-black text-xs uppercase rounded-xl transition-all"
                        >
                          Fechar Câmera
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                        <div className="relative flex-1">
                          <input 
                            ref={newCountBarcodeRef}
                            type="text"
                            placeholder="Passe o leitor ou digite o código..."
                            value={newCountBarcode}
                            onChange={e => setNewCountBarcode(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleStep1BarcodeSubmit();
                              }
                            }}
                            className="w-full px-4 sm:px-6 py-3.5 sm:py-4 bg-brand-slate rounded-2xl border border-gray-200 font-mono text-base sm:text-lg font-bold text-center text-brand-dark focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 focus:outline-none transition-all placeholder:text-gray-300 placeholder:text-xs sm:placeholder:text-sm placeholder:font-sans"
                            autoFocus
                          />
                        </div>
                        <button 
                          onClick={() => handleStep1BarcodeSubmit()}
                          className="w-full sm:w-auto px-5 py-3.5 sm:py-4 bg-brand-blue text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:brightness-110 flex items-center justify-center gap-2 shadow-md shadow-brand-blue/20 transition-all active:scale-95 shrink-0"
                        >
                          <Barcode size={18} />
                          Bipar / Continuar
                        </button>
                        <button 
                          onClick={startNewCountCamera}
                          className="w-full sm:w-auto px-4 py-3.5 sm:py-4 bg-gray-100 text-brand-dark hover:bg-brand-blue hover:text-white font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
                        >
                          <Camera size={18} />
                          Usar Câmera
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: MARCA, MODELO, COR, DATAS/MESES E TAMANHOS */}
                {newCountStep === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-slate border border-gray-100 flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center font-bold">
                          <Barcode size={18} />
                        </div>
                        <div>
                          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Código Lido</span>
                          <span className="font-mono text-base font-black text-brand-dark">{newSessionForm.barcode}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${newCountProductFound ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {newCountProductFound ? '✓ Produto Localizado' : '+ Novo Cadastro'}
                        </span>
                        <button 
                          onClick={() => setNewCountStep(1)} 
                          className="text-xs text-brand-blue font-black uppercase hover:underline ml-2"
                        >
                          Trocar Código
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Marca */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Marca do Calçado</label>
                        <select 
                          value={newSessionForm.brand}
                          onChange={e => setNewSessionForm({ ...newSessionForm, brand: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {brands.map(b => (
                            <option key={b.id} value={b.name}>{b.name}</option>
                          ))}
                          <option value="Outras Marcas">Outras Marcas</option>
                        </select>
                      </div>

                      {/* Modelo */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Modelo do Calçado</label>
                        <input 
                          type="text"
                          placeholder="Ex: Sapatilha Soft Flex"
                          value={newSessionForm.model}
                          onChange={e => setNewSessionForm({ ...newSessionForm, model: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>

                      {/* Cor */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Cor / Acabamento</label>
                        <input 
                          type="text"
                          placeholder="Ex: Preto Nobuck / Nude"
                          value={newSessionForm.color}
                          onChange={e => setNewSessionForm({ ...newSessionForm, color: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>

                      {/* Categoria */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Categoria / Tipo</label>
                        <select 
                          value={newSessionForm.category}
                          onChange={e => setNewSessionForm({ ...newSessionForm, category: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {PRODUCT_TYPES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {/* Mês de Chegada (Datas e Meses) */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Mês de Chegada</label>
                        <select 
                          value={newSessionForm.arrivalMonth}
                          onChange={e => setNewSessionForm({ ...newSessionForm, arrivalMonth: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {MONTHS.map(m => (
                            <option key={m} value={m}>Mês {m}</option>
                          ))}
                        </select>
                      </div>

                      {/* Ano de Chegada (Datas e Meses) */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Ano de Chegada</label>
                        <select 
                          value={newSessionForm.arrivalYear}
                          onChange={e => setNewSessionForm({ ...newSessionForm, arrivalYear: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {YEARS.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>

                      {/* Responsável */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Responsável / Conferente</label>
                        <input 
                          type="text"
                          placeholder="Nome do operador"
                          value={newSessionForm.employee}
                          onChange={e => setNewSessionForm({ ...newSessionForm, employee: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>

                      {/* Observações */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Observações do Lote</label>
                        <input 
                          type="text"
                          placeholder="Ex: Lote da prateleira central (opcional)"
                          value={newSessionForm.observations}
                          onChange={e => setNewSessionForm({ ...newSessionForm, observations: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* TAMANHOS / NUMERAÇÕES E QUANTIDADES */}
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-brand-dark uppercase tracking-wider">
                          Grade de Tamanhos / Numerações Encontradas
                        </label>
                        <span className="text-[10px] font-black text-brand-blue uppercase bg-brand-blue/10 px-3 py-1 rounded-full">
                          Total: {Object.values(newSessionForm.sizes).reduce((a, b) => a + (b || 0), 0)} pares
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {(() => {
                          const cat = (newSessionForm.category || '').toLowerCase();
                          let sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 33 && n <= 45; });
                          if (cat.includes('infantil')) {
                            sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 14 && n <= 37; });
                          } else if (cat.includes('masculin')) {
                            sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 34 && n <= 45; });
                          } else if (cat.includes('feminin')) {
                            sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 33 && n <= 41; });
                          }
                          return sizes;
                        })().map(sz => {
                          const currentQty = newSessionForm.sizes[sz] || 0;
                          return (
                            <div key={sz} className={`p-3 rounded-2xl border text-center transition-all ${currentQty > 0 ? 'bg-blue-50/50 border-brand-blue' : 'bg-brand-slate border-gray-200'}`}>
                              <span className="text-xs font-black text-brand-dark uppercase block mb-1">Tam {sz}</span>
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => {
                                    const newQty = Math.max(0, currentQty - 1);
                                    const updated = { ...newSessionForm.sizes, [sz]: newQty };
                                    setNewSessionForm({ ...newSessionForm, sizes: updated });
                                  }}
                                  className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-brand-dark font-bold text-xs flex items-center justify-center hover:bg-gray-100"
                                >
                                  -
                                </button>
                                <span className="font-mono font-black text-sm text-brand-blue min-w-[20px]">{currentQty}</span>
                                <button 
                                  onClick={() => {
                                    const updated = { ...newSessionForm.sizes, [sz]: currentQty + 1 };
                                    setNewSessionForm({ ...newSessionForm, sizes: updated });
                                  }}
                                  className="w-7 h-7 rounded-lg bg-brand-blue text-white font-bold text-xs flex items-center justify-center hover:brightness-110"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => setNewCountStep(1)}
                        className="px-5 py-4 bg-gray-100 hover:bg-gray-200 text-brand-dark font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                      >
                        Voltar ao Leitor
                      </button>
                      <button 
                        onClick={handleConfirmAndStartSession}
                        className="flex-1 py-4 bg-brand-blue hover:brightness-110 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-brand-blue/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <CheckCircle2 size={18} />
                        Confirmar Dados e Iniciar Contagem
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Search Brand input */}
            <div className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-blue transition-colors" size={20} />
              <input 
                type="text"
                placeholder="Pesquisar marca de calçado..."
                className="w-full pl-16 pr-12 py-5 bg-white rounded-[2rem] shadow-modern border border-gray-100 focus:border-brand-blue/30 focus:ring-8 focus:ring-brand-blue/5 focus:outline-none transition-all text-sm font-bold placeholder:text-gray-300"
                value={searchBrandTerm}
                onChange={(e) => setSearchBrandTerm(e.target.value)}
              />
              {searchBrandTerm && (
                <button 
                  onClick={() => setSearchBrandTerm('')}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-dark"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Brands grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredBrands.filter(b => b.active).map(brand => {
                const brandHistory = inventories.filter(i => i.brand === brand.name);
                const lastSession = brandHistory[0]; // ordered newest first
                
                return (
                  <div 
                    key={brand.id}
                    onClick={() => setSelectedBrandName(brand.name)}
                    className="bg-white p-5 rounded-[2rem] shadow-modern-sm border border-gray-100 hover:border-brand-blue/20 transition-all cursor-pointer flex flex-col justify-between group h-40 active:scale-[0.99]"
                  >
                    <div>
                      <h4 className="font-display font-black text-lg text-brand-dark group-hover:text-brand-blue transition-colors uppercase leading-tight">
                        {brand.name}
                      </h4>
                      <p className="text-[9px] text-gray-400 font-black uppercase mt-1">
                        {brandHistory.length} contagens salvas
                      </p>
                    </div>

                    <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                      <div className="text-left">
                        {lastSession ? (
                          <>
                            <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider leading-none">ÚLTIMA</span>
                            <span className="text-[9px] font-black text-brand-dark uppercase">{lastSession.date}</span>
                          </>
                        ) : (
                          <span className="text-[9px] font-black text-gray-300 uppercase">Sem histórico</span>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-brand-slate text-brand-blue flex items-center justify-center group-hover:bg-brand-blue group-hover:text-white transition-all shadow-inner">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {filteredBrands.filter(b => b.active).length === 0 && (
              <div className="text-center py-16 bg-white rounded-[2.5rem] border border-dashed border-gray-100 text-gray-400 text-xs font-bold">
                Nenhuma marca encontrada com "{searchBrandTerm}"
              </div>
            )}
          </motion.div>
        )}

        {/* SPECIFIC BRAND HISTORY AND INITIATION VIEW */}
        {activeTab === 'COUNTS' && !activeCountSession && selectedBrandName && (
          <motion.div 
            key="brand-history-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Header / Brand info */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-modern flex justify-between items-center flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedBrandName(null)}
                  className="w-10 h-10 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-gray-100 transition-all"
                >
                  <ChevronLeft size={20} strokeWidth={3} />
                </button>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">CONTAGENS POR MARCA</span>
                  <h3 className="font-display font-black text-2xl text-brand-dark uppercase leading-none">{selectedBrandName}</h3>
                </div>
              </div>

              <button 
                onClick={() => {
                  setIsStartingNewSession(true);
                  setNewCountStep(1);
                  setNewCountBarcode('');
                  setNewSessionForm({
                    ...newSessionForm,
                    brand: selectedBrandName
                  });
                }}
                className="px-5 py-3 bg-brand-blue text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:brightness-110 shadow-md shadow-brand-blue/15 transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Plus size={14} strokeWidth={3} />
                Iniciar Nova Contagem
              </button>
            </div>

            {/* 2-STEP NEW COUNT WIZARD INSIDE BRAND VIEW */}
            {isStartingNewSession && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-white rounded-[2.5rem] border-2 border-brand-blue/30 shadow-xl space-y-6"
              >
                {/* Wizard Header */}
                <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-brand-blue uppercase tracking-widest bg-brand-blue/10 px-3 py-1 rounded-full inline-block">
                      NOVA CONTAGEM PARA MARCA: {selectedBrandName}
                    </span>
                    <h4 className="font-display font-black text-xl text-brand-dark uppercase">
                      {newCountStep === 1 
                        ? 'Passo 1 de 2: Leitura do Código de Barras' 
                        : 'Passo 2 de 2: Confirmar Dados e Tamanhos'}
                    </h4>
                  </div>
                  <button 
                    onClick={() => {
                      setIsStartingNewSession(false);
                      stopNewCountCamera();
                    }} 
                    className="w-10 h-10 rounded-full bg-brand-slate text-gray-400 hover:text-brand-dark hover:bg-gray-200 flex items-center justify-center transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* STEP 1: BARCODE SCANNER / TYPING */}
                {newCountStep === 1 && (
                  <div className="space-y-5">
                    <div className="p-4 bg-brand-slate rounded-2xl border border-gray-100 text-center">
                      <p className="text-xs text-brand-dark font-bold uppercase tracking-wide">
                        Bipe o código de barras da caixa com o leitor USB/Bluetooth ou use a câmera do celular
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium mt-1">
                        Ao ler, o sistema abrirá o formulário com marca, modelo, cor, datas e tamanhos.
                      </p>
                    </div>

                    {isNewCountCameraActive ? (
                      <div className="space-y-3">
                        <div id="new-count-camera-reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-brand-blue shadow-md"></div>
                        <button 
                          onClick={stopNewCountCamera}
                          className="w-full py-3 bg-red-100 hover:bg-red-200 text-red-600 font-black text-xs uppercase rounded-xl transition-all"
                        >
                          Fechar Câmera
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <input 
                            ref={newCountBarcodeRef}
                            type="text"
                            placeholder="Passe o leitor ou digite o código de barras..."
                            value={newCountBarcode}
                            onChange={e => setNewCountBarcode(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleStep1BarcodeSubmit();
                              }
                            }}
                            className="w-full px-6 py-4 bg-brand-slate rounded-2xl border border-gray-200 font-mono text-lg font-bold text-center text-brand-dark focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 focus:outline-none transition-all placeholder:text-gray-300 placeholder:text-sm placeholder:font-sans"
                            autoFocus
                          />
                        </div>
                        <button 
                          onClick={() => handleStep1BarcodeSubmit()}
                          className="px-6 py-4 bg-brand-blue text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:brightness-110 flex items-center justify-center gap-2 shadow-md shadow-brand-blue/20 transition-all active:scale-95"
                        >
                          <Barcode size={18} />
                          Bipar / Continuar
                        </button>
                        <button 
                          onClick={startNewCountCamera}
                          className="px-5 py-4 bg-gray-100 text-brand-dark hover:bg-brand-blue hover:text-white font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                          <Camera size={18} />
                          Usar Câmera
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: MARCA, MODELO, COR, DATAS/MESES E TAMANHOS */}
                {newCountStep === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-slate border border-gray-100 flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center font-bold">
                          <Barcode size={18} />
                        </div>
                        <div>
                          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Código Lido</span>
                          <span className="font-mono text-base font-black text-brand-dark">{newSessionForm.barcode}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${newCountProductFound ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {newCountProductFound ? '✓ Produto Localizado' : '+ Novo Cadastro'}
                        </span>
                        <button 
                          onClick={() => setNewCountStep(1)} 
                          className="text-xs text-brand-blue font-black uppercase hover:underline ml-2"
                        >
                          Trocar Código
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Marca */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Marca do Calçado</label>
                        <select 
                          value={newSessionForm.brand}
                          onChange={e => setNewSessionForm({ ...newSessionForm, brand: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {brands.map(b => (
                            <option key={b.id} value={b.name}>{b.name}</option>
                          ))}
                          <option value="Outras Marcas">Outras Marcas</option>
                        </select>
                      </div>

                      {/* Modelo */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Modelo do Calçado</label>
                        <input 
                          type="text"
                          placeholder="Ex: Sapatilha Soft Flex"
                          value={newSessionForm.model}
                          onChange={e => setNewSessionForm({ ...newSessionForm, model: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>

                      {/* Cor */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Cor / Acabamento</label>
                        <input 
                          type="text"
                          placeholder="Ex: Preto Nobuck / Nude"
                          value={newSessionForm.color}
                          onChange={e => setNewSessionForm({ ...newSessionForm, color: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>

                      {/* Categoria */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Categoria / Tipo</label>
                        <select 
                          value={newSessionForm.category}
                          onChange={e => setNewSessionForm({ ...newSessionForm, category: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {PRODUCT_TYPES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {/* Mês de Chegada (Datas e Meses) */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Mês de Chegada</label>
                        <select 
                          value={newSessionForm.arrivalMonth}
                          onChange={e => setNewSessionForm({ ...newSessionForm, arrivalMonth: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {MONTHS.map(m => (
                            <option key={m} value={m}>Mês {m}</option>
                          ))}
                        </select>
                      </div>

                      {/* Ano de Chegada (Datas e Meses) */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Ano de Chegada</label>
                        <select 
                          value={newSessionForm.arrivalYear}
                          onChange={e => setNewSessionForm({ ...newSessionForm, arrivalYear: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        >
                          {YEARS.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>

                      {/* Responsável */}
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Responsável / Conferente</label>
                        <input 
                          type="text"
                          placeholder="Nome do operador"
                          value={newSessionForm.employee}
                          onChange={e => setNewSessionForm({ ...newSessionForm, employee: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>

                      {/* Observações */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Observações do Lote</label>
                        <input 
                          type="text"
                          placeholder="Ex: Lote da prateleira central (opcional)"
                          value={newSessionForm.observations}
                          onChange={e => setNewSessionForm({ ...newSessionForm, observations: e.target.value })}
                          className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-200 font-bold text-sm text-brand-dark focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* TAMANHOS / NUMERAÇÕES E QUANTIDADES */}
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-brand-dark uppercase tracking-wider">
                          Grade de Tamanhos / Numerações Encontradas
                        </label>
                        <span className="text-[10px] font-black text-brand-blue uppercase bg-brand-blue/10 px-3 py-1 rounded-full">
                          Total: {Object.values(newSessionForm.sizes).reduce((a, b) => a + (b || 0), 0)} pares
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {(() => {
                          const cat = (newSessionForm.category || '').toLowerCase();
                          let sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 33 && n <= 45; });
                          if (cat.includes('infantil')) {
                            sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 14 && n <= 37; });
                          } else if (cat.includes('masculin')) {
                            sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 34 && n <= 45; });
                          } else if (cat.includes('feminin')) {
                            sizes = NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 33 && n <= 41; });
                          }
                          return sizes;
                        })().map(sz => {
                          const currentQty = newSessionForm.sizes[sz] || 0;
                          return (
                            <div key={sz} className={`p-3 rounded-2xl border text-center transition-all ${currentQty > 0 ? 'bg-blue-50/50 border-brand-blue' : 'bg-brand-slate border-gray-200'}`}>
                              <span className="text-xs font-black text-brand-dark uppercase block mb-1">Tam {sz}</span>
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => {
                                    const newQty = Math.max(0, currentQty - 1);
                                    const updated = { ...newSessionForm.sizes, [sz]: newQty };
                                    setNewSessionForm({ ...newSessionForm, sizes: updated });
                                  }}
                                  className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-brand-dark font-bold text-xs flex items-center justify-center hover:bg-gray-100"
                                >
                                  -
                                </button>
                                <span className="font-mono font-black text-sm text-brand-blue min-w-[20px]">{currentQty}</span>
                                <button 
                                  onClick={() => {
                                    const updated = { ...newSessionForm.sizes, [sz]: currentQty + 1 };
                                    setNewSessionForm({ ...newSessionForm, sizes: updated });
                                  }}
                                  className="w-7 h-7 rounded-lg bg-brand-blue text-white font-bold text-xs flex items-center justify-center hover:brightness-110"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => setNewCountStep(1)}
                        className="px-5 py-4 bg-gray-100 hover:bg-gray-200 text-brand-dark font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                      >
                        Voltar ao Leitor
                      </button>
                      <button 
                        onClick={handleConfirmAndStartSession}
                        className="flex-1 py-4 bg-brand-blue hover:brightness-110 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-brand-blue/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <CheckCircle2 size={18} />
                        Confirmar Dados e Iniciar Contagem
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Past counts list for this brand */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
                Histórico de Contagens da {selectedBrandName}
              </h4>

              {inventories.filter(i => i.brand === selectedBrandName).length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[2rem] border border-dashed border-gray-100 text-gray-400 text-xs font-bold">
                  Nenhuma contagem realizada para esta marca ainda.
                </div>
              ) : (
                <div className="grid gap-4">
                  {inventories.filter(i => i.brand === selectedBrandName).map(inv => {
                    const totalPares = Object.values(inv.counts).reduce((a, b) => a + b, 0);
                    let statusLabel = 'Em andamento';
                    let badgeStyle = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
                    if (inv.status === 'FINISHED') {
                      statusLabel = 'Finalizada';
                      badgeStyle = 'bg-green-50 text-green-600 border border-green-100';
                    } else if (inv.status === 'CANCELLED') {
                      statusLabel = 'Cancelada';
                      badgeStyle = 'bg-red-50 text-red-600 border border-red-100';
                    }

                    return (
                      <div 
                        key={inv.id}
                        onClick={() => setDetailedSession(inv)}
                        className="bg-white p-5 rounded-[2rem] shadow-modern-sm border border-gray-100 hover:border-brand-blue/20 transition-all cursor-pointer flex justify-between items-center group active:scale-[0.99]"
                      >
                        <div className="space-y-2">
                          <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeStyle}`}>
                            {statusLabel}
                          </span>
                          <h5 className="font-display font-black text-base text-brand-dark group-hover:text-brand-blue transition-colors">
                            {inv.date} às {inv.time}
                          </h5>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                            ID: {inv.id} | Responsável: {inv.employee}
                          </p>
                        </div>

                        <div className="text-right flex items-center gap-2.5" onClick={e => e.stopPropagation()}>
                          <div className="text-right">
                            <span className="block font-display font-black text-lg text-brand-dark leading-none">{totalPares}</span>
                            <span className="text-[8px] text-gray-400 font-black uppercase">Pares</span>
                          </div>
                          
                          <button 
                            onClick={() => setDetailedSession(inv)}
                            className="w-8 h-8 rounded-lg bg-brand-slate text-brand-blue flex items-center justify-center hover:bg-brand-blue hover:text-white transition-all shadow-sm"
                            title="Ver detalhes"
                          >
                            <ArrowRight size={14} />
                          </button>

                          <button 
                            onClick={() => {
                              if (confirm('Deseja realmente excluir permanentemente este inventário do histórico?')) {
                                deleteLocalInventory(inv.id, currentUserId).then(() => {
                                  loadData();
                                  showToast('Inventário removido.');
                                });
                              }
                            }}
                            className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-brand-red hover:text-white transition-all shadow-sm"
                            title="Excluir contagem"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 2: GENERAL HISTORY VIEW WITH ADVANCED SEARCH */}
        {activeTab === 'HISTORY' && !activeCountSession && !detailedSession && (
          <motion.div 
            key="history-dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Search filter input */}
            <div className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-blue transition-colors" size={20} />
              <input 
                type="text"
                placeholder="Pesquisar por Marca, Data, Numeração (ex: 36), Status, ou Responsável..."
                className="w-full pl-16 pr-12 py-5 bg-white rounded-[2rem] shadow-modern border border-gray-100 focus:border-brand-blue/30 focus:ring-8 focus:ring-brand-blue/5 focus:outline-none transition-all text-sm font-bold placeholder:text-gray-300"
                value={searchHistoryTerm}
                onChange={(e) => setSearchHistoryTerm(e.target.value)}
              />
              {searchHistoryTerm && (
                <button 
                  onClick={() => setSearchHistoryTerm('')}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-dark"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* List entries */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
                Histórico Geral de Contagens ({filteredHistory.length})
              </h4>

              {filteredHistory.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[2rem] border border-dashed border-gray-100 text-gray-400 text-xs font-bold">
                  Nenhuma contagem encontrada com "{searchHistoryTerm}"
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredHistory.map(inv => {
                    const totalPares = Object.values(inv.counts).reduce((a, b) => a + b, 0);
                    let statusLabel = 'Em andamento';
                    let badgeStyle = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
                    if (inv.status === 'FINISHED') {
                      statusLabel = 'Finalizada';
                      badgeStyle = 'bg-green-50 text-green-600 border border-green-100';
                    } else if (inv.status === 'CANCELLED') {
                      statusLabel = 'Cancelada';
                      badgeStyle = 'bg-red-50 text-red-600 border border-red-100';
                    }

                    return (
                      <div 
                        key={inv.id}
                        onClick={() => setDetailedSession(inv)}
                        className="bg-white p-5 rounded-[2rem] shadow-modern-sm border border-gray-100 hover:border-brand-blue/20 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group active:scale-[0.99]"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-black text-lg text-brand-dark group-hover:text-brand-blue transition-colors uppercase">
                              {inv.brand || inv.name}
                            </span>
                            <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeStyle}`}>
                              {statusLabel}
                            </span>
                          </div>
                          
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                            Responsável: {inv.employee} | ID: {inv.id}
                          </p>
                          <p className="text-[9px] text-brand-blue font-bold uppercase">
                            Data: {inv.date} às {inv.time}
                          </p>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-6" onClick={e => e.stopPropagation()}>
                          <div className="text-right">
                            <span className="block font-display font-black text-xl text-brand-dark leading-none">{totalPares}</span>
                            <span className="text-[8px] text-gray-400 font-black uppercase">Pares</span>
                          </div>

                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleExportCSV(inv)}
                              className="w-9 h-9 rounded-xl bg-brand-slate text-brand-blue flex items-center justify-center hover:bg-brand-blue hover:text-white transition-all shadow-sm"
                              title="Exportar CSV"
                            >
                              <FileSpreadsheet size={16} />
                            </button>
                            <button 
                              onClick={() => generateBrandCountPDF(inv, 'download')}
                              className="w-9 h-9 rounded-xl bg-brand-slate text-brand-blue flex items-center justify-center hover:bg-brand-blue hover:text-white transition-all shadow-sm"
                              title="Baixar PDF"
                            >
                              <FileText size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Deseja realmente excluir permanentemente este inventário do histórico?')) {
                                  deleteLocalInventory(inv.id, currentUserId).then(() => {
                                    loadData();
                                    showToast('Inventário removido.');
                                  });
                                }
                              }}
                              className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-brand-red hover:text-white transition-all shadow-sm"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* DETAILS OF HISTORIC SESSION */}
        {detailedSession && (
          <motion.div 
            key="detailed-session-view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-modern space-y-6"
          >
            {/* Header info */}
            <div className="flex justify-between items-center flex-wrap gap-4 pb-4 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    setDetailedSession(null);
                    // Return back to corresponding list
                    if (activeTab === 'COUNTS') setSelectedBrandName(selectedBrandName);
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-gray-100 transition-all"
                >
                  <ChevronLeft size={20} strokeWidth={3} />
                </button>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">DETALHES DO INVENTÁRIO</span>
                  <h3 className="font-display font-black text-2xl text-brand-dark uppercase leading-none">{detailedSession.brand || detailedSession.name}</h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detailedSession.status === 'FINISHED' && (
                  <span className="text-[9px] bg-green-50 text-green-600 border border-green-100 px-3 py-1 rounded-full uppercase font-black tracking-widest">
                    Finalizada
                  </span>
                )}
                {detailedSession.status === 'CANCELLED' && (
                  <span className="text-[9px] bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded-full uppercase font-black tracking-widest">
                    Cancelada
                  </span>
                )}
                {detailedSession.status === 'IN_PROGRESS' && (
                  <span className="text-[9px] bg-yellow-50 text-yellow-600 border border-yellow-100 px-3 py-1 rounded-full uppercase font-black tracking-widest">
                    Em andamento
                  </span>
                )}
              </div>
            </div>

            {/* Meta Data */}
            <div className="p-5 bg-brand-slate rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-bold text-gray-500">
              <div className="space-y-1">
                <span className="block text-[8px] uppercase tracking-wider text-gray-400">ID ÚNICO</span>
                <span className="font-mono text-brand-dark text-xs">{detailedSession.id}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[8px] uppercase tracking-wider text-gray-400">DATA/HORA COMPLETA</span>
                <span className="text-brand-dark">{detailedSession.date} às {detailedSession.time}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[8px] uppercase tracking-wider text-gray-400">RESPONSÁVEL</span>
                <span className="text-brand-dark uppercase">{detailedSession.employee || 'Não informado'}</span>
              </div>
              {detailedSession.observations && (
                <div className="sm:col-span-2 md:col-span-3 space-y-1 pt-2 border-t border-gray-200/50">
                  <span className="block text-[8px] uppercase tracking-wider text-gray-400">OBSERVAÇÕES</span>
                  <span className="text-brand-dark font-medium italic block">"{detailedSession.observations}"</span>
                </div>
              )}
            </div>

            {/* Print/Download row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <button 
                onClick={() => generateBrandCountPDF(detailedSession, 'view')}
                className="py-4 bg-brand-slate hover:bg-brand-blue hover:text-white rounded-xl text-brand-blue font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-1.5 border border-gray-100 shadow-sm"
              >
                <Eye size={15} />
                Visualizar PDF
              </button>
              <button 
                onClick={() => generateBrandCountPDF(detailedSession, 'download')}
                className="py-4 bg-brand-slate hover:bg-brand-blue hover:text-white rounded-xl text-brand-blue font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-1.5 border border-gray-100 shadow-sm"
              >
                <Download size={15} />
                Baixar PDF
              </button>
              <button 
                onClick={() => generateBrandCountPDF(detailedSession, 'print')}
                className="py-4 bg-brand-blue hover:brightness-110 rounded-xl text-white font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-md shadow-brand-blue/15"
              >
                <Printer size={15} />
                Imprimir PDF
              </button>
              <button 
                onClick={async () => {
                  if (confirm('Deseja realmente EXCLUIR permanentemente este lote de contagem inteiro? Esta ação não pode ser desfeita.')) {
                    try {
                      await deleteLocalInventory(detailedSession.id, currentUserId);
                      setDetailedSession(null);
                      await loadData();
                      showToast('Inventário excluído permanentemente!');
                    } catch (err) {
                      showToast('Erro ao excluir inventário', 'error');
                    }
                  }
                }}
                className="py-4 bg-red-50 hover:bg-red-500 hover:text-white rounded-xl text-red-500 font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-1.5 border border-red-100 shadow-sm"
              >
                <Trash2 size={15} />
                Excluir Contagem
              </button>
            </div>

            {/* List of counted items size table (Grade) */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                Grade de Numerações Registrada ({Object.keys(detailedSession.counts).length} modelos lidos)
              </h4>

              {Object.keys(detailedSession.counts).length === 0 ? (
                <div className="text-center py-10 bg-brand-slate rounded-2xl text-gray-400 text-xs font-bold">
                  Nenhum item foi registrado neste lote.
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {/* Detailed Table */}
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-brand-slate text-gray-500 font-black uppercase tracking-wider border-b border-gray-100">
                          <th className="p-4">Modelo / Calçado</th>
                          <th className="p-4">Cor</th>
                          <th className="p-4 text-center">Numeração (Tamanho)</th>
                          <th className="p-4 text-right">Quantidade</th>
                          <th className="p-4 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(detailedSession.counts).map(([barcode, qty]) => {
                          const prod = products.find(p => p.barcode === barcode);
                          return (
                            <tr key={barcode} className="border-b border-gray-50 hover:bg-gray-50 font-bold text-brand-dark">
                              <td className="p-4">
                                <span className="block text-brand-blue uppercase">{prod?.model || 'Desconhecido'}</span>
                                <span className="block text-[8px] text-gray-400 font-mono">Barras: {barcode}</span>
                              </td>
                              <td className="p-4 uppercase text-gray-400">{prod?.color || '-'}</td>
                              <td className="p-4 text-center font-display text-sm font-black text-brand-dark">{prod?.size || '-'}</td>
                              <td className="p-4 text-right font-display text-sm font-black text-brand-blue">{qty} pares</td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => handleDeleteHistoryItem(barcode)}
                                  className="mx-auto w-8 h-8 rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 flex items-center justify-center transition-all animate-none"
                                  title="Excluir este calçado deste registro"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Grouped Sizes summary block (Tabela completa de numerações) */}
                  <div className="p-5 bg-brand-slate rounded-[2rem] space-y-3 border border-gray-100">
                    <h5 className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Distribuição Consolidada de Tamanhos</h5>
                    <div className="flex flex-wrap gap-2.5">
                      {getSizesGroupedForUi(detailedSession.counts).map(([size, qty]) => (
                        <div key={size} className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                          <div className="text-center">
                            <span className="block text-[7px] text-gray-400 font-bold uppercase leading-none">TAM</span>
                            <span className="text-sm font-display font-black text-brand-dark leading-none">{size}</span>
                          </div>
                          <div className="border-l border-gray-100 h-6"></div>
                          <div>
                            <span className="text-xs font-display font-black text-brand-blue">{qty}</span>
                            <span className="text-[7px] text-gray-400 font-bold uppercase block leading-none">pares</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-3 mt-2 border-t border-gray-200/50 flex justify-between items-center text-sm font-black uppercase text-brand-dark">
                      <span>Total Geral do Lote</span>
                      <span className="text-brand-blue font-display text-lg">{Object.values(detailedSession.counts).reduce((a, b) => a + b, 0)} pares</span>
                    </div>
                  </div>

                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 3: CONFIGURE/MANAGE BRANDS PANEL */}
        {activeTab === 'MANAGE' && !activeCountSession && (
          <motion.div 
            key="brands-config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-8 rounded-[2.5rem] shadow-modern border border-gray-100 space-y-6"
          >
            {/* Quick Create Brand Form */}
            <div className="p-5 bg-brand-slate rounded-2xl border border-gray-50 space-y-3">
              <h5 className="text-[10px] font-black text-brand-blue uppercase tracking-widest">
                {editingBrand ? 'Editar Marca Existente' : 'Cadastrar Nova Marca de Calçados'}
              </h5>
              
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Nome da marca (ex: Ramarim)"
                  className="flex-1 px-4 py-3 bg-white rounded-xl border border-gray-100 focus:outline-none font-bold text-sm text-brand-dark shadow-sm"
                  value={brandFormName}
                  onChange={e => setBrandFormName(e.target.value)}
                />
                <button 
                  onClick={handleSaveBrand}
                  className="px-5 bg-brand-blue text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:brightness-110 transition-all shadow-md shadow-brand-blue/10"
                >
                  {editingBrand ? 'Salvar' : 'Adicionar'}
                </button>
                {editingBrand && (
                  <button 
                    onClick={() => {
                      setEditingBrand(null);
                      setBrandFormName('');
                    }}
                    className="px-3 bg-gray-200 text-gray-500 rounded-xl font-black uppercase text-[10px]"
                  >
                    X
                  </button>
                )}
              </div>
            </div>

            {/* Brands list */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                Lista Completa de Marcas ({brands.length})
              </h5>

              <div className="grid gap-2.5 max-h-[400px] overflow-y-auto pr-1 no-scrollbar border border-gray-100 rounded-2xl p-2 bg-brand-slate/30">
                {brands.map(brand => (
                  <div key={brand.id} className="p-4 bg-white border border-gray-50 rounded-xl flex justify-between items-center shadow-sm hover:border-gray-100 transition-all">
                    <span className={`font-bold text-sm uppercase ${brand.active ? 'text-brand-dark' : 'text-gray-300 line-through'}`}>
                      {brand.name}
                    </span>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleToggleBrandActive(brand)}
                        className={`text-xs ${brand.active ? 'text-green-500 hover:text-green-600' : 'text-gray-400 hover:text-gray-500'}`}
                        title={brand.active ? 'Desativar marca' : 'Ativar marca'}
                      >
                        {brand.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                      <button 
                        onClick={() => {
                          setEditingBrand(brand);
                          setBrandFormName(brand.name);
                        }}
                        className="p-1.5 text-gray-400 hover:text-brand-blue transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteBrand(brand.id)}
                        className="p-1.5 text-red-400 hover:text-brand-red transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* REGISTRATION MODAL FOR PRODUCTS NOT IN CATALOGUE */}
      <AnimatePresence>
        {showMissingProductModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-gray-50">
                <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center text-yellow-500 border border-yellow-100">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h4 className="font-display font-black text-lg text-brand-dark leading-none">Produto Não Encontrado</h4>
                  <span className="text-[8px] text-gray-400 uppercase font-black tracking-widest">Barras: {missingBarcode}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Código de Barras *</label>
                  <input 
                    type="text"
                    placeholder="Código de barras"
                    className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold font-mono text-xs text-brand-dark focus:ring-2 focus:ring-brand-blue outline-none"
                    value={missingBarcode}
                    onChange={e => setMissingBarcode(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Marca *</label>
                  <select 
                    className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold text-xs text-brand-dark"
                    value={missingForm.brand}
                    onChange={e => setMissingForm({ ...missingForm, brand: e.target.value })}
                  >
                    <option value="">Selecione uma Marca</option>
                    {brands.filter(b => b.active).map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Modelo *</label>
                  <input 
                    type="text"
                    placeholder="Ex: Revolution 7, Moleca Soft, etc"
                    className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold text-xs text-brand-dark"
                    value={missingForm.model}
                    onChange={e => setMissingForm({ ...missingForm, model: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Categoria *</label>
                  <select 
                    className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold text-xs text-brand-dark"
                    value={missingForm.category}
                    onChange={e => setMissingForm({ ...missingForm, category: e.target.value })}
                  >
                    <option value="Sapatilha Feminina Adulta">Sapatilha Feminina Adulta</option>
                    <option value="Sapatilha Feminina Infantil">Sapatilha Feminina Infantil</option>
                    <option value="Rasteirinhas">Rasteirinhas</option>
                    <option value="Saltos">Saltos</option>
                    <option value="Papetes Adulto">Papetes Adulto</option>
                    <option value="Botas Masculinas">Botas Masculinas</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Cor *</label>
                    <input 
                      type="text"
                      placeholder="Ex: Preto"
                      className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold text-xs text-brand-dark"
                      value={missingForm.color}
                      onChange={e => setMissingForm({ ...missingForm, color: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Tamanho *</label>
                    <input 
                      type="text"
                      placeholder="Ex: 36"
                      className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold text-xs text-brand-dark"
                      value={missingForm.size}
                      onChange={e => setMissingForm({ ...missingForm, size: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase block mb-1">Quantidade Esperada em Estoque</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-3 bg-brand-slate rounded-xl border border-gray-100 font-bold text-xs text-brand-dark"
                    value={missingForm.expectedQty}
                    onChange={e => setMissingForm({ ...missingForm, expectedQty: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowMissingProductModal(false);
                      setTimeout(() => barcodeInputRef.current?.focus(), 300);
                    }}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                  >
                    Ignorar
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveMissingProduct}
                    className="flex-1 py-3 bg-brand-blue text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:brightness-110 transition-all shadow-md"
                  >
                    Cadastrar & Bipar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
