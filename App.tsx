
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
  BrainCircuit,
  TrendingUp,
  AlertTriangle,
  UploadCloud,
  Loader2,
  ExternalLink
} from 'lucide-react';
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
  validateConnection 
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
import { AppView, InventoryCount, SizeGridType } from './types';
import { PRODUCT_TYPES, LETTER_SIZES, NUMERIC_SIZES, MONTHS, YEARS } from './constants';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | 'ALL' }>({
    isOpen: false,
    id: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | null }>({
    message: '',
    type: null
  });
  
  const [newSizeInput, setNewSizeInput] = useState('');
  
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
  
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<InventoryCount>>({
    productType: '',
    model: '',
    brand: '',
    color: '',
    arrivalMonth: '',
    arrivalYear: '',
    gridType: 'LETTER',
    sizes: {},
    total: 0
  });

  // Auth effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      // No wall here
    });
    return () => unsubscribe();
  }, []);

  // Firestore sync effect
  useEffect(() => {
    if (!currentUserId) {
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    const targetUserId = currentUserId;
    
    // Defensive check to avoid querying with invalid values
    if (typeof targetUserId !== 'string' || targetUserId === '') {
      setIsSyncing(false);
      return;
    }

    const q = query(
      collection(db, 'inventory'),
      where('userId', '==', targetUserId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newCounts = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as InventoryCount[];
      // Sort in memory to avoid needing a composite index for now
      newCounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setCounts(newCounts);
      setIsSyncing(false);
    }, (error) => {
      console.error("Firestore List Error:", error, "for userId:", targetUserId);
      handleFirestoreError(error, OperationType.LIST, 'inventory');
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
    setFormData({
      productType: PRODUCT_TYPES[0],
      model: '',
      brand: '',
      color: '',
      arrivalMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
      arrivalYear: new Date().getFullYear().toString(),
      gridType: 'LETTER',
      sizes: {},
      total: 0
    });
    setEditingId(null);
    setAuthError(null);
    setCurrentView(AppView.IDENTIFY);
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
    
    // Close modal immediately for better UX
    setDeleteModal({ isOpen: false, id: '' });
    
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
        
        if (editingId === deleteId) {
          setCurrentView(AppView.HOME);
          setEditingId(null);
        }
      }
    } catch (error: any) {
      console.error("Delete Error:", error);
      
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

  const saveInventory = async () => {
    // Sanitize data
    const productType = (formData.productType || '').trim();
    const model = (formData.model || '').trim();

    if (!productType || !model) {
      showToast('Preencha Produto e Modelo', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Use Firestore to generate ID if we don't have one
      const inventoryRef = collection(db, 'inventory');
      const itemDoc = editingId ? doc(db, 'inventory', editingId) : doc(inventoryRef);
      
      const createdAt = editingId 
        ? counts.find(c => c.id === editingId)?.createdAt || Date.now() 
        : Date.now();

      const finalCount = {
        productType,
        model,
        brand: (formData.brand || '').trim(),
        color: (formData.color || '').trim(),
        arrivalMonth: formData.arrivalMonth || '',
        arrivalYear: formData.arrivalYear || '',
        gridType: (formData.gridType as SizeGridType) || 'LETTER',
        sizes: formData.sizes as Record<string, number>,
        total: formData.total || 0,
        createdAt,
        userId: currentUserId
      };

      await setDoc(itemDoc, finalCount);
      showToast(editingId ? 'Registro atualizado' : 'Registro salvo com sucesso');
      setIsSaving(false);
      return true;
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
      return false;
    }
  };

  const generateSinglePDF = (item: Partial<InventoryCount>) => {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    // Header Design
    doc.setFillColor(192, 36, 40); // brand-red
    doc.rect(0, 0, 210, 15, 'F');
    
    doc.setFontSize(22);
    doc.setTextColor(192, 36, 40); // brand-red
    doc.setFont(undefined, 'bold');
    doc.text('IDEAL TECIDOS', 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(29, 43, 91); // brand-blue
    doc.setFont(undefined, 'bold');
    doc.text('CONTROLE DE ESTOQUE - COMPROVANTE', 14, 36);

    // Metadata Box
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(14, 45, 182, 30, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'bold');
    doc.text('PRODUTO:', 20, 53);
    doc.text('MODELO:', 20, 60);
    doc.text('MARCA/COR:', 20, 67);

    doc.setTextColor(29, 43, 91);
    doc.text(item.productType?.toUpperCase() || '-', 45, 53);
    doc.text(item.model?.toUpperCase() || '-', 45, 60);
    doc.text(`${item.brand || '-'} / ${item.color || '-'}`, 45, 67);

    doc.setTextColor(100, 100, 100);
    doc.text('DATA:', 130, 53);
    doc.text('CHEGADA:', 130, 60);
    doc.text('TOTAL:', 130, 67);

    doc.setTextColor(29, 43, 91);
    doc.text(dateStr, 150, 53);
    doc.text(`${item.arrivalMonth || '--'}/${item.arrivalYear || '--'}`, 150, 60);
    doc.setFontSize(11);
    doc.setTextColor(192, 36, 40);
    doc.text(item.total?.toString() || '0', 150, 67);

    // Grid Table
    const tableRows = Object.entries(item.sizes || {})
      .filter(([_, qty]) => (qty as any) > 0)
      .map(([size, qty]) => [size, qty.toString()]);

    autoTable(doc, {
      startY: 85,
      head: [['Tamanho', 'Quantidade']],
      body: tableRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [29, 43, 91],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold', cellWidth: 40 },
        1: { halign: 'center', fontSize: 12, fontStyle: 'bold' }
      },
      margin: { left: 40, right: 40 }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const footerText = `Documento emitido via Ideal Tecidos - Controle de Estoque em ${dateStr} ${timeStr}`;
    doc.text(footerText, 14, doc.internal.pageSize.getHeight() - 10);

    const fileName = `Contagem_${item.model || 'Item'}_${item.color || ''}_${dateStr.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    // Header Design
    // Red bar at top
    doc.setFillColor(192, 36, 40); // brand-red
    doc.rect(0, 0, 210, 15, 'F');
    
    doc.setFontSize(24);
    doc.setTextColor(192, 36, 40); // brand-red
    doc.setFont(undefined, 'bold');
    doc.text('IDEAL TECIDOS - CONTROLE DE ESTOQUE', 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(29, 43, 91); // brand-blue
    doc.setFont(undefined, 'bold');
    doc.text('CALÇADOS E CONFECÇÕES', 14, 36);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'normal');
    doc.text(`Relatório de Controle de Estoque`, 14, 42);
    doc.text(`Gerado em: ${dateStr} às ${timeStr}`, 14, 46);

    // Table data
    const tableRows = filteredCounts.map(item => {
      const sizesStr = Object.entries(item.sizes)
        .filter(([_, qty]) => (qty as any) > 0)
        .map(([size, qty]) => `${size}: ${qty}`)
        .join(', ');

      return [
        new Date(item.createdAt).toLocaleDateString('pt-BR'),
        item.productType,
        item.model,
        item.brand || '',
        item.color || '',
        `${item.arrivalMonth || ''}${item.arrivalMonth && item.arrivalYear ? '/' : ''}${item.arrivalYear || ''}`,
        sizesStr,
        item.total.toString()
      ];
    });

    autoTable(doc, {
      startY: 55,
      head: [['Data', 'Produto', 'Modelo', 'Marca', 'Cor', 'Chegada', 'Grade', 'Total']],
      body: tableRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [29, 43, 91], // brand-blue
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      foot: [[
        { content: 'TOTAL GERAL ACUMULADO', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [29, 43, 91], textColor: [255, 255, 255] } },
        { content: filteredCounts.reduce((sum, item) => sum + item.total, 0).toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [29, 43, 91], textColor: [255, 255, 255] } }
      ]],
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        1: { fontStyle: 'bold' }, // Produto
        2: { fontStyle: 'bold' }, // Modelo
        5: { halign: 'center' }, // Chegada
        7: { halign: 'center', fontStyle: 'bold', fontSize: 10 } // Total
      }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${pageCount} - A Ideal Tecidos | Calçados e Confecções`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    // Save the PDF
    const fileName = `Relatorio_Estoque_${dateStr.replace(/\//g, '-')}_${timeStr.replace(/:/g, '-')}.pdf`;
    doc.save(fileName);
  };

  // Filtered counts
  const filteredCounts = useMemo(() => {
    if (!searchTerm) return counts;
    const low = searchTerm.toLowerCase();
    return counts.filter(c => 
      c.productType.toLowerCase().includes(low) || 
      c.model.toLowerCase().includes(low) || 
      c.brand?.toLowerCase().includes(low)
    );
  }, [counts, searchTerm]);

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

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-brand-slate shadow-2xl relative overflow-x-hidden font-sans">
      {/* HEADER (No Print) */}
      <header className="no-print bg-brand-dark text-white p-6 sticky top-0 z-50 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-white overflow-hidden relative">
            <div className="flex flex-col items-center scale-[0.35] leading-[0.8] relative z-10 -mt-1">
              <span className="text-[#C02428] font-serif font-bold text-lg italic">A Ideal</span>
              <span className="text-[#C02428] font-serif font-bold text-xl italic">Tecidos</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[45%] bg-[#1D2B5B] rounded-t-[100%] scale-x-125 translate-y-1"></div>
            <div className="absolute bottom-[5%] left-0 right-0 h-[25%] bg-[#C02428] rounded-t-[100%] scale-x-150 rotate-3 translate-y-1 opacity-90"></div>
          </div>
          <div>
            <h1 className="font-display font-black text-2xl uppercase tracking-tighter leading-none text-white">Ideal Tecidos</h1>
            <p className="text-[10px] uppercase font-black text-brand-red tracking-[0.2em] mt-1 space-x-1">
              <span>C</span><span>O</span><span>N</span><span>T</span><span>R</span><span>O</span><span>L</span><span>E</span><span> </span><span>D</span><span>E</span><span> </span><span>E</span><span>S</span><span>T</span><span>O</span><span>Q</span><span>U</span><span>E</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentView !== AppView.HOME && (
            <button 
              onClick={() => setCurrentView(AppView.HOME)}
              className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all active:scale-90"
            >
              <XCircle size={20} className="text-white/60" />
            </button>
          )}
        </div>
      </header>

      {/* VIEWS */}
      <main className="flex-1 p-6 pb-32 no-print space-y-8">
        <AnimatePresence mode="wait">
          {currentView === AppView.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              {/* Summary Dashboard */}
              <div className="grid grid-cols-2 gap-5">
                <motion.div 
                  whileHover={{ y: -4 }}
                  className="bg-white p-6 rounded-[2.5rem] shadow-modern border border-gray-100 flex flex-col justify-between overflow-hidden relative group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-slate rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000 ease-out"></div>
                  <div className="mb-6 bg-brand-blue/5 w-12 h-12 rounded-2xl flex items-center justify-center text-brand-blue relative z-10 border border-brand-blue/5">
                    <LayoutGrid size={22} strokeWidth={2.5} />
                  </div>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-1">Registros</span>
                    <span className="text-4xl font-display font-black text-brand-dark tracking-tighter">{counts.length}</span>
                  </div>
                </motion.div>
                
                <motion.div 
                  whileHover={{ y: -4 }}
                  className="bg-brand-blue p-6 rounded-[2.5rem] shadow-modern-lg flex flex-col justify-between text-white overflow-hidden relative group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000 ease-out"></div>
                  <div className="mb-6 bg-white/10 w-12 h-12 rounded-2xl flex items-center justify-center text-white relative z-10 backdrop-blur-sm border border-white/10">
                    <Package size={22} strokeWidth={2.5} />
                  </div>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] block mb-1">Peças Totais</span>
                    <span className="text-4xl font-display font-black tracking-tighter">{counts.reduce((sum, c) => sum + c.total, 0)}</span>
                  </div>
                </motion.div>
              </div>

              <div className="flex flex-col gap-5">
                <motion.button 
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartNew}
                  className="relative overflow-hidden bg-brand-red text-white py-6 px-7 rounded-[2rem] shadow-2xl shadow-brand-red/30 flex items-center justify-between group active:brightness-95 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  <div className="flex items-center gap-4">
                    <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center group-hover:rotate-90 transition-transform duration-500 shadow-inner">
                      <Plus size={28} strokeWidth={3} />
                    </div>
                    <div className="text-left font-display">
                      <span className="block text-xl font-black tracking-tight uppercase leading-none mb-1">Nova Contagem</span>
                      <span className="block text-[10px] font-bold text-white/50 uppercase tracking-[0.1em]">Registrar movimentação</span>
                    </div>
                  </div>
                  <PlusCircle size={24} className="text-white/20 group-hover:text-white/40 transition-colors" />
                </motion.button>

                <div className="relative group">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-accent transition-colors" size={20} />
                  <input 
                    type="text"
                    placeholder="Filtrar por produto, marca..."
                    className="w-full pl-16 pr-12 py-7 bg-white rounded-[2.2rem] shadow-modern border border-gray-100 focus:border-brand-accent/30 focus:ring-8 focus:ring-brand-accent/5 focus:outline-none transition-all text-base font-bold placeholder:text-gray-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <motion.button 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setSearchTerm('')}
                      className="absolute right-6 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-brand-red rounded-full transition-colors active:scale-90"
                    >
                      <XCircle size={18} fill="currentColor" className="text-white" />
                    </motion.button>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between px-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-brand-dark/5 p-2 rounded-lg text-brand-dark/30">
                      <History size={14} strokeWidth={3} />
                    </div>
                    <h2 className="text-brand-dark font-black text-xs uppercase tracking-[0.2em] opacity-40">Histórico Recente</h2>
                  </div>
                  {counts.length > 0 && (
                    <button 
                      onClick={() => handleDelete('ALL')}
                      className="flex items-center gap-1.5 py-2 px-4 rounded-full bg-red-50 text-red-500 hover:bg-brand-red hover:text-white transition-all text-[9px] font-black uppercase tracking-widest shadow-sm"
                    >
                      <Trash2 size={12} />
                      Limpar Tudo
                    </button>
                  )}
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
                          {/* Top row: Type and Actions */}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="bg-brand-dark text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest">
                                {item.productType}
                              </span>
                              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                                {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            
                            <div className="flex gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateSinglePDF(item);
                                }}
                                className="w-11 h-11 flex items-center justify-center bg-brand-slate text-brand-blue rounded-xl hover:bg-white hover:shadow-md transition-all active:scale-90"
                                title="Baixar PDF"
                              >
                                <Download size={18} strokeWidth={2.5} />
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

                          {/* Middle row: Model and Info */}
                          <div className="space-y-1">
                            <h3 className="font-display font-black text-brand-dark text-2xl leading-tight tracking-tight uppercase">
                              {item.model}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                              {item.brand && <span>{item.brand}</span>}
                              {item.brand && item.color && <span className="w-1 h-1 bg-gray-200 rounded-full"></span>}
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
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4 mb-4">
                <button 
                  onClick={() => setCurrentView(AppView.HOME)} 
                  className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-modern text-brand-blue active:scale-95 transition-all border border-gray-100"
                >
                  <ChevronLeft size={24} strokeWidth={3} />
                </button>
                <div>
                  <h2 className="text-3xl font-display font-black text-brand-dark tracking-tighter">Identificação</h2>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1">Passo 01: Dados do Lote</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] shadow-modern-lg space-y-6 border border-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-slate rounded-full -mr-16 -mt-16 opacity-50"></div>
                
                {/* Category Selection with Quick Chips */}
                <div className="space-y-2 relative z-10">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Categoria de Produto</label>
                  <div className="relative group">
                    <select 
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:ring-0 focus:outline-none appearance-none font-display font-bold text-lg text-brand-dark transition-all pr-12"
                      value={formData.productType && PRODUCT_TYPES.includes(formData.productType) ? formData.productType : (formData.productType === undefined || formData.productType === "" ? "" : "CUSTOM")}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "CUSTOM") {
                          setFormData(prev => ({ ...prev, productType: " " })); // Use space to indicate "typing"
                        } else {
                          setFormData(prev => ({ ...prev, productType: val }));
                        }
                      }}
                    >
                      <option value="">Selecione...</option>
                      {PRODUCT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      <option value="CUSTOM">+ Nova Categoria (Digitar)...</option>
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-brand-accent">
                      <LayoutGrid size={18} strokeWidth={2.5} />
                    </div>
                  </div>
                  {(formData.productType !== undefined && formData.productType !== "" && !PRODUCT_TYPES.includes(formData.productType)) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <input 
                        type="text" 
                        placeholder="Digite o nome da categoria personalizada..."
                        className="w-full p-5 bg-white border-2 border-brand-accent/20 rounded-2xl focus:border-brand-accent focus:outline-none font-bold text-brand-dark shadow-inner text-lg"
                        value={formData.productType === " " ? "" : formData.productType}
                        onChange={(e) => setFormData(prev => ({ ...prev, productType: e.target.value }))}
                        autoFocus
                      />
                      <p className="text-[9px] font-black text-brand-accent uppercase tracking-[0.2em] mt-3 ml-3 flex items-center gap-2">
                        <PlusCircle size={12} />
                        Nova Categoria Identificada
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-2 relative z-10">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Modelo</label>
                  <input 
                    type="text"
                    placeholder="Ex: Sport..."
                    className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:outline-none font-display font-bold text-lg text-brand-dark transition-all"
                    value={formData.model}
                    onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 relative z-10">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Marca</label>
                    <input 
                      type="text"
                      placeholder="Nike..."
                      className="w-full p-5 bg-brand-slate border border-gray-100 focus:border-brand-accent focus:bg-white rounded-2xl focus:outline-none font-display font-bold text-lg text-brand-dark transition-all"
                      value={formData.brand}
                      onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Cor</label>
                    <input 
                      type="text"
                      placeholder="Azul..."
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
                    disabled={!formData.productType || !formData.model}
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
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4 mb-4">
                <button 
                  onClick={() => setCurrentView(AppView.IDENTIFY)} 
                  className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-modern text-brand-blue active:scale-95 transition-all border border-gray-100"
                >
                  <ChevronLeft size={24} strokeWidth={3} />
                </button>
                <div>
                  <h2 className="text-3xl font-display font-black text-brand-dark tracking-tighter leading-none mb-1 uppercase">Contagem</h2>
                  <p className="text-[10px] text-brand-red uppercase font-black tracking-widest opacity-90">{formData.productType} • {formData.model}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-modern border border-gray-50">
                <div className="space-y-4">
                  {(() => {
                    const isInfantilStatus = formData.productType?.toLowerCase().includes('infantil');
                    const defaultSizes = formData.gridType === 'LETTER' 
                      ? LETTER_SIZES 
                      : (isInfantilStatus 
                          ? NUMERIC_SIZES.filter(s => parseInt(s, 10) <= 38)
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
                  <div className="flex gap-3">
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
                      className="flex-1 bg-brand-red hover:brightness-110 shadow-xl shadow-brand-red/20 text-white py-5 rounded-[1.5rem] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group/btn disabled:opacity-50"
                    >
                      {isSaving ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <Save size={20} strokeWidth={3} className="group-hover/btn:scale-110 transition-transform" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-[0.1em]">{isSaving ? 'Salvando...' : 'Salvar'}</span>
                    </motion.button>
                    
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isSaving}
                      onClick={async () => {
                        const success = await saveInventory();
                        if (success) {
                          handleStartNew();
                        }
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-5 rounded-[1.5rem] border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Plus size={20} strokeWidth={3} />
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] leading-tight text-center">Salvar & Novo</span>
                    </motion.button>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    disabled={isSaving}
                    onClick={async () => {
                      const success = await saveInventory();
                      if (success) {
                        generateSinglePDF(formData as InventoryCount);
                        showToast('PDF Gerado e Histórico Atualizado!');
                        setCurrentView(AppView.HOME);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="w-full bg-brand-blue hover:brightness-110 shadow-xl shadow-brand-blue/20 text-white py-5 rounded-[1.5rem] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    <Download size={20} strokeWidth={3} />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">Salvar & Baixar PDF</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
          {currentView === AppView.ANALYTICS && (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 pb-10"
            >
              <div className="flex items-center gap-4 mb-2">
                <button 
                  onClick={() => setCurrentView(AppView.HOME)} 
                  className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-modern text-brand-blue active:scale-95 transition-all border border-gray-100"
                >
                  <ChevronLeft size={24} strokeWidth={3} />
                </button>
                <div>
                  <h2 className="text-3xl font-display font-black text-brand-dark tracking-tighter uppercase leading-none mb-1">Visão Geral</h2>
                  <p className="text-[10px] text-brand-red uppercase font-black tracking-widest opacity-90">Estatísticas & Inteligencia IA</p>
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
                          tick={{ fill: '#ffffff60', fontSize: 8, fontWeight: 'bold' }} 
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

              {/* Data Import & AI Analysis */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-modern border border-gray-100 space-y-6">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-brand-red w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-red/10">
                      <BrainCircuit size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-display font-black text-brand-dark uppercase text-sm leading-none mb-1">IA Consultor</h3>
                      <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Análise de Tendências</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowPasteInput(!showPasteInput)}
                    className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${showPasteInput ? 'bg-brand-blue text-white' : 'bg-brand-slate text-gray-400 border-transparent hover:border-brand-blue/30'}`}
                  >
                    {pastedData ? 'Dados Externos (+)' : 'Importar PDF'}
                  </button>
                </div>

                {showPasteInput && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3"
                  >
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">Cole o conteúdo dos PDFs aqui:</label>
                    <textarea 
                      className="w-full h-32 p-4 bg-brand-slate/30 border border-gray-100 rounded-2xl focus:bg-white focus:border-brand-blue focus:outline-none text-xs font-bold text-brand-dark transition-all"
                      placeholder="Ex: Tênis Sport 12 un, Camiseta Polo 5 un..."
                      value={pastedData}
                      onChange={(e) => setPastedData(e.target.value)}
                    />
                  </motion.div>
                )}

                <motion.button 
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  disabled={isAnalyzing || (counts.length === 0 && !pastedData)}
                  onClick={handleAIAnalysis}
                  className="w-full bg-brand-dark text-white py-6 rounded-[2rem] shadow-xl shadow-brand-dark/20 font-display font-black uppercase text-xs tracking-[0.2em] relative overflow-hidden flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={24} className="animate-spin" />
                      <span>Processando Inteligência...</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit size={24} strokeWidth={2.5} />
                      <span>Gerar Relatório Estratégico</span>
                    </>
                  )}
                </motion.button>
              </div>

              {/* AI Report Result */}
              {aiReport && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-modern border border-gray-100 space-y-6"
                >
                  <div className="flex items-center gap-3 pb-6 border-b border-gray-50">
                    <div className="bg-brand-red w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-red/20">
                      <FileText size={22} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-display font-black text-brand-dark uppercase text-lg leading-none mb-1">Relatório Estratégico</h3>
                      <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Insights da Ideal IA</p>
                    </div>
                  </div>

                  <div className="prose prose-sm max-w-none text-gray-700 font-medium">
                    <ReactMarkdown components={{
                      h1: ({children}) => <h1 className="text-xl font-black text-brand-blue uppercase mt-6 mb-3">{children}</h1>,
                      h2: ({children}) => <h2 className="text-lg font-black text-brand-dark uppercase mt-6 mb-2 border-l-4 border-brand-red pl-3">{children}</h2>,
                      h3: ({children}) => <h3 className="text-sm font-black text-brand-dark uppercase mt-4 mb-2 tracking-wide">{children}</h3>,
                      p: ({children}) => <p className="leading-relaxed mb-4 text-sm">{children}</p>,
                      ul: ({children}) => <ul className="space-y-2 mb-4 ml-4 list-disc marker:text-brand-red">{children}</ul>,
                      li: ({children}) => <li className="text-sm">{children}</li>,
                      strong: ({children}) => <strong className="font-black text-brand-dark">{children}</strong>,
                    }}>
                      {aiReport}
                    </ReactMarkdown>
                  </div>

                  <button 
                    onClick={() => window.print()}
                    className="w-full mt-8 py-5 bg-brand-slate border border-gray-100 rounded-2xl text-brand-blue font-black uppercase text-[10px] tracking-widest hover:bg-white hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Download size={16} strokeWidth={3} />
                    Imprimir Relatório
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="no-print pb-40 px-6 text-center">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] leading-relaxed">
          Ideal Tecidos - Controle de Estoque<br/>
          <span className="text-brand-blue/40">Desenvolvido pelo Engenheiro de Software Sergio Bruce</span>
        </p>
      </footer>

      {/* FIXED FOOTER NAVIGATION (No Print) */}
      <nav className="no-print fixed bottom-0 left-0 right-0 max-w-lg mx-auto p-4 z-50">
        <div className="bg-brand-blue/95 backdrop-blur-xl rounded-[2.5rem] p-2 flex gap-2 shadow-2xl shadow-brand-blue/40 border border-white/10">
          <button 
            onClick={() => setCurrentView(AppView.HOME)}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.8rem] transition-all duration-500 ${currentView === AppView.HOME ? 'bg-white text-brand-blue shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            <Home size={20} fill={currentView === AppView.HOME ? "currentColor" : "none"} />
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Início</span>
          </button>
          
          <button 
            onClick={() => setCurrentView(AppView.ANALYTICS)}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.8rem] transition-all duration-500 ${currentView === AppView.ANALYTICS ? 'bg-white text-brand-blue shadow-xl' : 'text-white/40 hover:text-white'}`}
          >
            <BrainCircuit size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Análise</span>
          </button>

          <button 
            onClick={generatePDF}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.8rem] text-white/40 hover:text-white hover:bg-white/5 transition-all duration-300"
          >
            <Download size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">PDF</span>
          </button>
        </div>
      </nav>

      {/* PRINT REPORT (Hidden on screen, visible on print) */}
      <div className="print-only">
        <div className="mb-10 border-b-6 border-brand-blue pb-8 flex justify-between items-end">
          <div>
            <h1 className="text-5xl font-black text-brand-blue tracking-tighter">A IDEAL TECIDOS</h1>
            <p className="text-brand-red font-black text-lg uppercase tracking-[0.2em]">Calçados e Confecções</p>
          </div>
          <div className="text-right text-xs text-gray-600 font-bold uppercase tracking-widest leading-relaxed">
            Relatório de Controle Interno<br />
            {new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-brand-blue text-white">
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Data</th>
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Produto</th>
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Modelo</th>
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Marca</th>
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Cor</th>
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Chegada</th>
              <th className="border-none p-4 text-left text-xs uppercase font-black tracking-widest">Grade</th>
              <th className="border-none p-4 text-center text-xs uppercase font-black tracking-widest">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredCounts.map(item => (
              <tr key={item.id} className="border-b-2 border-gray-100">
                <td className="p-4 text-xs font-bold text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-4 text-sm font-black text-brand-dark uppercase tracking-wide">{item.productType}</td>
                <td className="p-4 text-sm font-black text-brand-blue">
                  {item.model}
                </td>
                <td className="p-4 text-xs font-black text-brand-dark uppercase">{item.brand || '-'}</td>
                <td className="p-4 text-xs font-black text-gray-500 uppercase">{item.color || '-'}</td>
                <td className="p-4 text-xs font-black text-gray-400">
                  {item.arrivalMonth && item.arrivalYear ? `${item.arrivalMonth}/${item.arrivalYear}` : (item.arrivalMonth || item.arrivalYear || '-')}
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(item.sizes)
                      .filter(([_, qty]) => (qty as any) > 0)
                      .map(([size, qty]) => (
                        <span key={size} className="bg-gray-100 px-3 py-1 rounded-lg text-xs font-black border border-gray-200">
                          {size}: {qty}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="p-4 text-center text-lg font-black text-brand-dark">{item.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-brand-slate font-black shadow-inner">
              <td colSpan={7} className="p-6 text-right uppercase text-xs tracking-widest text-gray-500">Total Geral Acumulado</td>
              <td className="p-6 text-center text-3xl text-brand-red">
                {filteredCounts.reduce((sum, item) => sum + item.total, 0)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-20 pt-10 border-t-4 border-dashed border-gray-200 text-center text-xs text-gray-400 font-black uppercase tracking-[0.3em]">
          Documento para uso exclusivo - Ideal Tecidos
        </div>
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
              className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl flex flex-col items-center text-center"
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
    </div>
  );
};

export default App;
