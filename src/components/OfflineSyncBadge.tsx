import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { 
  getPendingOfflineCounts, 
  getPendingOfflineBarcodes, 
  syncOfflineQueueToFirebase 
} from '../services/offlineSyncService';

interface OfflineSyncBadgeProps {
  userId: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onSyncCompleted?: () => void;
}

export const OfflineSyncBadge: React.FC<OfflineSyncBadgeProps> = ({
  userId,
  showToast,
  onSyncCompleted
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const updatePendingState = () => {
    const counts = getPendingOfflineCounts().length;
    const barcodes = getPendingOfflineBarcodes().length;
    setPendingCount(counts + barcodes);
  };

  useEffect(() => {
    updatePendingState();
    const interval = setInterval(updatePendingState, 2000);

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('Sem conexão com a internet. Modo Offline ativo com salvamento local.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userId]);

  const triggerSync = async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await syncOfflineQueueToFirebase(userId);
      if (result.syncedCounts > 0 || result.syncedBarcodes > 0) {
        showToast(`Sincronizado com sucesso: ${result.syncedCounts} contagens e ${result.syncedBarcodes} códigos!`, 'success');
        if (onSyncCompleted) onSyncCompleted();
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setIsSyncing(false);
      updatePendingState();
    }
  };

  if (isOnline && pendingCount === 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-full text-[11px] font-black uppercase">
        <Wifi size={12} className="animate-pulse" />
        <span className="hidden sm:inline">Online</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase border ${
        !isOnline 
          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
          : 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
      }`}>
        {!isOnline ? <WifiOff size={12} /> : <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />}
        <span>{!isOnline ? 'Offline' : 'Pendente'}: {pendingCount}</span>
      </div>

      {isOnline && pendingCount > 0 && (
        <button
          type="button"
          onClick={triggerSync}
          disabled={isSyncing}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] rounded-lg shadow transition-all flex items-center gap-1"
        >
          <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} />
          Sincronizar
        </button>
      )}
    </div>
  );
};
