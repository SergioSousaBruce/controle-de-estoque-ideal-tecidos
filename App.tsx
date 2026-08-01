
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  History, 
  Plus, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  Save, 
  FileText, 
  Search,
  XCircle,
  Download,
  Home,
  LogIn,
  PlusCircle,
  Minus,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  BarChart3,
  BrainCircuit,
  TrendingUp,
  AlertTriangle,
  UploadCloud,
  Loader2,
  ExternalLink,
  ClipboardList,
  Eye,
  Printer,
  Barcode,
  ArrowRight,
  Lock,
  Unlock,
  RotateCcw,
  ArrowUpDown
} from 'lucide-react';
import { OfflineSyncBadge } from './src/components/OfflineSyncBadge';
import { queueOfflineCount } from './src/services/offlineSyncService';
import { saveBarcodeReference, getReferenceByBarcode, sanitizeBarcode, preloadBarcodeCache } from './src/services/barcodeFirebaseService';
import { recordStockMovement } from './src/services/stockMovementService';

// Lazy loading heavy modals for optimal initial boot performance
const ReportsModule = React.lazy(() => import('./src/components/ReportsModule').then(m => ({ default: m.ReportsModule })));
const DashboardModule = React.lazy(() => import('./src/components/DashboardModule').then(m => ({ default: m.DashboardModule })));
const InventoryModeModule = React.lazy(() => import('./src/components/InventoryModeModule').then(m => ({ default: m.InventoryModeModule })));
const StockMovementHistoryModule = React.lazy(() => import('./src/components/StockMovementHistoryModule').then(m => ({ default: m.StockMovementHistoryModule })));
const ContinuousScannerModal = React.lazy(() => import('./src/components/ContinuousScannerModal').then(m => ({ default: m.ContinuousScannerModal })));
const LabelGeneratorModal = React.lazy(() => import('./src/components/LabelGeneratorModal').then(m => ({ default: m.LabelGeneratorModal })));
const DivergenceReportModal = React.lazy(() => import('./src/components/DivergenceReportModal').then(m => ({ default: m.DivergenceReportModal })));
const ErpExporterModal = React.lazy(() => import('./src/components/ErpExporterModal').then(m => ({ default: m.ErpExporterModal })));
const BarcodeScannerManager = React.lazy(() => import('./src/components/BarcodeScannerManager').then(m => ({ default: m.BarcodeScannerManager })));
import { Zap, Tag, FileSpreadsheet } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { 
  db, 
  auth,
  googleProvider,
  handleFirestoreError, 
  OperationType, 
  validateConnection,
  sanitizeForFirestore
} from './src/lib/firebase';
import firebaseConfig from './firebase-applet-config.json';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where,
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { AppView, InventoryCount, SizeGridType, ShoeProduct, ShoeInventory } from './types';
import { PRODUCT_TYPES, LETTER_SIZES, NUMERIC_SIZES, MONTHS, YEARS, getGenderFromProductType, getDefaultProductTypeFromGender, syncProductTypeWithGender } from './constants';
import { DEFAULT_BRANDS_LIST } from './src/services/inventoryDb';
import { computeBrandSizeAnalysis } from './src/utils/brandAnalysis';

