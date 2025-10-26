import React, { useEffect, useState } from 'react';
import { networkService } from '@/services/networkService';
import { syncService } from '@/services/syncService';
import { cn } from '@/lib/utils';

export const SyncStatus: React.FC = () => {
  const [connected, setConnected] = useState<boolean>(true);
  const [pending, setPending] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    setConnected(networkService.getConnectionStatus());
    setSyncing(networkService.isSyncInProgress?.() || syncService.isSyncInProgress());

    const load = async () => {
      try {
        if (syncService.getQueueStats) {
          const stats = await syncService.getQueueStats();
          if (mounted) setPending(stats.pending);
        } else if (networkService.getPendingSyncCount) {
          const count = await networkService.getPendingSyncCount();
          if (mounted) setPending(count);
        }
      } catch {}
    };
    load();

    const listener = (status: any) => { if (mounted) setConnected(status.connected); };
    networkService.addStatusListener(listener);

    const interval = setInterval(async () => {
      setSyncing(networkService.isSyncInProgress?.() || syncService.isSyncInProgress());
      await load();
    }, 2000);

    return () => { mounted = false; clearInterval(interval); networkService.removeStatusListener(listener); };
  }, []);

  const color = !connected ? 'bg-red-500' : syncing ? 'bg-yellow-500' : pending > 0 ? 'bg-orange-500' : 'bg-green-600';
  const label = !connected ? 'offline' : syncing ? 'sincronizando…' : pending > 0 ? `${pending} pendente(s)` : 'online';

  return (
    <div className="w-full flex justify-center mt-2">
      <div className={cn('px-3 py-1 rounded-full text-white text-xs font-medium shadow-sm', color)}>{label}</div>
    </div>
  );
};
