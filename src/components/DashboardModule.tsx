import React, { useMemo, useEffect, useState } from 'react';
import { 
  BarChart3, Package, Layers, AlertTriangle, TrendingUp, RefreshCw, 
  Clock, Award, Tag, ShoppingBag, PieChart as PieIcon, ArrowUpRight, 
  ArrowDownLeft, Zap, ArrowLeft
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, Legend 
} from 'recharts';
import { InventoryCount, StockMovement } from '../../types';
import { subscribeStockMovements } from '../services/stockMovementService';

interface DashboardModuleProps {
  counts: InventoryCount[];
  onBackToHome?: () => void;
  onOpenBrands?: () => void;
  onOpenPurchasing?: (priority: 'ALL' | 'CRITICO' | 'ZERADOS' | 'BAIXO') => void;
  onOpenSizeFilter?: (sizeKey: string) => void;
  onSelectBrand?: (brandName: string) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  counts,
  onBackToHome,
  onOpenBrands,
  onOpenPurchasing,
  onOpenSizeFilter,
  onSelectBrand,
  showToast
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Subscribe to stock movements real-time for sales/movements analytics
  useEffect(() => {
    const unsubscribe = subscribeStockMovements((list) => {
      setMovements(list);
    });
    return () => unsubscribe();
  }, []);

  // 1. Quantidade total de produtos / referências
  const totalProductsCount = counts.length;

  // 2. Quantidade total de pares / peças
  const totalPairsCount = useMemo(() => {
    return counts.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
  }, [counts]);

  // 3. Quantidade de marcas
  const totalBrandsCount = useMemo(() => {
    const brandSet = new Set<string>();
    counts.forEach(item => {
      if (item.brand && item.brand.trim()) {
        brandSet.add(item.brand.trim().toUpperCase());
      }
    });
    return brandSet.size;
  }, [counts]);

  // 4. Quantidade de modelos
  const totalModelsCount = useMemo(() => {
    const modelSet = new Set<string>();
    counts.forEach(item => {
      if (item.model && item.model.trim()) {
        modelSet.add(item.model.trim().toUpperCase());
      }
    });
    return modelSet.size;
  }, [counts]);

  // 5. Produtos sem estoque (total = 0)
  const zeroStockCount = useMemo(() => {
    return counts.filter(item => (Number(item.total) || 0) === 0).length;
  }, [counts]);

  // 6. Produtos com estoque baixo (1 a 3 peças)
  const lowStockCount = useMemo(() => {
    return counts.filter(item => {
      const tot = Number(item.total) || 0;
      return tot > 0 && tot <= 3;
    }).length;
  }, [counts]);

  // Produtos com estoque normal (> 3 peças)
  const normalStockCount = useMemo(() => {
    return counts.filter(item => (Number(item.total) || 0) > 3).length;
  }, [counts]);

  // 7. Última atualização (data e hora)
  const lastUpdatedFormatted = useMemo(() => {
    let maxTime = 0;
    counts.forEach(c => {
      if (c.createdAt && c.createdAt > maxTime) maxTime = c.createdAt;
    });
    movements.forEach(m => {
      if (m.timestamp && m.timestamp > maxTime) maxTime = m.timestamp;
    });

    if (!maxTime) return 'Sem dados recentes';

    const d = new Date(maxTime);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }, [counts, movements]);