const App: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isEmailLogin, setIsEmailLogin] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', password: '', name: '' });
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Get or Create Device ID for isolation
  const getDeviceId = () => {
    let id = localStorage.getItem('ideal_tecidos_device_id');
    if (!id) {
      id = `device_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
      localStorage.setItem('ideal_tecidos_device_id', id);
    }
    return id;
  };

  const currentUserId = user?.uid || getDeviceId();

  // Persistence state
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // UI state
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [viewingPdfItem, setViewingPdfItem] = useState<InventoryCount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [historySort, setHistorySort] = useState<'AZ' | 'DATE'>('AZ');

  // Clean Architecture Module States
  // Delete Brand and Edit Brand Modal States
  const [deleteBrandModal, setDeleteBrandModal] = useState<{
    isOpen: boolean;
    brandName: string;
    count: number;
    pieces: number;
  }>({ isOpen: false, brandName: '', count: 0, pieces: 0 });

  const [brandEditModal, setBrandEditModal] = useState<{
    isOpen: boolean;
    brandName: string;
  }>({ isOpen: false, brandName: '' });

  const [viewingBrandPreview, setViewingBrandPreview] = useState<{
    brandName: string;
    items: InventoryCount[];
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | 'ALL' }>({
    isOpen: false,
    id: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | null }>({
    message: '',
    type: null
  });

  // New Features Modal States
  const [isContinuousModalOpen, setIsContinuousModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isDivergenceModalOpen, setIsDivergenceModalOpen] = useState(false);
  const [isErpExporterModalOpen, setIsErpExporterModalOpen] = useState(false);

  // Save Continuous Count Helper for High-Speed USB Scanner
  const saveContinuousCount = async (data: Omit<InventoryCount, 'id' | 'createdAt' | 'userId'>) => {
    const inventoryRef = collection(db, 'inventory');
    const newDoc = doc(inventoryRef);
    const finalCount: InventoryCount = {
      ...data,
      id: newDoc.id,
      createdAt: Date.now(),
      userId: currentUserId
    };

    if (!navigator.onLine) {
      queueOfflineCount(finalCount);
      setCounts(prev => [finalCount, ...prev]);
      return finalCount;
    }

    try {
      await setDoc(newDoc, sanitizeForFirestore(finalCount));
      setCounts(prev => [finalCount, ...prev]);
      return finalCount;
    } catch (err) {
      queueOfflineCount(finalCount);
      setCounts(prev => [finalCount, ...prev]);
      return finalCount;
    }
  };
  
  const [newSizeInput, setNewSizeInput] = useState('');
  
  // Brand inventory statuses state
  const [completedBrands, setCompletedBrands] = useState<Record<string, boolean>>({});
  const [brandSearchTerm, setBrandSearchTerm] = useState('');
  const [brandStatusFilter, setBrandStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING'>('ALL');
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  
  // AI State
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pastedData, setPastedData] = useState('');
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: null }), 3000);
  };

  // Firestore sync for shared brand statuses across all employees
  useEffect(() => {
    if (!currentUserId) return;
    try {
      const saved = localStorage.getItem(`brand_statuses_shared`);
      if (saved) {
        setCompletedBrands(JSON.parse(saved));
      }
    } catch (e) {
      // Ignore JSON parse error
    }

    // Subscribe to shared global brand statuses doc so all employees see real-time updates
    const sharedDocRef = doc(db, 'shared_settings', 'brand_statuses');
    const unsub = onSnapshot(sharedDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const val = docSnap.data().completed || {};
        setCompletedBrands(val);
        localStorage.setItem(`brand_statuses_shared`, JSON.stringify(val));
      }
    }, (err) => {
      console.warn("Shared brand statuses listener fallback:", err);
    });
    return () => unsub();
  }, [currentUserId]);

  const toggleBrandCompleted = async (brandName: string, forceStatus?: boolean) => {
    if (!brandName) return;
    const cleanBrand = brandName.trim();
    if (!cleanBrand) return;

    const newStatus = forceStatus !== undefined ? forceStatus : !completedBrands[cleanBrand];
    const updated = { ...completedBrands, [cleanBrand]: newStatus };
    setCompletedBrands(updated);

    try {
      localStorage.setItem(`brand_statuses_shared`, JSON.stringify(updated));
      const sharedDocRef = doc(db, 'shared_settings', 'brand_statuses');
      await setDoc(sharedDocRef, { completed: updated, updatedAt: Date.now(), updatedBy: user?.displayName || user?.email || currentUserId }, { merge: true });
      if (currentUserId) {
        const userDocRef = doc(db, 'users', currentUserId, 'settings', 'brand_statuses');
        await setDoc(userDocRef, { completed: updated }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.warn("Notice saving brand status to Firestore:", err);
      handleFirestoreError(err, OperationType.WRITE, `shared_settings/brand_statuses`);
    }
  };

  // Real-time Brand Statistics
  const allBrandsList = useMemo(() => {
    const customFromCounts = counts.map(c => c.brand?.trim()).filter(Boolean) as string[];
    const set = new Set([...DEFAULT_BRANDS_LIST, ...customFromCounts]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [counts]);

  const brandStats = useMemo(() => {
    return allBrandsList.map(brandName => {
      const brandCounts = counts.filter(c => (c.brand || '').toLowerCase().trim() === brandName.toLowerCase().trim());
      const totalPieces = brandCounts.reduce((acc, c) => acc + c.total, 0);
      const totalModels = new Set(brandCounts.map(c => c.model)).size;
      const isCompleted = !!completedBrands[brandName];
      const isStarted = totalPieces > 0;

      let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
      if (isCompleted) status = 'COMPLETED';
      else if (isStarted) status = 'IN_PROGRESS';

      return {
        name: brandName,
        totalPieces,
        totalModels,
        totalLots: brandCounts.length,
        status,
        items: brandCounts
      };
    });
  }, [allBrandsList, counts, completedBrands]);

  const completedCount = useMemo(() => brandStats.filter(b => b.status === 'COMPLETED').length, [brandStats]);
  const inProgressCount = useMemo(() => brandStats.filter(b => b.status === 'IN_PROGRESS').length, [brandStats]);
  const pendingCount = useMemo(() => brandStats.filter(b => b.status === 'PENDING').length, [brandStats]);
  
  // Form state & persistent last entered shoe info template
  const [lastShoeInfo, setLastShoeInfo] = useState<{
    brand?: string;
    gender?: string;
    model?: string;
    color?: string;
    productType?: string;
    arrivalMonth?: string;
    arrivalYear?: string;
    gridType?: SizeGridType;
  }>(() => {
    try {
      const saved = localStorage.getItem('ideal_last_shoe_info');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<InventoryCount> & { barcode?: string }>(() => ({
    barcode: '',
    productType: lastShoeInfo.productType || '',
    model: lastShoeInfo.model || '',
    brand: lastShoeInfo.brand || '',
    color: lastShoeInfo.color || '',
    arrivalMonth: lastShoeInfo.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
    arrivalYear: lastShoeInfo.arrivalYear || new Date().getFullYear().toString(),
    gridType: lastShoeInfo.gridType || 'LETTER',
    sizes: {},
    total: 0,
    gender: lastShoeInfo.gender || 'M'
  }));

  // Active locked reference & mismatch modal states
  const [activeLockedReference, setActiveLockedReference] = useState<{
    barcode: string;
    brand: string;
    model: string;
    color?: string;
    productType?: string;
    arrivalMonth?: string;
    arrivalYear?: string;
    gridType?: SizeGridType;
    sizes?: Record<string, number>;
    total?: number;
    gender?: string;
  } | null>(null);

  const [mismatchModalData, setMismatchModalData] = useState<{
    newScannedData: Partial<InventoryCount> & { barcode: string };
  } | null>(null);

  const handleFinishActiveReference = async () => {
    if (activeLockedReference) {
      if (formData.brand || formData.barcode || (formData.total && formData.total > 0)) {
        try {
          await saveInventory();
        } catch (err) {
          console.warn("Auto save on finish reference warning:", err);
        }
      }
      const finishedBrand = activeLockedReference.brand || 'Referência';
      setActiveLockedReference(null);
      setFormData({
        barcode: '',
        productType: '',
        model: '',
        brand: '',
        color: '',
        arrivalMonth: '',
        arrivalYear: '',
        gridType: 'LETTER',
        sizes: {},
        total: 0,
        gender: ''
      });
      setEditingId(null);
      showToast(`Contagem de ${finishedBrand} concluída! Próxima marca liberada.`, 'success');
    } else {
      showToast('Nenhuma marca em contagem travada.', 'success');
    }
    setCurrentView(AppView.IDENTIFY);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmSwitchReference = async (newScannedData: Partial<InventoryCount> & { barcode: string }) => {
    if (formData.brand || formData.barcode) {
      try {
        await saveInventory();
      } catch (err) {
        console.warn("Auto save on switch reference:", err);
      }
    }

    const calculatedGender = newScannedData.gender || getGenderFromProductType(newScannedData.productType, '') || 'M';
    const calculatedProductType = newScannedData.productType || getDefaultProductTypeFromGender(calculatedGender, '') || 'Tênis Adulto Masculino';

    const newLock = {
      barcode: newScannedData.barcode,
      brand: newScannedData.brand || '',
      model: newScannedData.model || '',
      color: newScannedData.color || '',
      productType: calculatedProductType,
      arrivalMonth: newScannedData.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
      arrivalYear: newScannedData.arrivalYear || new Date().getFullYear().toString(),
      gridType: newScannedData.gridType || 'NUMERIC',
      sizes: newScannedData.sizes || {},
      total: newScannedData.total || 0,
      gender: calculatedGender
    };

    setActiveLockedReference(newLock);
    setFormData(newLock);
    setEditingId(null);
    setMismatchModalData(null);
    setCurrentView(AppView.IDENTIFY);
    showToast(`Referência finalizada! Iniciada contagem de ${newLock.brand || 'Nova Marca'}`, 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectBarcodeForCounting = (itemData: Partial<InventoryCount> & { barcode: string }) => {
    // If a reference/brand is currently locked
    if (activeLockedReference) {
      const activeBrandClean = (activeLockedReference.brand || '').toLowerCase().trim();
      const itemBrandClean = (itemData.brand || '').toLowerCase().trim();

      const isSameBrand = !itemBrandClean || !activeBrandClean || itemBrandClean === activeBrandClean;

      if (isSameBrand) {
        const finalBrand = itemData.brand || activeLockedReference.brand || '';
        const calculatedGender = itemData.gender || activeLockedReference.gender || getGenderFromProductType(itemData.productType, '') || 'M';
        const calculatedProductType = itemData.productType || activeLockedReference.productType || getDefaultProductTypeFromGender(calculatedGender, '') || 'Tênis Adulto Masculino';

        const updatedLock = {
          barcode: itemData.barcode,
          brand: finalBrand,
          model: itemData.model || '',
          color: itemData.color || '',
          productType: calculatedProductType,
          arrivalMonth: itemData.arrivalMonth || activeLockedReference.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
          arrivalYear: itemData.arrivalYear || activeLockedReference.arrivalYear || new Date().getFullYear().toString(),
          gridType: itemData.gridType || activeLockedReference.gridType || 'NUMERIC',
          sizes: itemData.sizes || {},
          total: itemData.total || 0,
          gender: calculatedGender
        };

        setActiveLockedReference(updatedLock);
        setFormData(updatedLock);

        const destinationView = updatedLock.model && updatedLock.model.trim() ? AppView.COUNT : AppView.IDENTIFY;
        setCurrentView(destinationView);
        showToast(`Referência ${updatedLock.model || updatedLock.barcode} carregada para ${finalBrand}!`, 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      } else {
        // Different brand scanned! Prompt user
        setMismatchModalData({
          newScannedData: itemData
        });
        return;
      }
    }

    // No lock active: Lock onto this new scanned reference
    const calculatedGender = itemData.gender || getGenderFromProductType(itemData.productType, '') || 'M';
    const calculatedProductType = itemData.productType || getDefaultProductTypeFromGender(calculatedGender, '') || 'Tênis Adulto Masculino';

    const newLock = {
      barcode: itemData.barcode,
      brand: itemData.brand || '',
      model: itemData.model || '',
      color: itemData.color || '',
      productType: calculatedProductType,
      arrivalMonth: itemData.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
      arrivalYear: itemData.arrivalYear || new Date().getFullYear().toString(),
      gridType: itemData.gridType || 'NUMERIC',
      sizes: itemData.sizes || {},
      total: itemData.total || 0,
      gender: calculatedGender
    };

    setActiveLockedReference(newLock);
    setFormData(newLock);
    setEditingId(null);
    const destinationView = newLock.model && newLock.model.trim() ? AppView.COUNT : AppView.IDENTIFY;
    setCurrentView(destinationView);
    showToast(`🔒 Contagem da marca/referência ${newLock.brand || 'Nova Marca'} iniciada!`, 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Preload barcode memory cache for instant <1ms lookup
  useEffect(() => {
    preloadBarcodeCache();
  }, []);

  // Auth effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      // No wall here
    });
    return () => unsubscribe();
  }, []);

  // Firestore sync effect for real-time multi-employee counts
  useEffect(() => {
    if (!currentUserId) {
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    
    // Subscribe to all shared inventory counts so multiple employees see live updates
    const colRef = collection(db, 'inventory');

    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const newCounts = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as InventoryCount[];
      
      // Sort in memory by newest created count first
      newCounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setCounts(newCounts);
      setIsSyncing(false);
    }, (error) => {
      console.warn("Firestore shared list notice, falling back to user filter:", error);
      // Fallback query if needed
      const qUser = query(collection(db, 'inventory'), where('userId', '==', currentUserId));
      getDocs(qUser).then(snap => {
        const userCounts = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as InventoryCount[];
        userCounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setCounts(userCounts);
      }).catch(e => console.error("Fallback error:", e));
      setIsSyncing(false);
    });

    return () => unsubscribe();
  }, [user, currentUserId]);

  const login = async () => {
    setAuthError(null);
    setLoginLoading(true);
    try {
      auth.useDeviceLanguage();
      // Ensure we are using a fresh provider instance
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        showToast('Login realizado com sucesso!');
        setIsEmailLogin(false);
      }
    } catch (error: any) {
      console.error("Detailed Login Error:", error);
      let msg = 'Falha no login com Google';
      
      if (error.code === 'auth/popup-blocked') {
        msg = 'O navegador bloqueou a janela de login. Por favor, habilite popups.';
      } else if (error.message) {
        msg = `Erro: ${error.message}`;
      }
      
      setAuthError(msg);
      showToast('Falha no login', 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email || !emailForm.password) {
      setAuthError('Preencha e-mail e senha.');
      return;
    }

    setAuthError(null);
    setLoginLoading(true);
    try {
      if (isSignUp) {
        if (!emailForm.name) {
          throw new Error('Nome é obrigatório para cadastro.');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, emailForm.email, emailForm.password);
        await updateProfile(userCredential.user, { displayName: emailForm.name });
        showToast('Conta criada com sucesso!');
      } else {
        await signInWithEmailAndPassword(auth, emailForm.email, emailForm.password);
        showToast('Bem-vindo de volta!');
      }
    } catch (error: any) {
      console.error("Email Auth Error:", error);
      let msg = 'Erro na autenticação';
      
      switch (error.code) {
        case 'auth/user-not-found':
          msg = 'Usuário não encontrado. Verifique o e-mail ou cadastre-se.';
          break;
        case 'auth/wrong-password':
          msg = 'Senha incorreta. Tente novamente.';
          break;
        case 'auth/email-already-in-use':
          msg = 'Este e-mail já está cadastrado.';
          break;
        case 'auth/invalid-email':
          msg = 'E-mail inválido.';
          break;
        case 'auth/operation-not-allowed':
          msg = 'O login por E-mail precisa ser ativado no Console do Firebase (Authentication -> Sign-in method).';
          break;
        case 'auth/weak-password':
          msg = 'A senha deve ter pelo menos 6 caracteres.';
          break;
        case 'auth/network-request-failed':
          msg = 'Erro de conexão. Verifique sua internet.';
          break;
        default:
          msg = error.message || 'Ocorreu um erro inesperado.';
      }
      
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      showToast('Até logo!');
    } catch (error) {
      console.error(error);
    }
  };

  // Handlers
  const handleStartNew = () => {
    const recent = counts[0];
    const brand = lastShoeInfo.brand || recent?.brand || '';
    const gender = lastShoeInfo.gender || recent?.gender || 'M';
    const model = lastShoeInfo.model || recent?.model || '';
    const color = lastShoeInfo.color || recent?.color || '';
    const productType = lastShoeInfo.productType || recent?.productType || 'Tênis Adulto Masculino';
    const arrivalMonth = lastShoeInfo.arrivalMonth || recent?.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0');
    const arrivalYear = lastShoeInfo.arrivalYear || recent?.arrivalYear || new Date().getFullYear().toString();
    const gridType = lastShoeInfo.gridType || recent?.gridType || 'LETTER';

    setFormData({
      barcode: '',
      brand,
      productType: syncProductTypeWithGender(productType, gender),
      model,
      color,
      arrivalMonth,
      arrivalYear,
      gridType,
      sizes: {},
      total: 0,
      gender
    });
    setEditingId(null);
    setAuthError(null);
    setCurrentView(AppView.IDENTIFY);
  };

  const handleStartWithSameBrand = (brandName: string) => {
    const brandCounts = counts.filter(
      c => (c.brand || '').toLowerCase().trim() === brandName.toLowerCase().trim()
    );
    const lastBrandCount = brandCounts[0];

    const productType = lastBrandCount?.productType || lastShoeInfo.productType || 'Tênis Adulto Masculino';
    const gender = lastBrandCount?.gender || lastShoeInfo.gender || getGenderFromProductType(productType) || 'M';
    const arrivalMonth = lastBrandCount?.arrivalMonth || lastShoeInfo.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0');
    const arrivalYear = lastBrandCount?.arrivalYear || lastShoeInfo.arrivalYear || new Date().getFullYear().toString();
    const gridType = lastBrandCount?.gridType || lastShoeInfo.gridType || 'NUMERIC';

    const cleanBrand = brandName.trim();
    const nextLock = {
      barcode: '',
      brand: cleanBrand,
      model: '',
      color: '',
      productType: syncProductTypeWithGender(productType, gender),
      arrivalMonth,
      arrivalYear,
      gridType,
      sizes: {},
      total: 0,
      gender
    };

    setActiveLockedReference(nextLock);
    setFormData(nextLock);
    setEditingId(null);
    setAuthError(null);
    setCurrentView(AppView.IDENTIFY);
  };

  const handleSaveAndScanNextReference = async () => {
    const currentBrand = formData.brand || activeLockedReference?.brand || '';
    const success = await saveInventory();
    if (success) {
      const nextLock = {
        barcode: '',
        brand: currentBrand,
        model: '',
        color: '',
        productType: formData.productType || 'Tênis Adulto Masculino',
        arrivalMonth: formData.arrivalMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'),
        arrivalYear: formData.arrivalYear || new Date().getFullYear().toString(),
        gridType: formData.gridType || 'NUMERIC',
        sizes: {},
        total: 0,
        gender: formData.gender || 'M'
      };
      setActiveLockedReference(nextLock);
      setFormData(nextLock);
      setEditingId(null);
      setCurrentView(AppView.IDENTIFY);
      showToast(`Salvo! Digite a próxima referência da marca ${currentBrand || 'geral'}`, 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleEdit = (count: InventoryCount) => {
    setFormData({ ...count });
    setEditingId(count.id);
    setCurrentView(AppView.IDENTIFY);
  };

  const handleDelete = (id: string | 'ALL') => {
    setDeleteModal({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    const targetUserId = currentUserId;
    const isSingleDelete = deleteModal.id !== 'ALL';
    const deleteId = deleteModal.id;
    
    if (!deleteId) return;

    // Save previous state for rollback in case of error
    const previousCounts = [...counts];

    // Close modal immediately for optimal UX
    setDeleteModal({ isOpen: false, id: '' });
    
    // OPTIMISTIC UPDATE: Update local state immediately for instant visual feedback
    if (deleteId === 'ALL') {
      setCounts([]);
      if (editingId) {
        setCurrentView(AppView.HOME);
        setEditingId(null);
      }
    } else {
      setCounts(prev => prev.filter((item) => item.id !== deleteId));
      if (editingId === deleteId) {
        setCurrentView(AppView.HOME);
        setEditingId(null);
      }
    }
    
    try {
      if (deleteId === 'ALL') {
        const batch = writeBatch(db);
        const q = query(collection(db, 'inventory'), where('userId', '==', targetUserId));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          showToast('Nenhum registro para apagar');
          return;
        }

        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        showToast('Todo o histórico foi apagado');
      } else {
        await deleteDoc(doc(db, 'inventory', deleteId));
        showToast('Registro excluído com sucesso');
      }
    } catch (error: any) {
      console.error("Delete Error:", error);
      
      // Rollback optimistic state change if Firebase deletion fails
      setCounts(previousCounts);
      
      let msg = 'Erro ao excluir registro';
      if (error.code === 'permission-denied') {
        msg = 'Permissão negada para excluir este item.';
      } else if (error.message && error.message.includes('insufficient permissions')) {
        msg = 'Erro de permissão no banco de dados.';
      }
      
      showToast(msg, 'error');
      // We don't re-throw here to prevent crashing the app
    }
  };

  const handleDeleteBrand = (brandName: string, count: number, pieces: number) => {
    setDeleteBrandModal({ isOpen: true, brandName, count, pieces });
  };

  const confirmDeleteBrand = async () => {
    const brandToDelete = deleteBrandModal.brandName;
    if (!brandToDelete) return;

    const previousCounts = [...counts];
    setDeleteBrandModal({ isOpen: false, brandName: '', count: 0, pieces: 0 });

    // Optimistic update
    setCounts(prev => prev.filter(c => (c.brand || '').toLowerCase().trim() !== brandToDelete.toLowerCase().trim()));

    try {
      // Delete from Firestore
      const q = query(collection(db, 'inventory'), where('brand', '==', brandToDelete));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
      }

      // Clear completed status
      const updatedStatuses = { ...completedBrands };
      delete updatedStatuses[brandToDelete];
      setCompletedBrands(updatedStatuses);
      const sharedDocRef = doc(db, 'shared_settings', 'brand_statuses');
      await setDoc(sharedDocRef, { completed: updatedStatuses, updatedAt: Date.now() }, { merge: true }).catch(() => {});

      showToast(`Marca "${brandToDelete}" e todos os seus lotes foram excluídos!`, 'success');
    } catch (err) {
      console.error("Error deleting brand:", err);
      setCounts(previousCounts);
      showToast('Erro ao excluir a marca do banco de dados.', 'error');
    }
  };

  const handleUpdateItemQuantity = async (itemId: string, newTotal: number) => {
    if (newTotal < 0) return;
    const targetItem = counts.find(c => c.id === itemId);
    if (!targetItem) return;

    const updatedItem = { ...targetItem, total: newTotal };
    setCounts(prev => prev.map(c => c.id === itemId ? updatedItem : c));

    try {
      const itemRef = doc(db, 'inventory', itemId);
      await updateDoc(itemRef, { total: newTotal, updatedAt: Date.now() });
      showToast('Quantidade atualizada com sucesso!', 'success');
    } catch (err) {
      console.error("Error updating item quantity:", err);
      showToast('Erro ao atualizar quantidade no servidor.', 'error');
    }
  };

  const handleAddCustomSize = () => {
    const size = newSizeInput.trim().toUpperCase();
    if (!size) return;
    
    // Check if it already exists in defaults or current sizes
    const currentSizes = formData.gridType === 'LETTER' ? LETTER_SIZES : NUMERIC_SIZES;
    if (currentSizes.includes(size) || (formData.sizes && formData.sizes[size] !== undefined)) {
      showToast('Este tamanho já existe', 'error');
      setNewSizeInput('');
      return;
    }

    setFormData(prev => ({
      ...prev,
      sizes: { ...(prev.sizes || {}), [size]: 0 }
    }));
    setNewSizeInput('');
    showToast(`Tamanho ${size} adicionado`);
  };

  const handleAIAnalysis = async () => {
    if (!process.env.GEMINI_API_KEY) {
      showToast('API Key do Gemini não configurada', 'error');
      return;
    }

    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const currentDataSummary = counts.map(c => ({
        produto: c.productType,
        modelo: c.model,
        marca: c.brand,
        grade: c.sizes,
        total: c.total,
        data: new Date(c.createdAt).toLocaleDateString('pt-BR')
      }));

      const prompt = `
        Aja como um especialista em logística e controle de estoque de uma loja de calçados e confecções chamada "Ideal Tecidos".
        Analise o histórico de contagens abaixo e forneça um relatório estratégico detalhado em Markdown.
        
        DADOS ATUAIS DO SISTEMA:
        ${JSON.stringify(currentDataSummary, null, 2)}
        
        ${pastedData ? `DADOS ADICIONAIS IMPORTADOS (TEXTO DE PDFS ANTIGOS):\n${pastedData}` : ''}
        
        O relatório deve conter:
        1. Resumo Executivo: Visão geral da saúde do estoque.
        2. Top Saídas/Entradas: O que está movimentando mais (baseado nos totais).
        3. Alerta de Compra Urgente: Itens com pouca grade ou muita saída.
        4. Itens de Baixa Rotação: O que parece estar parado ou tem poucas contagens.
        5. Sugestões Estratégicas: Dicas para melhorar as vendas ou a organização.
        
        Use um tom profissional, direto e encorajador.
        IMPORTANTE: Responda em Português do Brasil.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      setAiReport(response.text || 'Não foi possível gerar o relatório.');
      showToast('Análise completa!');
    } catch (error) {
      console.error(error);
      showToast('Erro ao processar análise', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateSizeCount = (size: string, value: string | number) => {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    const cleanNum = Math.max(0, isNaN(num) ? 0 : num);
    
    setFormData(prev => {
      const newSizes = { ...(prev.sizes || {}), [size]: cleanNum };
      const newTotal = Object.values(newSizes).reduce((sum: number, val: any) => sum + (val || 0), 0);
      return { ...prev, sizes: newSizes, total: newTotal };
    });
  };

  const adjustSizeCount = (size: string, delta: number) => {
    const current = formData.sizes?.[size] || 0;
    updateSizeCount(size, current + delta);
  };

  const saveInventory = async (): Promise<InventoryCount | null> => {
    if (isSaving) return null;

    // Sanitize data
    const productType = (formData.productType || 'Calçado').trim();
    const brand = (formData.brand || activeLockedReference?.brand || '').trim();
    let model = (formData.model || '').trim();

    if (!model && formData.barcode?.trim()) {
      model = `Cód ${formData.barcode.trim()}`;
    } else if (!model) {
      model = `Ref ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (!brand) {
      showToast('Por favor, selecione ou informe a Marca', 'error');
      return null;
    }

    setIsSaving(true);
    try {
      // Check for duplicate item created in last 2s to avoid duplicate cards from rapid double clicks
      const duplicateRecent = !editingId && counts.find(c => 
        c.brand?.toLowerCase().trim() === brand.toLowerCase() &&
        c.model?.toLowerCase().trim() === model.toLowerCase() &&
        (c.color || '').toLowerCase().trim() === (formData.color || '').toLowerCase().trim() &&
        c.arrivalMonth === (formData.arrivalMonth || '') &&
        c.arrivalYear === (formData.arrivalYear || '') &&
        Math.abs(Date.now() - (c.createdAt || 0)) < 2000
      );

      const inventoryRef = collection(db, 'inventory');
      const itemDoc = editingId 
        ? doc(db, 'inventory', editingId) 
        : (duplicateRecent ? doc(db, 'inventory', duplicateRecent.id) : doc(inventoryRef));
      
      const createdAt = editingId 
        ? counts.find(c => c.id === editingId)?.createdAt || Date.now() 
        : (duplicateRecent ? duplicateRecent.createdAt : Date.now());

      const syncGender = formData.gender || getGenderFromProductType(formData.productType) || 'M';
      const syncProductType = syncProductTypeWithGender(formData.productType, syncGender);

      const finalCount: InventoryCount = {
        id: itemDoc.id,
        barcode: (formData.barcode || '').trim() || '',
        productType: syncProductType,
        model,
        brand: (formData.brand || '').trim(),
        color: (formData.color || '').trim(),
        arrivalMonth: formData.arrivalMonth || '',
        arrivalYear: formData.arrivalYear || '',
        gridType: (formData.gridType as SizeGridType) || 'LETTER',
        sizes: formData.sizes as Record<string, number>,
        total: formData.total || 0,
        createdAt,
        userId: currentUserId || '',
        gender: syncGender
      };

      await setDoc(itemDoc, sanitizeForFirestore(finalCount));

      // Record stock movement for complete traceability
      const prevQty = editingId ? (counts.find(c => c.id === editingId)?.total || 0) : 0;
      recordStockMovement({
        userId: currentUserId,
        userName: 'Operador',
        brand: finalCount.brand,
        model: finalCount.model,
        color: finalCount.color,
        barcode: formData.barcode || 'S/C',
        previousQty: prevQty,
        movedQty: finalCount.total - prevQty,
        finalQty: finalCount.total,
        type: editingId ? 'AJUSTE' : 'ENTRADA',
        reason: editingId ? 'Ajuste de Contagem Manual' : 'Entrada / Contagem de Estoque'
      }).catch(err => console.warn("Could not log stock movement:", err));

      // If a barcode was provided in formData, sync reference to Firebase barcodes DB
      if (formData.barcode && formData.barcode.trim()) {
        try {
          await saveBarcodeReference({
            barcode: formData.barcode.trim(),
            brand: (formData.brand || '').trim(),
            model: (formData.model || '').trim(),
            productType: syncProductType,
            color: (formData.color || '').trim(),
            arrivalMonth: formData.arrivalMonth || '',
            arrivalYear: formData.arrivalYear || '',
            gridType: (formData.gridType as SizeGridType) || 'NUMERIC',
            sizes: (formData.sizes || {}) as Record<string, number>,
            total: formData.total || 0,
            gender: syncGender,
            userId: currentUserId
          });
        } catch (bErr) {
          console.warn("Could not sync barcode reference:", bErr);
        }
      }

      const newShoeInfo = {
        brand: finalCount.brand,
        model: finalCount.model,
        color: finalCount.color,
        gender: finalCount.gender,
        productType: finalCount.productType,
        arrivalMonth: finalCount.arrivalMonth,
        arrivalYear: finalCount.arrivalYear,
        gridType: finalCount.gridType
      };
      setLastShoeInfo(newShoeInfo);
      try {
        localStorage.setItem('ideal_last_shoe_info', JSON.stringify(newShoeInfo));
      } catch (e) {}

      showToast(editingId ? 'Registro atualizado' : 'Registro salvo com sucesso');
      setIsSaving(false);
      return finalCount;
    } catch (error: any) {
      console.error("Save Error Details:", error);
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
      
      let msg = 'Erro ao salvar no banco de dados';
      if (error.code === 'permission-denied') {
         msg = 'Permissão negada. Verifique as regras do banco.';
      } else if (error.message) {
         msg = `Erro: ${error.message}`;
      }
      
      showToast(msg, 'error');
      setIsSaving(false);
      return null;
    }
  };

  const generateSinglePDF = (item: Partial<InventoryCount>) => {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    // Header Design - Modern Navy Banner
    doc.setFillColor(15, 23, 42); // slate-900 / dark navy
    doc.rect(0, 0, 210, 16, 'F');
    doc.setFillColor(225, 29, 72); // rose-600 / brand red accent bar
    doc.rect(0, 16, 210, 2, 'F');
    
    // Brand Title
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text('IDEAL TECIDOS', 14, 30);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont(undefined, 'bold');
    doc.text('COMPROVANTE DE CONTAGEM DE ESTOQUE', 14, 36);

    // Metadata Card Box
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 43, 182, 32, 3, 3, 'FD');

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont(undefined, 'bold');
    doc.text('MARCA:', 20, 52);
    doc.text('MODELO:', 20, 59);
    doc.text('COR / TIPO:', 20, 66);

    doc.setTextColor(15, 23, 42);
    doc.text(item.brand?.toUpperCase() || '-', 48, 52);
    const modelWithGender = (item.model || '').toUpperCase() + (item.gender ? ` (${item.gender})` : '');
    doc.text(modelWithGender || '-', 48, 59);
    doc.text(`${item.color || '-'} (${item.productType || '-'})`, 48, 66);

    doc.setTextColor(100, 116, 139);
    doc.text('DATA:', 125, 52);
    doc.text('CHEGADA:', 125, 59);
    doc.text('TOTAL PEÇAS:', 125, 66);

    doc.setTextColor(15, 23, 42);
    doc.text(dateStr, 155, 52);
    doc.text(`${item.arrivalMonth || '--'}/${item.arrivalYear || '--'}`, 155, 59);
    
    doc.setFontSize(11);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.setFont(undefined, 'bold');
    doc.text(item.total?.toString() || '0', 155, 66);

    // Grid Table
    const tableRows = Object.entries(item.sizes || {})
      .filter(([_, qty]) => (qty as any) > 0)
      .map(([size, qty]) => [size, qty.toString()]);

    autoTable(doc, {
      startY: 83,
      head: [['Tamanho / Numeração', 'Quantidade Contada']],
      body: tableRows,
      theme: 'striped',
      headStyles: { 
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 9.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      bodyStyles: { textColor: [30, 41, 59] },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'center', fontSize: 11, fontStyle: 'bold', textColor: [15, 23, 42] }
      },
      margin: { left: 35, right: 35 }
    });

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(14, doc.internal.pageSize.getHeight() - 15, 196, doc.internal.pageSize.getHeight() - 15);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const footerText = `Documento emitido via Ideal Tecidos - Controle de Estoque | ${dateStr} às ${timeStr}`;
    doc.text(footerText, 14, doc.internal.pageSize.getHeight() - 9);

    const fileName = `Contagem_${item.model || 'Item'}_${item.color || ''}_${dateStr.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  };

  const generateBrandPDF = (brandName: string, brandItems: InventoryCount[]) => {
    if (!brandItems || brandItems.length === 0) {
      showToast(`A marca ${brandName} ainda não possui contagens registradas.`, 'error');
      return;
    }

    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    const totalPieces = brandItems.reduce((sum, item) => sum + item.total, 0);

    // Header Banner
    doc.setFillColor(15, 23, 42); // slate-900 / dark navy
    doc.rect(0, 0, 210, 16, 'F');
    doc.setFillColor(225, 29, 72); // rose-600 / brand red accent bar
    doc.rect(0, 16, 210, 2, 'F');
    
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text('IDEAL TECIDOS', 14, 28);
    
    doc.setFontSize(10);
    doc.setTextColor(225, 29, 72); // brand red
    doc.setFont(undefined, 'bold');
    doc.text(`RELATÓRIO ESPECÍFICO DE ESTOQUE - MARCA: ${brandName.toUpperCase()}`, 14, 34);
    
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont(undefined, 'normal');
    doc.text(`Gerado em: ${dateStr} às ${timeStr} | Total: ${totalPieces} peças em ${brandItems.length} lote(s)`, 14, 40);

    // Table data
    const tableRows = brandItems.map(item => {
      const sizesStr = Object.entries(item.sizes || {})
        .filter(([_, qty]) => (qty as any) > 0)
        .map(([size, qty]) => `${size}: ${qty}`)
        .join(', ');

      return [
        new Date(item.createdAt).toLocaleDateString('pt-BR'),
        item.brand || brandName || '-',
        (item.model || '') + (item.gender ? ` (${item.gender})` : ''),
        item.color || '-',
        `${item.arrivalMonth || ''}${item.arrivalMonth && item.arrivalYear ? '/' : ''}${item.arrivalYear || ''}` || '-',
        sizesStr || '-',
        item.total.toString()
      ];
    });

    autoTable(doc, {
      startY: 46,
      head: [['Data', 'Marca', 'Modelo', 'Cor', 'Chegada', 'Grade Contada', 'Total']],
      body: tableRows,
      theme: 'striped',
      headStyles: { 
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold'
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      bodyStyles: { textColor: [30, 41, 59] },
      foot: [[
        { content: `TOTAL ACUMULADO DA MARCA ${(brandName || '').toUpperCase()}`, colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totalPieces.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [225, 29, 72], textColor: [255, 255, 255], fontSize: 10 } }
      ]],
      styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { fontStyle: 'bold', cellWidth: 28 },
        2: { fontStyle: 'bold', cellWidth: 38 },
        3: { cellWidth: 22 },
        4: { halign: 'center', cellWidth: 20 },
        5: { cellWidth: 46 },
        6: { halign: 'center', fontStyle: 'bold', fontSize: 9.5, cellWidth: 16 }
      }
    });

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(14, doc.internal.pageSize.getHeight() - 15, 196, doc.internal.pageSize.getHeight() - 15);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const footerText = `Relatório por Marca - Ideal Tecidos Controle de Estoque | ${dateStr} às ${timeStr}`;
    doc.text(footerText, 14, doc.internal.pageSize.getHeight() - 9);

    const safeBrandName = brandName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Relatorio_Marca_${safeBrandName}_${dateStr.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    showToast(`PDF da marca ${brandName} baixado com sucesso!`, 'success');
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    const totalItems = filteredCounts.reduce((sum, item) => sum + item.total, 0);
    const brandAnalysisData = computeBrandSizeAnalysis(filteredCounts);

    // Header Design - Modern Dark Navy Banner with Red Accent
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 16, 'F');
    doc.setFillColor(225, 29, 72); // rose-600 accent
    doc.rect(0, 16, 210, 2, 'F');
    
    // Main Title
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text('IDEAL TECIDOS', 14, 28);
    
    doc.setFontSize(10);
    doc.setTextColor(225, 29, 72);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO GERAL DE CONTROLE E GIRO DE ESTOQUE', 14, 34);
    
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont(undefined, 'normal');
    doc.text(`Gerado em: ${dateStr} às ${timeStr} | Total Geral: ${totalItems} peças em estoque`, 14, 40);

    // Table data
    const tableRows = filteredCounts.map(item => {
      const sizesStr = Object.entries(item.sizes)
        .filter(([_, qty]) => (qty as any) > 0)
        .map(([size, qty]) => `${size}: ${qty}`)
        .join(', ');

      return [
        new Date(item.createdAt).toLocaleDateString('pt-BR'),
        item.brand || '-',
        item.model + (item.gender ? ` (${item.gender})` : ''),
        item.color || '-',
        `${item.arrivalMonth || ''}${item.arrivalMonth && item.arrivalYear ? '/' : ''}${item.arrivalYear || ''}` || '-',
        sizesStr || '-',
        item.total.toString()
      ];
    });

    autoTable(doc, {
      startY: 46,
      head: [['Data', 'Marca', 'Modelo', 'Cor', 'Chegada', 'Grade', 'Total']],
      body: tableRows,
      theme: 'striped',
      headStyles: { 
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold'
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      bodyStyles: { textColor: [30, 41, 59] },
      foot: [[
        { content: 'TOTAL GERAL ACUMULADO', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totalItems.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [225, 29, 72], textColor: [255, 255, 255], fontSize: 10 } }
      ]],
      styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { fontStyle: 'bold', cellWidth: 28 },
        2: { fontStyle: 'bold', cellWidth: 38 },
        3: { cellWidth: 20 },
        4: { halign: 'center', cellWidth: 18 },
        5: { cellWidth: 42 },
        6: { halign: 'center', fontStyle: 'bold', fontSize: 9.5, cellWidth: 16 }
      }
    });

    // Brand Size Analysis section in jsPDF
    if (brandAnalysisData.length > 0) {
      const finalY = (doc as any).lastAutoTable?.finalY || 120;
      let currentY = finalY + 12;
      
      if (currentY > 210) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text('CONTROLE DE GIRO DE NUMERAÇÕES POR MARCA', 14, currentY);
      
      currentY += 4.5;
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont(undefined, 'normal');
      doc.text('Classificação por volume de saída: Saindo Bastante (Alta), Saindo Mais ou Menos (Média), Saindo Pouco (Baixa)', 14, currentY);

      currentY += 4;

      const brandTableRows = brandAnalysisData.map(b => {
        const highStr = b.highOutputSizes.length > 0 
          ? b.highOutputSizes.map(s => `${s.size} (${s.qty}un)`).join(', ')
          : '-';
        const medStr = b.mediumOutputSizes.length > 0 
          ? b.mediumOutputSizes.map(s => `${s.size} (${s.qty}un)`).join(', ')
          : '-';
        const lowStr = b.lowOutputSizes.length > 0 
          ? b.lowOutputSizes.map(s => `${s.size} (${s.qty}un)`).join(', ')
          : '-';

        return [
          b.brandName,
          `${b.totalItems} un`,
          highStr,
          medStr,
          lowStr
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Marca', 'Total', 'Saindo Bastante (Alta)', 'Saindo Mais ou Menos (Média)', 'Saindo Pouco (Baixa)']],
        body: brandTableRows,
        theme: 'striped',
        headStyles: { 
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59] },
        styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 28 },
          1: { halign: 'center', cellWidth: 18 },
          2: { cellWidth: 46 },
          3: { cellWidth: 46 },
          4: { cellWidth: 44 }
        }
      });
    }

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(14, doc.internal.pageSize.getHeight() - 15, 196, doc.internal.pageSize.getHeight() - 15);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const footerText = `Relatório de Estoque Geral - Ideal Tecidos | ${dateStr} às ${timeStr}`;
    doc.text(footerText, 14, doc.internal.pageSize.getHeight() - 9);

    doc.save(`Relatorio_Estoque_IdealTecidos_${dateStr.replace(/\//g, '-')}.pdf`);
  };

  // Filtered counts
  const filteredCounts = useMemo(() => {
    let list = counts;
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      list = counts.filter(c => 
        c.productType.toLowerCase().includes(low) || 
        c.model.toLowerCase().includes(low) || 
        c.brand?.toLowerCase().includes(low)
      );
    }

    // Deduplicate identical items to prevent repeating duplicate cards in the list
    const uniqueList: InventoryCount[] = [];
    const seenKeys = new Set<string>();

    for (const item of list) {
      const sizesStr = JSON.stringify(item.sizes || {});
      const key = `${(item.brand || '').toLowerCase().trim()}_${(item.model || '').toLowerCase().trim()}_${(item.color || '').toLowerCase().trim()}_${item.arrivalMonth}_${item.arrivalYear}_${item.total}_${sizesStr}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueList.push(item);
      }
    }

    if (historySort === 'AZ') {
      uniqueList.sort((a, b) => {
        const brandA = (a.brand || '').toLowerCase().trim();
        const brandB = (b.brand || '').toLowerCase().trim();
        const brandComp = brandA.localeCompare(brandB, 'pt-BR');
        if (brandComp !== 0) return brandComp;
        const modelA = (a.model || '').toLowerCase().trim();
        const modelB = (b.model || '').toLowerCase().trim();
        return modelA.localeCompare(modelB, 'pt-BR');
      });
    } else {
      uniqueList.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return uniqueList;
  }, [counts, searchTerm, historySort]);

  // Brand size turnover analysis
  const brandAnalysis = useMemo(() => {
    return computeBrandSizeAnalysis(filteredCounts);
  }, [filteredCounts]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-dark text-white p-8">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="mb-6 opacity-20"
        >
          <Package size={60} strokeWidth={1} />
        </motion.div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Sincronizando Sistema...</p>
      </div>
    );
  }

  // Auth Overlay / Optional Login
  if (isEmailLogin && !user) {
    return (
      <div className="min-h-screen flex flex-col bg-brand-slate max-w-lg mx-auto p-6 items-center justify-center">
        <form onSubmit={handleEmailAuth} className="w-full space-y-4 bg-white p-8 rounded-[2rem] shadow-xl border border-gray-50 relative">
          <button type="button" onClick={() => setIsEmailLogin(false)} className="absolute top-6 left-6 text-brand-blue flex items-center gap-1 font-black text-[10px] uppercase">
            <ChevronLeft size={16} /> Voltar
          </button>
          
          <div className="text-center pt-8 mb-6">
            <h3 className="font-display font-black text-brand-dark uppercase text-xl leading-none">{isSignUp ? 'Criar Conta' : 'Área do Usuário'}</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{isSignUp ? 'Cadastre-se para salvar seu estoque' : 'Acesse seu estoque privado'}</p>
          </div>

          {authError && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3 mb-4">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={14} />
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">{authError}</p>
            </div>
          )}
          
          {isSignUp && (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">Nome Completo</label>
              <input 
                type="text" 
                required
                placeholder="Ex: João Silva"
                className="w-full p-4 bg-brand-slate rounded-xl border-2 border-transparent focus:border-brand-blue outline-none font-bold text-sm"
                value={emailForm.name}
                onChange={e => setEmailForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">E-mail</label>
            <input 
              type="email" 
              required
              placeholder="seu@email.com"
              className="w-full p-4 bg-brand-slate rounded-xl border-2 border-transparent focus:border-brand-blue outline-none font-bold text-sm"
              value={emailForm.email}
              onChange={e => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">Senha</label>
            <input 
              type="password" 
              required
              placeholder="••••••"
              className="w-full p-4 bg-brand-slate rounded-xl border-2 border-transparent focus:border-brand-blue outline-none font-bold text-sm"
              value={emailForm.password}
              onChange={e => setEmailForm(prev => ({ ...prev, password: e.target.value }))}
            />
          </div>

          <button 
            type="submit"
            disabled={loginLoading}
            className="w-full bg-brand-dark text-white py-5 rounded-2xl shadow-lg font-display font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all mt-4"
          >
            {loginLoading ? <Loader2 size={18} className="animate-spin" /> : (isSignUp ? 'Criar minha Conta' : 'Entrar no Sistema')}
          </button>

          <button 
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-center text-[10px] font-black text-brand-blue uppercase tracking-widest hover:underline pt-2"
          >
            {isSignUp ? 'Já possui conta? Faça Login' : 'Ainda não tem conta? Clique aqui'}
          </button>
        </form>
      </div>
    );
  }

  if (currentView === AppView.INVENTORY_MODE) {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8 font-black uppercase tracking-wider">Carregando Modo Inventário...</div>}>
        <InventoryModeModule
          currentUserId={currentUserId}
          onExit={() => setCurrentView(AppView.HOME)}
          showToast={showToast}
        />
      </React.Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-lg sm:max-w-xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto w-full bg-brand-slate shadow-2xl relative overflow-x-hidden font-sans">
      {/* HEADER (No Print) */}
      <header className="no-print bg-slate-950/95 backdrop-blur-md border-b border-slate-800 text-white py-3 px-4 sm:px-6 sticky top-0 z-50 flex items-center justify-between shadow-xl">
        <div 
          onClick={() => setCurrentView(AppView.HOME)}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
          title="Ir para a Página Inicial"
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 overflow-hidden shrink-0 group-hover:scale-105 transition-transform p-0.5">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="50" fill="#ffffff" />
              <path d="M -10 66 Q 50 54 110 66 L 110 110 L -10 110 Z" fill="#1D2B5B" />
              <path d="M -10 78 Q 50 67 110 78 L 110 110 L -10 110 Z" fill="#C02428" />
              <text x="50" y="27" textAnchor="middle" fill="#C02428" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="bold" fontSize="16" fontStyle="italic">A Ideal</text>
              <text x="50" y="45" textAnchor="middle" fill="#C02428" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="bold" fontSize="20" fontStyle="italic">Tecidos</text>
              <text x="50" y="57" textAnchor="middle" fill="#1D2B5B" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="6.2" letterSpacing="0.2">CALÇADOS E CONFECÇÕES</text>
            </svg>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-base sm:text-xl uppercase tracking-tight leading-none text-white group-hover:text-emerald-400 transition-colors">
                A Ideal Tecidos
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-brand-red/20 text-red-400 border border-brand-red/30 text-[9px] font-black uppercase tracking-wider">
                Estoque
              </span>
            </div>
            <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-blue-300 mt-1 leading-none">
              Calçados e Confecções
            </p>
            <p className="text-[9px] sm:text-[10.5px] font-bold text-amber-300 italic mt-0.5 leading-none">
              "A Loja da Sua Família"
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button 
            onClick={() => setCurrentView(AppView.DASHBOARD)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 border ${
              currentView === AppView.DASHBOARD
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/50'
                : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/30'
            }`}
            title="Abrir Dashboard"
          >
            <BarChart3 size={15} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <OfflineSyncBadge userId={currentUserId} showToast={showToast} />
          {currentView !== AppView.HOME && (
            <button 
              onClick={() => setCurrentView(AppView.HOME)}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
              title="Voltar ao Início"
            >
              <Home size={15} />
              <span className="hidden md:inline">Início</span>
            </button>
          )}
        </div>
      </header>

      {/* VIEWS */}
      <main className="flex-1 p-3.5 sm:p-5 md:p-6 pb-28 sm:pb-32 no-print space-y-5 sm:space-y-8">
        <AnimatePresence mode="wait">
          {currentView === AppView.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-5 sm:space-y-8"
            >
              {/* Summary Dashboard */}
              <div className="grid grid-cols-2 gap-3 sm:gap-5">
                <motion.div 
                  whileHover={{ y: -4 }}
                  className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] shadow-modern border border-gray-100 flex flex-col justify-between overflow-hidden relative group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-slate rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000 ease-out"></div>
                  <div className="mb-4 sm:mb-6 bg-brand-blue/5 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-brand-blue relative z-10 border border-brand-blue/5">
                    <LayoutGrid size={20} strokeWidth={2.5} className="sm:w-[22px] sm:h-[22px]" />
                  </div>
                  <div className="relative z-10">
                    <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Registros</span>
                    <span className="text-2xl sm:text-4xl font-display font-black text-brand-dark tracking-tighter">{counts.length}</span>
                  </div>
                </motion.div>
                
                <motion.div 
                  whileHover={{ y: -4 }}
                  className="bg-brand-blue p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] shadow-modern-lg flex flex-col justify-between text-white overflow-hidden relative group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000 ease-out"></div>
                  <div className="mb-4 sm:mb-6 bg-white/10 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-white relative z-10 backdrop-blur-sm border border-white/10">
                    <Package size={20} strokeWidth={2.5} className="sm:w-[22px] sm:h-[22px]" />
                  </div>
                  <div className="relative z-10">
                    <span className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest block mb-1">Peças Totais</span>
                    <span className="text-2xl sm:text-4xl font-display font-black tracking-tighter">{counts.reduce((sum, c) => sum + c.total, 0)}</span>
                  </div>
                </motion.div>
              </div>

              {/* Real-Time Brand Inventory Widget */}
              <motion.div 
                whileHover={{ y: -2 }}
                onClick={() => setCurrentView(AppView.INVENTORIES)}
                className="bg-gradient-to-br from-brand-dark via-[#1a254c] to-brand-blue text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] shadow-modern-lg cursor-pointer space-y-3 sm:space-y-4 border border-white/10 group relative overflow-hidden"
              >
                <div className="flex items-center justify-between relative z-10 gap-2">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={20} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-white truncate">Inventário de Marcas em Tempo Real</h3>
                      <p className="text-[9px] sm:text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                        {completedCount} de {allBrandsList.length} marcas concluídas
                      </p>
                    </div>
                  </div>
                  <ChevronLeft size={18} className="rotate-180 text-white/40 group-hover:text-white transition-colors shrink-0" />
                </div>

                <div className="space-y-1.5 relative z-10">
                  <div className="w-full bg-white/10 h-2.5 sm:h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
                    <div 
                      className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(3, (completedCount / (allBrandsList.length || 1)) * 100))}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-black uppercase text-white/60 tracking-wider">
                    <span>{inProgressCount} marcas em contagem</span>
                    <span className="text-emerald-300 font-black">Ver Inventário Completo →</span>
                  </div>
                </div>
              </motion.div>

              <div className="flex flex-col gap-3.5 sm:gap-5">

                {/* DASHBOARD PROFISSIONAL ACTION CARD */}
                <motion.button 
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCurrentView(AppView.DASHBOARD)}
                  className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-2xl shadow-indigo-950/40 flex items-center justify-between group active:brightness-95 transition-all text-left border-2 border-indigo-500/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 pr-2">
                    <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                      <BarChart3 size={22} strokeWidth={2.5} className="sm:w-7 sm:h-7" />
                    </div>
                    <div className="font-display min-w-0">
                      <span className="text-base sm:text-xl font-black tracking-tight uppercase leading-none mb-1 flex items-center gap-1.5 flex-wrap">
                        DASHBOARD
                        <span className="bg-emerald-400 text-slate-950 text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-extrabold uppercase whitespace-nowrap">Profissional</span>
                      </span>
                      <span className="block text-[9px] sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide leading-tight">Métricas, Gráficos, Top Marcas e Modelos</span>
                    </div>
                  </div>
                  <div className="px-3 sm:px-3.5 py-1.5 bg-emerald-500 text-slate-950 font-black uppercase text-[9px] sm:text-[10px] tracking-wider rounded-xl shadow-md group-hover:bg-emerald-400 transition-colors shrink-0">
                    Abrir
                  </div>
                </motion.button>



                <motion.button 
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartNew}
                  className="relative overflow-hidden bg-brand-red text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-2xl shadow-brand-red/30 flex items-center justify-between group active:brightness-95 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 pr-2">
                    <div className="bg-white/20 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:rotate-90 transition-transform duration-500 shadow-inner">
                      <Plus size={22} strokeWidth={3} className="sm:w-7 sm:h-7" />
                    </div>
                    <div className="text-left font-display min-w-0">
                      <span className="block text-base sm:text-xl font-black tracking-tight uppercase leading-tight mb-0.5">Nova Contagem Manual</span>
                      <span className="block text-[9px] sm:text-[10px] font-bold text-white/50 uppercase tracking-wide leading-tight">Registrar sem código</span>
                    </div>
                  </div>
                  <PlusCircle size={22} className="text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
                </motion.button>

                <div className="relative group">
                  <Search className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-accent transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="Filtrar por produto, marca..."
                    className="w-full pl-12 sm:pl-16 pr-10 sm:pr-12 py-4 sm:py-6 bg-white rounded-2xl sm:rounded-[2.2rem] shadow-modern border border-gray-100 focus:border-brand-accent/30 focus:ring-4 focus:ring-brand-accent/5 focus:outline-none transition-all text-sm sm:text-base font-bold placeholder:text-gray-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <motion.button 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setSearchTerm('')}
                      className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-brand-red rounded-full transition-colors active:scale-90"
                    >
                      <XCircle size={18} fill="currentColor" className="text-white" />
                    </motion.button>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between px-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-brand-dark/5 p-2 rounded-lg text-brand-dark/30">
                      <History size={14} strokeWidth={3} />
                    </div>
                    <div>
                      <h2 className="text-brand-dark font-black text-xs uppercase tracking-[0.2em] opacity-40">Histórico de Contagens</h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Sort Selector */}
                    <div className="flex items-center bg-gray-100/80 p-1 rounded-2xl border border-gray-200/80 text-[10px] font-black shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setHistorySort('AZ')}
                        className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                          historySort === 'AZ' 
                            ? 'bg-brand-dark text-white shadow-xs' 
                            : 'text-gray-500 hover:text-brand-dark'
                        }`}
                        title="Organizar marcas em ordem alfabética (A-Z)"
                      >
                        <ArrowUpDown size={12} />
                        Ordem Alfabética A-Z
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistorySort('DATE')}
                        className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                          historySort === 'DATE' 
                            ? 'bg-brand-dark text-white shadow-xs' 
                            : 'text-gray-500 hover:text-brand-dark'
                        }`}
                        title="Organizar pelas contagens mais recentes"
                      >
                        Mais Recentes
                      </button>
                    </div>

                    {counts.length > 0 && (
                      <button 
                        onClick={() => handleDelete('ALL')}
                        className="flex items-center gap-1.5 py-2 px-3.5 rounded-2xl bg-red-50 text-red-500 hover:bg-brand-red hover:text-white transition-all text-[9px] font-black uppercase tracking-widest shadow-2xs"
                      >
                        <Trash2 size={12} />
                        Limpar Tudo
                      </button>
                    )}
                  </div>
                </div>

              {filteredCounts.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-20 px-8 bg-white rounded-[2.5rem] border border-dashed border-gray-100 space-y-4 shadow-sm"
                  >
                    <div className="bg-brand-slate w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Package size={32} className="text-gray-200" />
                    </div>
                    <div>
                      <p className="text-brand-dark font-display font-bold text-lg leading-tight">Nenhum registro</p>
                      <p className="text-gray-400 text-sm">Sua base de movimentações está vazia ou os filtros não retornaram resultados.</p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="grid gap-6">
                    {filteredCounts.map((item, index) => (
                      <motion.div 
                        key={item.id} 
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingPdfItem(item);
                                }}
                                className="w-11 h-11 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-white hover:shadow-md transition-all active:scale-90"
                                title="Visualizar Comprovante / PDF"
                              >
                                <FileText size={18} strokeWidth={2.5} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(item);
                                }}
                                className="w-11 h-11 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-brand-blue hover:text-white transition-all active:scale-90"
                                title="Editar"
                              >
                                <Edit2 size={18} strokeWidth={2.5} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(item.id);
                                }}
                                className="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-brand-red hover:text-white transition-all active:scale-90"
                                title="Excluir"
                              >
                                <Trash2 size={18} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>

                          {/* Middle row: Brand (Bold) and Model / Details */}
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
                                    <p className="text-sm font-black text-brand-dark leading-none">{qty}</p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {currentView === AppView.IDENTIFY && (
            <motion.div 
              key="identify"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {activeLockedReference && (
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-5 rounded-[2.5rem] shadow-xl border border-indigo-500/30 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/30 shrink-0 shadow-inner">
                        <Lock size={22} strokeWidth={2.5} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            Contagem da Marca Travada
                          </span>
                        </div>
                        <h3 className="text-base font-black uppercase text-white mt-1 tracking-tight">
                          Marca: <span className="text-emerald-300">{activeLockedReference.brand || 'Não Informada'}</span>
                          {activeLockedReference.model && (
                            <span className="text-white/80 font-normal text-xs lowercase ml-2">
                              • Ref: {activeLockedReference.model}
                            </span>
                          )}
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleFinishActiveReference}
                      className="w-full sm:w-auto px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
                    >
                      <CheckCircle2 size={18} />
                      Concluir Marca/Referência
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-modern-lg space-y-6 border border-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-slate rounded-full -mr-16 -mt-16 opacity-50 pointer-events-none"></div>

                {/* Pre-fill status indicator & clear form action */}
                {(formData.brand || formData.model || formData.color) && (
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 relative z-10">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        ⚡ Dados do último lançamento mantidos
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          barcode: '',
                          productType: '',
                          model: '',
                          brand: '',
                          color: '',
                          arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
                          arrivalYear: new Date().getFullYear().toString(),
                          gridType: 'LETTER',
                          sizes: {},
                          total: 0,
                          gender: 'M'
                        });
                        showToast('Formulário limpo para novo modelo', 'success');
                      }}
                      className="text-[10px] font-black uppercase text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1 active:scale-95 bg-gray-50 hover:bg-red-50 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-red-200"
                    >
                      <RotateCcw size={12} />
                      Limpar Campos
                    </button>
                  </div>
                )}
                


                {/* Brand Selection with Dropdown */}
                <div className="space-y-2 relative z-10">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Marca</label>
                  <div className="relative group">
                    <select 
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:ring-0 focus:outline-none appearance-none font-display font-bold text-lg text-brand-dark transition-all pr-12"
                      value={formData.brand && DEFAULT_BRANDS_LIST.includes(formData.brand) ? formData.brand : (formData.brand === undefined || formData.brand === "" ? "" : "CUSTOM")}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "CUSTOM") {
                          setFormData(prev => ({ ...prev, brand: " " })); // Use space to indicate "typing"
                        } else {
                          setFormData(prev => ({ ...prev, brand: val }));
                        }
                      }}
                    >
                      <option value="">Selecione a Marca...</option>
                      {DEFAULT_BRANDS_LIST.map(brandName => <option key={brandName} value={brandName}>{brandName}</option>)}
                      <option value="CUSTOM">+ Outra Marca (Digitar)...</option>
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-brand-accent">
                      <LayoutGrid size={18} strokeWidth={2.5} />
                    </div>
                  </div>
                  {(formData.brand !== undefined && formData.brand !== "" && !DEFAULT_BRANDS_LIST.includes(formData.brand)) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <input 
                        type="text" 
                        placeholder="Digite o nome da marca personalizada..."
                        className="w-full p-5 bg-white border-2 border-brand-accent/20 rounded-2xl focus:border-brand-accent focus:outline-none font-bold text-brand-dark shadow-inner text-lg"
                        value={formData.brand === " " ? "" : formData.brand}
                        onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                        autoFocus
                      />
                      <p className="text-[9px] font-black text-brand-accent uppercase tracking-[0.2em] mt-3 ml-3 flex items-center gap-2">
                        <PlusCircle size={12} />
                        Nova Marca Identificada
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* Público / Gênero Selection */}
                <div className="space-y-2 relative z-10">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Público / Gênero</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-brand-slate p-2 rounded-2xl border border-gray-100">
                    {[
                      { id: 'M', code: 'M', label: 'Masculino', color: 'border-blue-500 bg-blue-50 text-blue-700' },
                      { id: 'F', code: 'F', label: 'Feminino', color: 'border-pink-500 bg-pink-50 text-pink-700' },
                      { id: 'IM', code: 'IM', label: 'Infantil Masc.', color: 'border-cyan-500 bg-cyan-50 text-cyan-700' },
                      { id: 'IF', code: 'IF', label: 'Infantil Fem.', color: 'border-purple-500 bg-purple-50 text-purple-700' },
                    ].map(opt => {
                      const isSelected = formData.gender === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            const newGender = formData.gender === opt.id ? '' : opt.id;
                            const newProductType = syncProductTypeWithGender(formData.productType, newGender);
                            setFormData(prev => ({ 
                              ...prev, 
                              gender: newGender,
                              productType: newProductType
                            }));
                          }}
                          className={`p-3 rounded-xl transition-all flex items-center gap-2.5 text-left border ${
                            isSelected 
                              ? `bg-white shadow-md text-brand-dark ${opt.color.split(' ')[0]}` 
                              : 'bg-white/70 hover:bg-white text-gray-500 border-transparent hover:border-gray-200'
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 border ${
                            isSelected ? opt.color : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            {opt.code}
                          </span>
                          <span className="text-xs font-black tracking-tight leading-none uppercase">
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row: Modelo & Cor */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 relative z-10">
                  <div className="md:col-span-7 space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Modelo</label>
                    <input 
                      type="text"
                      placeholder="Ex: Sport..."
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:outline-none font-display font-bold text-lg text-brand-dark transition-all"
                      value={formData.model}
                      onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                    />
                  </div>
                  
                  <div className="md:col-span-5 space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Cor</label>
                    <input 
                      type="text"
                      placeholder="Ex: Azul, Preto..."
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:outline-none font-display font-bold text-lg text-brand-dark transition-all"
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 relative z-10">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Mês Chegada</label>
                    <select 
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:outline-none appearance-none font-display font-bold text-lg text-brand-dark transition-all"
                      value={formData.arrivalMonth}
                      onChange={(e) => setFormData(prev => ({ ...prev, arrivalMonth: e.target.value }))}
                    >
                      <option value="">Mês...</option>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Ano Chegada</label>
                    <select 
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:outline-none appearance-none font-display font-bold text-lg text-brand-dark transition-all"
                      value={formData.arrivalYear}
                      onChange={(e) => setFormData(prev => ({ ...prev, arrivalYear: e.target.value }))}
                    >
                      <option value="">Ano...</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-4 space-y-4 relative z-10">
                  <div className="bg-brand-slate p-1.5 rounded-2xl flex gap-1 shadow-inner border border-gray-50">
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, gridType: 'LETTER' }))}
                      className={`flex-1 py-4 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${formData.gridType === 'LETTER' ? 'bg-white text-brand-blue shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      P/M/G
                    </button>
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, gridType: 'NUMERIC' }))}
                      className={`flex-1 py-4 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${formData.gridType === 'NUMERIC' ? 'bg-white text-brand-blue shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      34 a 44
                    </button>
                  </div>

                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    disabled={!formData.brand || !formData.model}
                    onClick={() => {
                      setCurrentView(AppView.COUNT);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full bg-brand-dark text-white py-5 rounded-2xl shadow-xl font-display font-black uppercase text-xs tracking-widest disabled:opacity-30 transition-all hover:bg-brand-blue flex items-center justify-center gap-3"
                  >
                    <span>Prosseguir</span>
                    <PlusCircle size={18} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === AppView.COUNT && (
            <motion.div 
              key="count"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {activeLockedReference && (
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-5 rounded-[2.5rem] shadow-xl border border-indigo-500/30 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/30 shrink-0 shadow-inner">
                        <Lock size={22} strokeWidth={2.5} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            Contagem da Marca Travada
                          </span>
                        </div>
                        <h3 className="text-base font-black uppercase text-white mt-1 tracking-tight">
                          Marca: <span className="text-emerald-300">{activeLockedReference.brand || 'Não Informada'}</span>
                          {activeLockedReference.model && (
                            <span className="text-white/80 font-normal text-xs lowercase ml-2">
                              • Ref: {activeLockedReference.model}
                            </span>
                          )}
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleFinishActiveReference}
                      className="w-full sm:w-auto px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
                    >
                      <CheckCircle2 size={18} />
                      Concluir Marca/Referência
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white p-6 rounded-[2rem] shadow-modern border border-gray-50 space-y-6">
                {/* Header Row */}
                <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                  <button 
                    type="button"
                    onClick={() => setCurrentView(AppView.IDENTIFY)} 
                    className="w-11 h-11 flex items-center justify-center bg-brand-slate hover:bg-brand-blue/10 rounded-2xl text-brand-blue active:scale-95 transition-all border border-gray-100 shrink-0 shadow-sm"
                  >
                    <ChevronLeft size={22} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl sm:text-2xl font-display font-black text-brand-dark tracking-tighter leading-none mb-1 uppercase">Contagem</h2>
                    <p className="text-[10px] text-brand-red uppercase font-black tracking-widest opacity-90 flex items-center gap-1.5 flex-wrap">
                      <span>{formData.productType}</span>
                      <span>•</span>
                      <span>{formData.model}</span>
                      {formData.gender && (
                        <>
                          <span>•</span>
                          <span className="px-1.5 py-0.5 bg-brand-red/10 text-brand-red rounded text-[9px] font-black uppercase">
                            {formData.gender === 'M' ? 'Masc' : formData.gender === 'F' ? 'Fem' : formData.gender === 'IM' ? 'Inf. Masc' : 'Inf. Fem'}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setFormData(prev => ({
                          ...prev,
                          model: '',
                          color: '',
                          sizes: {},
                          total: 0
                        }));
                        setCurrentView(AppView.IDENTIFY);
                        showToast('Salvar como Novo Item: Preencha o novo modelo/cor!', 'success');
                      }}
                      className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                      title="Clique para não alterar o item antigo e sim criar um novo cadastro para esta caixa"
                    >
                      <Plus size={14} strokeWidth={3} />
                      <span className="hidden sm:inline">Nova Caixa / Outro Modelo</span>
                      <span className="sm:hidden">Nova Caixa</span>
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {(() => {
                    const isInfantilStatus = (formData.productType || '').toLowerCase().includes('infantil') || 
                                             formData.gender === 'IM' || 
                                             formData.gender === 'IF';
                    const defaultSizes = formData.gridType === 'LETTER' 
                      ? LETTER_SIZES 
                      : (isInfantilStatus 
                          ? NUMERIC_SIZES.filter(s => {
                              const n = parseInt(s, 10);
                              return n >= 14 && n <= 37;
                            })
                          : NUMERIC_SIZES.filter(s => parseInt(s, 10) >= 33)
                        );
                    
                    // Get sizes from formData that aren't in defaults
                    const customSizes = Object.keys(formData.sizes || {}).filter(s => !defaultSizes.includes(s));
                    // Sort custom sizes: if numeric grid, try to sort numerically
                    const sortedCustom = customSizes.sort((a, b) => {
                      if (formData.gridType === 'NUMERIC') {
                        const na = parseInt(a, 10);
                        const nb = parseInt(b, 10);
                        if (!isNaN(na) && !isNaN(nb)) return na - nb;
                      }
                      return a.localeCompare(b);
                    });
                    
                    return [...defaultSizes, ...sortedCustom].map(size => (
                      <motion.div 
                        layout
                        key={size} 
                        className="grid grid-cols-[80px_1fr] items-center p-3 rounded-2xl bg-brand-slate/40 border border-white focus-within:bg-white focus-within:shadow-lg transition-all"
                      >
                        <div className="text-center border-r border-gray-100 pr-2">
                          <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Tamanho</label>
                          <span className="text-xl font-display font-black text-brand-dark">{size}</span>
                        </div>
                        
                        <div className="flex items-center gap-4 px-3">
                          <motion.button 
                            whileTap={{ scale: 0.9 }}
                            onClick={() => adjustSizeCount(size, -1)}
                            className="w-11 h-11 flex items-center justify-center bg-white rounded-xl shadow-sm text-red-500 border border-gray-100 active:bg-red-50"
                          >
                            <Minus size={18} strokeWidth={3} />
                          </motion.button>
                          
                          <input 
                            type="number"
                            inputMode="numeric"
                            min="0"
                            className="flex-1 w-full bg-transparent border-none text-center text-3xl font-display font-black text-brand-blue focus:ring-0 focus:outline-none placeholder:text-gray-100"
                            value={formData.sizes?.[size] || ''}
                            onChange={(e) => updateSizeCount(size, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            placeholder="0"
                          />
                          
                          <motion.button 
                            whileTap={{ scale: 0.9 }}
                            onClick={() => adjustSizeCount(size, 1)}
                            className="w-11 h-11 flex items-center justify-center bg-white rounded-xl shadow-sm text-brand-accent border border-gray-100 active:bg-blue-50"
                          >
                            <Plus size={18} strokeWidth={3} />
                          </motion.button>
                        </div>
                      </motion.div>
                    ));
                  })()}
                  
                  {/* ADD CUSTOM SIZE SECTION */}
                  <div className="mt-8 pt-6 border-t border-dashed border-gray-100 space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Não encontrou o tamanho?</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Ex: EX, 46, 48..."
                        className="flex-1 p-4 bg-brand-slate/30 border border-transparent focus:border-brand-accent/20 focus:bg-white rounded-xl focus:outline-none font-bold text-brand-dark placeholder:text-gray-300 text-sm"
                        value={newSizeInput}
                        onChange={(e) => setNewSizeInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSize()}
                      />
                      <button 
                        onClick={handleAddCustomSize}
                        className="bg-brand-dark text-white px-6 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-lg shadow-brand-dark/10 flex items-center gap-2"
                      >
                        <Plus size={16} strokeWidth={3} />
                        Adicionar
                      </button>
                    </div>
                  </div>
                  
                  {Object.values(formData.sizes || {}).some(v => (v as any) > 0) && (
                    <motion.button 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setFormData(prev => ({ ...prev, sizes: {}, total: 0 }))}
                      className="w-full py-4 text-[9px] font-black text-red-400 uppercase tracking-[0.3em] hover:text-red-500 transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle size={12} />
                      Zerar Grade
                    </motion.button>
                  )}
                </div>
              </div>

              <div className="bg-brand-dark p-6 rounded-[2.5rem] shadow-modern-lg flex flex-col gap-6 text-white overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-48 h-48 bg-brand-red rounded-full -mr-20 -mt-20 opacity-10 group-hover:scale-150 transition-transform duration-1000"></div>
                
                <div className="flex items-center justify-between relative z-10 px-1">
                  <div>
                    <p className="text-[9px] text-brand-red font-black uppercase tracking-[0.2em] mb-1 leading-none">Resumo do Lote</p>
                    <p className="text-6xl font-display font-black leading-none tracking-tighter text-white drop-shadow-xl animate-in zoom-in duration-500">{formData.total}</p>
                  </div>
                  <Package size={80} strokeWidth={1.5} className="text-white/10 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
                </div>

                <div className="flex flex-col gap-3 relative z-10 w-full">
                  {/* Option 1: Save & Next Reference */}
                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    disabled={isSaving}
                    onClick={handleSaveAndScanNextReference}
                    className="w-full bg-gradient-to-r from-red-600 via-brand-red to-rose-700 hover:brightness-110 shadow-xl shadow-brand-red/25 text-white py-5 rounded-[1.5rem] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 font-display border border-red-400/30"
                  >
                    {isSaving ? (
                      <Loader2 size={22} className="animate-spin" />
                    ) : (
                      <ArrowRight size={24} strokeWidth={2.5} />
                    )}
                    <div className="text-left leading-tight">
                      <span className="text-xs font-black uppercase tracking-[0.12em] block">
                        {isSaving ? 'Salvando...' : 'Salvar e Contar Próximo Modelo'}
                      </span>
                      <span className="text-[10px] font-bold text-red-100 uppercase tracking-wider block opacity-90">
                        {formData.brand ? `Continuar em ${formData.brand} • Próxima Referência` : 'Salvar e Ir para o Próximo'}
                      </span>
                    </div>
                  </motion.button>

                  {/* Option 2: Save & Conclude Brand */}
                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    disabled={isSaving}
                    onClick={async () => {
                      const currentBrand = formData.brand || '';
                      const success = await saveInventory();
                      if (success) {
                        if (currentBrand) {
                          await toggleBrandCompleted(currentBrand, true);
                        }
                        setCurrentView(AppView.INVENTORIES);
                        showToast(`Marca ${currentBrand || ''} concluída com sucesso!`);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/25 text-white py-4 rounded-[1.5rem] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 font-display"
                  >
                    <CheckCircle2 size={22} strokeWidth={2.5} />
                    <span className="text-xs font-black uppercase tracking-[0.12em]">
                      Salvar e Concluir Contagem Geral da Marca
                    </span>
                  </motion.button>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    {/* Option 3: Save & Type Model Manually */}
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isSaving}
                      onClick={async () => {
                        const currentBrand = formData.brand || '';
                        const success = await saveInventory();
                        if (success) {
                          handleStartWithSameBrand(currentBrand);
                          showToast(`Salvo! Digite o próximo modelo da marca ${currentBrand}`);
                        }
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white py-3.5 px-3 rounded-[1.2rem] border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Edit2 size={16} strokeWidth={2.5} />
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-center">Digitar Modelo</span>
                    </motion.button>

                    {/* Option 4: Save & Select Other Brand */}
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isSaving}
                      onClick={async () => {
                        const success = await saveInventory();
                        if (success) {
                          handleStartNew();
                          showToast('Salvo! Selecione uma nova marca');
                        }
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white py-3.5 px-3 rounded-[1.2rem] border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <PlusCircle size={16} strokeWidth={2.5} />
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-center">Outra Marca</span>
                    </motion.button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    {/* Option 3: Save & Go Home */}
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isSaving}
                      onClick={async () => {
                        const success = await saveInventory();
                        if (success) {
                          setCurrentView(AppView.HOME);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white py-4 rounded-[1.2rem] border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Home size={16} strokeWidth={2.5} />
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-center">Ir para o Início</span>
                    </motion.button>

                    {/* Option 4: Save & View Receipt */}
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isSaving}
                      onClick={async () => {
                        const success = await saveInventory();
                        if (success) {
                          setCurrentView(AppView.HOME);
                          setViewingPdfItem(success); // Immediately open visualizer
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white py-4 rounded-[1.2rem] border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Eye size={16} strokeWidth={2.5} />
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-center">Ver Comprovante</span>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === AppView.INVENTORIES && (
            <motion.div 
              key="inventories"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 pb-12"
            >
              {/* Header */}
              <div className="bg-white p-6 rounded-[2rem] shadow-modern border border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button 
                    type="button"
                    onClick={() => setCurrentView(AppView.HOME)} 
                    className="w-11 h-11 flex items-center justify-center bg-brand-slate hover:bg-brand-blue/10 rounded-2xl text-brand-blue active:scale-95 transition-all border border-gray-100 shrink-0 shadow-sm"
                  >
                    <ChevronLeft size={22} strokeWidth={3} />
                  </button>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-display font-black text-brand-dark tracking-tighter uppercase leading-none mb-1">Inventário por Marca</h2>
                    <p className="text-[10px] text-brand-blue font-black uppercase tracking-widest flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Atualização em Tempo Real
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="bg-brand-red text-white p-3 rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-lg shadow-brand-red/20 active:scale-95 transition-all"
                >
                  <Plus size={18} strokeWidth={3} />
                  <span className="hidden sm:inline uppercase">Contar</span>
                </button>
              </div>

              {/* Real-Time Progress Banner */}
              <div className="bg-brand-dark text-white p-6 sm:p-8 rounded-[2.5rem] shadow-modern-lg space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 block mb-1">Status de Cobertura do Estoque</span>
                    <h3 className="text-3xl font-display font-black tracking-tight">
                      {completedCount} de {allBrandsList.length} <span className="text-white/50 text-xl font-normal">Marcas Concluídas</span>
                    </h3>
                  </div>
                  <div className="text-right sm:text-left bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10 shrink-0">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/50 block">Peças Contadas</span>
                    <span className="text-3xl font-display font-black text-white">{counts.reduce((sum, c) => sum + c.total, 0)}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2 relative z-10">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-white/70">
                    <span>Progresso do Inventário</span>
                    <span>{Math.round((completedCount / (allBrandsList.length || 1)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-4 rounded-full overflow-hidden p-0.5 border border-white/10">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-700 shadow-sm"
                      style={{ width: `${Math.min(100, Math.max(2, (completedCount / (allBrandsList.length || 1)) * 100))}%` }}
                    ></div>
                  </div>
                </div>

                {/* Stats Pills */}
                <div className="grid grid-cols-3 gap-2 pt-2 relative z-10">
                  <div className="bg-emerald-500/15 border border-emerald-500/30 p-3 rounded-2xl text-center">
                    <span className="text-xl font-display font-black text-emerald-400 block leading-none mb-1">{completedCount}</span>
                    <span className="text-[8px] font-black uppercase tracking-wider text-emerald-200">Concluídas</span>
                  </div>
                  <div className="bg-blue-500/15 border border-blue-500/30 p-3 rounded-2xl text-center">
                    <span className="text-xl font-display font-black text-blue-400 block leading-none mb-1">{inProgressCount}</span>
                    <span className="text-[8px] font-black uppercase tracking-wider text-blue-200">Em Contagem</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 p-3 rounded-2xl text-center">
                    <span className="text-xl font-display font-black text-white/60 block leading-none mb-1">{pendingCount}</span>
                    <span className="text-[8px] font-black uppercase tracking-wider text-white/40">Pendentes</span>
                  </div>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text"
                    placeholder="Buscar marca no inventário..."
                    className="w-full pl-14 pr-10 py-4 bg-white rounded-2xl shadow-sm border border-gray-100 focus:border-brand-accent focus:outline-none font-bold text-sm text-brand-dark placeholder:text-gray-300"
                    value={brandSearchTerm}
                    onChange={(e) => setBrandSearchTerm(e.target.value)}
                  />
                  {brandSearchTerm && (
                    <button 
                      onClick={() => setBrandSearchTerm('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'ALL', label: `Todas (${allBrandsList.length})` },
                    { id: 'COMPLETED', label: `✅ Concluídas (${completedCount})` },
                    { id: 'IN_PROGRESS', label: `⏳ Em Contagem (${inProgressCount})` },
                    { id: 'PENDING', label: `⚪ Pendentes (${pendingCount})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setBrandStatusFilter(tab.id as any)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                        brandStatusFilter === tab.id
                          ? 'bg-brand-dark text-white border-brand-dark shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand List Cards */}
              <div className="space-y-3">
                {(() => {
                  const filtered = brandStats.filter(brand => {
                    const matchesSearch = brand.name.toLowerCase().includes(brandSearchTerm.toLowerCase());
                    if (!matchesSearch) return false;
                    if (brandStatusFilter === 'COMPLETED') return brand.status === 'COMPLETED';
                    if (brandStatusFilter === 'IN_PROGRESS') return brand.status === 'IN_PROGRESS';
                    if (brandStatusFilter === 'PENDING') return brand.status === 'PENDING';
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="bg-white p-12 rounded-[2rem] text-center border border-dashed border-gray-200 space-y-3">
                        <Package size={40} className="mx-auto text-gray-300" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Nenhuma marca encontrada</p>
                      </div>
                    );
                  }

                  return filtered.map(brand => {
                    const isExpanded = expandedBrand === brand.name;
                    return (
                      <div 
                        key={brand.name}
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
                              <h4 className="text-xl font-display font-black text-brand-dark uppercase tracking-tight truncate">
                                {brand.name}
                              </h4>
                              
                              {/* Status Badge */}
                              {brand.status === 'COMPLETED' && (
                                <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                                  <CheckCircle2 size={12} /> Concluída
                                </span>
                              )}
                              {brand.status === 'IN_PROGRESS' && (
                                <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 shrink-0">
                                  ⏳ Em Contagem ({brand.totalPieces} pcs)
                                </span>
                              )}
                              {brand.status === 'PENDING' && (
                                <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200 shrink-0">
                                  ⚪ Pendente
                                </span>
                              )}
                            </div>

                            {/* Stats Pills (No vertical line wrapping) */}
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-600 flex-wrap pt-0.5">
                              <span className="bg-gray-100/90 text-brand-dark px-3 py-1 rounded-xl whitespace-nowrap border border-gray-200/50">
                                <strong className="text-brand-blue font-black">{brand.totalPieces}</strong> peças total
                              </span>
                              <span className="bg-gray-100/90 text-brand-dark px-3 py-1 rounded-xl whitespace-nowrap border border-gray-200/50">
                                <strong className="text-brand-blue font-black">{brand.totalModels}</strong> modelos
                              </span>
                              <span className="bg-gray-100/90 text-brand-dark px-3 py-1 rounded-xl whitespace-nowrap border border-gray-200/50">
                                <strong className="text-brand-blue font-black">{brand.totalLots}</strong> lotes
                              </span>
                            </div>
                          </div>

                          {/* Top Right Quick Delete Icon */}
                          <button
                            type="button"
                            onClick={() => handleDeleteBrand(brand.name, brand.totalLots, brand.totalPieces)}
                            title={`Excluir a marca ${brand.name}`}
                            className="p-2.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl active:scale-90 transition-all border border-transparent hover:border-rose-100 shrink-0"
                          >
                            <Trash2 size={20} strokeWidth={2.2} />
                          </button>
                        </div>

                        {/* Action Buttons Row */}
                        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
                          {/* Pré-Visualização / Contagem Geral */}
                          {brand.items.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewingBrandPreview({ brandName: brand.name, items: brand.items })}
                              title={`Pré-visualizar contagem geral da marca ${brand.name}`}
                              className="p-2.5 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-black text-xs flex items-center gap-1.5 border border-indigo-200 shadow-xs active:scale-95 transition-all"
                            >
                              <Eye size={16} strokeWidth={2.5} />
                              <span className="text-[10px] uppercase tracking-wider">
                                Pré-Visualizar
                              </span>
                            </button>
                          )}

                          {/* Editar / Atualizar Contagens */}
                          <button
                            type="button"
                            onClick={() => setBrandEditModal({ isOpen: true, brandName: brand.name })}
                            title={`Editar ou atualizar números da marca ${brand.name}`}
                            className="p-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl font-black text-xs flex items-center gap-1.5 border border-amber-200 shadow-xs active:scale-95 transition-all"
                          >
                            <Edit2 size={16} strokeWidth={2.5} />
                            <span className="text-[10px] uppercase tracking-wider">
                              Editar / Atualizar
                            </span>
                          </button>

                          {/* Ver Lotes */}
                          {brand.items.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedBrand(isExpanded ? null : brand.name)}
                              title={`Ver lotes de ${brand.name}`}
                              className="p-2.5 px-3.5 bg-blue-50 hover:bg-blue-100 text-brand-blue rounded-2xl font-black text-xs flex items-center gap-1.5 border border-blue-200 shadow-xs active:scale-95 transition-all"
                            >
                              <Eye size={16} strokeWidth={2.5} />
                              <span className="text-[10px] uppercase tracking-wider">
                                {isExpanded ? 'Ocultar Lotes' : 'Ver Lotes'}
                              </span>
                            </button>
                          )}

                          {/* Baixar PDF da Marca */}
                          {brand.items.length > 0 && (
                            <button
                              type="button"
                              onClick={() => generateBrandPDF(brand.name, brand.items)}
                              title={`Baixar PDF da marca ${brand.name}`}
                              className="p-2.5 px-3.5 bg-red-50 hover:bg-red-100 text-brand-red rounded-2xl font-black text-xs flex items-center gap-1.5 border border-red-200 shadow-xs active:scale-95 transition-all"
                            >
                              <Download size={16} strokeWidth={2.5} />
                              <span className="text-[10px] uppercase tracking-wider">
                                PDF
                              </span>
                            </button>
                          )}

                          {/* Toggle Concluded */}
                          <button
                            type="button"
                            onClick={() => {
                              toggleBrandCompleted(brand.name);
                              showToast(
                                completedBrands[brand.name] 
                                  ? `Marca ${brand.name} reaberta` 
                                  : `Marca ${brand.name} concluída!`,
                                'success'
                              );
                            }}
                            title={completedBrands[brand.name] ? 'Reabrir contagem' : 'Marcar como Concluída'}
                            className={`p-2.5 px-3.5 rounded-2xl border font-black text-xs flex items-center gap-1.5 transition-all ${
                              completedBrands[brand.name]
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-gray-50 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 border-gray-200'
                            }`}
                          >
                            <CheckCircle2 size={16} strokeWidth={2.5} />
                            <span className="text-[10px] uppercase tracking-wider">
                              {completedBrands[brand.name] ? 'Concluída' : 'Concluir'}
                            </span>
                          </button>

                          {/* Start/Continue Count */}
                          <button
                            type="button"
                            onClick={() => handleStartWithSameBrand(brand.name)}
                            className="p-2.5 px-3.5 bg-brand-blue hover:bg-brand-dark text-white rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all ml-auto"
                            title={`Contar ${brand.name}`}
                          >
                            <Plus size={16} strokeWidth={3} />
                            <span className="text-[10px] uppercase tracking-wider">Contar</span>
                          </button>
                        </div>

                        {/* Accordion toggle if items exist */}
                        {brand.items.length > 0 && (
                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-400">
                            <span>
                              Último lançamento: {new Date(brand.items[0]?.createdAt || 0).toLocaleDateString('pt-BR')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteBrand(brand.name, brand.totalLots, brand.totalPieces)}
                              className="text-rose-500 hover:underline flex items-center gap-1 font-black uppercase text-[10px]"
                            >
                              <Trash2 size={12} />
                              Excluir Marca
                            </button>
                          </div>
                        )}

                        {/* Expanded Items List */}
                        {isExpanded && brand.items.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-3 space-y-2 pt-2 border-t border-dashed border-gray-200"
                          >
                            {brand.items.map(item => (
                              <div key={item.id} className="p-3 bg-brand-slate/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs font-bold text-brand-dark gap-2 border border-gray-100">
                                <div className="min-w-0 flex-1">
                                  <span className="block font-black text-sm uppercase truncate">{item.model}</span>
                                  <span className="text-[10px] text-gray-500 font-normal block truncate">
                                    Cor: {item.color || '-'} | Gênero: {item.gender || '-'} | Chegada: {item.arrivalMonth || '--'}/{item.arrivalYear || '--'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap">
                                  <span className="px-3 py-1 bg-white rounded-xl text-brand-blue font-black text-sm shadow-xs border border-gray-100">
                                    {item.total} pcs
                                  </span>
                                  <button 
                                    onClick={() => handleEdit(item)} 
                                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-[10px] uppercase rounded-xl flex items-center gap-1 border border-amber-200 active:scale-95 transition-all"
                                    title="Editar este lote"
                                  >
                                    <Edit2 size={14} strokeWidth={2.5} />
                                    <span>Editar</span>
                                  </button>
                                  <button 
                                    onClick={() => setViewingPdfItem(item)} 
                                    className="p-1.5 text-brand-blue hover:bg-white rounded-xl active:scale-90 transition-all border border-transparent hover:border-gray-200 shadow-xs"
                                    title="Pré-visualizar Comprovante / PDF"
                                  >
                                    <Eye size={16} strokeWidth={2.5} />
                                  </button>
                                  <button 
                                    onClick={() => generateSinglePDF(item)} 
                                    className="p-1.5 text-brand-red hover:bg-white rounded-xl active:scale-90 transition-all border border-transparent hover:border-gray-200 shadow-xs"
                                    title="Baixar PDF do Lote"
                                  >
                                    <Download size={16} strokeWidth={2.5} />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(item.id)} 
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl active:scale-90 transition-all border border-transparent hover:border-rose-200"
                                    title="Excluir Lote"
                                  >
                                    <Trash2 size={16} strokeWidth={2.5} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          )}

          {currentView === AppView.ANALYTICS && (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6 pb-10"
            >
              <div className="bg-white p-6 rounded-[2rem] shadow-modern border border-gray-50">
                <div className="flex items-center gap-4">
                  <button 
                    type="button"
                    onClick={() => setCurrentView(AppView.HOME)} 
                    className="w-11 h-11 flex items-center justify-center bg-brand-slate hover:bg-brand-blue/10 rounded-2xl text-brand-blue active:scale-95 transition-all border border-gray-100 shrink-0 shadow-sm"
                  >
                    <ChevronLeft size={22} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl sm:text-2xl font-display font-black text-brand-dark tracking-tighter uppercase leading-none mb-1">Visão Geral</h2>
                    <p className="text-[10px] text-brand-red uppercase font-black tracking-widest opacity-90">Estatísticas & Inteligencia IA</p>
                  </div>
                </div>
              </div>

              {/* Quick Metrics Bento Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between h-32">
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total de Itens</span>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-display font-black text-brand-dark">{counts.reduce((sum, c) => sum + c.total, 0)}</span>
                    <Package size={20} className="text-brand-blue opacity-20 mb-1" />
                  </div>
                </div>
                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between h-32">
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Diferentes Modelos</span>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-display font-black text-brand-dark">{new Set(counts.map(c => c.model)).size}</span>
                    <LayoutGrid size={20} className="text-brand-red opacity-20 mb-1" />
                  </div>
                </div>
              </div>

              {/* Pie Chart: Distribution by Category */}
              <div className="bg-white p-6 rounded-[2.5rem] shadow-modern border border-gray-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-black text-brand-dark uppercase text-xs tracking-widest">Distribuição por Categoria</h3>
                    <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Volume total de peças</p>
                  </div>
                  <TrendingUp size={20} className="text-brand-blue opacity-20" />
                </div>
                
                <div className="h-56 w-full">
                  {counts.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={(() => {
                            const summary: Record<string, number> = {};
                            counts.forEach(c => {
                              summary[c.productType] = (summary[c.productType] || 0) + c.total;
                            });
                            return Object.entries(summary)
                              .map(([name, value]) => ({ name, value }))
                              .sort((a, b) => b.value - a.value)
                              .slice(0, 5);
                          })()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {counts.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={['#1D2B5B', '#C02428', '#34A853', '#FBBC05', '#EA4335'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3 justify-center">
                  {(() => {
                    const summary: Record<string, number> = {};
                    counts.forEach(c => {
                      summary[c.productType] = (summary[c.productType] || 0) + c.total;
                    });
                    const colors = ['#1D2B5B', '#C02428', '#34A853', '#FBBC05', '#EA4335'];
                    return Object.entries(summary)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([name, _], i) => (
                        <div key={name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }}></div>
                          <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">{name}</span>
                        </div>
                      ));
                  })()}
                </div>
              </div>

              {/* Bar Chart: Items by Model */}
              <div className="bg-brand-dark text-white p-8 rounded-[2.5rem] shadow-modern-lg space-y-8 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-blue rounded-full -mr-32 -mt-32 opacity-10"></div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <h3 className="font-display font-black text-2xl uppercase tracking-tighter leading-none mb-1">Modelos em Destaque</h3>
                    <p className="text-[9px] text-brand-red font-black uppercase tracking-widest">Maiores volumes registrados</p>
                  </div>
                  <TrendingUp size={32} className="text-white/20" />
                </div>

                <div className="h-48 w-full relative z-10 -ml-4">
                  {counts.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(() => {
                        const summary: Record<string, number> = {};
                        counts.forEach(c => {
                          const key = `${c.model} (${c.productType.substring(0,3)})`;
                          summary[key] = (summary[key] || 0) + c.total;
                        });
                        return Object.entries(summary)
                          .map(([name, value]) => ({ name, value }))
                          .sort((a, b) => b.value - a.value)
                          .slice(0, 5);
                      })()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={40}
                          tick={{ fill: '#ffffff80', fontSize: 8, fontWeight: 'bold' }} 
                          tickFormatter={(val: string) => (val && val.length > 10 ? `${val.substring(0, 9)}…` : val)}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                          contentStyle={{ backgroundColor: '#1d2b5b', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={35}>
                          {counts.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={['#C02428', '#ffffff40', '#ffffff20', '#ffffff10', '#ffffff05'][index % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center border border-dashed border-white/10 rounded-2xl">
                      <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em]">Sem dados para exibir</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Brand Size Turnover Analysis Card */}
              {brandAnalysis.length > 0 && (
                <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-modern border border-gray-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-black text-brand-dark uppercase text-sm tracking-tight mb-0.5">
                        Giro de Numerações por Marca
                      </h3>
                      <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest">
                        Análise de saída de tamanhos (Alta, Média e Baixa)
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center font-black">
                      <TrendingUp size={18} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {brandAnalysis.map(b => (
                      <div key={b.brandName} className="p-4 bg-brand-slate/40 rounded-3xl border border-gray-100 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-200/60">
                          <span className="font-display font-black text-brand-dark uppercase text-xs">{b.brandName}</span>
                          <span className="text-[9px] font-black bg-brand-blue text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                            {b.totalItems} pares
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {/* Saindo Bastante */}
                          <div className="p-2.5 bg-emerald-50/90 border border-emerald-200/60 rounded-2xl space-y-1">
                            <div className="text-[9px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Saindo Bastante
                            </div>
                            {b.highOutputSizes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {b.highOutputSizes.map(s => (
                                  <span key={s.size} className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-lg text-[9px] font-black">
                                    {s.size}: {s.qty}un
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] text-gray-400 italic">Nenhum</span>
                            )}
                          </div>

                          {/* Saindo Mais ou Menos */}
                          <div className="p-2.5 bg-amber-50/90 border border-amber-200/60 rounded-2xl space-y-1">
                            <div className="text-[9px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Saindo Mais ou Menos
                            </div>
                            {b.mediumOutputSizes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {b.mediumOutputSizes.map(s => (
                                  <span key={s.size} className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg text-[9px] font-black">
                                    {s.size}: {s.qty}un
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] text-gray-400 italic">Nenhum</span>
                            )}
                          </div>

                          {/* Saindo Pouco */}
                          <div className="p-2.5 bg-rose-50/90 border border-rose-200/60 rounded-2xl space-y-1">
                            <div className="text-[9px] font-black text-rose-800 uppercase tracking-wider flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              Saindo Pouco
                            </div>
                            {b.lowOutputSizes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {b.lowOutputSizes.map(s => (
                                  <span key={s.size} className="bg-rose-100 text-rose-900 px-2 py-0.5 rounded-lg text-[9px] font-black">
                                    {s.size}: {s.qty}un
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] text-gray-400 italic">Nenhum</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </motion.div>
          )}

          {currentView === AppView.BARCODE_FIREBASE && (
            <motion.div
              key="barcode-firebase"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setCurrentView(AppView.HOME)}
                  className="flex items-center gap-2 text-xs font-black text-brand-blue uppercase hover:underline"
                >
                  <ChevronLeft size={18} /> Voltar ao Início
                </button>
              </div>

              <React.Suspense fallback={<div className="p-8 text-center text-gray-400 font-bold">Carregando Banco de Códigos...</div>}>
                <BarcodeScannerManager
                  currentUserId={currentUserId}
                  showToast={showToast}
                  onSelectForCounting={handleSelectBarcodeForCounting}
                  activeLockedReference={activeLockedReference}
                  onFinishActiveReference={handleFinishActiveReference}
                />
              </React.Suspense>
            </motion.div>
          )}

          {currentView === AppView.DASHBOARD && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <React.Suspense fallback={<div className="p-8 text-center text-slate-400 font-bold">Carregando Dashboard de Indicadores...</div>}>
                <DashboardModule
                  counts={counts}
                  onBackToHome={() => setCurrentView(AppView.HOME)}
                  showToast={showToast}
                />
              </React.Suspense>
            </motion.div>
          )}

          {currentView === AppView.REPORTS && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <React.Suspense fallback={<div className="p-8 text-center text-slate-400 font-bold">Carregando Módulo de Relatórios...</div>}>
                <ReportsModule
                  counts={counts}
                  onBackToHome={() => setCurrentView(AppView.HOME)}
                  showToast={showToast}
                />
              </React.Suspense>
            </motion.div>
          )}

          {currentView === AppView.STOCK_MOVEMENTS && (
            <motion.div
              key="stock-movements"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setCurrentView(AppView.HOME)}
                  className="flex items-center gap-2 text-xs font-black text-brand-blue uppercase hover:underline"
                >
                  <ChevronLeft size={18} /> Voltar ao Início
                </button>
              </div>

              <React.Suspense fallback={<div className="p-8 text-center text-gray-400 font-bold">Carregando Histórico de Movimentações...</div>}>
                <StockMovementHistoryModule
                  currentUserId={currentUserId}
                  userName="Operador"
                  showToast={showToast}
                />
              </React.Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MISMATCH MODAL IF DIFFERENT BARCODE/BRAND SCANNED WHILE REFERENCE IS LOCKED */}
        {mismatchModalData && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-red-100 space-y-6 relative overflow-hidden"
            >
              <div className="flex items-center gap-4 text-amber-700 bg-amber-50 p-4 rounded-2xl border border-amber-200">
                <div className="p-3 bg-amber-500 text-white rounded-xl shadow-md shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h4 className="font-black uppercase text-sm text-amber-900 leading-tight">
                    Marca / Referência Diferente!
                  </h4>
                  <p className="text-xs font-medium text-amber-800 mt-0.5">
                    Sua contagem está travada na referência atual.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs font-medium text-gray-700 bg-slate-50 p-4 rounded-2xl border border-gray-100">
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    🔒 Em Contagem Ativa (Travada):
                  </span>
                  <p className="font-bold text-sm text-brand-dark uppercase">
                    {activeLockedReference?.brand || 'Sem Marca'} {activeLockedReference?.model ? `- ${activeLockedReference.model}` : ''}
                  </p>
                  {activeLockedReference?.barcode && (
                    <p className="font-mono text-[11px] text-gray-500 mt-0.5">Cód: {activeLockedReference.barcode}</p>
                  )}
                </div>

                <hr className="border-gray-200 my-2" />

                <div>
                  <span className="block text-[10px] font-black uppercase tracking-wider text-red-500 mb-1">
                    ⚡ Novo Código Bipado:
                  </span>
                  <p className="font-bold text-sm text-red-600 uppercase">
                    {mismatchModalData.newScannedData.brand || 'Nova Marca / Não Cadastrada'} {mismatchModalData.newScannedData.model ? `- ${mismatchModalData.newScannedData.model}` : ''}
                  </p>
                  <p className="font-mono text-[11px] text-gray-500 mt-0.5">Cód: {mismatchModalData.newScannedData.barcode}</p>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center font-medium leading-relaxed">
                Para evitar misturar marcas ou referências durante a contagem, escolha o que deseja fazer:
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setMismatchModalData(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-sm"
                >
                  Permanecer na Marca Atual ({activeLockedReference?.brand || 'Atual'})
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmSwitchReference(mismatchModalData.newScannedData)}
                  className="w-full py-4 bg-brand-red hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  Concluir Atual e Contar Nova Marca ({mismatchModalData.newScannedData.brand || 'Nova'})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>

      <footer className="no-print pb-40 px-6 text-center">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] leading-relaxed">
          Ideal Tecidos - Controle de Estoque<br/>
          <span className="text-brand-blue/40">Desenvolvido pelo Engenheiro de Software Sergio Bruce</span>
        </p>
      </footer>

       {/* FIXED FOOTER NAVIGATION (No Print) */}
      <nav className="no-print fixed bottom-0 left-0 right-0 max-w-lg mx-auto p-4 z-50">
        <div className="bg-brand-blue/95 backdrop-blur-xl rounded-[2.5rem] p-2 flex gap-1 shadow-2xl shadow-brand-blue/40 border border-white/10">
          <button 
            onClick={() => setCurrentView(AppView.HOME)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-4 rounded-[1.8rem] transition-all duration-500 ${currentView === AppView.HOME ? 'bg-white text-brand-blue shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            <Home size={18} fill={currentView === AppView.HOME ? "currentColor" : "none"} />
            <span className="text-[9px] font-black uppercase tracking-wider leading-none">Início</span>
          </button>

          <button 
            onClick={() => setCurrentView(AppView.INVENTORIES)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-4 rounded-[1.8rem] transition-all duration-500 ${currentView === AppView.INVENTORIES ? 'bg-white text-brand-blue shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            <ClipboardList size={18} />
            <span className="text-[9px] font-black uppercase tracking-wider leading-none">Marcas</span>
          </button>
          
          <button 
            onClick={() => setCurrentView(AppView.ANALYTICS)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-4 rounded-[1.8rem] transition-all duration-500 ${currentView === AppView.ANALYTICS ? 'bg-white text-brand-blue shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            <BrainCircuit size={18} />
            <span className="text-[9px] font-black uppercase tracking-wider leading-none">Análise</span>
          </button>

          <button 
            onClick={generatePDF}
            className="flex-1 flex items-center justify-center gap-1.5 py-4 rounded-[1.8rem] text-white/40 hover:text-white hover:bg-white/5 transition-all duration-300"
          >
            <Download size={18} />
            <span className="text-[9px] font-black uppercase tracking-wider leading-none">PDF</span>
          </button>
        </div>
      </nav>

      {/* PRINT REPORT (Hidden on screen, visible on print) */}
      <div className="print-only">
        {/* Executive Header Banner */}
        <div className="mb-6 p-6 bg-slate-900 text-white rounded-2xl flex justify-between items-center shadow-md">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white uppercase">A IDEAL TECIDOS</h1>
            <p className="text-rose-400 font-black text-xs uppercase tracking-[0.25em] mt-0.5">Calçados e Confecções</p>
            <p className="text-slate-400 text-[10px] font-medium tracking-wide mt-1">SISTEMA DE CONTROLE E GIRO DE ESTOQUE</p>
          </div>
          <div className="text-right border-l border-slate-700 pl-6">
            <span className="inline-block px-3 py-1 bg-slate-800 text-rose-300 rounded text-[9px] font-black uppercase tracking-wider mb-1">
              Documento Oficial
            </span>
            <p className="text-xs font-bold text-slate-200">Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total em Estoque</p>
            <p className="text-2xl font-black text-brand-red mt-1">
              {filteredCounts.reduce((sum, item) => sum + item.total, 0)} <span className="text-xs font-bold text-slate-500">un/pares</span>
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Lotes Registrados</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{filteredCounts.length} <span className="text-xs font-bold text-slate-500">lotes</span></p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Marcas Analisadas</p>
            <p className="text-2xl font-black text-brand-blue mt-1">{brandAnalysis.length} <span className="text-xs font-bold text-slate-500">marcas</span></p>
          </div>
        </div>

        {/* Primary Inventory Table (Print View) */}
        <table className="w-full border-collapse text-xs border border-slate-300 mb-8 rounded-lg overflow-hidden shadow-sm">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-slate-800">Data</th>
              <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-slate-800">Produto</th>
              <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-slate-800">Modelo</th>
              <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-slate-800">Marca</th>
              <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-slate-800">Cor</th>
              <th className="p-2.5 text-center font-black uppercase tracking-wider border-r border-slate-800">Chegada</th>
              <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-slate-800">Grade (Numerações)</th>
              <th className="p-2.5 text-center font-black uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredCounts.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="p-2.5 text-slate-600 font-bold border-b border-r border-slate-200 whitespace-nowrap">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-2.5 font-black text-slate-900 uppercase border-b border-r border-slate-200">{item.productType}</td>
                <td className="p-2.5 font-black text-brand-blue border-b border-r border-slate-200">{item.model}{item.gender ? ` (${item.gender})` : ''}</td>
                <td className="p-2.5 font-black text-slate-800 uppercase border-b border-r border-slate-200">{item.brand || '-'}</td>
                <td className="p-2.5 font-bold text-slate-600 uppercase border-b border-r border-slate-200">{item.color || '-'}</td>
                <td className="p-2.5 font-bold text-center text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">
                  {item.arrivalMonth && item.arrivalYear ? `${item.arrivalMonth}/${item.arrivalYear}` : (item.arrivalMonth || item.arrivalYear || '-')}
                </td>
                <td className="p-2.5 border-b border-r border-slate-200">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(item.sizes)
                      .filter(([_, qty]) => (qty as any) > 0)
                      .map(([size, qty]) => (
                        <span key={size} className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-black text-[10px] border border-slate-300">
                          {size}: {qty}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="p-2.5 text-center text-sm font-black text-brand-red border-b border-slate-200 whitespace-nowrap">{item.total} un</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white font-black">
              <td colSpan={7} className="p-3 text-right uppercase text-xs tracking-wider">Total Geral em Estoque</td>
              <td className="p-3 text-center text-sm bg-brand-red text-white">
                {filteredCounts.reduce((sum, item) => sum + item.total, 0)} un
              </td>
            </tr>
          </tfoot>
        </table>

        {/* CONTROLE DE SAÍDA DE NUMERAÇÕES POR MARCA (PRINT TABLE) */}
        {brandAnalysis.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 pb-2 border-b-2 border-brand-red flex justify-between items-end">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                  Controle de Giro de Numerações por Marca
                </h2>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                  Classificação por velocidade de saída (Alta, Média e Baixa saída)
                </p>
              </div>
            </div>

            <table className="w-full border-collapse text-xs border border-slate-300 rounded-lg overflow-hidden shadow-sm">
              <thead>
                <tr className="bg-brand-red text-white">
                  <th className="p-2.5 text-left font-black uppercase tracking-wider border-r border-rose-800">Marca</th>
                  <th className="p-2.5 text-center font-black uppercase tracking-wider border-r border-rose-800">Total</th>
                  <th className="p-2.5 text-left font-black uppercase tracking-wider bg-emerald-800 border-r border-emerald-900">
                    🟢 Saindo Bastante (Alta)
                  </th>
                  <th className="p-2.5 text-left font-black uppercase tracking-wider bg-amber-700 border-r border-amber-800">
                    🟡 Saindo Mais ou Menos (Média)
                  </th>
                  <th className="p-2.5 text-left font-black uppercase tracking-wider bg-rose-800">
                    🔴 Saindo Pouco (Baixa)
                  </th>
                </tr>
              </thead>
              <tbody>
                {brandAnalysis.map((b, idx) => (
                  <tr key={b.brandName} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2.5 font-black text-slate-900 uppercase border-b border-r border-slate-200 align-top">
                      {b.brandName}
                    </td>
                    <td className="p-2.5 font-black text-center text-brand-blue border-b border-r border-slate-200 align-top whitespace-nowrap">
                      {b.totalItems} un
                    </td>
                    <td className="p-2.5 border-b border-r border-slate-200 align-top font-bold bg-emerald-50/40">
                      {b.highOutputSizes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {b.highOutputSizes.map(s => (
                            <span key={s.size} className="bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded border border-emerald-300 font-black text-[10px]">
                              Tam {s.size} ({s.qty}un)
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-normal text-[10px]">-</span>
                      )}
                    </td>
                    <td className="p-2.5 border-b border-r border-slate-200 align-top font-bold bg-amber-50/40">
                      {b.mediumOutputSizes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {b.mediumOutputSizes.map(s => (
                            <span key={s.size} className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300 font-black text-[10px]">
                              Tam {s.size} ({s.qty}un)
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-normal text-[10px]">-</span>
                      )}
                    </td>
                    <td className="p-2.5 border-b border-slate-200 align-top font-bold bg-rose-50/40">
                      {b.lowOutputSizes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {b.lowOutputSizes.map(s => (
                            <span key={s.size} className="bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded border border-rose-300 font-black text-[10px]">
                              Tam {s.size} ({s.qty}un)
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-normal text-[10px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* TOAST NOTIFICATION */}
      <AnimatePresence>
        {toast.type && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[110] w-[90%] max-w-xs"
          >
            <div className={`flex items-center gap-3 p-4 rounded-2xl shadow-2xl backdrop-blur-md border ${
              toast.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 'bg-red-500/90 border-red-400 text-white'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-black uppercase tracking-wider">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE MODAL */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl flex flex-col items-center text-center border border-gray-100"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-6 border border-red-100">
                <Trash2 size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-black text-brand-dark mb-3 tracking-tighter">Confirmar Exclusão</h3>
              <p className="text-gray-500 font-bold text-sm mb-8 leading-relaxed px-4">
                {deleteModal.id === 'ALL' 
                  ? 'Tem certeza que deseja apagar TODO o histórico? Esta ação não poderá ser revertida.' 
                  : 'Deseja excluir permanentemente este registro de contagem?'}
              </p>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => setDeleteModal({ isOpen: false, id: '' })}
                  className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-brand-red text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-brand-red/20 active:scale-95 transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE BRAND CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteBrandModal.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md shadow-2xl flex flex-col items-center text-center border border-gray-100"
            >
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mb-5 border border-rose-100">
                <Trash2 size={36} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-black text-brand-dark mb-2 tracking-tight uppercase">Excluir Marca</h3>
              <p className="text-gray-600 font-bold text-sm mb-2">
                Tem certeza que deseja excluir a marca <span className="text-rose-600 font-black uppercase">{deleteBrandModal.brandName}</span>?
              </p>
              <p className="text-xs text-gray-400 font-medium mb-6 leading-relaxed">
                Esta ação removerá permanentemente todos os <strong className="text-gray-700">{deleteBrandModal.count} lote(s)</strong> e <strong className="text-gray-700">{deleteBrandModal.pieces} peça(s)</strong> desta marca do servidor e do seu inventário.
              </p>
              <div className="flex gap-3 w-full">
                <button 
                  type="button"
                  onClick={() => setDeleteBrandModal({ isOpen: false, brandName: '', count: 0, pieces: 0 })}
                  className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl font-black uppercase text-xs tracking-wider active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={confirmDeleteBrand}
                  className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider shadow-lg shadow-rose-600/30 active:scale-95 transition-all"
                >
                  Excluir Marca
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BRAND EDIT / UPDATE QUANTITIES MODAL */}
      <AnimatePresence>
        {brandEditModal.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-[2.5rem] p-6 sm:p-8 w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh] border border-gray-100"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-700 border border-amber-200/60 shrink-0">
                    <Edit2 size={22} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-brand-dark uppercase tracking-tight">
                      Editar & Atualizar: {brandEditModal.brandName}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold">
                      Ajuste quantidades ou altere detalhes dos lotes em tempo real
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBrandEditModal({ isOpen: false, brandName: '' })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                >
                  <XCircle size={22} />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 my-2">
                {(() => {
                  const brandItems = counts.filter(
                    c => (c.brand || '').toLowerCase().trim() === brandEditModal.brandName.toLowerCase().trim()
                  );

                  if (brandItems.length === 0) {
                    return (
                      <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <p className="text-sm font-bold text-gray-400 uppercase">Nenhum lote registrado nesta marca</p>
                      </div>
                    );
                  }

                  return brandItems.map(item => (
                    <div 
                      key={item.id} 
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block font-black text-base text-slate-800 uppercase truncate">
                          {item.model}
                        </span>
                        <span className="text-xs text-gray-500 font-medium block">
                          Cor: {item.color || '-'} | Gênero: {item.gender || '-'} | Chegada: {item.arrivalMonth || '--'}/{item.arrivalYear || '--'}
                        </span>
                      </div>

                      {/* Quantity Controls & Edit Action */}
                      <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                        <div className="flex items-center bg-white rounded-xl border border-slate-300 p-1 shadow-xs">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQuantity(item.id, Math.max(0, item.total - 1))}
                            className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg active:scale-95 font-black"
                            title="Diminuir quantidade"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          
                          <input
                            type="number"
                            value={item.total}
                            onChange={(e) => handleUpdateItemQuantity(item.id, parseInt(e.target.value) || 0)}
                            className="w-14 text-center font-black text-base text-brand-dark bg-transparent border-none focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => handleUpdateItemQuantity(item.id, item.total + 1)}
                            className="w-8 h-8 flex items-center justify-center bg-brand-blue text-white hover:bg-brand-dark rounded-lg active:scale-95 font-black"
                            title="Aumentar quantidade"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setBrandEditModal({ isOpen: false, brandName: '' });
                            handleEdit(item);
                          }}
                          className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl font-black text-xs uppercase flex items-center gap-1 border border-amber-300 shadow-xs"
                          title="Editar grade e detalhes completos deste lote"
                        >
                          <Edit2 size={14} strokeWidth={2.5} />
                          <span className="hidden sm:inline">Grade</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-rose-500 hover:bg-rose-100/70 rounded-xl active:scale-90 transition-all border border-transparent hover:border-rose-200"
                          title="Excluir Lote"
                        >
                          <Trash2 size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Modal Bottom Bar */}
              <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const currentBrand = brandEditModal.brandName;
                    setBrandEditModal({ isOpen: false, brandName: '' });
                    handleStartWithSameBrand(currentBrand);
                  }}
                  className="w-full sm:w-auto py-3 px-5 bg-brand-blue hover:bg-brand-dark text-white font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <Plus size={16} strokeWidth={3} />
                  <span>Contar Novo Modelo em {brandEditModal.brandName}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBrandEditModal({ isOpen: false, brandName: '' })}
                  className="w-full sm:w-auto py-3 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs uppercase tracking-wider rounded-2xl active:scale-95 transition-all"
                >
                  Concluído / Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BRAND OVERALL COUNT PREVIEW MODAL */}
      <AnimatePresence>
        {viewingBrandPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] border border-gray-100 text-brand-dark"
            >
              {/* Top Header Banner */}
              <div className="bg-brand-dark p-4 text-center text-white flex items-center justify-between px-6">
                <div className="flex items-center gap-2">
                  <Package size={18} className="text-brand-accent" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-200">
                    Pré-Visualização • Contagem Geral da Marca
                  </span>
                </div>
                <button 
                  type="button"
                  onClick={() => setViewingBrandPreview(null)}
                  className="p-1 text-gray-400 hover:text-white rounded-full transition-colors"
                >
                  <XCircle size={22} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 bg-gradient-to-b from-white to-brand-slate/10">
                <div className="text-center space-y-1">
                  <h3 className="text-3xl font-display font-black text-brand-dark tracking-tight leading-none uppercase">
                    {viewingBrandPreview.brandName}
                  </h3>
                  <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest">
                    IDEAL TECIDOS • Controle de Estoque
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    {completedBrands[viewingBrandPreview.brandName] ? (
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Contagem Concluída
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                        ⏳ Em Contagem
                      </span>
                    )}
                  </div>
                </div>

                {/* Cards for Overview Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-2xl p-4 text-center space-y-1">
                    <span className="text-[9px] font-black text-brand-blue uppercase tracking-wider block">Total de Peças</span>
                    <span className="text-2xl sm:text-3xl font-display font-black text-brand-blue block">
                      {viewingBrandPreview.items.reduce((s, i) => s + (i.total || 0), 0)}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">Modelos</span>
                    <span className="text-2xl sm:text-3xl font-display font-black text-brand-dark block">
                      {new Set(viewingBrandPreview.items.map(i => (i.model || '').toLowerCase().trim())).size}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">Lotes</span>
                    <span className="text-2xl sm:text-3xl font-display font-black text-brand-dark block">
                      {viewingBrandPreview.items.length}
                    </span>
                  </div>
                </div>

                {/* CONTAGEM GERAL POR TAMANHO (GRADE CONSOLIDADA DA MARCA) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand-dark uppercase tracking-widest flex items-center gap-1.5">
                      <BarChart3 size={16} className="text-brand-blue" />
                      Contagem Geral por Tamanho (Grade Consolidada)
                    </span>
                    <span className="text-[10px] font-black text-gray-400 uppercase">
                      Soma da Marca
                    </span>
                  </div>

                  {(() => {
                    const aggregatedSizes: Record<string, number> = {};
                    viewingBrandPreview.items.forEach(item => {
                      Object.entries(item.sizes || {}).forEach(([sizeKey, qty]) => {
                        const val = Number(qty) || 0;
                        if (val > 0) {
                          aggregatedSizes[sizeKey] = (aggregatedSizes[sizeKey] || 0) + val;
                        }
                      });
                    });

                    const sortedEntries = Object.entries(aggregatedSizes).sort((a, b) => {
                      const numA = parseFloat(a[0]);
                      const numB = parseFloat(b[0]);
                      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                      return a[0].localeCompare(b[0]);
                    });

                    if (sortedEntries.length === 0) {
                      return (
                        <div className="p-4 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400 uppercase">
                          Nenhuma quantidade contada nesta marca
                        </div>
                      );
                    }

                    return (
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-slate-50/60 border-b border-gray-100">
                          {sortedEntries.map(([sz, count]) => (
                            <div key={sz} className="bg-white p-3 rounded-xl border border-gray-200/80 text-center shadow-2xs">
                              <span className="text-xs font-black text-brand-accent block uppercase">{sz}</span>
                              <span className="text-lg font-black text-brand-dark block mt-0.5">{count} <span className="text-[10px] font-bold text-gray-400">pcs</span></span>
                            </div>
                          ))}
                        </div>
                        <div className="p-3 px-4 bg-brand-dark text-white flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-white/70">TOTAL GERAL CONSOLIDADO</span>
                          <span className="text-xl font-display font-black text-brand-accent">
                            {sortedEntries.reduce((acc, [_, c]) => acc + c, 0)} PEÇAS
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* DETALHAMENTO DOS LOTES / MODELOS */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-black text-brand-dark uppercase tracking-widest block">
                    Detalhamento dos Lotes ({viewingBrandPreview.items.length})
                  </span>
                  <div className="space-y-2.5">
                    {viewingBrandPreview.items.map((item, idx) => {
                      const sizeSummary = Object.entries(item.sizes || {})
                        .filter(([_, q]) => Number(q) > 0)
                        .map(([sz, q]) => `${sz}: ${q}`)
                        .join(', ');

                      return (
                        <div key={item.id || idx} className="p-4 bg-white border border-gray-200 rounded-2xl shadow-2xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-black text-sm text-brand-dark uppercase block">
                                {item.model} {item.gender ? `(${item.gender})` : ''}
                              </span>
                              <span className="text-xs text-gray-500 font-medium block">
                                Cor: {item.color || '-'} | Chegada: {item.arrivalMonth || '--'}/{item.arrivalYear || '--'}
                              </span>
                            </div>
                            <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue rounded-xl font-black text-sm border border-brand-blue/20 shrink-0">
                              {item.total} pcs
                            </span>
                          </div>
                          {sizeSummary && (
                            <div className="text-[11px] font-bold text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                              Grade: {sizeSummary}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 bg-brand-slate border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    generateBrandPDF(viewingBrandPreview.brandName, viewingBrandPreview.items);
                    showToast('PDF da Marca baixado com sucesso!', 'success');
                  }}
                  className="flex-1 py-3.5 bg-brand-red text-white hover:brightness-110 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-brand-red/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  Baixar PDF da Marca
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    const brandName = viewingBrandPreview.brandName;
                    setViewingBrandPreview(null);
                    setBrandEditModal({ isOpen: true, brandName });
                  }}
                  className="py-3.5 px-5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-2xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-1.5 border border-amber-300 active:scale-95 transition-all"
                >
                  <Edit2 size={16} />
                  Editar / Atualizar
                </button>

                <button 
                  type="button"
                  onClick={() => setViewingBrandPreview(null)}
                  className="py-3.5 px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-2xl font-black uppercase text-xs tracking-wider active:scale-95 transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMPROVANTE / PDF PREVIEW MODAL */}
      <AnimatePresence>
        {viewingPdfItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] border border-gray-100 text-brand-dark"
            >
              {/* Paper Top Decorative Header */}
              <div className="bg-brand-red p-4 text-center text-white flex items-center justify-center gap-2">
                <Package size={16} />
                <span className="text-[10px] font-black uppercase tracking-[0.25em]">Comprovante de Contagem - Ideal Tecidos</span>
              </div>

              {/* Receipt Area (Scrollable if needed, paper-styled) */}
              <div className="p-8 space-y-6 overflow-y-auto flex-1 bg-gradient-to-b from-white to-brand-slate/10">
                <div className="text-center space-y-1">
                  <h3 className="text-3xl font-display font-black text-brand-red tracking-tight leading-none">IDEAL TECIDOS</h3>
                  <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest">Controle de Estoque • Comprovante</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Gerado em {new Date(viewingPdfItem.createdAt).toLocaleString('pt-BR')}</p>
                </div>

                {/* Meta details grid */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3.5 shadow-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">Marca</span>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-brand-dark uppercase truncate">{viewingPdfItem.brand || '-'}</span>
                        {viewingPdfItem.brand && (
                          <button
                            type="button"
                            onClick={() => {
                              const bName = viewingPdfItem.brand || '';
                              const brandItems = counts.filter(
                                c => (c.brand || '').toLowerCase().trim() === bName.toLowerCase().trim()
                              );
                              setViewingBrandPreview({ brandName: bName, items: brandItems });
                            }}
                            className="text-[9px] font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 uppercase flex items-center gap-1 shrink-0 active:scale-95 transition-all"
                            title="Ver contagem geral de toda esta marca"
                          >
                            <Eye size={10} />
                            Ver Geral
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">Tipo de Produto</span>
                      <span className="text-sm font-bold text-brand-dark uppercase block truncate">{viewingPdfItem.productType || '-'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-dashed border-gray-100 pt-3.5">
                    <div>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">Modelo</span>
                      <span className="text-sm font-bold text-brand-dark uppercase flex items-center gap-1.5 truncate">
                        <span>{viewingPdfItem.model || '-'}</span>
                        {viewingPdfItem.gender && (
                          <span className={`text-[8px] px-1 py-0.5 rounded font-black ${
                            viewingPdfItem.gender === 'M' ? 'bg-blue-50 text-blue-600' :
                            viewingPdfItem.gender === 'F' ? 'bg-pink-50 text-pink-600' :
                            viewingPdfItem.gender === 'IM' ? 'bg-indigo-50 text-indigo-600' :
                            'bg-purple-50 text-purple-600'
                          }`}>
                            {viewingPdfItem.gender}
                          </span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">Cor</span>
                      <span className="text-sm font-bold text-brand-dark uppercase block truncate">{viewingPdfItem.color || '-'}</span>
                    </div>
                  </div>

                  {(viewingPdfItem.arrivalMonth || viewingPdfItem.arrivalYear) && (
                    <div className="border-t border-dashed border-gray-100 pt-3.5">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">Mês/Ano de Chegada</span>
                      <span className="text-sm font-bold text-brand-red flex items-center gap-1.5 uppercase">
                        <TrendingUp size={12} />
                        {viewingPdfItem.arrivalMonth || '--'}/{viewingPdfItem.arrivalYear || '--'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Table of sizes */}
                <div className="space-y-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Grade de Tamanhos</span>
                  
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-brand-blue/5 text-[9px] font-black uppercase tracking-wider text-brand-blue border-b border-gray-100">
                          <th className="p-4 text-center">Tamanho</th>
                          <th className="p-4 text-center">Quantidade Contada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(viewingPdfItem.sizes)
                          .filter(([_, qty]) => (qty as any) > 0)
                          .map(([size, qty]) => (
                            <tr key={size} className="border-b border-gray-50 last:border-0 hover:bg-brand-slate/30 transition-colors">
                              <td className="p-4 text-center text-sm font-black text-brand-accent">{size}</td>
                              <td className="p-4 text-center text-sm font-black text-brand-dark">{qty} pares</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Total badge */}
                <div className="bg-brand-blue text-white rounded-2xl p-5 flex items-center justify-between shadow-lg">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">Total Geral de Peças</span>
                    <span className="text-xs font-bold text-white/70">Quantidade total contada neste lote</span>
                  </div>
                  <span className="text-4xl font-display font-black tracking-tight">{viewingPdfItem.total}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 bg-brand-slate border-t border-gray-100 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      generateSinglePDF(viewingPdfItem);
                      showToast('PDF baixado com sucesso!');
                    }}
                    className="flex-1 py-4 bg-brand-red text-white hover:brightness-110 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-brand-red/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    Baixar PDF
                  </button>
                  
                  <button 
                    onClick={() => {
                      const doc = new jsPDF();
                      const dateStr = new Date(viewingPdfItem.createdAt).toLocaleDateString('pt-BR');
                      const timeStr = new Date(viewingPdfItem.createdAt).toLocaleTimeString('pt-BR');

                      // Header Design - Modern Navy Banner
                      doc.setFillColor(15, 23, 42); // slate-900 / dark navy
                      doc.rect(0, 0, 210, 16, 'F');
                      doc.setFillColor(225, 29, 72); // rose-600 / brand red accent bar
                      doc.rect(0, 16, 210, 2, 'F');
                      
                      // Brand Title
                      doc.setFontSize(22);
                      doc.setTextColor(15, 23, 42);
                      doc.setFont(undefined, 'bold');
                      doc.text('IDEAL TECIDOS', 14, 30);
                      
                      doc.setFontSize(9);
                      doc.setTextColor(100, 116, 139); // slate-500
                      doc.setFont(undefined, 'bold');
                      doc.text('COMPROVANTE DE CONTAGEM DE ESTOQUE', 14, 36);

                      // Metadata Card Box
                      doc.setDrawColor(226, 232, 240); // slate-200
                      doc.setFillColor(248, 250, 252); // slate-50
                      doc.roundedRect(14, 43, 182, 32, 3, 3, 'FD');

                      doc.setFontSize(8.5);
                      doc.setTextColor(100, 116, 139);
                      doc.setFont(undefined, 'bold');
                      doc.text('MARCA:', 20, 52);
                      doc.text('MODELO:', 20, 59);
                      doc.text('COR / TIPO:', 20, 66);

                      doc.setTextColor(15, 23, 42);
                      doc.text(viewingPdfItem.brand?.toUpperCase() || '-', 48, 52);
                      const modelWithGender = (viewingPdfItem.model || '').toUpperCase() + (viewingPdfItem.gender ? ` (${viewingPdfItem.gender})` : '');
                      doc.text(modelWithGender || '-', 48, 59);
                      doc.text(`${viewingPdfItem.color || '-'} (${viewingPdfItem.productType || '-'})`, 48, 66);

                      doc.setTextColor(100, 116, 139);
                      doc.text('DATA:', 125, 52);
                      doc.text('CHEGADA:', 125, 59);
                      doc.text('TOTAL PEÇAS:', 125, 66);

                      doc.setTextColor(15, 23, 42);
                      doc.text(dateStr, 155, 52);
                      doc.text(`${viewingPdfItem.arrivalMonth || '--'}/${viewingPdfItem.arrivalYear || '--'}`, 155, 59);
                      
                      doc.setFontSize(11);
                      doc.setTextColor(225, 29, 72); // rose-600
                      doc.setFont(undefined, 'bold');
                      doc.text(viewingPdfItem.total?.toString() || '0', 155, 66);

                      // Grid Table
                      const tableRows = Object.entries(viewingPdfItem.sizes || {})
                        .filter(([_, qty]) => (qty as any) > 0)
                        .map(([size, qty]) => [size, qty.toString()]);

                      autoTable(doc, {
                        startY: 83,
                        head: [['Tamanho / Numeração', 'Quantidade Contada']],
                        body: tableRows,
                        theme: 'striped',
                        headStyles: { 
                          fillColor: [15, 23, 42],
                          textColor: [255, 255, 255],
                          fontSize: 9.5,
                          fontStyle: 'bold',
                          halign: 'center'
                        },
                        alternateRowStyles: { fillColor: [248, 250, 252] },
                        bodyStyles: { textColor: [30, 41, 59] },
                        columnStyles: {
                          0: { halign: 'center', fontStyle: 'bold', cellWidth: 50 },
                          1: { halign: 'center', fontSize: 11, fontStyle: 'bold', textColor: [15, 23, 42] }
                        },
                        margin: { left: 35, right: 35 }
                      });

                      // Footer
                      doc.setDrawColor(226, 232, 240);
                      doc.line(14, doc.internal.pageSize.getHeight() - 15, 196, doc.internal.pageSize.getHeight() - 15);
                      doc.setFontSize(8);
                      doc.setTextColor(148, 163, 184);
                      const footerText = `Documento emitido via Ideal Tecidos - Controle de Estoque | ${dateStr} às ${timeStr}`;
                      doc.text(footerText, 14, doc.internal.pageSize.getHeight() - 9);
                      
                      const blobUrl = doc.output('bloburl');
                      const printWindow = window.open(blobUrl, '_blank');
                      if (printWindow) {
                        printWindow.onload = () => {
                          printWindow.print();
                        };
                      }
                      showToast('Impressora iniciada!');
                    }}
                    className="flex-1 py-4 bg-brand-blue text-white hover:brightness-110 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-brand-blue/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Printer size={16} />
                    Imprimir
                  </button>
                </div>

                <button 
                  onClick={() => setViewingPdfItem(null)}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Fechar sem baixar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <React.Suspense fallback={null}>
        {/* MODAL 1: Bipagem Contínua (USB) */}
        {isContinuousModalOpen && (
          <ContinuousScannerModal
            isOpen={isContinuousModalOpen}
            onClose={() => setIsContinuousModalOpen(false)}
            userId={currentUserId}
            onSaveCount={saveContinuousCount}
            showToast={showToast}
          />
        )}

        {/* MODAL 2: Gerador e Impressor de Etiquetas de Caixas */}
        {isLabelModalOpen && (
          <LabelGeneratorModal
            isOpen={isLabelModalOpen}
            onClose={() => setIsLabelModalOpen(false)}
            showToast={showToast}
          />
        )}

        {/* MODAL 3: Relatório de Divergência ERP */}
        {isDivergenceModalOpen && (
          <DivergenceReportModal
            isOpen={isDivergenceModalOpen}
            onClose={() => setIsDivergenceModalOpen(false)}
            counts={counts}
            showToast={showToast}
          />
        )}

        {/* MODAL 4: Exportação Personalizada para ERPs */}
        {isErpExporterModalOpen && (
          <ErpExporterModal
            isOpen={isErpExporterModalOpen}
            onClose={() => setIsErpExporterModalOpen(false)}
            counts={counts}
            showToast={showToast}
          />
        )}
      </React.Suspense>
    </div>
  );
};

export default App;
