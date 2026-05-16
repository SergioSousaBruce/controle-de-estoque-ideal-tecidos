
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
  userId?: string;
  conferente?: string;
}

export enum AppView {
  HOME = 'HOME',
  IDENTIFY = 'IDENTIFY',
  COUNT = 'COUNT',
  HISTORY = 'HISTORY',
  EDIT = 'EDIT',
  ANALYTICS = 'ANALYTICS'
}
