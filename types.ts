
export type SizeGridType = 'LETTER' | 'NUMERIC';

export interface InventoryCount {
  id: string;
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

export enum AppView {
  HOME = 'HOME',
  IDENTIFY = 'IDENTIFY',
  COUNT = 'COUNT',
  HISTORY = 'HISTORY',
  EDIT = 'EDIT',
  ANALYTICS = 'ANALYTICS',
  INVENTORIES = 'INVENTORIES'
}

export interface ShoeBrand {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
}

export interface ShoeProduct {
  barcode: string;
  brand: string;
  model: string;
  category: string;
  color: string;
  size: string;
  expectedQty: number;
  countedQty: number; // overall count
  lastUpdated: number;
  lastCountedTime?: number;
}

export interface ShoeInventory {
  id: string;
  name: string;
  description: string;
  date: string;
  time: string;
  employee: string;
  observations: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  brandsStatus: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'>;
  counts: Record<string, number>; // barcode -> counted quantity in this inventory
  createdAt: number;
  brand?: string; // Optional brand property for single-brand counting sessions
}