  // 8. Marcas com maior quantidade (Top 5)
  const topBrandsData = useMemo(() => {
    const brandTotals: Record<string, number> = {};

    counts.forEach(item => {
      const b = (item.brand && item.brand.trim()) ? item.brand.trim() : 'Outras';
      brandTotals[b] = (brandTotals[b] || 0) + (Number(item.total) || 0);
    });

    return Object.entries(brandTotals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [counts]);

  // 9. Modelos mais vendidos / movimentados (A partir do histórico de movimentações + estoque)
  const topModelsMovedData = useMemo(() => {
    const modelMovedMap: Record<string, { brand: string; model: string; moved: number; currentStock: number }> = {};

    // First collect movements
    movements.forEach(m => {
      const key = `${m.brand}_${m.model}`.toUpperCase();
      if (!modelMovedMap[key]) {
        modelMovedMap[key] = {
          brand: m.brand || 'N/I',
          model: m.model || 'N/I',
          moved: 0,
          currentStock: 0
        };
      }
      // Count outputs/sales
      if (m.type === 'SAIDA') {
        modelMovedMap[key].moved += Math.abs(m.movedQty);
      } else {
        modelMovedMap[key].moved += Math.abs(m.movedQty);
      }
    });

    // Match with current stock
    counts.forEach(c => {
      const key = `${c.brand}_${c.model}`.toUpperCase();
      if (modelMovedMap[key]) {
        modelMovedMap[key].currentStock += (c.total || 0);
      }
    });

    const list = Object.values(modelMovedMap)
      .sort((a, b) => b.moved - a.moved)
      .slice(0, 5);

    // Fallback if no movements yet: rank by total stock
    if (list.length === 0) {
      return counts
        .map(c => ({
          brand: c.brand || 'Ideal',
          model: c.model || 'Geral',
          moved: c.total || 0,
          currentStock: c.total || 0
        }))
        .sort((a, b) => b.moved - a.moved)
        .slice(0, 5);
    }

    return list;
  }, [movements, counts]);

  // 10. Numeração com maior quantidade
  const sizeDistributionData = useMemo(() => {
    const sizeTotals: Record<string, number> = {};

    counts.forEach(item => {
      if (item.sizes) {
        Object.entries(item.sizes).forEach(([sz, qty]) => {
          if (qty > 0) {
            sizeTotals[sz] = (sizeTotals[sz] || 0) + qty;
          }
        });
      }
    });

    return Object.entries(sizeTotals)
      .map(([size, quantity]) => ({ size: `Tam ${size}`, sizeKey: size, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [counts]);

  const topSize = useMemo(() => {
    if (sizeDistributionData.length === 0) return { size: 'N/A', sizeKey: 'N/A', quantity: 0 };
    return sizeDistributionData[0];
  }, [sizeDistributionData]);

  // Pie chart stock status data
  const pieStockStatusData = useMemo(() => [
    { name: 'Estoque Normal (>3)', value: normalStockCount, color: '#10b981' },
    { name: 'Estoque Baixo (1-3)', value: lowStockCount, color: '#f59e0b' },
    { name: 'Sem Estoque (0)', value: zeroStockCount, color: '#f43f5e' }
  ], [normalStockCount, lowStockCount, zeroStockCount]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      if (showToast) showToast('Métricas do Dashboard atualizadas!', 'success');
    }, 400);
  };

  const BRAND_BAR_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b'];

  return (
    <div className="space-y-6">
      {/* HEADER DO DASHBOARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 shadow-2xl">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl sm:rounded-2xl transition-all shrink-0"
              title="Voltar"
            >
              <ArrowLeft size={18} className="sm:w-[20px] sm:h-[20px]" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 sm:p-2 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-xl shrink-0">
                <BarChart3 size={18} className="sm:w-[22px] sm:h-[22px]" />
              </span>
              <h1 className="text-base sm:text-xl font-black uppercase tracking-tight text-white truncate">Dashboard do Estoque</h1>
            </div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <Clock size={12} className="text-emerald-400 shrink-0 sm:w-[14px] sm:h-[14px]" />
              <span>Última atualização: <strong className="text-white">{lastUpdatedFormatted}</strong></span>
            </p>
          </div>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="w-full md:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-700 transition-all shrink-0"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
          <span>{isRefreshing ? 'Atualizando...' : 'Atualizar Dados'}</span>
        </button>
      </div>

      {/* KPI METRIC CARDS (10 MÉTRICAS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Produtos */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Total de Produtos</span>
            <Package size={18} className="text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-white">{totalProductsCount}</p>
          <p className="text-[10px] font-bold text-slate-500">Referências em linha</p>
        </div>

        {/* Card 2: Total de Pares / Peças */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Total de Pares</span>
            <Layers size={18} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{totalPairsCount.toLocaleString('pt-BR')}</p>
          <p className="text-[10px] font-bold text-slate-500">Unidades físicas estocadas</p>
        </div>

        {/* Card 3: Qtd de Marcas (Clicável) */}
        <div
          onClick={() => onOpenBrands?.()}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-blue-500/60 transition-all cursor-pointer group"
          title="Abrir lista de marcas"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Marcas</span>
            <Tag size={18} className="text-blue-400" />
          </div>
          <p className="text-2xl font-black text-white">{totalBrandsCount}</p>
          <p className="text-[10px] font-bold text-blue-400/90 group-hover:text-blue-300">Ver todas as marcas →</p>
        </div>

        {/* Card 4: Qtd de Modelos */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Modelos</span>
            <ShoppingBag size={18} className="text-purple-400" />
          </div>
          <p className="text-2xl font-black text-white">{totalModelsCount}</p>
          <p className="text-[10px] font-bold text-slate-500">Desenhos distintos</p>
        </div>

        {/* Card 5: Numeração com Maior Qtd (Clicável) */}
        <div
          onClick={() => topSize.sizeKey && topSize.sizeKey !== 'N/A' && onOpenSizeFilter?.(topSize.sizeKey)}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-amber-500/60 transition-all cursor-pointer group"
          title="Filtrar itens com esta numeração"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Top Numeração</span>
            <Award size={18} className="text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">{topSize.sizeKey || '-'}</p>
          <p className="text-[10px] font-bold text-slate-500 group-hover:text-amber-300">{topSize.quantity} pares • Filtrar →</p>
        </div>

        {/* Card 6: Estoque Normal */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Estoque Normal</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-2xl font-black text-emerald-400">{normalStockCount}</p>
          <p className="text-[10px] font-bold text-slate-500">Produtos &gt; 3 pares</p>
        </div>

        {/* Card 7: Estoque Baixo (Clicável -> Central de Compras) */}
        <div
          onClick={() => onOpenPurchasing?.('BAIXO')}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-amber-500/70 transition-all cursor-pointer group"
          title="Abrir Central de Compras (Estoque Baixo)"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Estoque Baixo</span>
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">{lowStockCount}</p>
          <p className="text-[10px] font-bold text-amber-400/90 group-hover:text-amber-300">Abrir reposição →</p>
        </div>

        {/* Card 8: Sem Estoque (Clicável -> Central de Compras) */}
        <div
          onClick={() => onOpenPurchasing?.('ZERADOS')}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg hover:border-rose-500/70 transition-all cursor-pointer group"
          title="Abrir Central de Compras (Zerados / Grade Furada)"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Sem Estoque</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          </div>
          <p className="text-2xl font-black text-rose-400">{zeroStockCount}</p>
          <p className="text-[10px] font-bold text-rose-400/90 group-hover:text-rose-300">Ver faltas e compras →</p>
        </div>
      </div>

      {/* SEÇÃO DE GRÁFICOS LEVES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GRÁFICO 1: MARCAS COM MAIOR QUANTIDADE DE ESTOQUE */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <BarChart3 size={16} className="text-emerald-400" />
              Marcas com Maior Quantidade (Volume de Pares)
            </h3>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase">Top 6 Marcas</span>
          </div>

          {topBrandsData.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">Nenhuma marca registrada no estoque.</p>
          ) : (
            <div className="space-y-4">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topBrandsData} margin={{ top: 15, right: 10, left: -15, bottom: 55 }}>
                    <XAxis 
                      dataKey="name" 
                      stroke="#94a3b8" 
                      fontSize={10} 
                      fontWeight={700}
                      tickLine={false} 
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                      tickFormatter={(val: string) => {
                        if (!val) return '';
                        return val.length > 12 ? `${val.substring(0, 10)}…` : val;
                      }}
                    />
                    <YAxis stroke="#94a3b8" fontSize={10} fontWeight={700} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff', fontWeight: 'bold' }}
                      formatter={(val: any) => [`${val} pares`, 'Estoque Total']}
                      labelStyle={{ color: '#38bdf8', fontWeight: '900', textTransform: 'uppercase' }}
                    />
                    <Bar dataKey="total" radius={[8, 8, 0, 0]} barSize={36}>
                      {topBrandsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={BRAND_BAR_COLORS[index % BRAND_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legenda Detalhada das Marcas (Clicável para abrir grade da marca) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
                {topBrandsData.map((item, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => onSelectBrand?.(item.name)}
                    className="flex items-center justify-between p-2.5 px-3 bg-slate-950/70 hover:bg-slate-800/80 rounded-xl border border-slate-800/80 hover:border-emerald-500/50 transition-all cursor-pointer text-left"
                    title={`Abrir grade consolidada de ${item.name}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-md shrink-0 shadow-xs" style={{ backgroundColor: BRAND_BAR_COLORS[idx % BRAND_BAR_COLORS.length] }}></span>
                      <span className="text-xs font-bold text-slate-200 truncate uppercase" title={item.name}>{item.name}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-400 font-mono shrink-0 ml-1.5">{item.total} <span className="text-[9px] text-slate-500 font-bold">prs</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* GRÁFICO 2: STATUS DO ESTOQUE (PIE CHART) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <PieIcon size={16} className="text-indigo-400" />
              Saúde do Estoque
            </h3>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase">Proporção</span>
          </div>

          <div className="h-56 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieStockStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieStockStatusData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 border-t border-slate-800/80 pt-3">
            {pieStockStatusData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="text-slate-300 font-medium">{item.name}</span>
                </div>
                <span className="font-mono font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SEÇÃO INFERIOR: NUMERAÇÃO MAIS ESTOCADA & MODELOS MAIS MOVIMENTADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NUMERAÇÃO COM MAIOR QUANTIDADE (GRÁFICO HORIZONTAL) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Award size={16} className="text-amber-400" />
              Numeração com Maior Quantidade
            </h3>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase">Top Tamanhos</span>
          </div>

          {sizeDistributionData.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">Nenhuma numeração com saldo encontrada.</p>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sizeDistributionData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <XAxis type="number" stroke="#64748b" fontSize={11} />
                  <YAxis dataKey="size" type="category" stroke="#64748b" fontSize={11} width={65} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                    formatter={(val: any) => [`${val} pares`, 'Quantidade']}
                  />
                  <Bar dataKey="quantity" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* MODELOS MAIS MOVIDOS / VENDIDOS */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <TrendingUp size={16} className="text-purple-400" />
                Modelos Mais Movimentados / Vendidos
              </h3>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase">Ranking</span>
            </div>

            <div className="mt-4 space-y-2.5">
              {topModelsMovedData.map((item, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] ${
                      index === 0 ? 'bg-amber-400 text-slate-950' :
                      index === 1 ? 'bg-slate-300 text-slate-950' :
                      index === 2 ? 'bg-amber-700 text-white' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-black text-white">{item.brand} - {item.model}</p>
                      <p className="text-[10px] text-slate-400 font-mono">Estoque Atual: {item.currentStock} pares</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Movimentado</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      {item.moved} pcs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
