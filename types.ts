
export type SizeGridType = 'LETTER' | 'NUMERIC';

export type MovementType = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'TRANSFERENCIA';

export interface StockMovement {
  id: string;
  timestamp: number;
  date: string;            // 'DD/MM/YYYY' or 'YYYY-MM-DD'
  time: string;            // 'HH:mm:ss'
  userId: string;
  userName: string;
  brand: string;
  model: string;
  color: string;
  barcode: string;
  previousQty: number;
  movedQty: number;
  finalQty: number;
  type: MovementType;
  reason: string;
  destinationLocation?: string; // Optional for TRANSFERENCIA
}

export enum AppView {
  HOME = 'HOME',
  DASHBOARD = 'DASHBOARD',           // Dashboard Profissional com Métricas e Gráficos
  REPORTS = 'REPORTS',               // Relatórios Avançados (PDF, Excel, CSV, Divergências, Zerados, Estoque Baixo)
  INVENTORY_MODE = 'INVENTORY_MODE', // MODO INVENTÁRIO EXCLUSIVO (Contagem Rápida)
  STOCK_MOVEMENTS = 'STOCK_MOVEMENTS', // Sistema de Movimentação de Estoque
  PRODUCTS = 'PRODUCTS',             // Módulo 1: Cadastro de Produtos (Base Permanente)
  INVENTORIES = 'INVENTORIES',       // Módulo 2: Sessões de Inventário Físico
  SCANNING = 'SCANNING',             // Módulo 3: Itens / Bipagem Contínua
  AUDIT_LOGS = 'AUDIT_LOGS',         // Módulo 4: Histórico & Auditoria
  COMPARE = 'COMPARE',               // Ferramenta: Comparação entre Inventários
  ANALYTICS = 'ANALYTICS',           // Ferramenta: Relatórios e Análises Visual
  BARCODE_FIREBASE = 'BARCODE_FIREBASE', // Visão Legada / Rápida
  IDENTIFY = 'IDENTIFY',
  COUNT = 'COUNT',
  HISTORY = 'HISTORY',
  EDIT = 'EDIT'
}

// 1. Módulo: Cadastro de Produtos (Base de Dados Permanente - Sem Saldo Volátil)
export interface ShoeProduct {
  barcode: string;         // Chave Primária (EAN13 / Code128)
  brand: string;           // Marca (ex: Beira Rio, Nike, Moleca)
  model: string;           // Modelo / Referência
  category: string;        // Categoria (Tênis, Rasteira, Bota, etc.)
  color: string;           // Cor
  size: string;            // Numeração/Tamanho (ex: 35, 36, M)
  gender?: string;         // Gênero (Feminino, Masculino, Infantil)
  expectedQty: number;     // Saldo Teórico vindo do ERP
  countedQty?: number;     // Saldo total apurado acumulado
  lastUpdated: number;     // Timestamp da última alteração
  lastCountedTime?: number; // Timestamp da última bipagem
  createdAt?: number;
}

// 2. Módulo: Sessões de Inventário Físico
export interface ShoeInventory {
  id: string;
  name: string;            // Nome/Título da Sessão (ex: Inventário Setor A - Março)
  description?: string;
  date: string;            // Data de realização
  time: string;            // Hora de início
  employee: string;        // Responsável pela contagem
  storeOrDept?: string;    // Loja ou Departamento
  observations?: string;   // Observações gerais
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  counts: Record<string, number>; // Mapeamento barcode -> quantidade contada nesta sessão
  brandsStatus?: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'>;
  createdAt: number;
  closedAt?: number;
  closedBy?: string;
  brand?: string;          // Filtro por marca se for inventário específico
}

// 3. Módulo: Itens do Inventário (Bipagens Individuais)
export interface InventoryScanItem {
  id: string;
  inventoryId: string;     // ID da sessão de inventário
  barcode: string;         // Código de barras lido
  qty: number;             // Quantidade incrementada nesta bipagem
  scannedAt: number;       // Timestamp exato do bip
  scannedBy: string;       // Usuário/Operador
  scanMethod: 'USB_SCANNER' | 'CAMERA' | 'MANUAL'; // Método de leitura
  brand?: string;
  model?: string;
  size?: string;
}

// 4. Módulo: Histórico e Auditoria
export interface AuditLog {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action: 'SCAN_ITEM' | 'CREATE_PRODUCT' | 'UPDATE_PRODUCT' | 'DELETE_PRODUCT' | 'CREATE_INVENTORY' | 'CLOSE_INVENTORY' | 'REOPEN_INVENTORY' | 'DELETE_INVENTORY' | 'IMPORT_EXCEL' | 'EXPORT_ERP' | 'GENERATE_LABELS';
  module: 'CADASTRO' | 'INVENTARIOS' | 'BIPAGEM' | 'HISTORICO' | 'ETIQUETAS';
  details: string;
  metadata?: Record<string, any>;
}

export interface ShoeBrand {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
}

export interface InventoryCount {
  id: string;
  barcode?: string;
  productType: string;
  model: string;
  brand?: string;
  color?: string;
  arrivalMonth?: string;
  arrivalYear?: string;
  gridType: SizeGridType;
  sizes: Record<string, number>;
  total: number;
  createdAt: number;
  userId: string;
  gender?: string;
}

export interface ColumnMapping {
  barcode: string;
  brand: string;
  model: string;
  category: string;
  color: string;
  size: string;
  expectedQty: string;
  gender: string;
}


